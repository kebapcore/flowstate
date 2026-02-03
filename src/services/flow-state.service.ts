
import { Injectable, signal, computed, inject, effect } from '@angular/core';
import { GoogleGenAI, Content, Part, FunctionDeclaration, Type, Tool } from '@google/genai';
import { marked } from 'marked';
import { AudioService, MusicTrack } from './audio.service';
import { FlowCloudService } from './flow-cloud.service';
import { IdeService } from './ide.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

declare const katex: any;

// --- SESSION DEFINITIONS ---

export type SessionType = 'chat' | 'workspace';

export interface SessionData {
    messages: ChatMessage[];
    notes: Note[];
    planSteps: PlanStep[];
    routineBlocks: RoutineBlock[];
    files: UserFile[];
    metadata: IdeaMetadata;
    activeModules: ModuleState;
    theme: ThemeType;
    wallpaper: string | null;
    extraGlassMode: boolean;
    layoutMode: 'standard' | 'reversed';
    // Persist UI visibility
    uiState: {
        sidebarOpen: boolean;
        toolsOpen: boolean;
    };
}

export interface Session {
    id: string;
    type: SessionType;
    title: string;
    lastModified: number;
    data: SessionData;
}

// --- TOOL DEFINITIONS ---

const setChatTitleTool: FunctionDeclaration = {
    name: "setChatTitle",
    description: "Sets the title of the current chat session based on the conversation topic. Use this early in the conversation.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            title: { type: Type.STRING, description: "The new title for the chat." }
        },
        required: ["title"]
    }
};

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

const readPlanTool: FunctionDeclaration = {
    name: "readPlan",
    description: "Reads the current Project Plan/Curriculum steps from the workspace. Use this to check progress or remind yourself of the plan.",
    parameters: { type: Type.OBJECT, properties: {} }
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

const readRoutineTool: FunctionDeclaration = {
    name: "readRoutine",
    description: "Reads the current Daily Routine schedule. Use this to check the schedule or active block.",
    parameters: { type: Type.OBJECT, properties: {} }
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

const readNoteTool: FunctionDeclaration = {
    name: "readNote",
    description: "Reads notes from the notebook. If no noteId is provided, returns a list of all note titles and IDs (lookup). If noteId is provided, returns the content.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            noteId: { type: Type.STRING, description: "Optional. The ID of the specific note to read." }
        }
    }
};

const setSystemStateTool: FunctionDeclaration = {
    name: "setSystemState",
    description: "Advanced control over system layout ('Liquid UI'), active modules, and global state. Use this to construct the interface.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            layout: {
                type: Type.OBJECT,
                description: "Configure UI panels.",
                properties: {
                    metadata: {
                        type: Type.OBJECT,
                        description: "Context/Sidebar Panel configuration",
                        properties: {
                            visible: { type: Type.BOOLEAN },
                            location: { type: Type.STRING, enum: ["left", "right"], description: "If 'right', the sidebar moves to the right and tools move to the left." }
                        }
                    },
                    tools: {
                        type: Type.OBJECT,
                        description: "Tools/Plan Panel configuration",
                        properties: {
                            visible: { type: Type.BOOLEAN }
                        }
                    }
                }
            },
            modules: {
                type: Type.OBJECT,
                description: "Enable/Disable specific workspace features.",
                properties: {
                    notes: { type: Type.BOOLEAN },
                    files: { type: Type.BOOLEAN },
                    routine: { type: Type.BOOLEAN },
                    ide: { type: Type.BOOLEAN }
                }
            },
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

const generateImageTool: FunctionDeclaration = {
    name: "generateImage",
    description: "Generates an image based on a prompt using the Gemini Nano Banana model. The image is automatically saved to the Files panel.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            prompt: { type: Type.STRING, description: "Detailed description of the image to generate." },
            aspectRatio: {
                type: Type.STRING,
                enum: ["1:1", "16:9", "4:3", "3:4"],
                description: "Aspect ratio of the generated image. Default is 1:1."
            }
        },
        required: ["prompt"]
    }
};

const manageIDETool: FunctionDeclaration = {
    name: "manageIDE",
    description: "Advanced IDE control. Create files, read structure, run commands, and manage the dev server. Triggers the IDE Panel.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            action: {
                type: Type.STRING,
                enum: ["write", "read", "delete", "run", "list", "reload"],
                description: "write: Create/Update file content. read: Get file content. list: Get file tree. run: Exec terminal command."
            },
            path: { type: Type.STRING, description: "File path (e.g., 'src/App.tsx' or just '/'). Required for write/read/delete." },
            content: { type: Type.STRING, description: "Content to write (for 'write' action)." },
            command: { type: Type.STRING, description: "Shell command to run (e.g., 'npm install', 'npm run dev')." }
        },
        required: ["action"]
    }
};

// --- INTERFACES ---

export interface ModuleState {
    core: boolean;
    files: boolean;
    routine: boolean;
    ide: boolean; // New module
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
    description?: string;
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
    private ideService = inject(IdeService);
    private sanitizer = inject(DomSanitizer);
    private timerInterval: any;
    private lastActiveBlockId: string | null = null;
    private autoSaveInterval: any;

    // GLOBAL APP STATE
    appMode = signal<AppMode>('landing');

    // CONFIG STATE
    apiKey = signal<string>('');
    selectedModel = signal<string>('gemini-2.5-flash');

    // SESSION MANAGEMENT
    sessions = signal<Session[]>([]);
    activeSessionId = signal<string | null>(null);
    activeSession = computed(() => this.sessions().find(s => s.id === this.activeSessionId()) || null);

    // CURRENT SESSION STATE (Signals populated from Active Session)
    messages = signal<ChatMessage[]>([]);
    isLoading = signal(false);

    // Initialize as false, will turn true after FlowCloud fetch
    isSystemReady = signal(false);

    // EDITABLE SYSTEM INSTRUCTION (For Dev Panel)
    systemInstructionTemplate = signal<string>("");

    // UI State (Persisted in Session)
    zenMode = signal(false);
    leftSidebarOpen = signal(false);
    rightPanelOpen = signal(false);
    rightPanelWidth = signal(360);
    showDevPanel = signal(false);
    layoutMode = signal<'standard' | 'reversed'>('standard');

    // APPEARANCE STATE
    showSettings = signal(false);
    theme = signal<ThemeType>('material');
    wallpaper = signal<string | null>(null);
    extraGlassMode = signal(false);

    // MODULES
    activeModules = signal<ModuleState>({
        core: true,
        files: false,
        routine: true,
        ide: false
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

    // QUIZ STORAGE (Runtime)
    activeTests = new Map<string, InteractiveTest>();
    // AGENT STORAGE (Runtime)
    createdAgents = new Map<string, { name: string, description: string, systemPrompt: string }>();
    // DESIGN STORAGE (Runtime)
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
        this.loadSessionsFromStorage();

        // Auto-save session state on changes
        effect(() => {
            if (this.activeSessionId()) {
                this.syncSessionState();
            }
        });

        // Start System Initialization
        this.initializeSystem();

        setInterval(() => this.syncRoutineWithTime(), 30000);
        setTimeout(() => this.syncRoutineWithTime(), 1000);

        this.autoSaveInterval = setInterval(() => this.persistSessions(), 5000); // 5s Auto-persist to localStorage
    }

    // --- SESSION LOGIC ---

    private loadSessionsFromStorage() {
        try {
            const raw = localStorage.getItem('flow_sessions_v2');
            if (raw) {
                const sessions = JSON.parse(raw);
                this.sessions.set(sessions);
            }
        } catch (e) {
            console.error("Failed to load sessions", e);
        }
    }

    private persistSessions() {
        if (!this.activeSessionId()) return;
        // Ensure current state is synced to the array
        this.syncSessionState();
        // Save array to LS
        try {
            localStorage.setItem('flow_sessions_v2', JSON.stringify(this.sessions()));
        } catch (e: any) {
            console.warn("Storage Quota Exceeded. Attempting cleanup...", e);
            this.emergencyStorageCleanup();
        }
    }

    private emergencyStorageCleanup() {
        const currentSessions = this.sessions();
        const activeId = this.activeSessionId();

        // Strategy: Remove base64 data and large URLs from inactive sessions to free space
        const optimized = currentSessions.map(s => {
            if (s.id === activeId) return s; // Keep active session intact

            const data = { ...s.data };
            if (data.files && data.files.length > 0) {
                data.files = data.files.map(f => {
                    const safeFile = { ...f };
                    if (safeFile.base64) {
                        delete safeFile.base64;
                    }
                    // If URL is a data URI (base64 image), clear it to save space
                    if (safeFile.url && safeFile.url.startsWith('data:')) {
                        safeFile.url = ''; // Will result in [Image Not Found] but saves app from crashing
                    }
                    return safeFile;
                });
            }
            return { ...s, data };
        });

        try {
            localStorage.setItem('flow_sessions_v2', JSON.stringify(optimized));
            this.sessions.set(optimized); // Update state to reflect optimized data
            this.addSystemMessage("⚠️ System: Storage optimized. Older session images cleared to save space.");
        } catch (e) {
            console.error("Storage Critical: Cleanup failed.", e);
            this.addSystemMessage("❌ System: Storage Critical. Unable to save state.");
        }
    }

    // Syncs the individual signals back into the session object in the array
    private syncSessionState() {
        const id = this.activeSessionId();
        if (!id) return;

        this.sessions.update(current => {
            return current.map(s => {
                if (s.id === id) {
                    return {
                        ...s,
                        lastModified: Date.now(),
                        title: this.metadata().title || s.title || 'Untitled',
                        data: {
                            messages: this.messages(),
                            notes: this.notes(),
                            planSteps: this.planSteps(),
                            routineBlocks: this.routineBlocks(),
                            files: this.files(),
                            metadata: this.metadata(),
                            activeModules: this.activeModules(),
                            theme: this.theme(),
                            wallpaper: this.wallpaper(),
                            extraGlassMode: this.extraGlassMode(),
                            layoutMode: this.layoutMode(),
                            uiState: {
                                sidebarOpen: this.leftSidebarOpen(),
                                toolsOpen: this.rightPanelOpen()
                            }
                        }
                    };
                }
                return s;
            });
        });
    }

    createSession(type: SessionType) {
        // 1. Check for API Key FIRST
        if (!this.apiKey()) {
            this.showSettings.set(true);
            // Optional: You might want to switch to a specific tab or show a toast
            this.addSystemMessage("⚠️ System: Please enter your Google Gemini API Key in Settings to start.");
            return;
        }

        const newId = Math.random().toString(36).substring(2, 10);
        const newSession: Session = {
            id: newId,
            type: type,
            title: 'Untitled',
            lastModified: Date.now(),
            data: {
                messages: [],
                notes: [],
                planSteps: [],
                routineBlocks: [],
                files: [],
                metadata: {
                    title: 'Untitled',
                    problem: 'Undefined',
                    audience: 'Undefined',
                    slogan: 'Undefined',
                    created_at: new Date().toISOString(),
                    keywords: ''
                },
                activeModules: { core: true, files: false, routine: true, ide: false },
                theme: 'material',
                wallpaper: null,
                extraGlassMode: false,
                layoutMode: 'standard',
                uiState: { sidebarOpen: false, toolsOpen: false }
            }
        };

        this.sessions.update(s => [newSession, ...s]);
        this.loadSession(newId);
    }

    loadSession(id: string) {
        const session = this.sessions().find(s => s.id === id);
        if (!session) return;

        this.activeSessionId.set(id);

        // Hydrate Signals
        this.messages.set(session.data.messages || []);
        this.notes.set(session.data.notes || []);
        this.planSteps.set(session.data.planSteps || []);
        this.routineBlocks.set(session.data.routineBlocks || []);
        this.files.set(session.data.files || []);
        this.metadata.set(session.data.metadata);
        this.activeModules.set(session.data.activeModules || { core: true, files: false, routine: true, ide: false });
        this.theme.set(session.data.theme);
        this.wallpaper.set(session.data.wallpaper);
        this.extraGlassMode.set(session.data.extraGlassMode);
        this.layoutMode.set(session.data.layoutMode || 'standard');

        // UI State Logic
        if (session.type === 'chat') {
            this.appMode.set('project');
            this.leftSidebarOpen.set(false);
            this.rightPanelOpen.set(false);
        } else {
            this.appMode.set('project');
            // For workspace, we default to the saved state OR closed if undefined
            // This respects "Zero UI" for new sessions (default false) and persists user preference
            const savedUI = session.data.uiState || { sidebarOpen: false, toolsOpen: false };
            this.leftSidebarOpen.set(savedUI.sidebarOpen);
            this.rightPanelOpen.set(savedUI.toolsOpen);
        }
    }

    deleteSession(id: string) {
        if (this.activeSessionId() === id) {
            this.exitSession();
        }
        this.sessions.update(s => s.filter(x => x.id !== id));
        this.persistSessions();
    }

    exitSession() {
        this.persistSessions();
        this.activeSessionId.set(null);
        this.appMode.set('landing');
        this.messages.set([]);
        this.audioService.stop();
    }

    // --- CONFIG ---

    private initializeConfig() {
        const storedKey = localStorage.getItem('flow_api_key');
        if (storedKey && storedKey.trim().length > 0) {
            this.apiKey.set(storedKey);
        }

        const storedModel = localStorage.getItem('flow_model');
        if (storedModel) this.selectedModel.set(JSON.parse(storedModel));

        this.initGenAIClient();
    }

    private initGenAIClient() {
        const key = this.apiKey();
        if (!key) {
            console.warn("No API Key available.");
            return;
        }
        try {
            this.genAI = new GoogleGenAI({ apiKey: key });
        } catch (e) {
            console.error("GenAI Init Failed:", e);
        }
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

    setGlassMode(enabled: boolean) {
        this.extraGlassMode.set(enabled);
    }

    private async initializeSystem() {
        try {
            const files = [
                'system_base.txt',
                'chat_base.txt',
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
                    }
                } catch (e) { }
            }

            this.isSystemReady.set(true);
        } catch (e) {
            this.isSystemReady.set(true);
        }
    }

    toggleLeftSidebar() {
        this.leftSidebarOpen.update(v => !v);
    }

    private getSystemInstruction(): string {
        const session = this.activeSession();
        const type = session?.type || 'workspace';

        let instruction = "";

        if (type === 'chat') {
            // --- CHAT MODE INSTRUCTION ---
            instruction = this.rawInstructions['chat_base.txt'] || "You are a helpful assistant.";
            instruction += "\n\n" + (this.rawInstructions['dj_mode.txt'] || "");

            // Simpler tools context
            instruction += `\n\n### MUSIC CONTROL:\nUse 'controlMusic' or 'setChatTitle' tools.`;
        } else {
            // --- WORKSPACE MODE INSTRUCTION ---
            instruction = this.systemInstructionTemplate() || this.rawInstructions['system_base.txt'] || "";
            instruction += "\n\n" + (this.rawInstructions['note_system.txt'] || "");
            instruction += "\n\n" + (this.rawInstructions['agent_creation.txt'] || "");
            instruction += "\n\n" + (this.rawInstructions['test_extra.txt'] || "");
            instruction += "\n\n" + (this.rawInstructions['dj_mode.txt'] || "");

            if (this.activeModules().routine) {
                instruction += "\n\n" + (this.rawInstructions['routine_management.txt'] || "");
            }
        }

        // Common Context
        const library = this.audioService.library();
        const musicListStr = library.length > 0
            ? library.map(t => `- ${t.id} (Mood: ${t.mood}, Name: ${t.name})`).join('\n')
            : "No music loaded.";

        instruction += `\n\n### AVAILABLE MUSIC TRACKS:\n${musicListStr}`;

        // Global Widget Protocol
        instruction += `\n\n### UI WIDGET PROTOCOL (CRITICAL)
If a tool execution returns a JSON field named 'widgetToken' (e.g., "[[WIDGET_TEST:id]]"), you **MUST** include this exact string in your final text response.`;

        // IDE PROTOCOL - CONDITIONAL
        if (this.activeModules().ide) {
            instruction += `\n\n### IDE PROTOCOL (CRITICAL)
You have access to a 'manageIDE' tool. Use this to build applications.
When you use 'manageIDE', be concise in your text response.
The UI will automatically show "Chips" for file operations.
Do NOT dump large code blocks in chat if you have written them to the IDE. Just say "I've created [filename]".`;
        } else {
            instruction += `\n\n### IDE NOTE: The IDE module is currently disabled. Do not try to write code to files.`;
        }

        instruction += `\n\n### CURRENT CONTEXT:\nAPP_MODE: ${this.appMode().toUpperCase()}`;
        instruction += `\nUSER_PERSONA: ${this.userPersona()}`;

        return instruction;
    }

    // --- CORE AI PROCESS ---

    async sendMessage(userText: string, attachedFiles: UserFile[] = []) {
        if (!this.isSystemReady() || !this.activeSessionId()) return;
        if (!userText.trim() && attachedFiles.length === 0) return;
        if (!this.genAI) {
            this.messages.update(msgs => [...msgs, { role: 'model', type: 'system', text: 'API Key missing.' }]);
            return;
        }

        this.messages.update(msgs => [...msgs, {
            role: 'user',
            type: 'text',
            text: userText,
            displayHtml: this.renderMarkdown(userText),
            attachments: attachedFiles
        }]);

        attachedFiles.forEach(f => {
            if (!this.files().find(existing => existing.name === f.name)) {
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
        return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
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
                const code = part.executableCode.code;
                let output = '';
                if (i + 1 < parts.length && parts[i + 1].codeExecutionResult) {
                    output = parts[i + 1].codeExecutionResult?.output || '(No output)';
                    i += 2;
                } else {
                    i++;
                }
                const payload = JSON.stringify({ code, output });
                const b64 = btoa(unescape(encodeURIComponent(payload)));
                md += `\n[[WIDGET_CODE:${b64}]]\n`;
            } else if (part.inlineData) {
                const mime = part.inlineData.mimeType;
                const data = part.inlineData.data;
                const src = `data:${mime};base64,${data}`;
                md += `\n<img src="${src}" alt="Generated Image" class="max-w-full rounded-lg my-2 border border-white/10 shadow-lg" />\n`;
                i++;
            } else {
                i++;
            }
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

            // DEFINE TOOLS based on Session Type
            const sessionType = this.activeSession()?.type || 'workspace';

            let activeFunctions: FunctionDeclaration[] = [];

            if (sessionType === 'chat') {
                activeFunctions = [
                    controlMusicTool,
                    createDesignTool,
                    setChatTitleTool, // Simpler metadata tool
                    createInteractiveTestTool, // Allowed in chat for fun
                    generateImageTool,
                    manageIDETool // Allow IDE in chat too
                ];
            } else {
                // Workspace Mode - All Tools
                activeFunctions = [
                    createPlanTool,
                    readPlanTool,
                    manageNotesTool,
                    readNoteTool,
                    setSystemStateTool,
                    controlMusicTool,
                    createInteractiveTestTool,
                    createAgentTool,
                    createRoutineTool,
                    readRoutineTool,
                    changeBackgroundTool,
                    createDesignTool,
                    backgroundSelectorTool,
                    generateImageTool,
                    manageIDETool
                ];
            }

            const tools: Tool[] = [{
                functionDeclarations: activeFunctions,
                googleSearch: {},
                codeExecution: {},
                // @ts-ignore
                urlContext: {}
            }];

            let response = await this.genAI.models.generateContent({
                model: this.selectedModel(),
                contents: history,
                config: {
                    systemInstruction: this.getSystemInstruction(),
                    temperature: 0.7,
                    tools: tools,
                    toolConfig: { functionCallingConfig: { mode: 'AUTO' as any } }
                }
            });

            const initialParts = response.candidates?.[0]?.content?.parts || [];
            this.displayResponseContent(initialParts);

            let functionCalls = this.getFunctionCalls(response);

            let loopCount = 0;
            const MAX_LOOPS = 5; // Prevent infinite loops

            while (functionCalls && functionCalls.length > 0 && loopCount < MAX_LOOPS) {
                loopCount++;
                console.log(`🤖 Tool Calls (Loop ${loopCount}):`, functionCalls);
                const toolOutputs: Part[] = [];

                for (const call of functionCalls) {
                    const result = await this.executeTool(call);
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

            if (loopCount >= MAX_LOOPS) {
                this.addSystemMessage("⚠️ Loop limit reached. Stopping tool execution.");
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
            case 'setChatTitle':
                if (args.title) {
                    this.metadata.update(m => ({ ...m, title: args.title }));
                    return { success: true, message: `Session renamed to "${args.title}"` };
                }
                return { success: false };

            case 'manageIDE':
                if (!this.activeModules().ide) {
                    return { success: false, message: "IDE Module is currently disabled. Please ask user to enable it in settings." };
                }
                // ACTIVATE IDE MODULE UI if not already
                this.ensureProjectMode();

                const ideAction = args.action;
                try {
                    if (ideAction === 'write' && args.path) {
                        await this.ideService.writeFile(args.path, args.content || '');

                        // Inject Explicit Chip Message IMMEDIATELY
                        this.messages.update(m => [...m, {
                            role: 'model',
                            type: 'system',
                            text: `[[IDE_CHIP:write:${args.path}]]`,
                            displayHtml: this.renderMarkdown(`[[IDE_CHIP:write:${args.path}]]`),
                            hidden: false
                        }]);

                        return { success: true, message: `File ${args.path} written.` };
                    }
                    if (ideAction === 'read' && args.path) {
                        const content = await this.ideService.readFile(args.path);
                        return { success: true, content };
                    }
                    if (ideAction === 'run' && args.command) {
                        // Run async
                        this.ideService.runCommand(args.command);

                        // Inject Explicit Chip Message IMMEDIATELY
                        this.messages.update(m => [...m, {
                            role: 'model',
                            type: 'system',
                            text: `[[IDE_CHIP:run:${args.command}]]`,
                            displayHtml: this.renderMarkdown(`[[IDE_CHIP:run:${args.command}]]`),
                            hidden: false
                        }]);

                        return { success: true, message: `Command '${args.command}' started.` };
                    }
                    if (ideAction === 'list') {
                        await this.ideService.refreshFileList();
                        return { success: true, files: this.ideService.fileTree() };
                    }
                } catch (e: any) {
                    return { success: false, error: e.message };
                }
                return { success: false, message: "Invalid IDE action" };

            case 'createPlan':
                if (args.steps) {
                    const newSteps = args.steps.map((s: any) => ({
                        id: Math.random().toString(36),
                        title: s.title,
                        description: s.description || '',
                        status: s.status || 'pending'
                    }));
                    this.planSteps.set(newSteps);
                    this.ensureProjectMode();
                    return { success: true, count: newSteps.length, message: "Plan created. UI updated." };
                }
                return { success: false };

            case 'readPlan':
                return { success: true, steps: this.planSteps() };

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
                    this.ensureProjectMode();
                    return { success: true, count: newBlocks.length, message: "Routine updated." };
                }
                return { success: false };

            case 'readRoutine':
                return { success: true, blocks: this.routineBlocks() };

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
                return { success: false };

            case 'generateImage':
                if (args.prompt) {
                    const imgPrompt = args.prompt;
                    const ratio = args.aspectRatio || '1:1';

                    // UX Improvement: Show immediate feedback
                    this.addSystemMessage(`🎨 Generating image: "${imgPrompt}"...`);

                    try {
                        // Generate using dedicated image model
                        const response = await this.genAI.models.generateContent({
                            model: 'gemini-2.5-flash-image',
                            contents: [{ role: 'user', parts: [{ text: imgPrompt }] }], // Structured content
                            config: {
                                responseModalities: ['IMAGE'], // Use CAPS as per standard API enum, likely stricter here.
                                // @ts-ignore - dynamic param
                                imageConfig: { aspectRatio: ratio }
                            }
                        });

                        const part = response.candidates?.[0]?.content?.parts?.[0];
                        if (part && part.inlineData) {
                            const base64 = part.inlineData.data;
                            const mimeType = part.inlineData.mimeType || 'image/png';
                            const fileId = Math.random().toString(36).substring(2, 10);
                            const filename = `gen-${fileId}.png`;
                            const url = `data:${mimeType};base64,${base64}`;

                            // Save to Files Module
                            this.addFile({
                                id: fileId,
                                name: filename,
                                type: mimeType,
                                url: url,
                                base64: base64,
                                description: imgPrompt
                            });

                            // Ensure Files Module is visible
                            this.updateModule('files', true);

                            return { success: true, fileId: fileId, widgetToken: `[[WIDGET_IMAGE:${fileId}]]` };
                        }
                        return { success: false, message: "No image data returned." };
                    } catch (e: any) {
                        return { success: false, message: "Image generation failed: " + e.message };
                    }
                }
                return { success: false, message: "Prompt required." };

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
                    this.ensureProjectMode();
                    return { success: true, action: 'create', noteId: newId };
                } else if (action === 'update' && targetNoteId) {
                    const found = this.updateNote(targetNoteId, args.title, args.content);
                    return { success: found, action: 'update' };
                } else if (action === 'append' && targetNoteId) {
                    const found = this.appendNote(targetNoteId, args.content || '');
                    return { success: found, action: 'append' };
                } else if (action === 'delete' && args.noteId) {
                    this.deleteNote(args.noteId);
                    return { success: true, action: 'delete' };
                }
                return { success: false, message: "Invalid note action." };

            case 'readNote':
                if (args.noteId) {
                    const note = this.notes().find(n => n.id === args.noteId);
                    if (note) return { success: true, note: note };
                    return { success: false, message: "Note not found." };
                } else {
                    // Lookup mode: Return list of ID/Titles
                    const list = this.notes().map(n => ({ id: n.id, title: n.title }));
                    return { success: true, notes: list };
                }

            case 'setSystemState':
                if (args.musicId) this.audioService.playTrackById(args.musicId);
                if (args.zenMode !== undefined) this.zenMode.set(args.zenMode);
                if (args.metadataUpdate) this.metadata.update(m => ({ ...m, ...args.metadataUpdate }));

                if (args.modules) {
                    if (args.modules.notes !== undefined) this.updateModule('core', args.modules.notes); // Note: core is usually true, but flexible
                    if (args.modules.files !== undefined) this.updateModule('files', args.modules.files);
                    if (args.modules.routine !== undefined) this.updateModule('routine', args.modules.routine);
                    if (args.modules.ide !== undefined) this.updateModule('ide', args.modules.ide);
                }

                if (args.layout) {
                    // Metadata Panel (Left Sidebar usually)
                    if (args.layout.metadata) {
                        if (args.layout.metadata.visible !== undefined) this.leftSidebarOpen.set(args.layout.metadata.visible);
                        if (args.layout.metadata.location === 'right') this.layoutMode.set('reversed');
                        if (args.layout.metadata.location === 'left') this.layoutMode.set('standard');
                    }

                    // Tools Panel (Right Panel usually)
                    if (args.layout.tools) {
                        if (args.layout.tools.visible !== undefined) this.rightPanelOpen.set(args.layout.tools.visible);
                    }
                }
                return { success: true, state: "configured" };

            case 'controlMusic':
                if (args.action === 'stop') {
                    this.audioService.stop();
                    return { success: true };
                }
                if (args.action === 'play' && args.trackIds) {
                    if (args.trackIds.length === 1) this.audioService.playTrackById(args.trackIds[0]);
                    else this.audioService.playPlaylist(args.trackIds);
                    return { success: true };
                }
                return { success: false };

            case 'changeBackground':
                if (args.url) {
                    this.setWallpaper(args.url);
                    return { success: true };
                }
                return { success: false };

            default:
                return { success: false, message: "Unknown tool name." };
        }
    }

    // --- UTILS & HELPERS ---

    ensureProjectMode() {
        // Force UI panels in workspace mode
        if (this.activeSession()?.type === 'workspace') {
            // If UI is closed, open it to show the change (e.g. creating note)
            if (!this.rightPanelOpen()) this.rightPanelOpen.set(true);
            if (!this.leftSidebarOpen()) this.leftSidebarOpen.set(true);
            if (this.zenMode()) this.zenMode.set(false);
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

        if (hasChanges) this.routineBlocks.set(updatedBlocks);
        if (activeBlock && activeBlock.type === 'deep' && this.activeWidget().type === 'none') {
            const duration = parseInt(activeBlock.duration.replace('m', '')) || 25;
            this.startPomodoro(duration);
        }
    }

    activateTest(testId: string) {
        const test = this.activeTests.get(testId);
        if (test) {
            this.activeAgent.set(null);
            this.activeTest.set(test);
            this.rightPanelOpen.set(true);
        }
    }

    closeTest() { this.activeTest.set(null); }

    handleQuizAnswer(testId: string, questionId: string, answerKey: string) {
        const test = this.activeTests.get(testId);
        if (!test || test.completed) return;
        const question = test.questions.find(q => q.id === questionId);
        if (!question) return;
        if (test.userAnswers.find(a => a.questionId === questionId)) return;

        const isCorrect = answerKey === question.correctKey;
        test.userAnswers.push({ questionId, answerKey, isCorrect, correctKey: question.correctKey });

        if (test.userAnswers.length === test.questions.length) {
            test.completed = true;
            this.submitTestSummary(test);
        }
        this.activeTest.update(t => t ? { ...t } : null);
    }

    private submitTestSummary(test: InteractiveTest) {
        const correctCount = test.userAnswers.filter(a => a.isCorrect).length;
        const mistakes = test.userAnswers.filter(a => !a.isCorrect).map(a => {
            const q = test.questions.find(q => q.id === a.questionId);
            return { question: q?.question, user_answer: a.answerKey, correct_answer: a.correctKey };
        });
        const payload = { score: Math.round((correctCount / test.questions.length) * 100), total: test.questions.length, correct: correctCount, mistakes: mistakes };
        this.messages.update(m => [...m, { role: 'user', type: 'text', text: `[LOG: TEST_RESULT]\n${JSON.stringify(payload, null, 2)}`, hidden: true }]);
        this.processTurn();
    }

    async sendAgentMessage(userText: string) {
        const agent = this.activeAgent();
        if (!agent || !userText.trim()) return;

        this.activeAgent.update(a => {
            if (!a) return null;
            return { ...a, messages: [...a.messages, { role: 'user', type: 'text', text: userText, displayHtml: this.renderMarkdown(userText) }], isLoading: true };
        });

        try {
            const history: Content[] = agent.messages.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
            history.push({ role: 'user', parts: [{ text: userText }] });
            const response = await this.genAI.models.generateContent({
                model: this.selectedModel(),
                contents: history,
                config: { systemInstruction: agent.systemPrompt, temperature: 0.7 }
            });
            const text = response.text || "I'm having trouble connecting.";
            this.activeAgent.update(a => {
                if (!a) return null;
                return { ...a, messages: [...a.messages, { role: 'model', type: 'text', text: text, displayHtml: this.renderMarkdown(text) }], isLoading: false };
            });
        } catch (e) {
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
        } catch (e) { return "Error: " + e; }
    }

    public renderMarkdown(text: string): SafeHtml {
        let html = marked.parse(text) as string;
        if (typeof katex !== 'undefined') {
            try {
                html = html.replace(/\$\$([\s\S]+?)\$\$/g, (match, tex) => { try { return katex.renderToString(tex, { displayMode: true, throwOnError: false }); } catch (e) { return match; } });
                html = html.replace(/\$([^$]+?)\$/g, (match, tex) => { try { return katex.renderToString(tex, { displayMode: false, throwOnError: false }); } catch (e) { return match; } });
            } catch (e) { }
        }
        html = html.replace(/\[\[WIDGET_TEST:([a-zA-Z0-9\-_]+)\]\]/g, (match, testId) => {
            const test = this.activeTests.get(testId);
            if (!test) return `<div class="p-4 border border-red-500 rounded">Error</div>`;
            const cardClass = this.extraGlassMode() ? 'glass-panel-ultra border-none' : 'bg-[#2B2930] border-[#444746]';
            const iconBg = this.extraGlassMode() ? 'bg-white/10 text-white' : 'bg-[#D0BCFF] text-[#381E72]';
            return `<div class="agent-card p-5 ${cardClass} rounded-2xl border flex flex-col items-start my-4 group transition-all relative overflow-hidden">
               <div class="flex items-center gap-3 mb-3 z-10"><div class="w-10 h-10 rounded-full ${iconBg} flex items-center justify-center shadow-md"><span class="material-symbols-outlined text-[20px]">quiz</span></div><div><div class="font-bold text-[#E3E3E3] text-lg">${test.topic}</div><div class="text-xs text-[#C4C7C5]">${test.questions.length} Questions</div></div></div><button class="test-run-btn w-full py-3 rounded-xl bg-[#4F378B] hover:bg-[#6750A4] text-[#EADDFF] font-medium transition-colors flex items-center justify-center gap-2 z-10" data-testid="${test.id}"><span class="material-symbols-outlined text-[18px]">play_arrow</span><span>Start Quiz</span></button></div>`;
        });
        html = html.replace(/\[\[WIDGET_AGENT:([a-zA-Z0-9\-_]+)\]\]/g, (match, agentId) => {
            const agent = this.createdAgents.get(agentId);
            if (!agent) return ``;
            const configStr = encodeURIComponent(JSON.stringify({ name: agent.name, description: agent.description, systemPrompt: encodeURIComponent(agent.systemPrompt) }));
            const cardClass = this.extraGlassMode() ? 'glass-panel-ultra border-none' : 'bg-[#2B2930] border-[#444746]';
            return `<div class="agent-card p-4 ${cardClass} rounded-xl border flex justify-between items-center my-4 group"><div class="flex-1 min-w-0 mr-4"><div class="flex items-center gap-2 mb-1"><span class="material-symbols-outlined text-[#D0BCFF]">smart_toy</span><div class="font-bold text-[#E3E3E3] truncate">${agent.name}</div></div><div class="text-xs text-[#C4C7C5] line-clamp-2">${agent.description}</div></div><button class="agent-run-btn w-10 h-10 rounded-full bg-[#D0BCFF] text-[#381E72] flex items-center justify-center shadow-lg" data-config="${configStr}"><span class="material-symbols-outlined pointer-events-none">play_arrow</span></button></div>`;
        });
        html = html.replace(/\[\[WIDGET_DESIGN:([a-zA-Z0-9\-_]+)\]\]/g, (match, designId) => {
            const design = this.createdDesigns.get(designId);
            if (!design) return ``;
            return `<div class="design-widget my-6 rounded-2xl overflow-hidden border border-[#444746] bg-[#000] relative group" id="design-container-${designId}"><div class="flex items-center justify-between px-4 py-3 bg-[#1E1F20] border-b border-[#444746]"><div class="flex items-center gap-2"><span class="material-symbols-outlined text-[#D0BCFF] text-sm">palette</span><span class="text-xs font-bold text-[#C4C7C5] uppercase tracking-wide">Generated Design</span></div></div><div class="relative overflow-auto flex items-center justify-center p-8 bg-checkerboard" style="min-height: ${design.height}px;"><div class="design-preview shadow-2xl origin-center transition-transform" style="width: ${design.width}px; height: ${design.height}px;">${design.html}</div></div><div class="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity"><button class="design-export-btn bg-[#2B2930] hover:bg-[#D0BCFF] hover:text-[#381E72] text-[#E3E3E3] p-2 rounded-lg shadow-lg flex items-center gap-2 transition-colors text-xs font-medium border border-[#444746]" data-design-id="${designId}"><span class="material-symbols-outlined text-[16px]">download</span><span>Download</span></button></div></div><style>.bg-checkerboard { background-image: radial-gradient(#333 1px, transparent 1px); background-size: 20px 20px; }</style>`;
        });
        html = html.replace(/\[\[WIDGET_BG_SELECTOR:([a-zA-Z0-9\-_]+)\]\]/g, (match, selectorId) => {
            const options = this.activeBackgroundSelectors.get(selectorId);
            if (!options) return ``;
            let gridHtml = `<div class="grid grid-cols-2 gap-3 my-4">`;
            options.forEach(url => { gridHtml += `<div class="relative group aspect-video rounded-xl overflow-hidden cursor-pointer border border-transparent hover:border-[#D0BCFF] transition-all bg-[#2B2930]"><img src="${url}" class="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"><button class="background-selector-btn absolute inset-0 z-10 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity" data-url="${url}"><span class="material-symbols-outlined text-white text-3xl">check_circle</span></button></div>`; });
            gridHtml += `</div>`;
            const cardClass = this.extraGlassMode() ? 'glass-panel-ultra border-none' : 'bg-[#1E1F20] border-[#444746]';
            return `<div class="${cardClass} p-4 rounded-2xl border my-4"><div class="flex items-center gap-2 mb-2 text-xs font-bold text-[#C4C7C5] uppercase tracking-wide"><span class="material-symbols-outlined text-sm text-[#D0BCFF]">wallpaper</span> Select Wallpaper</div>${gridHtml}</div>`;
        });
        html = html.replace(/\[\[WIDGET_IMAGE:([a-zA-Z0-9\-_]+)\]\]/g, (match, fileId) => {
            const file = this.files().find(f => f.id === fileId);
            if (!file) return `<div class="text-red-500 text-xs">[Image Not Found]</div>`;
            const cardClass = this.extraGlassMode() ? 'glass-panel-ultra border-none' : 'bg-[#2B2930] border-[#444746]';
            return `<div class="${cardClass} p-3 rounded-2xl border my-4 group relative overflow-hidden"><img src="${file.url}" class="w-full h-auto rounded-xl shadow-lg" alt="${file.name}"><div class="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity"><a href="${file.url}" download="${file.name}" class="bg-black/50 hover:bg-[#D0BCFF] hover:text-[#381E72] text-white p-2 rounded-full backdrop-blur-md transition-colors flex items-center justify-center"><span class="material-symbols-outlined text-sm">download</span></a></div></div>`;
        });
        // IDE CHIPS
        html = html.replace(/\[\[IDE_CHIP:(write|run):(.+?)\]\]/g, (match, action, details) => {
            const icon = action === 'write' ? 'description' : 'terminal';
            const label = action === 'write' ? 'Created' : 'Running';
            return `<button class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#2B2930] hover:bg-[#D0BCFF] hover:text-[#381E72] border border-[#444746] transition-all text-xs font-mono my-1 group ide-chip" data-action="${action}" data-details="${details}">
            <span class="material-symbols-outlined text-[14px] text-[#D0BCFF] group-hover:text-[#381E72]">${icon}</span>
            <span>${label}: ${details}</span>
        </button>`;
        });

        const codeTokenRegex = /\[\[WIDGET_CODE:([a-zA-Z0-9+\/=]+)\]\]/g;
        html = html.replace(codeTokenRegex, (match, b64) => {
            try {
                const jsonStr = decodeURIComponent(escape(atob(b64)));
                const data = JSON.parse(jsonStr);
                const escapedCode = this.escapeHtml(data.code || '');
                const escapedOutput = this.escapeHtml(data.output || '');
                return `<div class="code-widget-container my-5 rounded-lg border border-[#444746] bg-[#1e1e1e] overflow-hidden shadow-lg select-text font-mono text-sm"><button class="code-widget-toggle w-full flex items-center justify-between px-4 py-3 bg-[#252526] hover:bg-[#2a2d2e] transition-colors cursor-pointer group text-[#cccccc] border-b border-[#444746]/50"><div class="flex items-center gap-2.5"><span class="material-symbols-outlined text-[16px] text-green-400">terminal</span><span class="text-xs font-semibold tracking-wide uppercase text-[#cccccc] group-hover:text-white">Code Executed</span></div><span class="material-symbols-outlined text-[18px] text-[#8E918F] transition-transform duration-300 chevron transform">expand_more</span></button><div class="code-widget-content hidden animate-in slide-in-from-top-2 duration-200"><div class="bg-[#1e1e1e] p-0"><div class="flex items-center justify-between px-4 py-1.5 bg-[#1e1e1e] border-b border-[#333333]"><span class="text-[10px] uppercase font-bold text-[#6e7681]">Input (Python)</span></div><div class="p-4 pt-2 overflow-x-auto"><code class="text-[#9cdcfe] whitespace-pre block text-xs leading-relaxed">${escapedCode}</code></div></div><div class="bg-[#181818] border-t border-[#444746]"><div class="flex items-center justify-between px-4 py-1.5 bg-[#181818] border-b border-[#333333]"><span class="text-[10px] uppercase font-bold text-[#6e7681]">Output</span></div><div class="p-4 pt-2 overflow-x-auto"><code class="text-[#ce9178] whitespace-pre block text-xs leading-relaxed">${escapedOutput || '<span class="opacity-50 italic">No standard output</span>'}</code></div></div></div></div>`;
            } catch (e) { return `<div class="text-red-500 text-xs">Error rendering code widget</div>`; }
        });
        html = html.replace(/<p>\s*<\/p>/g, '');
        return this.sanitizer.bypassSecurityTrustHtml(html);
    }

    updateModule(key: keyof ModuleState, value: boolean) { this.activeModules.update(m => ({ ...m, [key]: value })); }
    setRightPanelWidth(w: number) { this.rightPanelWidth.set(w); }
    setTheme(t: ThemeType) { this.theme.set(t); }
    setWallpaper(u: string | null) { this.wallpaper.set(u); }
    openSettings() { this.showSettings.set(true); }
    closeSettings() { this.showSettings.set(false); }
    activateAgent(c: any) { this.zenMode.set(false); this.rightPanelOpen.set(true); this.activeTest.set(null); this.activeAgent.set({ name: c.name, description: c.description, systemPrompt: c.systemPrompt, messages: [{ role: 'model', type: 'text', text: `Hello! I am ${c.name}.`, displayHtml: `Hello! I am ${c.name}.` }], isLoading: false }); }
    closeAgent() { this.activeAgent.set(null); this.setRightPanelWidth(360); }
    toggleDevPanel() { this.showDevPanel.update(v => !v); }
    toggleZenMode() { this.zenMode.update(v => !v); }
    toggleWidgetVisibility() { this.widgetVisible.update(v => !v); }
    resetSystemInstruction() { const original = this.rawInstructions['system_base.txt'] || ""; this.systemInstructionTemplate.set(original); this.addSystemMessage("🛠️ System Instructions reset."); }
    getNoteContent(t: string) { return this.notes().find(n => n.title === t)?.content || null; }
    updateNoteContent(t: string, c: string) { let found = false; this.notes.update(n => { const idx = n.findIndex(x => x.title === t); if (idx !== -1) { found = true; n[idx] = { ...n[idx], content: c }; return [...n]; } return n; }); return found; }
    deleteNoteByTitle(t: string) { let found = false; this.notes.update(n => { const idx = n.findIndex(x => x.title === t); if (idx !== -1) { found = true; n.splice(idx, 1); return [...n]; } return n; }); return found; }
    updatePlanStatus(t: string, s: string) { let found = false; this.planSteps.update(steps => { const idx = steps.findIndex(x => x.title.toLowerCase().includes(t.toLowerCase())); if (idx !== -1) { found = true; steps[idx] = { ...steps[idx], status: s as any }; return [...steps]; } return steps; }); return found; }
    addFile(f: any) { this.files.update(fs => [...fs, { ...f, id: f.id || Math.random().toString() }]); }
    getFile(n: string) { return this.files().find(f => f.name === n); }
    deleteFile(id: string) { this.files.update(fs => fs.filter(f => f.id !== id)); }
    logAction(m: string) { console.log("System Action:", m); }
    addSystemMessage(t: string) { this.messages.update(m => [...m, { role: 'model', type: 'system', text: t, displayHtml: t }]); }
    addMessage(m: ChatMessage) { this.messages.update(msgs => [...msgs, m]); }
    playMusic(id: string) { this.audioService.playTrackById(id); }
    endRoutine() { this.routineBlocks.set([]); }
    startPomodoro(m: number) { if (this.timerInterval) clearInterval(this.timerInterval); this.activeWidget.set({ type: 'pomodoro', data: { current: m * 60, isPaused: false } }); this.widgetVisible.set(true); this.timerInterval = setInterval(() => { this.activeWidget.update(w => { if (w.type === 'pomodoro' && !w.data.isPaused && w.data.current > 0) return { ...w, data: { ...w.data, current: w.data.current - 1 } }; return w; }); }, 1000); }
    toggleTimerPause() { this.activeWidget.update(w => { if (w.type === 'pomodoro') return { ...w, data: { ...w.data, isPaused: !w.data.isPaused } }; return w; }); }
    stopWidget() { this.activeWidget.set({ type: 'none', data: null }); if (this.timerInterval) clearInterval(this.timerInterval); }
    updatePersona(p: string) { this.userPersona.set(p); }
    setZenMode(v: boolean) { this.zenMode.set(v); }
    triggerManualRefresh() { this.processTurn("Context Refresh: Please check current state and update if necessary."); }
    async triggerAppTransition(mode: string) { if (mode !== 'landing' && mode !== 'project' && mode !== 'study') return; this.appMode.set(mode as AppMode); if (mode === 'project') { setTimeout(() => { this.leftSidebarOpen.set(true); this.rightPanelOpen.set(true); }, 800); } else if (mode === 'study') { setTimeout(() => { this.leftSidebarOpen.set(true); this.rightPanelOpen.set(true); this.updateModule('routine', true); }, 800); } }
    addPlanStep(t: string, d: string) { this.planSteps.update(s => [...s, { id: Math.random().toString(), title: t, description: d, status: 'pending' }]); }
    insertPlanStep(id: string, t: string) { this.planSteps.update(s => { const idx = s.findIndex(x => x.id === id); if (idx === -1) return s; const copy = [...s]; copy.splice(idx + 1, 0, { id: Math.random().toString(), title: t, description: '', status: 'pending' }); return copy; }); }
    updatePlanStep(id: string, t: string, d: string) { this.planSteps.update(s => s.map(x => x.id === id ? { ...x, title: t, description: d } : x)); }
    deletePlanStep(id: string) { this.planSteps.update(s => s.filter(x => x.id !== id)); }
    movePlanStep(id: string, dir: 'up' | 'down') { this.planSteps.update(steps => { const idx = steps.findIndex(s => s.id === id); if (idx === -1) return steps; const newSteps = [...steps]; if (dir === 'up' && idx > 0) { [newSteps[idx], newSteps[idx - 1]] = [newSteps[idx - 1], newSteps[idx]]; } else if (dir === 'down' && idx < steps.length - 1) { [newSteps[idx], newSteps[idx + 1]] = [newSteps[idx + 1], newSteps[idx]]; } return newSteps; }); }
    addNote(t: string, c: string) { const newNote = { id: Math.random().toString(), title: t, content: c }; this.notes.update(n => [...n, newNote]); }
    updateNote(id: string, t: string, c: string) { let found = false; this.notes.update(n => { const idx = n.findIndex(x => x.id === id); if (idx !== -1) { found = true; n[idx] = { ...n[idx], title: t, content: c }; return [...n]; } return n; }); return found; }
    appendNote(id: string, additionalContent: string): boolean { let found = false; this.notes.update(n => { const idx = n.findIndex(x => x.id === id); if (idx !== -1) { found = true; const prev = n[idx].content; const newContent = prev ? (prev + '\n\n' + additionalContent) : additionalContent; n[idx] = { ...n[idx], content: newContent }; return [...n]; } return n; }); return found; }
    deleteNote(id: string) { this.notes.update(n => { const idx = n.findIndex(x => x.id === id); if (idx !== -1) { n.splice(idx, 1); return [...n]; } return n; }); }
}
