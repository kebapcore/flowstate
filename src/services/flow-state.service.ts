import { Injectable, signal, computed, inject, WritableSignal } from '@angular/core';
import { GoogleGenAI, Content, Part, FunctionDeclaration, Type, Tool, FunctionCallingConfigMode, Modality } from '@google/genai';
import { marked } from 'marked';
import { AudioService, MusicTrack } from './audio.service';
import { FlowCloudService } from './flow-cloud.service';
import { AuthService } from './auth.service';
import { supabase } from '../lib/supabase-client';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

declare const katex: any; // Globals from index.html

// --- AUDIO UTILS (PCM CONVERSION) ---
function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return output.buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

// --- TOOL DEFINITIONS (Function Calling Schemas) ---

const createPlanTool: FunctionDeclaration = {
  name: "createPlan",
  description: "Creates or overwrites the project plan/curriculum. VISIBLE IN UI 'Plan' TAB.",
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
  description: "Manages the user's notebook. VISIBLE IN UI 'Notes' TAB.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      action: { type: Type.STRING, enum: ["create", "update", "append", "delete"], description: "Action to perform." },
      noteId: { type: Type.STRING, description: "ID of the note (required for update/append/delete)" },
      title: { type: Type.STRING, description: "Title of the note" },
      content: { type: Type.STRING, description: "Content of the note" }
    },
    required: ["action"]
  }
};

const setSystemStateTool: FunctionDeclaration = {
  name: "setSystemState",
  description: "Updates global system state including app mode, music, zen mode.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      appMode: { type: Type.STRING, enum: ["landing", "project", "study"], description: "Switch application mode" },
      musicId: { type: Type.STRING, description: "ID of the music track to play" },
      zenMode: { type: Type.BOOLEAN, description: "Enable or disable Zen Mode" },
      metadataUpdate: {
        type: Type.OBJECT,
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
  description: "Advanced music control.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      action: { type: Type.STRING, enum: ["play", "stop"], description: "Action to perform." },
      trackIds: { 
          type: Type.ARRAY, 
          items: { type: Type.STRING }, 
          description: "List of track IDs to play." 
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
  description: "Creates a specialized AI sub-agent/persona.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: "Name of the agent" },
      description: { type: Type.STRING, description: "Short description" },
      systemPrompt: { type: Type.STRING, description: "The specific system instructions for this agent" }
    },
    required: ["name", "description", "systemPrompt"]
  }
};

const createDesignTool: FunctionDeclaration = {
    name: "createDesign",
    description: "Generates a visual design (card, banner, chart) by writing HTML/CSS code.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        html: { type: Type.STRING, description: "Complete, self-contained HTML and CSS code (inline <style>)." },
        width: { type: Type.NUMBER, description: "Preferred width in pixels (default 400)." },
        height: { type: Type.NUMBER, description: "Preferred height in pixels (default 300)." },
        description: { type: Type.STRING, description: "Short description of design." }
      },
      required: ["html"]
    }
};

const backgroundSelectorTool: FunctionDeclaration = {
    name: "backgroundSelector",
    description: "Provides a selection of 4 wallpapers for the user to choose from.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            options: {
                type: Type.ARRAY,
                description: "Array of exactly 4 HTTPS image URLs.",
                items: { type: Type.STRING }
            }
        },
        required: ["options"]
    }
};

const generateImageTool: FunctionDeclaration = {
  name: "generateImage",
  description: "Generates an image based on a text prompt.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      prompt: { type: Type.STRING, description: "Detailed description of the image." },
      aspectRatio: { type: Type.STRING, enum: ["1:1", "16:9", "4:3", "3:4", "9:16"], description: "Aspect ratio." },
      model: { type: Type.STRING, enum: ["gemini-2.5-flash-image", "gemini-3-pro-image-preview"], description: "Model to use." }
    },
    required: ["prompt"]
  }
};

// --- INTERFACES ---

export interface ModuleState {
  core: boolean;       
  files: boolean;      
  routine: boolean;
  liveCall: boolean; // New Module
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

export interface ChatSession {
    id: string;
    title: string;
    lastModified: number;
    // We store the essential state to restore the session
    messages: ChatMessage[];
    planSteps: PlanStep[];
    notes: Note[];
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
  private authService = inject(AuthService);
  private sanitizer = inject(DomSanitizer);
  private timerInterval: any;
  private lastActiveBlockId: string | null = null;
  
  // LIVE MODE STATE
  isLiveMode = signal(false);
  isLiveConnecting = signal(false);
  liveDuration = signal(0);
  private liveSession: any = null;
  private audioContext: AudioContext | null = null;
  private inputProcessor: ScriptProcessorNode | null = null;
  private mediaStream: MediaStream | null = null;
  private liveTimerInterval: any;
  public audioAnalyser: AnalyserNode | null = null; // Exposed for Visualizer
  
  // Audio Queue Scheduling State
  private nextAudioStartTime = 0;

  // GLOBAL APP STATE
  appMode = signal<AppMode>('landing');
  
  // New: Landing Overlay State (Controls the Video/Features view vs Input view)
  showLandingOverlay = signal(true);

  // CONFIG STATE
  apiKey = signal<string>('');
  selectedModel = signal<string>('gemini-2.5-flash');
  
  // DEV PANEL STATE
  showDevPanel = signal(false);

  // CHAT HISTORY STATE (Local Only)
  savedChats = signal<ChatSession[]>([]);
  currentChatId = signal<string | null>(null);

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
  
  // APPEARANCE STATE
  showSettings = signal(false);
  theme = signal<ThemeType>('material');
  wallpaper = signal<string | null>(null);

  // MODULES
  activeModules = signal<ModuleState>({
    core: true,
    files: false,    
    routine: true,
    liveCall: false 
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
    this.loadChats(); // Load local chats

    this.messages.set([]); 
    
    // Start System Initialization
    this.initializeSystem();

    setInterval(() => this.syncRoutineWithTime(), 30000); 
    setTimeout(() => this.syncRoutineWithTime(), 1000);
  }

  private initializeConfig() {
      // 1. Load API Key (LocalStorage ONLY - No Env)
      const storedKey = localStorage.getItem('flow_api_key');
      
      if (storedKey && storedKey.trim().length > 0) {
          this.apiKey.set(storedKey);
          this.initGenAIClient();
      } 
      // If no key, we wait for user to input it.
      
      // 2. Load Model
      const storedModel = localStorage.getItem('flow_model');
      if (storedModel) this.selectedModel.set(JSON.parse(storedModel));
  }

  private initGenAIClient() {
      const key = this.apiKey();
      if (!key) {
          return;
      }
      this.genAI = new GoogleGenAI({ apiKey: key });
      console.log("✅ GenAI Client Initialized.");
  }

  updateApiKey(newKey: string) {
      this.apiKey.set(newKey);
      localStorage.setItem('flow_api_key', newKey);
      this.initGenAIClient();
  }

  setModel(m: string) { 
      this.selectedModel.set(m); 
      localStorage.setItem('flow_model', JSON.stringify(m)); 
  }

  // --- LOCAL CHAT HISTORY LOGIC ---

  private loadChats() {
      try {
          const stored = localStorage.getItem('flow_chats');
          if (stored) {
              this.savedChats.set(JSON.parse(stored));
          }
      } catch (e) { console.error("Failed to load chats", e); }
  }

  private saveChatsToStorage() {
      localStorage.setItem('flow_chats', JSON.stringify(this.savedChats()));
  }

  createNewChat() {
      // Save current if exists and has messages
      if (this.currentChatId() && this.messages().length > 0) {
          this.saveCurrentSession();
      }

      this.currentChatId.set(null);
      this.messages.set([]);
      this.planSteps.set([]);
      this.notes.set([]);
      this.appMode.set('landing'); 
      this.showLandingOverlay.set(false); // Dismiss marketing, show input
      this.leftSidebarOpen.set(false);
  }

  async loadChatSession(sessionId: string) {
      // Save current first
      if (this.currentChatId() === sessionId) return;
      if (this.currentChatId()) this.saveCurrentSession();

      const session = this.savedChats().find(s => s.id === sessionId);
      if (session) {
          this.currentChatId.set(sessionId);
          this.messages.set(session.messages || []);
          this.planSteps.set(session.planSteps || []);
          
          // --- SUPABASE FETCH ---
          // If user is logged in, replace local notes/routines with cloud data
          if (this.authService.user()) {
              await this.fetchCloudData(sessionId);
          } else {
              // Fallback to local
              this.notes.set(session.notes || []);
          }
          
          // Determine mode based on content
          if (session.planSteps.length > 0 || this.notes().length > 0) {
              this.appMode.set('project');
              this.rightPanelOpen.set(true);
          } else {
              this.appMode.set('landing'); 
          }
          this.showLandingOverlay.set(false); // Always hide overlay when loading a chat
          this.leftSidebarOpen.set(false); 
      }
  }

  // Fetch Notes and Routines from Supabase
  private async fetchCloudData(projectId: string) {
      try {
          // 1. Fetch Notes
          const { data: notesData, error: notesError } = await supabase
              .from('notes')
              .select('*')
              .eq('project_id', projectId);
          
          if (!notesError && notesData) {
              const mappedNotes: Note[] = notesData.map(n => ({
                  id: n.id,
                  title: n.title,
                  content: n.content
              }));
              this.notes.set(mappedNotes);
          }

          // 2. Fetch Routines
          const { data: routineData, error: routineError } = await supabase
              .from('routines')
              .select('blocks')
              .eq('project_id', projectId)
              .single();
          
          if (!routineError && routineData?.blocks) {
              // Assuming blocks is stored as JSON array
              this.routineBlocks.set(routineData.blocks as RoutineBlock[]);
          }

      } catch (e) {
          console.error("Failed to sync cloud data", e);
      }
  }

  saveCurrentSession() {
      const msgs = this.messages();
      if (msgs.length === 0) return;

      const currentId = this.currentChatId();
      let title = "New Chat";
      
      // Determine title from first user message
      const firstUserMsg = msgs.find(m => m.role === 'user');
      if (firstUserMsg) {
          title = firstUserMsg.text.slice(0, 30) + (firstUserMsg.text.length > 30 ? '...' : '');
      }

      const sessionId = currentId || Math.random().toString(36).substring(7);

      const session: ChatSession = {
          id: sessionId,
          title: title,
          lastModified: Date.now(),
          messages: msgs,
          planSteps: this.planSteps(),
          notes: this.notes() // Saved locally still
      };

      this.savedChats.update(chats => {
          const idx = chats.findIndex(c => c.id === session.id);
          if (idx >= 0) {
              const newChats = [...chats];
              newChats[idx] = session;
              return newChats;
          } else {
              return [session, ...chats];
          }
      });
      
      this.currentChatId.set(session.id);
      this.saveChatsToStorage();

      // OPTIONAL: Sync Project Metadata to Supabase if you want persistence for chat history too
      // For now, we only sync Notes and Routines as requested.
      if (this.authService.user() && this.currentChatId()) {
          this.upsertProject(sessionId, title);
      }
  }

  private async upsertProject(id: string, title: string) {
      const user = this.authService.user();
      if(!user) return;
      await supabase.from('projects').upsert({
          id,
          user_id: user.id,
          title,
          last_modified: Date.now()
      });
  }

  deleteChatSession(id: string) {
      this.savedChats.update(chats => chats.filter(c => c.id !== id));
      this.saveChatsToStorage();
      if (this.currentChatId() === id) {
          this.createNewChat();
          this.showLandingOverlay.set(true); // Reset to landing if current deleted
      }
  }

  // --- SYSTEM INIT ---

  private async initializeSystem() {
      // Fetch all required instructions from FlowCloud
      try {
          const files = [
              'system_base.txt',
              'note_system.txt',
              'routine_management.txt',
              'agent_creation.txt',
              'test_extra.txt',
              'dj_mode.txt',
              'music_list.txt'
          ];
          
          await Promise.all(files.map(async (f) => {
              this.rawInstructions[f] = await this.flowCloud.fetchInstruction(f);
          }));
          
          if (this.rawInstructions['music_list.txt']) {
              try {
                  const rawTracks = JSON.parse(this.rawInstructions['music_list.txt']);
                  if (Array.isArray(rawTracks)) {
                      this.audioService.setLibrary(rawTracks);
                      // Don't auto-play on load anymore, wait for user interaction
                  }
              } catch (e) {
                  console.error("Failed to parse music_list.txt", e);
              }
          }

          this.systemInstructionTemplate.set(this.rawInstructions['system_base.txt'] || "");
          this.isSystemReady.set(true);
          console.log("✅ FlowState System Ready.");
      } catch (e) {
          console.error("System Initialization Failed", e);
          this.isSystemReady.set(true); // Fallback to ready to prevent lock
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
    let instruction = this.systemInstructionTemplate() || this.rawInstructions['system_base.txt'] || "";
    instruction += "\n\n" + (this.rawInstructions['note_system.txt'] || "");
    instruction += "\n\n" + (this.rawInstructions['agent_creation.txt'] || "");
    instruction += "\n\n" + (this.rawInstructions['test_extra.txt'] || "");
    instruction += "\n\n" + (this.rawInstructions['dj_mode.txt'] || "");

    if (this.activeModules().routine) {
        instruction += "\n\n" + (this.rawInstructions['routine_management.txt'] || "");
    }

    const library = this.audioService.library();
    const musicListStr = library.length > 0 
        ? library.map(t => `- ${t.id} (Mood: ${t.mood}, Name: ${t.name})`).join('\n')
        : "No music loaded.";

    instruction += `\n\n### AVAILABLE MUSIC TRACKS (Dynamically Loaded):\n${musicListStr}`;
    instruction += `\n\n### MUSIC CONTROL:\nUse the 'controlMusic' tool to create playlists (pass multiple IDs) or stop playback.`;
    
    instruction += `\n\n### UI WIDGET PROTOCOL (CRITICAL)
If a tool execution returns a JSON field named 'widgetToken' (e.g., "[[WIDGET_TEST:id]]", "[[WIDGET_DESIGN:id]]", "[[WIDGET_BG_SELECTOR:id]]", "[[WIDGET_IMAGE:id]]"), you **MUST** include this exact string in your final text response.`;
    
    instruction += `\n\n### SPECIAL TOKENS:
    - [widget_request_url]: If you need to browse the web or get specific URL contents from the user to answer a query, output this token exactly. It will show a UI for the user to input URLs.`;

    instruction += `\n\n### CURRENT CONTEXT:\nAPP_MODE: ${this.appMode().toUpperCase()}`;
    instruction += `\nUSER_PERSONA: ${this.userPersona()}`;

    return instruction;
  }

  // --- LIVE AUDIO MODE ---

  async connectLive() {
      // Check Module
      if (!this.activeModules().liveCall) {
          console.warn("Live Call module disabled");
          return;
      }
      
      if (!this.apiKey()) {
          this.addSystemMessage("Please configure your API Key in settings first.");
          this.openSettings();
          return;
      }

      if (this.isLiveConnecting()) return;
      
      this.isLiveConnecting.set(true);
      this.audioService.stop();

      try {
          this.audioContext = new AudioContext({ sampleRate: 24000 });
          this.audioAnalyser = this.audioContext.createAnalyser();
          this.audioAnalyser.fftSize = 256;
          this.nextAudioStartTime = this.audioContext.currentTime;

          this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, sampleRate: 16000 } });
          
          const config = {
              generationConfig: {
                  responseModalities: ["AUDIO" as Modality],
                  speechConfig: {
                      voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } }
                  }
              },
              systemInstruction: { parts: [{ text: this.getSystemInstruction() }] }
          };

          const contextHistory: Content[] = this.messages()
              .slice(-10)
              .filter(m => m.text && m.text.trim().length > 0 && m.type !== 'system')
              .map(m => {
                  return { role: m.role, parts: [{ text: m.text }] };
              });

          this.liveSession = await this.genAI.live.connect({
              model: 'gemini-2.5-flash-native-audio-preview-12-2025',
              config: config,
              callbacks: {
                  onopen: () => console.log("Live Session Connected"),
                  onmessage: (msg: any) => this.handleIncomingMessage(msg),
                  onclose: () => this.disconnectLive(),
                  onerror: (e: any) => {
                      console.error("Live Session Error:", e);
                      this.disconnectLive();
                  }
              }
          });

          if (contextHistory.length > 0) {
              await this.liveSession.sendClientContent({ turns: contextHistory, turnComplete: true });
          }

          const source = this.audioContext.createMediaStreamSource(this.mediaStream);
          this.inputProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
          
          this.inputProcessor.onaudioprocess = (e) => {
              if (!this.liveSession) return;
              
              const inputData = e.inputBuffer.getChannelData(0);
              const pcm16 = floatTo16BitPCM(inputData);
              const base64 = arrayBufferToBase64(pcm16);
              
              this.liveSession.sendRealtimeInput({
                  audio: {
                      data: base64,
                      mimeType: "audio/pcm;rate=" + e.inputBuffer.sampleRate
                  }
              });
          };

          source.connect(this.inputProcessor);
          const mute = this.audioContext.createGain();
          mute.gain.value = 0;
          this.inputProcessor.connect(mute);
          mute.connect(this.audioContext.destination);
          
          source.connect(this.audioAnalyser);

          this.isLiveMode.set(true);
          this.liveTimerInterval = setInterval(() => this.liveDuration.update(v => v + 1), 1000);

      } catch (e) {
          console.error("Live Connection Failed", e);
          this.disconnectLive();
      } finally {
          this.isLiveConnecting.set(false);
      }
  }

  async disconnectLive() {
      if (this.liveSession) {
          try { this.liveSession.close(); } catch(e) {}
          this.liveSession = null;
      }
      if (this.mediaStream) {
          this.mediaStream.getTracks().forEach(t => t.stop());
          this.mediaStream = null;
      }
      if (this.inputProcessor) {
          this.inputProcessor.disconnect();
          this.inputProcessor = null;
      }
      if (this.audioContext) {
          try { await this.audioContext.close(); } catch(e) {}
          this.audioContext = null;
      }
      if (this.liveTimerInterval) {
          clearInterval(this.liveTimerInterval);
      }
      this.liveDuration.set(0);
      this.isLiveMode.set(false);
      this.nextAudioStartTime = 0;
  }

  private handleIncomingMessage(msg: any) {
      if (!msg.serverContent) return;
      const content = msg.serverContent;

      if (content.interrupted) {
          this.nextAudioStartTime = 0;
          return;
      }

      if (content.modelTurn && content.modelTurn.parts) {
          for (const part of content.modelTurn.parts) {
              if (part.inlineData && part.inlineData.data) {
                  this.playAudioChunk(part.inlineData.data);
              }
          }
      }
      
      if (content.outputTranscription && content.outputTranscription.text) {
          this.updateLiveTranscript('model', content.outputTranscription.text);
      }
      
      if (content.inputTranscription && content.inputTranscription.text) {
          this.updateLiveTranscript('user', content.inputTranscription.text);
      }
  }

  private updateLiveTranscript(role: 'user'|'model', text: string) {
      this.messages.update(msgs => {
          const lastMsg = msgs[msgs.length - 1];
          if (lastMsg && lastMsg.role === role && !lastMsg.text.endsWith('.') && !lastMsg.text.endsWith('?')) {
               const newMsgs = [...msgs];
               newMsgs[newMsgs.length - 1] = {
                   ...lastMsg,
                   text: lastMsg.text + text,
                   displayHtml: this.renderMarkdown(lastMsg.text + text)
               };
               return newMsgs;
          } else {
              return [...msgs, {
                  role: role,
                  type: 'text',
                  text: text,
                  displayHtml: this.renderMarkdown(text)
              }];
          }
      });
      // Save session on update
      this.saveCurrentSession();
  }

  private playAudioChunk(base64: string) {
      if (!this.audioContext) return;

      const binaryString = window.atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
      }
      
      const int16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
          float32[i] = int16[i] / 32768.0;
      }

      const buffer = this.audioContext.createBuffer(1, float32.length, 24000);
      buffer.copyToChannel(float32, 0);

      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(this.audioContext.destination);

      const currentTime = this.audioContext.currentTime;
      if (this.nextAudioStartTime < currentTime) {
          this.nextAudioStartTime = currentTime;
      }

      source.start(this.nextAudioStartTime);
      this.nextAudioStartTime += buffer.duration;
  }

  // --- CORE AI PROCESS ---

  async sendMessage(userText: string, attachedFiles: UserFile[] = [], hiddenContext?: string) {
    if (!this.isSystemReady()) return;
    if (!userText.trim() && attachedFiles.length === 0 && !hiddenContext) return;
    
    // API KEY CHECK
    if (!this.apiKey()) {
        this.addSystemMessage('🔑 API Key Required. Please add it in Settings.');
        this.openSettings();
        return;
    }

    if (!this.genAI) {
        this.initGenAIClient();
    }

    this.messages.update(msgs => {
        const newMsgs = [...msgs];
        if (userText.trim() || attachedFiles.length > 0) {
             newMsgs.push({ 
                role: 'user', 
                type: 'text',
                text: userText, 
                displayHtml: this.renderMarkdown(userText),
                attachments: attachedFiles
            });
        }
        if (hiddenContext) {
            newMsgs.push({
                role: 'user',
                type: 'text',
                text: hiddenContext,
                hidden: true
            });
        }
        return newMsgs;
    });

    attachedFiles.forEach(f => {
       if(!this.files().find(existing => existing.name === f.name)) {
           this.addFile(f);
       }
    });

    this.saveCurrentSession(); // Save user message
    this.isLoading.set(true);
    await this.processTurn();
  }

  private getFunctionCalls(response: any): any[] {
      const parts = response.candidates?.[0]?.content?.parts || [];
      return parts.filter((part: any) => part.functionCall).map((part: any) => part.functionCall);
  }

  private escapeHtml(text: string): string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  private partsToMarkdown(parts: Part[]): string {
    let md = '';
    let i = 0;
    while (i < parts.length) {
        const part = parts[i];
        if (part.text) { md += part.text; i++; } 
        else if (part.executableCode) {
            const code = part.executableCode.code;
            let output = '';
            if (i + 1 < parts.length && parts[i + 1].codeExecutionResult) {
                output = parts[i + 1].codeExecutionResult?.output || '(No output)';
                i += 2;
            } else { i++; }
            const payload = JSON.stringify({ code, output });
            const b64 = btoa(unescape(encodeURIComponent(payload)));
            md += `\n[[WIDGET_CODE:${b64}]]\n`;
        } else if (part.codeExecutionResult) {
             md += `\n**Result:**\n\`\`\`text\n${part.codeExecutionResult.output}\n\`\`\`\n`;
             i++;
        } else { i++; }
    }
    return md;
  }

  private displayResponseContent(parts: Part[]) {
      const md = this.partsToMarkdown(parts);
      if (md.trim()) {
          this.messages.update(msgs => [...msgs, {
              role: 'model',
              type: 'text',
              text: md,
              displayHtml: this.renderMarkdown(md)
          }]);
          this.saveCurrentSession(); // Save model response
      }
  }

  private async processTurn(refreshContext?: string) {
    try {
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

      // Define Tools DYNAMICALLY
      const activeFunctions = [
          createPlanTool, 
          manageNotesTool, 
          setSystemStateTool,
          controlMusicTool,
          createInteractiveTestTool,
          createAgentTool,
          createRoutineTool,
          changeBackgroundTool,
          createDesignTool, 
          backgroundSelectorTool,
          generateImageTool
      ];

      const tools: Tool[] = [{
        functionDeclarations: activeFunctions,
        googleSearch: {},
        codeExecution: {}, 
      }];

      let response = await this.genAI.models.generateContent({
        model: this.selectedModel(),
        contents: history,
        config: {
          systemInstruction: this.getSystemInstruction(),
          temperature: 0.7,
          tools: tools,
          toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } }
        }
      });

      const initialParts = response.candidates?.[0]?.content?.parts || [];
      this.displayResponseContent(initialParts);

      let functionCalls = this.getFunctionCalls(response);
      
      // TOOL LOOP
      while (functionCalls && functionCalls.length > 0) {
          console.log("🤖 Model requested function calls:", functionCalls);
          const toolOutputs: Part[] = [];

          for (const call of functionCalls) {
              const result = await this.executeTool(call);
              console.log(`✅ Tool Executed: ${call.name}`, result);
              toolOutputs.push({
                  functionResponse: {
                      name: call.name,
                      response: { result: result } 
                  }
              });
          }

          const modelTurn = response.candidates?.[0]?.content;
          if (!modelTurn) throw new Error("Model response missing content.");

          const toolTurn: Content = { role: 'user', parts: toolOutputs };
          history = [...history, modelTurn, toolTurn];

          response = await this.genAI.models.generateContent({
            model: this.selectedModel(),
            contents: history,
            config: {
                systemInstruction: this.getSystemInstruction(),
                tools: tools
            }
          });

          const loopParts = response.candidates?.[0]?.content?.parts || [];
          this.displayResponseContent(loopParts);

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
                  this.triggerAppTransition('project'); // Force UI to show the plan
                  return { success: true, count: newSteps.length, message: "Plan created. UI updated." };
              }
              return { success: false, message: "No steps provided." };

          case 'createRoutine':
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
                  
                  // SYNC TO SUPABASE
                  if (this.authService.user() && this.currentChatId()) {
                      await supabase.from('routines').upsert({
                          project_id: this.currentChatId(),
                          user_id: this.authService.user()!.id,
                          blocks: newBlocks
                      });
                  }

                  this.triggerAppTransition('study'); 
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
              
              return { success: true, testId: testId, widgetToken: `[[WIDGET_TEST:${testId}]]` };

          case 'createAgent':
              const agentId = `agent-${Date.now()}`;
              this.createdAgents.set(agentId, {
                  name: args.name,
                  description: args.description,
                  systemPrompt: args.systemPrompt
              });
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

          case 'generateImage':
              const imgPrompt = args.prompt;
              const imgRatio = args.aspectRatio || '1:1';
              const imgModel = args.model || 'gemini-2.5-flash-image';
              
              try {
                  const response = await this.genAI.models.generateContent({
                      model: imgModel,
                      contents: imgPrompt,
                      config: {
                          responseModalities: ['IMAGE'],
                          imageConfig: { aspectRatio: imgRatio }
                      }
                  });
                  
                  const candidates = response.candidates;
                  if (candidates && candidates[0]?.content?.parts) {
                      for (const part of candidates[0].content.parts) {
                          if (part.inlineData) {
                              const base64 = part.inlineData.data;
                              const mimeType = part.inlineData.mimeType;
                              const fileId = Math.random().toString(36).substring(7);
                              const filename = `AI_Gen_${Date.now()}.png`;
                              
                              const newFile: UserFile = {
                                  id: fileId,
                                  name: filename,
                                  type: mimeType || 'image/png',
                                  url: `data:${mimeType};base64,${base64}`,
                                  base64: base64,
                                  description: `AI generated image: ${imgPrompt}`
                              };
                              
                              this.addFile(newFile); 
                              this.updateModule('files', true); 
                              
                              return { 
                                  success: true, 
                                  fileId: fileId, 
                                  widgetToken: `[[WIDGET_IMAGE:${fileId}]]`,
                                  message: "Image generated successfully and saved to Files." 
                              };
                          }
                      }
                  }
                  return { success: false, message: "No image generated." };
              } catch(e: any) {
                  return { success: false, message: `Image gen error: ${e.message}` };
              }

          case 'manageNotes':
              const action = args.action;
              let targetNoteId = args.noteId;
              if ((action === 'update' || action === 'append') && !targetNoteId && args.title) {
                  const note = this.notes().find(n => n.title === args.title);
                  if (note) targetNoteId = note.id;
              }

              if (action === 'create') {
                  const newId = Math.random().toString(36);
                  this.addNote(args.title || 'Untitled', args.content || '');
                  this.triggerAppTransition('project');
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

  private calculateDuration(start: string, end: string): string {
      const [sh, sm] = start.split(':').map(Number);
      const [eh, em] = end.split(':').map(Number);
      const diff = (eh * 60 + em) - (sh * 60 + sm);
      return diff > 0 ? `${diff}m` : '0m';
  }

  // --- RENDERER ---
  public renderMarkdown(text: string): SafeHtml {
    let html = marked.parse(text) as string;

    // KaTeX Math Rendering
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

    // WIDGETS
    const testTokenRegex = /\[\[WIDGET_TEST:([a-zA-Z0-9\-_]+)\]\]/g;
    html = html.replace(testTokenRegex, (match, testId) => {
        const test = this.activeTests.get(testId);
        if (!test) return `<div class="p-4 border border-red-500 rounded text-red-400 text-xs">Test Widget Error: ID ${testId} not found</div>`;
        return `
            <div class="agent-card p-5 bg-[#2B2930] rounded-2xl border border-[#444746] flex flex-col items-start my-4 group hover:border-[#D0BCFF] transition-all relative overflow-hidden">
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

    const agentTokenRegex = /\[\[WIDGET_AGENT:([a-zA-Z0-9\-_]+)\]\]/g;
    html = html.replace(agentTokenRegex, (match, agentId) => {
        const agent = this.createdAgents.get(agentId);
        if (!agent) return `<div class="p-4 border border-red-500 rounded text-red-400 text-xs">Agent Error: ID ${agentId} not found</div>`;
        const configStr = encodeURIComponent(JSON.stringify({ name: agent.name, description: agent.description, systemPrompt: encodeURIComponent(agent.systemPrompt) }));
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

    const designTokenRegex = /\[\[WIDGET_DESIGN:([a-zA-Z0-9\-_]+)\]\]/g;
    html = html.replace(designTokenRegex, (match, designId) => {
        const design = this.createdDesigns.get(designId);
        if (!design) return `<div class="p-4 border border-red-500 rounded text-red-400 text-xs">Design Error: ID ${designId} not found</div>`;
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
                    <div class="design-preview shadow-2xl origin-center transition-transform" style="width: ${design.width}px; height: ${design.height}px;">${design.html}</div>
                </div>
                <div class="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                     <button class="design-export-btn bg-[#2B2930] hover:bg-[#D0BCFF] hover:text-[#381E72] text-[#E3E3E3] p-2 rounded-lg shadow-lg flex items-center gap-2 transition-colors text-xs font-medium border border-[#444746]" data-design-id="${designId}">
                        <span class="material-symbols-outlined text-[16px]">download</span><span>Download</span>
                     </button>
                </div>
            </div><style>.bg-checkerboard { background-image: radial-gradient(#333 1px, transparent 1px); background-size: 20px 20px; }</style>
        `;
    });

    const bgSelectorTokenRegex = /\[\[WIDGET_BG_SELECTOR:([a-zA-Z0-9\-_]+)\]\]/g;
    html = html.replace(bgSelectorTokenRegex, (match, selectorId) => {
        const options = this.activeBackgroundSelectors.get(selectorId);
        if (!options) return `<div class="p-4 border border-red-500 rounded text-red-400 text-xs">Selector Error: ID ${selectorId} not found</div>`;
        let gridHtml = `<div class="grid grid-cols-2 gap-3 my-4">`;
        options.forEach(url => {
            gridHtml += `
                <div class="relative group aspect-video rounded-xl overflow-hidden cursor-pointer border border-transparent hover:border-[#D0BCFF] transition-all bg-[#2B2930]">
                    <img src="${url}" class="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity">
                    <button class="background-selector-btn absolute inset-0 z-10 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity" data-url="${url}">
                        <span class="material-symbols-outlined text-white text-3xl">check_circle</span>
                    </button>
                </div>`;
        });
        gridHtml += `</div>`;
        return `<div class="bg-[#1E1F20] p-4 rounded-2xl border border-[#444746] my-4"><div class="flex items-center gap-2 mb-2 text-xs font-bold text-[#C4C7C5] uppercase tracking-wide"><span class="material-symbols-outlined text-sm text-[#D0BCFF]">wallpaper</span> Select Wallpaper</div>${gridHtml}</div>`;
    });

    const imageTokenRegex = /\[\[WIDGET_IMAGE:([a-zA-Z0-9\-_]+)\]\]/g;
    html = html.replace(imageTokenRegex, (match, fileId) => {
        const file = this.files().find(f => f.id === fileId);
        if (!file) return `<div class="p-4 border border-red-500 rounded text-red-400 text-xs">Image Error: ID ${fileId} not found</div>`;
        return `
            <div class="my-6 rounded-2xl overflow-hidden border border-[#444746] bg-[#000] relative group max-w-md shadow-2xl">
                <div class="relative"><img src="${file.url}" class="w-full h-auto object-cover" alt="${file.description}"></div>
                <div class="p-3 bg-[#1E1F20] border-t border-[#444746] flex items-center justify-between">
                    <div class="flex items-center gap-2"><div class="w-6 h-6 rounded-full bg-gradient-to-tr from-[#D0BCFF] to-[#EADDFF] flex items-center justify-center"><span class="material-symbols-outlined text-[14px] text-[#381E72]">auto_awesome</span></div><span class="text-[10px] font-bold text-[#E3E3E3] uppercase tracking-wider">Generated Image</span></div>
                </div>
            </div>`;
    });

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
    <div class="flex items-center gap-2.5"><span class="material-symbols-outlined text-[16px] text-green-400">terminal</span><span class="text-xs font-semibold tracking-wide uppercase text-[#cccccc] group-hover:text-white">Code Executed</span></div>
    <span class="material-symbols-outlined text-[18px] text-[#8E918F] transition-transform duration-300 chevron transform">expand_more</span>
  </button>
  <div class="code-widget-content hidden animate-in slide-in-from-top-2 duration-200">
    <div class="bg-[#1e1e1e] p-0"><div class="flex items-center justify-between px-4 py-1.5 bg-[#1e1e1e] border-b border-[#333333]"><span class="text-[10px] uppercase font-bold text-[#6e7681]">Input (Python)</span></div><div class="p-4 pt-2 overflow-x-auto"><code class="text-[#9cdcfe] whitespace-pre block text-xs leading-relaxed">${escapedCode}</code></div></div>
    <div class="bg-[#181818] border-t border-[#444746]"><div class="flex items-center justify-between px-4 py-1.5 bg-[#181818] border-b border-[#333333]"><span class="text-[10px] uppercase font-bold text-[#6e7681]">Output</span></div><div class="p-4 pt-2 overflow-x-auto"><code class="text-[#ce9178] whitespace-pre block text-xs leading-relaxed">${escapedOutput || '<span class="opacity-50 italic">No standard output</span>'}</code></div></div>
  </div>
</div>`;
        } catch(e) { return `<div class="text-red-500 text-xs">Error rendering code widget</div>`; }
    });

    html = html.replace(/\[widget_request_url\]/g, () => {
        return `<button class="url-request-btn bg-[#2B2930] hover:bg-[#D0BCFF] hover:text-[#381E72] text-[#D0BCFF] border border-[#D0BCFF]/30 px-4 py-2 rounded-xl flex items-center gap-2 transition-all my-2 text-sm font-medium shadow-md group">
            <span class="material-symbols-outlined group-hover:rotate-45 transition-transform">link</span><span>Provide Context URLs</span></button>`;
    });

    html = html.replace(/<p>\s*<\/p>/g, '');
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  // --- HELPERS ---
  
  syncRoutineWithTime() {
      const blocks = this.routineBlocks();
      if (blocks.length === 0) return;

      const now = new Date();
      const currentMins = now.getHours() * 60 + now.getMinutes();
      let hasChanges = false;

      const updated = blocks.map(b => {
          const [sH, sM] = b.startTime.split(':').map(Number);
          const [eH, eM] = b.endTime.split(':').map(Number);
          const start = sH * 60 + sM;
          const end = eH * 60 + eM;

          let status = b.status;
          let remainingLabel = b.remainingLabel;

          if (currentMins >= end) {
              if (status !== 'completed' && status !== 'skipped') {
                  status = 'completed';
                  remainingLabel = undefined;
              }
          } else if (currentMins >= start) {
              if (status !== 'active') status = 'active';
              const diff = end - currentMins;
              remainingLabel = `${diff}m left`;
          } else {
              if (status === 'active') status = 'upcoming';
              remainingLabel = undefined;
          }

          if (status !== b.status || remainingLabel !== b.remainingLabel) {
              hasChanges = true;
              return { ...b, status, remainingLabel };
          }
          return b;
      });

      if (hasChanges) {
          this.routineBlocks.set(updated);
          this.saveCurrentSession();
      }
  }

  async generateRawResponse(prompt: string, systemInstruction?: string): Promise<string> {
      if (!this.genAI) this.initGenAIClient();
      if (!this.genAI) return "Error: AI not initialized";

      try {
        const config: any = {
           model: this.selectedModel(),
           contents: { role: 'user', parts: [{ text: prompt }] },
        };
        if (systemInstruction) {
            config.config = { systemInstruction: systemInstruction };
        }
        
        const response = await this.genAI.models.generateContent(config);
        return response.text || "";
      } catch (e: any) {
        return "Error: " + e.message;
      }
  }

  activateTest(id: string) {
      const test = this.activeTests.get(id);
      if (test) {
          this.activeTest.set(test);
          this.rightPanelOpen.set(true);
          this.activeAgent.set(null); 
      }
  }

  closeTest() {
      this.activeTest.set(null);
      this.setRightPanelWidth(360);
  }

  handleQuizAnswer(testId: string, questionId: string, answerKey: string) {
      const test = this.activeTest();
      if (!test || test.id !== testId) return;

      const question = test.questions.find(q => q.id === questionId);
      if (!question) return;
      if (test.userAnswers.some(a => a.questionId === questionId)) return;

      const isCorrect = question.correctKey === answerKey;
      const newAnswer = { 
          questionId, 
          answerKey, 
          isCorrect, 
          correctKey: question.correctKey 
      };

      const updatedAnswers = [...test.userAnswers, newAnswer];
      const updatedTest = { ...test, userAnswers: updatedAnswers };
      
      this.activeTest.set(updatedTest);
      this.activeTests.set(testId, updatedTest);
  }

  async sendAgentMessage(text: string) {
      const agent = this.activeAgent();
      if (!agent) return;

      this.activeAgent.update(a => {
          if(!a) return null;
          return {
              ...a,
              messages: [...a.messages, { role: 'user', type: 'text', text: text, displayHtml: this.renderMarkdown(text) }],
              isLoading: true
          };
      });

      const history: Content[] = agent.messages.map(m => ({
          role: m.role,
          parts: [{ text: m.text }]
      }));
      history.push({ role: 'user', parts: [{ text: text }] });

      try {
          if (!this.genAI) this.initGenAIClient();
          const response = await this.genAI.models.generateContent({
              model: this.selectedModel(),
              contents: history,
              config: { systemInstruction: agent.systemPrompt }
          });
          const responseText = response.text || "";
          this.activeAgent.update(a => {
              if(!a) return null;
              return {
                  ...a,
                  messages: [...a.messages, { role: 'model', type: 'text', text: responseText, displayHtml: this.renderMarkdown(responseText) }],
                  isLoading: false
              };
          });
      } catch (e) {
           this.activeAgent.update(a => {
              if(!a) return null;
              return { ...a, isLoading: false };
          });
      }
  }

  updateModule(key: keyof ModuleState, value: boolean) { 
      this.activeModules.update(m => ({ ...m, [key]: value })); 
      localStorage.setItem('flow_modules', JSON.stringify(this.activeModules()));
  }
  setRightPanelWidth(w: number) { this.rightPanelWidth.set(w); }
  setTheme(t: ThemeType) { this.theme.set(t); }
  setWallpaper(u: string|null) { this.wallpaper.set(u); }
  openSettings() { this.showSettings.set(true); }
  closeSettings() { this.showSettings.set(false); }
  
  activateAgent(c: any) { this.zenMode.set(false); this.rightPanelOpen.set(true); this.activeTest.set(null); this.activeAgent.set({name:c.name, description:c.description, systemPrompt:c.systemPrompt, messages:[{role:'model',type:'text',text:`Hello! I am ${c.name}.`, displayHtml:`Hello! I am ${c.name}.`}], isLoading:false}); }
  closeAgent() { this.activeAgent.set(null); this.setRightPanelWidth(360); }
  
  toggleZenMode() { this.zenMode.update(v=>!v); }
  toggleWidgetVisibility() { this.widgetVisible.update(v=>!v); }
  
  resetSystemInstruction() { 
      const original = this.rawInstructions['system_base.txt'] || "";
      this.systemInstructionTemplate.set(original);
      this.addSystemMessage("🛠️ System Instructions reset.");
  }
  
  getNoteContent(t:string){return this.notes().find(n=>n.title===t)?.content||null;}
  
  updateNoteContent(t:string,c:string){ 
      let found=false; 
      this.notes.update(n=>{
          const idx=n.findIndex(x=>x.title===t);
          if(idx!==-1){
              found=true;
              n[idx]={...n[idx],content:c};
              
              // SYNC TO SUPABASE
              if (this.authService.user() && this.currentChatId()) {
                  supabase.from('notes').update({ content: c }).eq('id', n[idx].id).then();
              }
              
              return[...n];
          }
          return n;
      }); 
      if(found) this.saveCurrentSession();
      return found;
  }

  deleteNoteByTitle(t:string){let found=false;this.notes.update(n=>{const len=n.length;const f=n.filter(x=>x.title!==t);if(f.length!==len)found=true;return f;});return found;}
  updatePlanStatus(t:string,s:string){let found=false;this.planSteps.update(st=>{const idx=st.findIndex(x=>x.title.toLowerCase().includes(t.toLowerCase()));if(idx!==-1){found=true;st[idx]={...st[idx],status:s as any};return[...st];}return st;});return found;}
  addFile(f:any){this.files.update(fs=>[...fs,{...f, id: f.id || Math.random().toString()}]); this.saveCurrentSession();}
  getFile(n:string){return this.files().find(f=>f.name===n);}
  deleteFile(id:string){this.files.update(fs=>fs.filter(f=>f.id!==id)); this.saveCurrentSession();}
  
  logAction(m:string){ console.log("System Action:", m); }
  addSystemMessage(t:string){this.messages.update(m=>[...m,{role:'model',type:'system',text:t,displayHtml:t}]);}
  addMessage(m:ChatMessage){this.messages.update(msgs=>[...msgs,m]); this.saveCurrentSession();}
  playMusic(id:string){this.audioService.playTrackById(id);}
  endRoutine(){this.routineBlocks.set([]); this.saveCurrentSession();}
  
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
  
  toggleTimerPause(){ this.activeWidget.update(w => { if(w.type === 'pomodoro') return {...w, data:{...w.data, isPaused: !w.data.isPaused}}; return w; }); }
  stopWidget(){ this.activeWidget.set({type:'none', data:null}); if(this.timerInterval) clearInterval(this.timerInterval); }
  
  updatePersona(p:string){this.userPersona.set(p); localStorage.setItem('flow_persona', JSON.stringify(p));}
  setZenMode(v:boolean){this.zenMode.set(v);}
  
  triggerManualRefresh(){ this.processTurn("Context Refresh: Please check current state and update if necessary."); }
  
  async triggerAppTransition(mode: string) {
      if (mode !== 'landing' && mode !== 'project' && mode !== 'study') return;
      this.appMode.set(mode as AppMode);
      if (mode === 'project' || mode === 'study') {
          setTimeout(() => {
              this.leftSidebarOpen.set(false); // Sidebar closed by default in project mode
              this.rightPanelOpen.set(true);
              if (mode === 'study') this.updateModule('routine', true);
          }, 800); 
      }
  }

  addPlanStep(t:string,d:string){ this.planSteps.update(s => [...s, {id:Math.random().toString(), title:t, description:d, status:'pending'}]); this.saveCurrentSession(); }
  insertPlanStep(id:string,t:string){ this.planSteps.update(s => { const idx = s.findIndex(x => x.id === id); if(idx===-1) return s; const copy = [...s]; copy.splice(idx+1, 0, {id:Math.random().toString(), title:t, description:'', status:'pending'}); return copy; }); this.saveCurrentSession(); }
  updatePlanStep(id:string,t:string,d:string){ this.planSteps.update(s => s.map(x => x.id===id ? {...x, title:t, description:d} : x)); this.saveCurrentSession(); }
  deletePlanStep(id:string){ this.planSteps.update(s => s.filter(x => x.id!==id)); this.saveCurrentSession(); }
  movePlanStep(id:string, dir:'up'|'down'){ this.planSteps.update(steps => { const idx = steps.findIndex(s => s.id === id); if (idx === -1) return steps; const newSteps = [...steps]; if (dir === 'up' && idx > 0) { [newSteps[idx], newSteps[idx-1]] = [newSteps[idx-1], newSteps[idx]]; } else if (dir === 'down' && idx < steps.length - 1) { [newSteps[idx], newSteps[idx+1]] = [newSteps[idx+1], newSteps[idx]]; } return newSteps; }); this.saveCurrentSession(); }
  
  addNote(t:string,c:string){ 
      const newNote = {id:Math.random().toString(), title:t, content:c};
      this.notes.update(n => [...n, newNote]);
      
      // SYNC TO SUPABASE
      if (this.authService.user() && this.currentChatId()) {
          supabase.from('notes').insert({
              id: newNote.id,
              project_id: this.currentChatId(),
              user_id: this.authService.user()!.id,
              title: t,
              content: c
          }).then();
      }
      this.saveCurrentSession(); 
  }

  updateNote(id:string,t:string,c:string){ 
      let found = false; 
      this.notes.update(n => { 
          const idx = n.findIndex(x => x.id === id); 
          if(idx !== -1) { 
              found = true; 
              n[idx] = {...n[idx], title:t, content:c}; 
              
              // SYNC TO SUPABASE
              if (this.authService.user() && this.currentChatId()) {
                  supabase.from('notes').update({ title: t, content: c }).eq('id', id).then();
              }

              return [...n]; 
          } 
          return n; 
      }); 
      if(found) this.saveCurrentSession(); 
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
              
              // SYNC TO SUPABASE
              if (this.authService.user() && this.currentChatId()) {
                  supabase.from('notes').update({ content: newContent }).eq('id', id).then();
              }

              return [...n]; 
          } 
          return n; 
      }); 
      if(found) this.saveCurrentSession(); 
      return found; 
  }

  deleteNote(id:string){ 
      this.notes.update(n => n.filter(x => x.id!==id)); 
      
      // SYNC TO SUPABASE
      if (this.authService.user() && this.currentChatId()) {
          supabase.from('notes').delete().eq('id', id).then();
      }

      this.saveCurrentSession(); 
  }
}