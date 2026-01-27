import { Injectable, signal, computed, inject } from '@angular/core';
import { GoogleGenAI, Content, Part, FunctionDeclaration, Type, Tool, FunctionCallingConfigMode } from '@google/genai';
import { marked } from 'marked';
import { AudioService, MusicTrack } from './audio.service';
import { FlowCloudService } from './flow-cloud.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

declare const katex: any; // Globals from index.html

// --- TOOL DEFINITIONS (Function Calling Schemas) ---

const createPlanTool: FunctionDeclaration = {
  name: "createPlan",
  description: "Creates or overwrites the project plan/curriculum. VISIBLE IN UI 'Plan' TAB. Use this to show the plan to the user.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      steps: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "Title of the step/lesson" },
            description: { type: Type.STRING, description: "Detailed description of what to do" },
            status: { type: Type.STRING, enum: ["pending", "active", "finished"], description: "Current status" }
          },
          required: ["title", "description"]
        }
      }
    },
    required: ["steps"]
  }
};

const createRoutineTool: FunctionDeclaration = {
  name: "createRoutine",
  description: "Creates or overwrites the daily routine schedule. VISIBLE IN UI 'Routine' TAB.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      blocks: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            startTime: { type: Type.STRING, description: "Start time (HH:MM) e.g. 09:00" },
            endTime: { type: Type.STRING, description: "End time (HH:MM) e.g. 09:45" },
            title: { type: Type.STRING, description: "Name of the activity" },
            description: { type: Type.STRING, description: "Short details" },
            type: { type: Type.STRING, enum: ["deep", "break", "shallow"], description: "Type of work" }
          },
          required: ["startTime", "endTime", "title", "type"]
        }
      }
    },
    required: ["blocks"]
  }
};

const createInteractiveTestTool: FunctionDeclaration = {
  name: "createInteractiveTest",
  description: "Creates an interactive multiple-choice quiz/test for the user.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      topic: { type: Type.STRING, description: "The main topic of the quiz" },
      questions: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            text: { type: Type.STRING, description: "The question text" },
            audioUrl: { type: Type.STRING, description: "Optional URL for audio listening questions" },
            options: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  key: { type: Type.STRING, description: "Option key (A, B, C, D)" },
                  text: { type: Type.STRING, description: "Option text" }
                },
                required: ["key", "text"]
              }
            },
            correctKey: { type: Type.STRING, description: "The key of the correct option (A, B, C, D)" },
            explanation: { type: Type.STRING, description: "Explanation of why the answer is correct" }
          },
          required: ["text", "options", "correctKey", "explanation"]
        }
      }
    },
    required: ["topic", "questions"]
  }
};

const manageNotesTool: FunctionDeclaration = {
  name: "manageNotes",
  description: "Manages the user's notebook. VISIBLE IN UI 'Notes' TAB. Supports creating, overwriting (update), appending, and deleting notes.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      action: { type: Type.STRING, enum: ["create", "update", "append", "delete"], description: "Action to perform. 'update' overwrites content. 'append' adds to the end." },
      noteId: { type: Type.STRING, description: "ID of the note (required for update/append/delete)" },
      title: { type: Type.STRING, description: "Title of the note (optional for append/delete)" },
      content: { type: Type.STRING, description: "Content of the note (Markdown supported)" }
    },
    required: ["action"]
  }
};

const setSystemStateTool: FunctionDeclaration = {
  name: "setSystemState",
  description: "Updates global system state including app mode, music, zen mode, and project metadata.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      appMode: { type: Type.STRING, enum: ["landing", "project", "study"], description: "Switch application mode" },
      musicId: { type: Type.STRING, description: "ID of the music track to play (Single track mode)" },
      zenMode: { type: Type.BOOLEAN, description: "Enable or disable Zen Mode" },
      metadataUpdate: {
        type: Type.OBJECT,
        description: "Updates to project metadata",
        properties: {
          title: { type: Type.STRING },
          problem: { type: Type.STRING },
          audience: { type: Type.STRING },
          slogan: { type: Type.STRING },
          keywords: { type: Type.STRING }
        }
      }
    }
  }
};

const controlMusicTool: FunctionDeclaration = {
  name: "controlMusic",
  description: "Advanced music control. Supports playing a single track, a playlist, stopping, or skipping.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      action: { type: Type.STRING, enum: ["play", "stop"], description: "Action to perform. 'play' requires trackIds." },
      trackIds: { 
          type: Type.ARRAY, 
          items: { type: Type.STRING }, 
          description: "List of track IDs to play. If multiple tracks are provided, they play in sequence as a playlist." 
      }
    },
    required: ["action"]
  }
};

const changeBackgroundTool: FunctionDeclaration = {
  name: "changeBackground",
  description: "Changes the application background/wallpaper to a specific image URL.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      url: { type: Type.STRING, description: "The full HTTPS URL of the image to set as background." }
    },
    required: ["url"]
  }
};

const createAgentTool: FunctionDeclaration = {
  name: "createAgent",
  description: "Creates a specialized AI sub-agent/persona that the user can chat with separately. Generates an Agent Card in the UI.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: "Name of the agent (e.g., 'Socrates', 'Code Reviewer')" },
      description: { type: Type.STRING, description: "Short description of the agent's purpose" },
      systemPrompt: { type: Type.STRING, description: "The specific system instructions/persona for this agent" }
    },
    required: ["name", "description", "systemPrompt"]
  }
};

const createDesignTool: FunctionDeclaration = {
    name: "createDesign",
    description: "Generates a visual design (card, banner, chart, ui component) by writing HTML/CSS code. The system renders this code as an image/preview widget.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        html: { type: Type.STRING, description: "Complete, self-contained HTML and CSS code (inline <style>). The design should be responsive and visually appealing." },
        width: { type: Type.NUMBER, description: "Preferred width of the design container in pixels (optional, default 400)." },
        height: { type: Type.NUMBER, description: "Preferred height of the design container in pixels (optional, default 300)." },
        description: { type: Type.STRING, description: "Short description of what this design represents." }
      },
      required: ["html"]
    }
};

const backgroundSelectorTool: FunctionDeclaration = {
    name: "backgroundSelector",
    description: "Provides a selection of 4 high-quality wallpapers for the user to choose from. Generates a clickable grid widget.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            options: {
                type: Type.ARRAY,
                description: "Array of exactly 4 HTTPS image URLs (approx 1920x1080).",
                items: { type: Type.STRING }
            }
        },
        required: ["options"]
    }
};

// --- INTERFACES ---

export interface ModuleState {
  core: boolean;       
  files: boolean;      
  routine: boolean;    
}

export type AppMode = 'landing' | 'project' | 'study';

export interface PlanStep {
  id: string; 
  title: string;
  description: string;
  status: 'pending' | 'active' | 'finished';
}

export interface RoutineBlock {
  id: string;
  startTime: string; 
  endTime: string;   
  duration: string;  
  title: string;
  description: string;
  type: 'deep' | 'break' | 'shallow';
  status: 'upcoming' | 'active' | 'completed' | 'skipped';
  remainingLabel?: string; 
}

export interface WidgetState {
  type: 'none' | 'pomodoro' | 'checklist';
  data: any; 
}

export interface IdeaMetadata {
  title: string;
  problem: string;
  audience: string;
  slogan: string;
  created_at: string;
  keywords: string;
}

export interface Note {
  id: string;
  title: string;
  content: string; 
}

export interface UserFile {
  id: string;
  name: string;
  url: string; 
  type: string;
  base64?: string;
  description?: string; // New: Metadata description
}

export interface ChatMessage {
  role: 'user' | 'model';
  type: 'text' | 'system'; 
  text: string;
  displayHtml?: SafeHtml | string; 
  hidden?: boolean; 
  attachments?: UserFile[];
}

export interface ActiveAgent {
    name: string;
    description: string;
    systemPrompt: string;
    messages: ChatMessage[];
    isLoading: boolean;
}

export interface TestQuestion {
    id: string;
    question: string;
    audioUrl?: string; 
    options: { key: string, text: string }[];
    correctKey: string;
    explanation: string;
}

export interface InteractiveTest {
    id: string;
    topic: string;
    questions: TestQuestion[];
    userAnswers: { questionId: string, answerKey: string, isCorrect: boolean, correctKey: string }[];
    completed: boolean;
}

export interface DesignArtifact {
    id: string;
    html: string;
    width: number;
    height: number;
    description: string;
}

export type ThemeType = 'material' | 'cold';

@Injectable({
  providedIn: 'root'
})
export class FlowStateService {
  private genAI!: GoogleGenAI;
  private audioService = inject(AudioService);
  private flowCloud = inject(FlowCloudService);
  private sanitizer = inject(DomSanitizer);
  private timerInterval: any;
  private lastActiveBlockId: string | null = null;
  
  // GLOBAL APP STATE
  appMode = signal<AppMode>('landing');
  
  // CONFIG STATE
  apiKey = signal<string>('');
  selectedModel = signal<string>('gemini-2.5-flash');

  // State Signals
  messages = signal<ChatMessage[]>([]);
  isLoading = signal(false);
  
  // Initialize as false, will turn true after FlowCloud fetch
  isSystemReady = signal(false);
  
  // EDITABLE SYSTEM INSTRUCTION (For Dev Panel)
  systemInstructionTemplate = signal<string>("");
  
  // UI State (Persisted)
  zenMode = signal(false);
  leftSidebarOpen = signal(false); 
  rightPanelOpen = signal(false);  
  rightPanelWidth = signal(360); 
  showDevPanel = signal(false); 
  
  // APPEARANCE STATE
  showSettings = signal(false);
  theme = signal<ThemeType>('material');
  wallpaper = signal<string | null>(null);

  // MODULES
  activeModules = signal<ModuleState>({
    core: true,
    files: false,    
    routine: true
  });

  // ACTIVE RIGHT PANEL STATES
  activeAgent = signal<ActiveAgent | null>(null);
  activeTest = signal<InteractiveTest | null>(null); 

  // USER DATA
  userPersona = signal<string>("You are a helpful AI assistant.");
  planSteps = signal<PlanStep[]>([]);
  routineBlocks = signal<RoutineBlock[]>([]);
  notes = signal<Note[]>([]);
  files = signal<UserFile[]>([]);
  metadata = signal<IdeaMetadata>({
    title: 'Untitled',
    problem: 'Undefined',
    audience: 'Undefined',
    slogan: 'Undefined',
    created_at: new Date().toISOString(),
    keywords: ''
  });

  // RAW INSTRUCTIONS (Cached from Cloud)
  private rawInstructions: Record<string, string> = {};

  // QUIZ STORAGE
  activeTests = new Map<string, InteractiveTest>();
  
  // AGENT STORAGE
  createdAgents = new Map<string, {name: string, description: string, systemPrompt: string}>();

  // DESIGN STORAGE
  createdDesigns = new Map<string, DesignArtifact>();

  // BACKGROUND SELECTOR STORAGE
  activeBackgroundSelectors = new Map<string, string[]>();

  // EXECUTION STATE
  activeWidget = signal<WidgetState>({ type: 'none', data: null });
  widgetVisible = signal(true); 

  // Derived
  completionPercentage = computed(() => {
    const steps = this.planSteps();
    if (steps.length === 0) return 0;
    const finished = steps.filter(s => s.status === 'finished').length;
    return Math.round((finished / steps.length) * 100);
  });

  constructor() {
    this.initializeConfig();
    
    this.loadState('flow_theme', this.theme);
    this.loadState('flow_wallpaper', this.wallpaper);
    this.loadState('flow_modules', this.activeModules);
    this.loadState('flow_persona', this.userPersona);

    this.messages.set([]); 
    
    // Start System Initialization
    this.initializeSystem();

    setInterval(() => this.syncRoutineWithTime(), 30000); 
    setTimeout(() => this.syncRoutineWithTime(), 1000);
  }

  private initializeConfig() {
      // 1. Load API Key (LocalStorage > Env)
      const storedKey = localStorage.getItem('flow_api_key');
      const envKey = (typeof process !== 'undefined' && process.env) ? process.env['API_KEY'] || '' : '';
      
      // Simple priority: Stored > Env
      if (storedKey && storedKey.trim().length > 0) {
          this.apiKey.set(storedKey);
      } else {
          this.apiKey.set(envKey);
      }

      // 2. Load Model
      const storedModel = localStorage.getItem('flow_model');
      if (storedModel) this.selectedModel.set(JSON.parse(storedModel));

      // 3. Init GenAI
      this.initGenAIClient();
  }

  private initGenAIClient() {
      const key = this.apiKey();
      if (!key) {
          console.warn("No API Key available. AI features will fail.");
          return;
      }
      this.genAI = new GoogleGenAI({ apiKey: key });
      console.log("✅ GenAI Client Initialized.");
  }

  updateApiKey(newKey: string) {
      // Simple direct update
      this.apiKey.set(newKey);
      localStorage.setItem('flow_api_key', newKey);
      
      // Force Re-initialization of the AI client
      this.initGenAIClient();
  }

  setModel(m: string) { 
      this.selectedModel.set(m); 
      localStorage.setItem('flow_model', JSON.stringify(m)); 
  }

  private async initializeSystem() {
      // Fetch all required instructions from FlowCloud
      // 'isSystemReady' stays false until this completes
      try {
          const files = [
              'system_base.txt',
              'note_system.txt',
              'routine_management.txt',
              'agent_creation.txt',
              'test_extra.txt',
              'dj_mode.txt',
              'music_list.txt' // NEW: Fetch music list
          ];
          
          await Promise.all(files.map(async (f) => {
              this.rawInstructions[f] = await this.flowCloud.fetchInstruction(f);
          }));
          
          // Hydrate Audio Service from music_list.txt
          if (this.rawInstructions['music_list.txt']) {
              try {
                  const rawTracks = JSON.parse(this.rawInstructions['music_list.txt']);
                  if (Array.isArray(rawTracks)) {
                      // Pass raw tracks to AudioService. 
                      // AudioService is now responsible for handling 'cloud://' schemes.
                      this.audioService.setLibrary(rawTracks);
                      console.log(`🎵 Music Library Loaded: ${rawTracks.length} tracks.`);
                      
                      // Auto-Start Music (Browser policy permitting)
                      // We default to MUSIC_MOOG as per request for "Main ID"
                      this.audioService.playTrackById('MUSIC_MOOG');
                  }
              } catch (e) {
                  console.error("Failed to parse music_list.txt", e);
              }
          }

          // Initialize mutable template signal
          this.systemInstructionTemplate.set(this.rawInstructions['system_base.txt'] || "");
          
          this.isSystemReady.set(true);
          console.log("✅ FlowState System Ready. Instructions Loaded.");
      } catch (e) {
          console.error("System Initialization Failed", e);
          // Fallback handled inside FlowCloudService, so we should still be able to proceed
          this.isSystemReady.set(true);
      }
  }

  private loadState(key: string, signal: any) {
    try {
      const saved = localStorage.getItem(key);
      if (saved !== null) signal.set(JSON.parse(saved));
    } catch(e) {}
  }

  toggleLeftSidebar() {
      this.leftSidebarOpen.update(v => !v);
  }

  private getSystemInstruction(): string {
    // 1. Base Instruction (Use Editable Template)
    let instruction = this.systemInstructionTemplate() || this.rawInstructions['system_base.txt'] || "";

    // 2. Append Module-Specific Instructions
    instruction += "\n\n" + (this.rawInstructions['note_system.txt'] || "");
    instruction += "\n\n" + (this.rawInstructions['agent_creation.txt'] || "");
    instruction += "\n\n" + (this.rawInstructions['test_extra.txt'] || "");
    instruction += "\n\n" + (this.rawInstructions['dj_mode.txt'] || "");

    // 3. Optional Module Instructions
    if (this.activeModules().routine) {
        instruction += "\n\n" + (this.rawInstructions['routine_management.txt'] || "");
    }

    // 4. Runtime Context Injection (Music List from Dynamic Source)
    // We parse the dynamic library to inject valid IDs into the prompt
    const library = this.audioService.library();
    const musicListStr = library.length > 0 
        ? library.map(t => `- ${t.id} (Mood: ${t.mood}, Name: ${t.name})`).join('\n')
        : "No music loaded.";

    instruction += `\n\n### AVAILABLE MUSIC TRACKS (Dynamically Loaded):\n${musicListStr}`;
    instruction += `\n\n### MUSIC CONTROL:\nUse the 'controlMusic' tool to create playlists (pass multiple IDs) or stop playback.`;
    
    // 5. GLOBAL WIDGET PROTOCOL (FORCE DISPLAY)
    instruction += `\n\n### UI WIDGET PROTOCOL (CRITICAL)
If a tool execution returns a JSON field named 'widgetToken' (e.g., "[[WIDGET_TEST:id]]", "[[WIDGET_DESIGN:id]]", "[[WIDGET_BG_SELECTOR:id]]"), you **MUST** include this exact string in your final text response. 
Do not alter it. If you do not include it, the user will not see the UI component.`;

    instruction += `\n\n### CURRENT CONTEXT:\nAPP_MODE: ${this.appMode().toUpperCase()}`;
    instruction += `\nUSER_PERSONA: ${this.userPersona()}`;

    return instruction;
  }

  // --- CORE AI PROCESS (FUNCTION CALLING ENABLED) ---

  async sendMessage(userText: string, attachedFiles: UserFile[] = []) {
    if (!this.isSystemReady()) return; // Block if not ready
    if (!userText.trim() && attachedFiles.length === 0) return;
    if (!this.genAI) {
        this.messages.update(msgs => [...msgs, {role: 'model', type: 'system', text: 'API Key missing. Ctrl+Shift+D to configure.'}]);
        return;
    }

    this.messages.update(msgs => [...msgs, { 
      role: 'user', 
      type: 'text',
      text: userText, 
      displayHtml: this.renderMarkdown(userText),
      attachments: attachedFiles
    }]);

    // Auto-save files
    attachedFiles.forEach(f => {
       if(!this.files().find(existing => existing.name === f.name)) {
           this.addFile(f);
       }
    });

    this.isLoading.set(true);
    await this.processTurn();
  }

  private getFunctionCalls(response: any): any[] {
      const parts = response.candidates?.[0]?.content?.parts || [];
      return parts.filter((part: any) => part.functionCall).map((part: any) => part.functionCall);
  }

  private escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
  }

  private partsToMarkdown(parts: Part[]): string {
    let md = '';
    let i = 0;
    while (i < parts.length) {
        const part = parts[i];

        if (part.text) {
            md += part.text;
            i++;
        } else if (part.executableCode) {
            // Found Code. Check next part for result.
            const code = part.executableCode.code;
            let output = '';
            
            if (i + 1 < parts.length && parts[i + 1].codeExecutionResult) {
                output = parts[i + 1].codeExecutionResult?.output || '(No output)';
                i += 2; // Skip both
            } else {
                i++; // Skip just code
            }

            // Generate Monaco-style Widget HTML
            const payload = JSON.stringify({ code, output });
            const b64 = btoa(unescape(encodeURIComponent(payload)));
            
            md += `\n[[WIDGET_CODE:${b64}]]\n`;

        } else if (part.codeExecutionResult) {
             // Orphan result (should be handled above, but just in case)
             md += `\n**Result:**\n\`\`\`text\n${part.codeExecutionResult.output}\n\`\`\`\n`;
             i++;
        } else {
            i++;
        }
    }
    return md;
  }

  private displayResponseContent(parts: Part[]) {
      // We generate the HTML string including our custom widgets
      const md = this.partsToMarkdown(parts);
      
      if (md.trim()) {
          this.messages.update(msgs => [...msgs, {
              role: 'model',
              type: 'text',
              text: md,
              // We render markdown first, then sanitize. 
              // Note: The widget HTML is effectively embedded in the markdown string. 
              // marked.parse will typically leave raw HTML alone if configured, or we can rely on our HTML structure.
              displayHtml: this.renderMarkdown(md)
          }]);
      }
  }

  private async processTurn(refreshContext?: string) {
    try {
      // 1. Build History
      let history: Content[] = this.messages().map(m => {
        const parts: Part[] = [];
        if (m.text) parts.push({ text: m.text });
        if (m.attachments) {
            m.attachments.forEach(file => {
                if (file.base64) {
                    parts.push({ inlineData: { mimeType: file.type, data: file.base64 } });
                }
            });
        }
        return { role: m.role, parts: parts };
      });

      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      history.push({ 
          role: 'user', 
          parts: [{ text: `[SYSTEM_TIME: ${timeStr}]` + (refreshContext ? ` ${refreshContext}` : '') }] 
      });

      // 2. Define Tools DYNAMICALLY based on active modules
      const activeFunctions = [
          createPlanTool, 
          manageNotesTool, 
          setSystemStateTool,
          controlMusicTool,
          createInteractiveTestTool,
          createAgentTool,
          createRoutineTool,
          changeBackgroundTool,
          createDesignTool, // Design Tool
          backgroundSelectorTool // NEW: Background Selector
      ];

      const tools: Tool[] = [{
        functionDeclarations: activeFunctions,
        googleSearch: {},
        codeExecution: {}, // ENABLED: Code Execution
      }];

      // 3. First Call to Model
      let response = await this.genAI.models.generateContent({
        model: this.selectedModel(),
        contents: history,
        config: {
          systemInstruction: this.getSystemInstruction(), // Dynamic from Cloud
          temperature: 0.7,
          tools: tools,
          toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } } // Let model decide
        }
      });

      // DISPLAY INITIAL CONTENT (If any)
      const initialParts = response.candidates?.[0]?.content?.parts || [];
      this.displayResponseContent(initialParts);

      // 4. Handle Function Calls (Multi-turn loop)
      let functionCalls = this.getFunctionCalls(response);
      
      while (functionCalls && functionCalls.length > 0) {
          console.log("🤖 Model requested function calls:", functionCalls);
          const toolOutputs: Part[] = [];

          for (const call of functionCalls) {
              // Execute the tool locally and get JSON result
              const result = await this.executeTool(call);
              
              console.log(`✅ Tool Executed: ${call.name}`, result);

              toolOutputs.push({
                  functionResponse: {
                      name: call.name,
                      response: { result: result } 
                  }
              });
          }

          // Important: Get the content of the model's turn (that contained the FunctionCalls)
          const modelTurn = response.candidates?.[0]?.content;
          if (!modelTurn) throw new Error("Model response missing content.");

          // Update History with the full interaction chain for the next request
          const toolTurn: Content = { role: 'user', parts: toolOutputs };
          history = [...history, modelTurn, toolTurn];

          // Send tool outputs back to model to get final natural language response (or more calls)
          response = await this.genAI.models.generateContent({
            model: this.selectedModel(),
            contents: history, // Use the updated history
            config: {
                systemInstruction: this.getSystemInstruction(),
                tools: tools
            }
          });

          // DISPLAY INTERMEDIATE CONTENT (If any)
          const loopParts = response.candidates?.[0]?.content?.parts || [];
          this.displayResponseContent(loopParts);

          // Check if it wants to call MORE functions (chaining)
          functionCalls = this.getFunctionCalls(response);
      }

    } catch (error) {
      console.error('Gemini API Error:', error);
      this.messages.update(m => [...m, { role: 'model', type: 'system', text: "Connection Error", displayHtml: "Connection Error: " + error }]);
    } finally {
      this.isLoading.set(false);
    }
  }

  // --- TOOL EXECUTOR ---

  private async executeTool(call: any): Promise<any> {
      const args = call.args;

      switch (call.name) {
          case 'createPlan':
              if (args.steps) {
                  const newSteps = args.steps.map((s: any) => ({
                      id: Math.random().toString(36),
                      title: s.title,
                      description: s.description || '',
                      status: s.status || 'pending'
                  }));
                  this.planSteps.set(newSteps);
                  this.ensureProjectMode(); // Force UI to show the plan
                  return { success: true, count: newSteps.length, message: "Plan created. UI updated." };
              }
              return { success: false, message: "No steps provided." };

          case 'createRoutine':
              // Force enable routine module if AI creates a routine
              if (!this.activeModules().routine) {
                  this.updateModule('routine', true);
              }

              if (args.blocks) {
                  const newBlocks = args.blocks.map((b: any) => ({
                      id: Math.random().toString(36),
                      startTime: b.startTime,
                      endTime: b.endTime,
                      duration: this.calculateDuration(b.startTime, b.endTime),
                      title: b.title,
                      description: b.description || '',
                      type: b.type || 'shallow',
                      status: 'upcoming'
                  }));
                  this.routineBlocks.set(newBlocks);
                  this.syncRoutineWithTime();
                  this.ensureProjectMode(); // Force UI to show the routine
                  return { success: true, count: newBlocks.length, message: "Routine schedule updated. UI updated." };
              }
              return { success: false, message: "No blocks provided." };

          case 'createInteractiveTest':
              const testId = `test-${Date.now()}`;
              const questions: TestQuestion[] = (args.questions || []).map((q: any, idx: number) => ({
                  id: `q-${Date.now()}-${idx}`,
                  question: q.text,
                  audioUrl: q.audioUrl,
                  options: q.options || [],
                  correctKey: q.correctKey,
                  explanation: q.explanation
              }));
              
              this.activeTests.set(testId, {
                  id: testId,
                  topic: args.topic || "Quiz",
                  questions,
                  userAnswers: [],
                  completed: false
              });
              
              // We return the Widget Token so the model can embed it in the final text
              return { success: true, testId: testId, widgetToken: `[[WIDGET_TEST:${testId}]]` };

          case 'createAgent':
              const agentId = `agent-${Date.now()}`;
              this.createdAgents.set(agentId, {
                  name: args.name,
                  description: args.description,
                  systemPrompt: args.systemPrompt
              });
              
              // Return widget token for rendering
              return { success: true, agentId: agentId, widgetToken: `[[WIDGET_AGENT:${agentId}]]` };

          case 'createDesign':
              const designId = `design-${Date.now()}`;
              this.createdDesigns.set(designId, {
                  id: designId,
                  html: args.html,
                  width: args.width || 400,
                  height: args.height || 300,
                  description: args.description || 'Generated Design'
              });
              
              return { success: true, designId: designId, widgetToken: `[[WIDGET_DESIGN:${designId}]]` };

          case 'backgroundSelector':
              if (args.options && Array.isArray(args.options) && args.options.length === 4) {
                  const bgId = `bg-sel-${Date.now()}`;
                  this.activeBackgroundSelectors.set(bgId, args.options);
                  return { success: true, selectorId: bgId, widgetToken: `[[WIDGET_BG_SELECTOR:${bgId}]]` };
              }
              return { success: false, message: "Requires exactly 4 URL options." };

          case 'manageNotes':
              const action = args.action;
              // ID Resolution Logic for update/append if ID not explicit but Title is
              let targetNoteId = args.noteId;
              if ((action === 'update' || action === 'append') && !targetNoteId && args.title) {
                  const note = this.notes().find(n => n.title === args.title);
                  if (note) targetNoteId = note.id;
              }

              if (action === 'create') {
                  const newId = Math.random().toString(36);
                  this.addNote(args.title || 'Untitled', args.content || '');
                  this.ensureProjectMode(); // Force UI to show the note
                  return { success: true, action: 'create', noteId: newId };
              } else if (action === 'update') {
                  if (targetNoteId) {
                      const found = this.updateNote(targetNoteId, args.title, args.content);
                      if (!found) return { success: false, message: "Note ID not found for update" };
                      return { success: true, action: 'update' };
                  }
              } else if (action === 'append') {
                  if (targetNoteId) {
                      const found = this.appendNote(targetNoteId, args.content || '');
                      if (!found) return { success: false, message: "Note ID not found for append" };
                      return { success: true, action: 'append' };
                  } else {
                      return { success: false, message: "Note ID missing and Title could not be resolved for append." };
                  }
              } else if (action === 'delete') {
                  if (args.noteId) {
                      this.deleteNote(args.noteId);
                      return { success: true, action: 'delete' };
                  }
              }
              return { success: false, message: "Invalid note action parameters." };

          case 'setSystemState':
              if (args.appMode) {
                  await this.triggerAppTransition(args.appMode);
              }
              // Backward compatibility for single track play
              if (args.musicId) {
                  this.audioService.playTrackById(args.musicId);
              }
              if (args.zenMode !== undefined) {
                  this.zenMode.set(args.zenMode);
              }
              if (args.metadataUpdate) {
                  this.metadata.update(m => ({ ...m, ...args.metadataUpdate }));
              }
              return { success: true, state: "updated" };

          case 'controlMusic':
              if (args.action === 'stop') {
                  this.audioService.stop();
                  return { success: true, message: "Music stopped." };
              }
              if (args.action === 'play') {
                  if (args.trackIds && args.trackIds.length > 0) {
                      if (args.trackIds.length === 1) {
                          this.audioService.playTrackById(args.trackIds[0]);
                      } else {
                          this.audioService.playPlaylist(args.trackIds);
                      }
                      return { success: true, message: `Playing ${args.trackIds.length} tracks.` };
                  }
                  return { success: false, message: "No trackIds provided for play action." };
              }
              return { success: false, message: "Unknown music action." };

          case 'changeBackground':
              if (args.url) {
                  this.setWallpaper(args.url);
                  return { success: true, message: "Background changed." };
              }
              return { success: false, message: "Missing URL." };

          default:
              return { success: false, message: "Unknown tool name." };
      }
  }

  // --- UTILS & HELPERS ---

  private ensureProjectMode() {
      // Automatically switch to project mode if we are in landing mode, 
      // ensuring the panels open to show the new content.
      if (this.appMode() === 'landing') {
          this.triggerAppTransition('project');
      }
      
      // Ensure right panel is open even if already in project mode but closed
      this.rightPanelOpen.set(true);
      
      // Exit Zen mode if active so panels are visible
      if (this.zenMode()) {
          this.zenMode.set(false);
      }
  }

  private calculateDuration(start: string, end: string): string {
      const [sh, sm] = start.split(':').map(Number);
      const [eh, em] = end.split(':').map(Number);
      const diff = (eh * 60 + em) - (sh * 60 + sm);
      return diff > 0 ? `${diff}m` : '0m';
  }

  syncRoutineWithTime() {
    const blocks = this.routineBlocks();
    if (blocks.length === 0) return;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    let hasChanges = false;
    let activeBlock: RoutineBlock | null = null;

    const updatedBlocks = blocks.map(block => {
        const [startH, startM] = block.startTime.split(':').map(Number);
        const startTotal = startH * 60 + startM;

        const [endH, endM] = block.endTime.split(':').map(Number);
        const endTotal = endH * 60 + endM;

        let newStatus = block.status;
        let remainingLabel = undefined;

        if (currentMinutes >= endTotal) {
            newStatus = 'completed'; 
        } else if (currentMinutes >= startTotal && currentMinutes < endTotal) {
            newStatus = 'active';
            activeBlock = block;
            const diff = endTotal - currentMinutes;
            remainingLabel = `${diff}m left`;
        } else {
            newStatus = 'upcoming';
        }

        if (newStatus === 'active' && block.remainingLabel !== remainingLabel) {
             hasChanges = true;
             return { ...block, status: newStatus as any, remainingLabel };
        }

        if (newStatus !== block.status) {
            hasChanges = true;
            return { ...block, status: newStatus as any, remainingLabel: undefined };
        }
        return block;
    });

    if (hasChanges) {
        this.routineBlocks.set(updatedBlocks);
    }

    // WIDGET MANAGEMENT LOGIC
    if (activeBlock) {
        // State A: Block Changed OR Widget missing while deep work active
        if (activeBlock.id !== this.lastActiveBlockId || (activeBlock.type === 'deep' && this.activeWidget().type === 'none')) {
            this.lastActiveBlockId = activeBlock.id;
            
            if (activeBlock.type === 'deep') {
               const durationStr = activeBlock.duration.replace('m','');
               const duration = parseInt(durationStr) || 25;
               // Force start if not running or if it's a new block
               this.startPomodoro(duration); 
            } else if (activeBlock.type === 'break') {
                this.activeWidget.set({ type: 'none', data: null }); 
            }
        }
    } else {
        // No active block? Stop widget if running tied to a block
        // (Optional: keep running if user manually started? For now we sync strict with routine)
    }
  }

  // --- TEST ENGINE ---

  activateTest(testId: string) {
      const test = this.activeTests.get(testId);
      if (test) {
          this.activeAgent.set(null); 
          this.activeTest.set(test);
          this.rightPanelOpen.set(true);
      }
  }

  closeTest() {
      this.activeTest.set(null);
  }

  handleQuizAnswer(testId: string, questionId: string, answerKey: string) {
      const test = this.activeTests.get(testId);
      if (!test || test.completed) return;

      const question = test.questions.find(q => q.id === questionId);
      if (!question) return;

      if (test.userAnswers.find(a => a.questionId === questionId)) return;

      const isCorrect = answerKey === question.correctKey;
      test.userAnswers.push({ 
          questionId, 
          answerKey, 
          isCorrect, 
          correctKey: question.correctKey 
      });

      if (test.userAnswers.length === test.questions.length) {
          test.completed = true;
          this.submitTestSummary(test);
      }
      this.activeTest.update(t => t ? {...t} : null);
  }

  private submitTestSummary(test: InteractiveTest) {
      const correctCount = test.userAnswers.filter(a => a.isCorrect).length;
      const mistakes = test.userAnswers
          .filter(a => !a.isCorrect)
          .map(a => {
              const q = test.questions.find(q => q.id === a.questionId);
              return {
                  question: q?.question,
                  user_answer: a.answerKey,
                  correct_answer: a.correctKey
              };
          });

      const payload = {
          score: Math.round((correctCount / test.questions.length) * 100),
          total: test.questions.length,
          correct: correctCount,
          mistakes: mistakes
      };

      this.messages.update(m => [...m, {
          role: 'user',
          type: 'text',
          text: `[LOG: TEST_RESULT]\n${JSON.stringify(payload, null, 2)}`,
          hidden: true
      }]);
      
      this.processTurn(); 
  }

  // --- AGENT & SCRIPT SUPPORT ---

  async sendAgentMessage(userText: string) {
    const agent = this.activeAgent();
    if (!agent || !userText.trim()) return;

    this.activeAgent.update(a => {
        if (!a) return null;
        return {
            ...a,
            messages: [...a.messages, {
                role: 'user',
                type: 'text',
                text: userText,
                displayHtml: this.renderMarkdown(userText)
            }],
            isLoading: true
        };
    });

    try {
        const history: Content[] = agent.messages.map(m => ({
            role: m.role,
            parts: [{ text: m.text }]
        }));
        
        history.push({ role: 'user', parts: [{ text: userText }] });

        const response = await this.genAI.models.generateContent({
            model: this.selectedModel(),
            contents: history,
            config: {
                systemInstruction: agent.systemPrompt,
                temperature: 0.7
            }
        });

        const text = response.text || "I'm having trouble connecting.";

        this.activeAgent.update(a => {
            if (!a) return null;
            return {
                ...a,
                messages: [...a.messages, {
                    role: 'model',
                    type: 'text',
                    text: text,
                    displayHtml: this.renderMarkdown(text)
                }],
                isLoading: false
            };
        });

    } catch (e) {
        console.error("Agent Error:", e);
        this.activeAgent.update(a => a ? { ...a, isLoading: false } : null);
    }
  }

  async generateRawResponse(prompt: string, systemInstruction?: string): Promise<string> {
      try {
          const config: any = { temperature: 0.7 };
          if (systemInstruction) config.systemInstruction = systemInstruction;

          const response = await this.genAI.models.generateContent({
              model: this.selectedModel(),
              contents: prompt,
              config: config
          });
          return response.text || "";
      } catch (e) {
          console.error("Raw Gen Error", e);
          return "Error: " + e;
      }
  }

  // --- RENDERER (TOKEN SWAP STRATEGY + KATEX) ---

  public renderMarkdown(text: string): SafeHtml {
    // 1. Process standard markdown first
    let html = marked.parse(text) as string;

    // 2. KaTeX Math Rendering
    if (typeof katex !== 'undefined') {
       try {
           html = html.replace(/\$\$([\s\S]+?)\$\$/g, (match, tex) => {
               try { return katex.renderToString(tex, { displayMode: true, throwOnError: false }); } catch(e) { return match; }
           });
           html = html.replace(/\$([^$]+?)\$/g, (match, tex) => {
               try { return katex.renderToString(tex, { displayMode: false, throwOnError: false }); } catch(e) { return match; }
           });
       } catch(e) { console.error("KaTeX Error", e); }
    }

    // 3. WIDGET: Interactive Test
    const testTokenRegex = /\[\[WIDGET_TEST:([a-zA-Z0-9\-_]+)\]\]/g;
    html = html.replace(testTokenRegex, (match, testId) => {
        const test = this.activeTests.get(testId);
        if (!test) return `<div class="p-4 border border-red-500 rounded text-red-400 text-xs">Test Widget Error: ID ${testId} not found</div>`;

        return `
            <div class="agent-card p-5 bg-[#2B2930] rounded-2xl border border-[#444746] flex flex-col items-start my-4 group hover:border-[#D0BCFF] transition-all relative overflow-hidden">
               <div class="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                   <span class="material-symbols-outlined text-[64px]">school</span>
               </div>
               
               <div class="flex items-center gap-3 mb-3 z-10">
                    <div class="w-10 h-10 rounded-full bg-[#D0BCFF] text-[#381E72] flex items-center justify-center shadow-md">
                        <span class="material-symbols-outlined text-[20px]">quiz</span>
                    </div>
                    <div>
                        <div class="font-bold text-[#E3E3E3] text-lg">${test.topic}</div>
                        <div class="text-xs text-[#C4C7C5]">${test.questions.length} Questions</div>
                    </div>
               </div>
               
               <button class="test-run-btn w-full py-3 rounded-xl bg-[#4F378B] hover:bg-[#6750A4] text-[#EADDFF] font-medium transition-colors flex items-center justify-center gap-2 z-10 active:scale-95" data-testid="${test.id}">
                  <span class="material-symbols-outlined text-[18px]">play_arrow</span>
                  <span>Start Quiz</span>
               </button>
            </div>
        `;
    });

    // 4. WIDGET: Agent
    const agentTokenRegex = /\[\[WIDGET_AGENT:([a-zA-Z0-9\-_]+)\]\]/g;
    html = html.replace(agentTokenRegex, (match, agentId) => {
        const agent = this.createdAgents.get(agentId);
        if (!agent) return `<div class="p-4 border border-red-500 rounded text-red-400 text-xs">Agent Error: ID ${agentId} not found</div>`;
        
        const configStr = encodeURIComponent(JSON.stringify({ 
            name: agent.name, 
            description: agent.description, 
            systemPrompt: encodeURIComponent(agent.systemPrompt) 
        }));

        return `<div class="agent-card p-4 bg-[#2B2930] rounded-xl border border-[#444746] flex justify-between items-center my-4 group hover:border-[#D0BCFF] transition-all">
               <div class="flex-1 min-w-0 mr-4">
                 <div class="flex items-center gap-2 mb-1">
                    <span class="material-symbols-outlined text-[#D0BCFF]">smart_toy</span>
                    <div class="font-bold text-[#E3E3E3] truncate">${agent.name}</div>
                 </div>
                 <div class="text-xs text-[#C4C7C5] line-clamp-2">${agent.description}</div>
               </div>
               <button class="agent-run-btn w-10 h-10 rounded-full bg-[#D0BCFF] text-[#381E72] flex items-center justify-center hover:scale-110 transition-transform shadow-lg" data-config="${configStr}"><span class="material-symbols-outlined pointer-events-none">play_arrow</span></button>
            </div>`;
    });

    // 5. WIDGET: Design (Generated Image/HTML)
    const designTokenRegex = /\[\[WIDGET_DESIGN:([a-zA-Z0-9\-_]+)\]\]/g;
    html = html.replace(designTokenRegex, (match, designId) => {
        const design = this.createdDesigns.get(designId);
        if (!design) return `<div class="p-4 border border-red-500 rounded text-red-400 text-xs">Design Error: ID ${designId} not found</div>`;

        // We give a unique ID to the preview container so we can grab it for HTML-to-Image
        // We ensure the export button is OUTSIDE the capture area (design-preview)
        return `
            <div class="design-widget my-6 rounded-2xl overflow-hidden border border-[#444746] bg-[#000] relative group" id="design-container-${designId}">
                <div class="flex items-center justify-between px-4 py-3 bg-[#1E1F20] border-b border-[#444746]">
                     <div class="flex items-center gap-2">
                        <span class="material-symbols-outlined text-[#D0BCFF] text-sm">palette</span>
                        <span class="text-xs font-bold text-[#C4C7C5] uppercase tracking-wide">Generated Design</span>
                     </div>
                     <span class="text-[10px] text-[#8E918F]">${design.description}</span>
                </div>
                
                <div class="relative overflow-auto flex items-center justify-center p-8 bg-checkerboard" style="min-height: ${design.height}px;">
                    <!-- This div acts as the canvas. We apply the AI's HTML directly here. -->
                    <div class="design-preview shadow-2xl origin-center transition-transform" style="width: ${design.width}px; height: ${design.height}px;">
                        ${design.html}
                    </div>
                </div>

                <div class="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                     <button 
                       class="design-export-btn bg-[#2B2930] hover:bg-[#D0BCFF] hover:text-[#381E72] text-[#E3E3E3] p-2 rounded-lg shadow-lg flex items-center gap-2 transition-colors text-xs font-medium border border-[#444746]"
                       data-design-id="${designId}"
                     >
                        <span class="material-symbols-outlined text-[16px]">download</span>
                        <span>Download Design</span>
                     </button>
                </div>
            </div>
            <style>.bg-checkerboard { background-image: radial-gradient(#333 1px, transparent 1px); background-size: 20px 20px; }</style>
        `;
    });

    // 6. WIDGET: Background Selector (NEW)
    const bgSelectorTokenRegex = /\[\[WIDGET_BG_SELECTOR:([a-zA-Z0-9\-_]+)\]\]/g;
    html = html.replace(bgSelectorTokenRegex, (match, selectorId) => {
        const options = this.activeBackgroundSelectors.get(selectorId);
        if (!options) return `<div class="p-4 border border-red-500 rounded text-red-400 text-xs">Selector Error: ID ${selectorId} not found</div>`;

        let gridHtml = `<div class="grid grid-cols-2 gap-3 my-4">`;
        options.forEach(url => {
            gridHtml += `
                <div class="relative group aspect-video rounded-xl overflow-hidden cursor-pointer border border-transparent hover:border-[#D0BCFF] transition-all bg-[#2B2930]">
                    <img src="${url}" class="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity">
                    <button 
                        class="background-selector-btn absolute inset-0 z-10 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                        data-url="${url}"
                    >
                        <span class="material-symbols-outlined text-white text-3xl">check_circle</span>
                    </button>
                </div>
            `;
        });
        gridHtml += `</div>`;

        return `
            <div class="bg-[#1E1F20] p-4 rounded-2xl border border-[#444746] my-4">
                <div class="flex items-center gap-2 mb-2 text-xs font-bold text-[#C4C7C5] uppercase tracking-wide">
                    <span class="material-symbols-outlined text-sm text-[#D0BCFF]">wallpaper</span> Select Wallpaper
                </div>
                ${gridHtml}
            </div>
        `;
    });

    // 7. WIDGET: Code Execution
    // This is generated manually in partsToMarkdown to bypass marked escaping
    const codeTokenRegex = /\[\[WIDGET_CODE:([a-zA-Z0-9+\/=]+)\]\]/g;
    html = html.replace(codeTokenRegex, (match, b64) => {
        try {
            const jsonStr = decodeURIComponent(escape(atob(b64)));
            const data = JSON.parse(jsonStr);
            const escapedCode = this.escapeHtml(data.code || '');
            const escapedOutput = this.escapeHtml(data.output || '');
            
            return `
<div class="code-widget-container my-5 rounded-lg border border-[#444746] bg-[#1e1e1e] overflow-hidden shadow-lg select-text font-mono text-sm">
  <button class="code-widget-toggle w-full flex items-center justify-between px-4 py-3 bg-[#252526] hover:bg-[#2a2d2e] transition-colors cursor-pointer group text-[#cccccc] border-b border-[#444746]/50">
    <div class="flex items-center gap-2.5">
      <span class="material-symbols-outlined text-[16px] text-green-400">terminal</span>
      <span class="text-xs font-semibold tracking-wide uppercase text-[#cccccc] group-hover:text-white">Code Executed</span>
    </div>
    <span class="material-symbols-outlined text-[18px] text-[#8E918F] transition-transform duration-300 chevron transform">expand_more</span>
  </button>
  
  <div class="code-widget-content hidden animate-in slide-in-from-top-2 duration-200">
    <div class="bg-[#1e1e1e] p-0">
      <div class="flex items-center justify-between px-4 py-1.5 bg-[#1e1e1e] border-b border-[#333333]">
         <span class="text-[10px] uppercase font-bold text-[#6e7681]">Input (Python)</span>
      </div>
      <div class="p-4 pt-2 overflow-x-auto">
        <code class="text-[#9cdcfe] whitespace-pre block text-xs leading-relaxed">${escapedCode}</code>
      </div>
    </div>
    
    <div class="bg-[#181818] border-t border-[#444746]">
       <div class="flex items-center justify-between px-4 py-1.5 bg-[#181818] border-b border-[#333333]">
         <span class="text-[10px] uppercase font-bold text-[#6e7681]">Output</span>
      </div>
      <div class="p-4 pt-2 overflow-x-auto">
        <code class="text-[#ce9178] whitespace-pre block text-xs leading-relaxed">${escapedOutput || '<span class="opacity-50 italic">No standard output</span>'}</code>
      </div>
    </div>
  </div>
</div>`;
        } catch(e) {
            return `<div class="text-red-500 text-xs">Error rendering code widget</div>`;
        }
    });

    // 8. Cleanup: Remove empty paragraphs that marked might have left around our tokens
    html = html.replace(/<p>\s*<\/p>/g, '');

    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  // --- HELPER FUNCTIONS & STATE UPDATERS ---

  updateModule(key: keyof ModuleState, value: boolean) { this.activeModules.update(m => ({ ...m, [key]: value })); }
  setRightPanelWidth(w: number) { this.rightPanelWidth.set(w); }
  setTheme(t: ThemeType) { this.theme.set(t); }
  setWallpaper(u: string|null) { this.wallpaper.set(u); }
  openSettings() { this.showSettings.set(true); }
  closeSettings() { this.showSettings.set(false); }
  
  activateAgent(c: any) { this.zenMode.set(false); this.rightPanelOpen.set(true); this.activeTest.set(null); this.activeAgent.set({name:c.name, description:c.description, systemPrompt:c.systemPrompt, messages:[{role:'model',type:'text',text:`Hello! I am ${c.name}.`, displayHtml:`Hello! I am ${c.name}.`}], isLoading:false}); }
  closeAgent() { this.activeAgent.set(null); this.setRightPanelWidth(360); }
  
  toggleDevPanel() { this.showDevPanel.update(v=>!v); }
  toggleZenMode() { this.zenMode.update(v=>!v); }
  toggleWidgetVisibility() { this.widgetVisible.update(v=>!v); }
  
  resetSystemInstruction() { 
      // Reset the signal to the original raw instruction
      const original = this.rawInstructions['system_base.txt'] || "";
      this.systemInstructionTemplate.set(original);
      this.addSystemMessage("🛠️ System Instructions reset.");
  }
  
  getNoteContent(t:string){return this.notes().find(n=>n.title===t)?.content||null;}
  
  updateNoteContent(t:string,c:string){
      let found = false;
      this.notes.update(n => {
          const idx = n.findIndex(x => x.title === t);
          if(idx !== -1) { found = true; n[idx] = {...n[idx], content: c}; return [...n]; }
          return n;
      });
      return found;
  }
  
  deleteNoteByTitle(t:string){
      let found = false;
      this.notes.update(n => {
          const prevLen = n.length;
          const filtered = n.filter(x => x.title !== t);
          if (filtered.length !== prevLen) found = true;
          return filtered;
      });
      return found;
  }
  
  updatePlanStatus(t:string,s:string){
      let found = false;
      this.planSteps.update(steps => {
          const idx = steps.findIndex(x => x.title.toLowerCase().includes(t.toLowerCase()));
          if(idx !== -1) { 
              found = true; 
              steps[idx] = {...steps[idx], status: s as any}; 
              return [...steps];
          }
          return steps;
      });
      return found;
  }

  addFile(f:any){this.files.update(fs=>[...fs,{...f, id:Math.random().toString()}]);}
  getFile(n:string){return this.files().find(f=>f.name===n);}
  deleteFile(id:string){this.files.update(fs=>fs.filter(f=>f.id!==id));}
  
  logAction(m:string){ console.log("System Action:", m); }
  addSystemMessage(t:string){this.messages.update(m=>[...m,{role:'model',type:'system',text:t,displayHtml:t}]);}
  addMessage(m:ChatMessage){this.messages.update(msgs=>[...msgs,m]);}
  playMusic(id:string){this.audioService.playTrackById(id);}
  endRoutine(){this.routineBlocks.set([]);}
  
  startPomodoro(m:number){
      if(this.timerInterval) clearInterval(this.timerInterval);
      
      this.activeWidget.set({type:'pomodoro', data:{current:m*60, isPaused:false}});
      this.widgetVisible.set(true);
      
      this.timerInterval = setInterval(() => {
          this.activeWidget.update(w => {
              if(w.type === 'pomodoro' && !w.data.isPaused && w.data.current > 0) return {...w, data:{...w.data, current: w.data.current - 1}};
              return w;
          });
      }, 1000);
  }
  
  toggleTimerPause(){
      this.activeWidget.update(w => {
          if(w.type === 'pomodoro') return {...w, data:{...w.data, isPaused: !w.data.isPaused}};
          return w;
      });
  }
  
  stopWidget(){
      this.activeWidget.set({type:'none', data:null});
      if(this.timerInterval) clearInterval(this.timerInterval);
  }
  
  updatePersona(p:string){this.userPersona.set(p);}
  setZenMode(v:boolean){this.zenMode.set(v);}
  
  triggerManualRefresh(){
     this.processTurn("Context Refresh: Please check current state and update if necessary.");
  }
  
  // Transition Logic for setSystemState tool
  async triggerAppTransition(mode: string) {
      if (mode !== 'landing' && mode !== 'project' && mode !== 'study') return;
      this.appMode.set(mode as AppMode);
      
      if (mode === 'project') {
          setTimeout(() => {
              this.leftSidebarOpen.set(true);
              this.rightPanelOpen.set(true);
          }, 800); 
      } else if (mode === 'study') {
          setTimeout(() => {
              this.leftSidebarOpen.set(true); 
              this.rightPanelOpen.set(true);
              this.updateModule('routine', true); 
          }, 800);
      }
  }

  addPlanStep(t:string,d:string){
      this.planSteps.update(s => [...s, {id:Math.random().toString(), title:t, description:d, status:'pending'}]);
  }
  insertPlanStep(id:string,t:string){
      this.planSteps.update(s => {
          const idx = s.findIndex(x => x.id === id);
          if(idx===-1) return s;
          const copy = [...s];
          copy.splice(idx+1, 0, {id:Math.random().toString(), title:t, description:'', status:'pending'});
          return copy;
      });
  }
  updatePlanStep(id:string,t:string,d:string){
      this.planSteps.update(s => s.map(x => x.id===id ? {...x, title:t, description:d} : x));
  }
  deletePlanStep(id:string){
      this.planSteps.update(s => s.filter(x => x.id!==id));
  }
  movePlanStep(id:string, dir:'up'|'down'){
       this.planSteps.update(steps => {
          const idx = steps.findIndex(s => s.id === id);
          if (idx === -1) return steps;
          const newSteps = [...steps];
          if (dir === 'up' && idx > 0) {
             [newSteps[idx], newSteps[idx-1]] = [newSteps[idx-1], newSteps[idx]];
          } else if (dir === 'down' && idx < steps.length - 1) {
             [newSteps[idx], newSteps[idx+1]] = [newSteps[idx+1], newSteps[idx]];
          }
          return newSteps;
      });
  }
  
  addNote(t:string,c:string){
      this.notes.update(n => [...n, {id:Math.random().toString(), title:t, content:c}]);
  }
  updateNote(id:string,t:string,c:string){
      let found = false;
      this.notes.update(n => {
          const idx = n.findIndex(x => x.id === id);
          if(idx !== -1) { found = true; n[idx] = {...n[idx], title:t, content:c}; return [...n]; }
          return n;
      });
      return found;
  }
  appendNote(id: string, additionalContent: string): boolean {
      let found = false;
      this.notes.update(n => {
          const idx = n.findIndex(x => x.id === id);
          if (idx !== -1) {
              found = true;
              const prev = n[idx].content;
              const newContent = prev ? (prev + '\n\n' + additionalContent) : additionalContent;
              n[idx] = { ...n[idx], content: newContent };
              return [...n];
          }
          return n;
      });
      return found;
  }
  deleteNote(id:string){
      this.notes.update(n => n.filter(x => x.id!==id));
  }
}