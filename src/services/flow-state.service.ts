import { Injectable, signal, computed, inject, effect } from '@angular/core';
import { GoogleGenAI, Content, Part } from '@google/genai';
import { marked } from 'marked';
import { AudioService } from './audio.service';
import { FlowCloudService } from './flowcloud.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

declare const katex: any; // Globals from index.html

// --- MODULAR PROMPT CONSTANTS (Fallbacks) ---
// These are used as fallbacks if FlowCloud is not available

const FALLBACK_PROMPT = `You are Flowstate v2.5, a Creative Engine & Master Tutor. FlowCloud instructions could not be loaded.`;

const PROMPT_MUSIC_TEMPLATE = `
### DJ MODE
- Command: \`[music.change ID="TRACK_ID"]\`
- Tracks: {{MUSIC_LIST}}
`;

// --- INTERFACES ---

export interface ModuleState {
    core: boolean;
    files: boolean;
    routine: boolean;
    flowscript: boolean;
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
    startTime: string; // "09:00"
    endTime: string;   // "09:45"
    duration: string;  // "45m"
    title: string;
    description: string;
    type: 'deep' | 'break' | 'shallow';
    status: 'upcoming' | 'active' | 'completed' | 'skipped';
    remainingLabel?: string; // e.g., "20m left"
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
    base64?: string; // For Gemini API
}

export interface ChatMessage {
    role: 'user' | 'model';
    type: 'text' | 'system';
    text: string;
    displayHtml?: SafeHtml | string;
    hidden?: boolean;
    attachments?: UserFile[];
}

export interface FlowScript {
    name: string;
    content: string;
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
    audioUrl?: string; // New field for listening comprehension
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

export type ThemeType = 'material' | 'cold';

@Injectable({
    providedIn: 'root'
})
export class FlowStateService {
    private genAI: GoogleGenAI;
    private audioService = inject(AudioService);
    private flowCloudService = inject(FlowCloudService);
    private sanitizer = inject(DomSanitizer);
    private timerInterval: any;
    private lastActiveBlockId: string | null = null;

    // FlowCloud state
    flowCloudReady = signal(false);

    // GLOBAL APP STATE
    appMode = signal<AppMode>('landing');

    // State Signals
    messages = signal<ChatMessage[]>([]);
    isLoading = signal(false);

    // Co-Pilot State
    coPilotMessages = signal<ChatMessage[]>([]);
    isCoPilotLoading = signal(false);

    // Script Storage
    savedScripts = signal<FlowScript[]>([]);

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

    // MODULES (Routine ON by default now)
    activeModules = signal<ModuleState>({
        core: true,
        files: false,
        routine: true,
        flowscript: false
    });

    // ACTIVE RIGHT PANEL STATES (Mutually Exclusive ideally)
    activeAgent = signal<ActiveAgent | null>(null);
    activeTest = signal<InteractiveTest | null>(null); // NEW: Test runner state

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

    // SYSTEM INSTRUCTION TEMPLATE (Editable)
    systemInstructionTemplate = signal<string>(FALLBACK_PROMPT);

    // QUIZ STORAGE
    activeTests = new Map<string, InteractiveTest>();

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
        this.genAI = new GoogleGenAI({ apiKey: process.env['API_KEY'] || '' });

        // Restore logic...
        this.loadState('flow_theme', this.theme);
        this.loadState('flow_wallpaper', this.wallpaper);
        this.loadState('flow_modules', this.activeModules);
        this.loadState('flow_persona', this.userPersona);

        this.messages.set([]);

        // Start Routine Ticker
        setInterval(() => this.syncRoutineWithTime(), 30000);
        // Initial sync
        setTimeout(() => this.syncRoutineWithTime(), 1000);
    }

    private loadState(key: string, signal: any) {
        try {
            const saved = localStorage.getItem(key);
            if (saved !== null) signal.set(JSON.parse(saved));
        } catch (e) { }
    }

    toggleLeftSidebar() {
        this.leftSidebarOpen.update(v => !v);
    }

    // --- TRANSITION LOGIC ---

    async triggerAppTransition(mode: 'project' | 'study') {
        this.appMode.set(mode);

        // Send hidden log to AI to confirm transition and TRIGGER MEGA-RESPONSE
        this.messages.update(m => [...m, {
            role: 'user',
            type: 'text',
            text: `[LOG: PROJECT STARTED] Mode set to: ${mode}. User is ready. Output the Welcome, Curriculum [plan.create], and [routine.create] NOW. Remember: Use STRICT JSON for plan and routine. Do not use pipes.`,
            hidden: true
        }]);

        // Open panels based on mode
        if (mode === 'project') {
            setTimeout(() => {
                this.leftSidebarOpen.set(true);
                this.rightPanelOpen.set(true);
            }, 800);
        } else if (mode === 'study') {
            setTimeout(() => {
                // Sidebar logic changed: Keep sidebar open for Study mode (Timer/Music)
                this.leftSidebarOpen.set(true);
                this.rightPanelOpen.set(true);
                this.updateModule('routine', true); // Enforce routine for study
            }, 800);
        }

        // Trigger AI to start Phase 2 immediately
        this.isLoading.set(true);
        await this.processTurn();
    }

    // --- FLOWCLOUD INITIALIZATION ---

    async initFlowCloud(accessKey: string): Promise<void> {
        try {
            await this.flowCloudService.loadInstructions(accessKey);
            this.flowCloudReady.set(true);
            console.log('✅ FlowCloud initialized');
        } catch (error) {
            console.error('❌ FlowCloud init failed, using fallback:', error);
            this.flowCloudReady.set(false);
        }
    }

    // --- SYSTEM INSTRUCTION ---

    private getSystemInstruction(): string {
        // Use FlowCloud instructions if available
        if (this.flowCloudService.isLoaded()) {
            const fc = this.flowCloudService.getInstructions();
            let instruction = fc.system_base || FALLBACK_PROMPT;

            // Append module-specific instructions from FlowCloud
            instruction += '\n\n' + (fc.note_system || '');
            instruction += '\n\n' + (fc.test_extra || '');

            // DJ Mode with dynamic music list
            const musicList = this.audioService.library.map(t => `- ${t.id} (Mood: ${t.mood}, Name: ${t.name})`).join('\n');
            instruction += '\n\n' + (fc.dj_mode || PROMPT_MUSIC_TEMPLATE).replace('{{MUSIC_LIST}}', musicList);

            instruction += '\n\n' + (fc.agent_creation || '');
            instruction += '\n\n' + (fc.routine_management || '');
            instruction += '\n\n' + (fc.flowscript || '');

            // Context
            instruction += `\nCURRENT_APP_MODE: ${this.appMode().toUpperCase()}\n`;
            instruction += `USER_PERSONA: ${this.userPersona()}\n`;

            return instruction;
        }

        // Fallback: use template signal or hardcoded fallback
        let instruction = this.systemInstructionTemplate() || FALLBACK_PROMPT;

        const musicList = this.audioService.library.map(t => `- ${t.id} (Mood: ${t.mood}, Name: ${t.name})`).join('\n');
        instruction += PROMPT_MUSIC_TEMPLATE.replace('{{MUSIC_LIST}}', musicList);

        instruction += `\nCURRENT_APP_MODE: ${this.appMode().toUpperCase()}\n`;
        instruction += `USER_PERSONA: ${this.userPersona()}\n`;

        return instruction;
    }

    // --- CORE AI PROCESS ---

    async sendMessage(userText: string, attachedFiles: UserFile[] = []) {
        if (!userText.trim() && attachedFiles.length === 0) return;

        this.messages.update(msgs => [...msgs, {
            role: 'user',
            type: 'text',
            text: userText,
            displayHtml: this.renderMarkdown(userText),
            attachments: attachedFiles
        }]);

        // AUTO-SAVE: If files are attached, add them to the Files module silently
        // This ensures they are available in the "Files" tab later even if it is currently closed.
        attachedFiles.forEach(f => {
            // Avoid duplicates if possible, or just add
            if (!this.files().find(existing => existing.name === f.name)) {
                this.addFile(f);
            }
        });

        this.isLoading.set(true);
        await this.processTurn();
    }

    private async processTurn(refreshContext?: string) {
        try {
            // BUILD MULTIMODAL HISTORY
            let history: Content[] = this.messages().map(m => {
                const parts: Part[] = [];

                // 1. Add Text Part
                if (m.text) {
                    parts.push({ text: m.text });
                }

                // 2. Add Attachment Parts (if any)
                if (m.attachments && m.attachments.length > 0) {
                    m.attachments.forEach(file => {
                        if (file.base64) {
                            parts.push({
                                inlineData: {
                                    mimeType: file.type,
                                    data: file.base64
                                }
                            });
                        }
                    });
                }

                return {
                    role: m.role,
                    parts: parts
                };
            });

            // Inject System Time for Context Awareness
            const now = new Date();
            const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
            history.push({
                role: 'user',
                parts: [{ text: `[SYSTEM_TIME: ${timeStr}]` + (refreshContext ? ` ${refreshContext}` : '') }]
            });

            // Using gemini-3-flash-preview as requested
            const response = await this.genAI.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: history,
                config: {
                    systemInstruction: this.getSystemInstruction(),
                    temperature: 0.7,
                    tools: [{ googleSearch: {} }]
                }
            });

            const responseText = response.text || "";

            // Check for Transition Trigger
            // FIX: Early return to prevent double messages during transition
            const styleMatch = responseText.match(/\[project_style="?(project|study)"?\]/i);
            if (styleMatch) {
                const mode = styleMatch[1].toLowerCase() as 'project' | 'study';

                // CRITICAL FIX: DO NOT add a message here. 
                // The transition tag implies the "Zero UI" phase is done.
                // We immediately trigger the full app transition which will generate the Real Welcome Message.

                this.triggerAppTransition(mode);
                this.isLoading.set(false);
                return; // STOP execution.
            }

            const { cleanText, parsedPlan, parsedMetadata, newNotes, updatedNotes, deletedNoteIds, musicId, routineBlocks, widgetCmd, zenCmd } = this.parseResponse(responseText);

            let systemFeedback: string[] = [];

            if (musicId) { this.audioService.playTrackById(musicId); }
            if (zenCmd) { this.zenMode.set(zenCmd === 'on'); }
            if (routineBlocks.length > 0) {
                this.routineBlocks.set(routineBlocks);
                this.syncRoutineWithTime();
                if (this.appMode() === 'study') this.updateModule('routine', true);
            }

            if (parsedPlan.length > 0) { this.planSteps.set(parsedPlan); }
            if (parsedMetadata) { this.metadata.update(p => ({ ...p, ...parsedMetadata })); }

            if (newNotes.length > 0) {
                this.notes.update(c => [...c, ...newNotes]);
            }

            if (deletedNoteIds.length > 0) {
                this.notes.update(c => c.filter(n => !deletedNoteIds.includes(n.id)));
            }

            // FIX: If cleanText is empty (because it was all JSON commands), hide the message
            const shouldHide = !!refreshContext || !cleanText.trim();

            this.messages.update(msgs => [...msgs, {
                role: 'model',
                type: 'text',
                text: responseText,
                displayHtml: this.renderMarkdown(cleanText),
                hidden: shouldHide
            }]);

        } catch (error) {
            console.error('Gemini API Error:', error);
            this.messages.update(m => [...m, { role: 'model', type: 'system', text: "Connection Error", displayHtml: "Connection Error" }]);
        } finally {
            this.isLoading.set(false);
        }
    }

    // --- PARSING ---

    private parseResponse(rawText: string) {
        let cleanText = rawText;
        let newNotes: Note[] = [];
        let updatedNotes: any[] = [];
        let deletedNoteIds: string[] = [];
        let musicId: string | null = null;
        let routineBlocks: RoutineBlock[] = [];
        let parsedPlan: PlanStep[] = [];
        let widgetCmd = null;
        let zenCmd = null;

        // --- 1. ROBUST CLEANING & PARSING STRATEGY ---
        // We use .replace(regex, callback) to parse AND strip in one pass.
        // The Regex looks for the [tag] ... [/tag] pattern, ignoring whatever wraps it.

        // A. PLAN (Global Replace)
        cleanText = cleanText.replace(/\[plan\.create\]([\s\S]*?)\[\/plan\.create\]/gi, (match, jsonContent) => {
            try {
                // Attempt to clean markdown code blocks from the inner content if present
                const innerClean = jsonContent.replace(/```json/g, '').replace(/```/g, '');
                const raw = JSON.parse(innerClean);
                if (Array.isArray(raw)) {
                    parsedPlan = raw.map((s: any) => ({
                        id: s.id || Math.random().toString(36),
                        title: s.title,
                        description: s.description || '',
                        status: s.status || 'pending'
                    }));
                }
            } catch (e) { console.error("Plan Parse Error", e); }
            return ''; // STRIP
        });

        // B. ROUTINE (Global Replace)
        cleanText = cleanText.replace(/\[routine\.create(?:.*?)\]([\s\S]*?)\[\/routine\.create\]/gi, (match, jsonContent) => {
            try {
                const innerClean = jsonContent.replace(/```json/g, '').replace(/```/g, '');
                const raw = JSON.parse(innerClean);
                if (Array.isArray(raw)) {
                    routineBlocks = raw.map((b: any) => {
                        let startTime = "09:00";
                        let endTime = "09:15";
                        if (b.time && b.time.includes('-')) {
                            const parts = b.time.split('-');
                            startTime = parts[0].trim();
                            endTime = parts[1].trim();
                        }
                        return {
                            id: b.id || Math.random().toString(36),
                            startTime: startTime,
                            endTime: endTime,
                            duration: b.duration || '15m',
                            title: b.title,
                            description: b.description,
                            type: b.type || b.mode || 'shallow',
                            status: b.status || 'upcoming'
                        };
                    });
                }
            } catch (e) { console.error("Routine Parse Error", e); }
            return ''; // STRIP
        });

        // C. TEST / QUIZ
        const testRegex = /(?:```(?:text)?\s*)?\[test\.create\s+topic="?(.*?)"?\]([\s\S]*?)\[\/test\.create\](?:```)?/gi;
        cleanText = cleanText.replace(testRegex, (match, topic, body) => {
            const testId = this.parseAndRegisterTest(topic, body);
            return `[[WIDGET_TEST:${testId}]]`; // Replace with Widget Token
        });

        // D. NOTES (Global Replace)
        const noteRegex = /\[note\]\s*\[note-id:\s*(.+?)\]\s*\[note-title:\s*(.+?)\]\s*\[note-content:\s*([\s\S]*?)\]/gi;
        cleanText = cleanText.replace(noteRegex, (match, id, title, content) => {
            newNotes.push({ id: id.trim(), title: title.trim(), content: content.trim() });
            return ''; // STRIP
        });

        const noteDelRegex = /\[note-delete:\s*(.+?)\]/gi;
        cleanText = cleanText.replace(noteDelRegex, (match, id) => {
            deletedNoteIds.push(id.trim());
            return '';
        });

        // E. METADATA
        cleanText = cleanText.replace(/\[metadata:([a-z_]+)\]\s*(.*)/gi, (match, key, val) => {
            this.metadata.update(m => ({ ...m, [key]: val.trim() }));
            return '';
        });

        // F. MUSIC
        cleanText = cleanText.replace(/\[music\.change\s+ID=["'](.+?)["']\]/gi, (match, id) => {
            musicId = id;
            return '';
        });

        // G. LOG CLEANUP
        cleanText = cleanText.replace(/\[LOG:.*?\]/gi, '');

        // H. FINAL CLEANUP OF EMPTY MARKDOWN BLOCKS
        // Removes ```json \n ``` or just ``` \n ``` that might be left over if the tags were inside them.
        cleanText = cleanText.replace(/```[a-z]*\s*```/gi, '');

        return { cleanText, parsedPlan, parsedMetadata: {}, newNotes, updatedNotes, deletedNoteIds, musicId, routineBlocks, widgetCmd, zenCmd };
    }

    // --- ROUTINE LOGIC ---

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

            // Determine Status based on Time
            if (currentMinutes >= endTotal) {
                newStatus = 'completed';
            } else if (currentMinutes >= startTotal && currentMinutes < endTotal) {
                newStatus = 'active';
                activeBlock = block;

                // Calculate Remaining
                const diff = endTotal - currentMinutes;
                remainingLabel = `${diff}m left`;
            } else {
                newStatus = 'upcoming';
            }

            // Always update remainingLabel if active, otherwise clear it
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

        // Auto-update widget AND AUTO-START POMODORO
        if (activeBlock && activeBlock.id !== this.lastActiveBlockId) {
            this.lastActiveBlockId = activeBlock.id;

            // If entering a Deep Work block, suggest AND START Pomodoro
            if (activeBlock.type === 'deep') {
                // Calculate duration of the block in minutes
                const durationStr = activeBlock.duration.replace('m', '');
                const duration = parseInt(durationStr) || 25;

                // Start immediately
                this.startPomodoro(duration);
            } else if (activeBlock.type === 'break') {
                this.activeWidget.set({ type: 'none', data: null });
            }
        }
    }

    // --- TEST ENGINE ---

    private parseAndRegisterTest(topic: string, body: string) {
        const questions: TestQuestion[] = [];
        const blocks = body.split('---');

        blocks.forEach((block, idx) => {
            if (!block.trim()) return;
            const qMatch = block.match(/Q:\s*(.*)/);
            const correctMatch = block.match(/CORRECT:\s*([A-Z])/);
            const explainMatch = block.match(/EXPLAIN:\s*(.*)/);
            const audioMatch = block.match(/AUDIO:\s*(.*)/i);

            if (qMatch && correctMatch) {
                const options: { key: string, text: string }[] = [];
                ['A', 'B', 'C', 'D'].forEach(key => {
                    const m = block.match(new RegExp(`${key}:\\s*(.*)`));
                    if (m && !m[0].startsWith('CORRECT') && !m[0].startsWith('EXPLAIN') && !m[0].startsWith('AUDIO')) {
                        if (!options.find(o => o.key === key)) {
                            options.push({ key, text: m[1].trim() });
                        }
                    }
                });

                questions.push({
                    id: `q-${Date.now()}-${idx}`,
                    question: qMatch[1].trim(),
                    audioUrl: audioMatch ? audioMatch[1].trim() : undefined,
                    options: options.sort((a, b) => a.key.localeCompare(b.key)),
                    correctKey: correctMatch[1].trim(),
                    explanation: explainMatch ? explainMatch[1].trim() : 'Correct!'
                });
            }
        });

        const testId = `test-${Date.now()}`;
        this.activeTests.set(testId, {
            id: testId,
            topic,
            questions,
            userAnswers: [],
            completed: false
        });
        return testId;
    }

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
        this.activeTest.update(t => t ? { ...t } : null);
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
                model: 'gemini-3-flash-preview',
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
                model: 'gemini-3-flash-preview',
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
        // 0. Pre-process Math for KaTeX
        // Replace $$...$$ with block math and $...$ with inline math if needed
        // OR: Just rely on marked, then run KaTeX on the output.
        // Since `marked` doesn't handle math natively, we can try to preserve it.

        // 1. Render Markdown FIRST.
        let html = marked.parse(text) as string;

        // 2. Render Math using window.katex if available
        if (typeof katex !== 'undefined') {
            try {
                // Block math $$...$$
                html = html.replace(/\$\$([\s\S]+?)\$\$/g, (match, tex) => {
                    try { return katex.renderToString(tex, { displayMode: true, throwOnError: false }); } catch (e) { return match; }
                });
                // Inline math $...$
                html = html.replace(/\$([^$]+?)\$/g, (match, tex) => {
                    try { return katex.renderToString(tex, { displayMode: false, throwOnError: false }); } catch (e) { return match; }
                });
            } catch (e) { console.error("KaTeX Error", e); }
        }

        // 3. TOKEN SWAP for WIDGETS
        const testTokenRegex = /(?:<p>)?\[\[WIDGET_TEST:(.*?)\]\](?:<\/p>)?/g;

        html = html.replace(testTokenRegex, (match, testId) => {
            const test = this.activeTests.get(testId);

            if (!test) return `<div class="p-4 border border-red-500 rounded text-red-400 text-xs">Test Widget Error</div>`;

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

        // 4. AGENTS
        html = html.replace(/\[createAI\s+([\s\S]*?)\]/g, (match, content) => {
            const cleanContent = content.replace(/<[^>]*>/g, '\n');
            const nameMatch = cleanContent.match(/NAME\s*=\s*(.*?)(?:\n|$)/);
            const descMatch = cleanContent.match(/DESC\s*=\s*(.*?)(?:\n|$)/);
            const promptMatch = cleanContent.match(/SYSTEM_PROMPT\s*=\s*([\s\S]*?)$/);

            const name = nameMatch ? nameMatch[1].trim() : 'AI Agent';
            const desc = descMatch ? descMatch[1].trim() : 'Assistant';
            const rawPrompt = promptMatch ? promptMatch[1].trim() : '';

            const configStr = encodeURIComponent(JSON.stringify({ name, description: desc, systemPrompt: encodeURIComponent(rawPrompt) }));

            return `<div class="agent-card p-4 bg-[#2B2930] rounded-xl border border-[#444746] flex justify-between items-center my-4 group hover:border-[#D0BCFF] transition-all">
               <div class="flex-1 min-w-0 mr-4">
                 <div class="flex items-center gap-2 mb-1">
                    <span class="material-symbols-outlined text-[#D0BCFF]">smart_toy</span>
                    <div class="font-bold text-[#E3E3E3] truncate">${name}</div>
                 </div>
                 <div class="text-xs text-[#C4C7C5] line-clamp-2">${desc}</div>
               </div>
               <button class="agent-run-btn w-10 h-10 rounded-full bg-[#D0BCFF] text-[#381E72] flex items-center justify-center hover:scale-110 transition-transform shadow-lg" data-config="${configStr}"><span class="material-symbols-outlined pointer-events-none">play_arrow</span></button>
            </div>`;
        });

        return this.sanitizer.bypassSecurityTrustHtml(html);
    }

    // --- HELPER FUNCTIONS & STATE UPDATERS ---

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
    resetSystemInstruction() { this.systemInstructionTemplate.set(FALLBACK_PROMPT); }

    saveScript(n: string, c: string) { this.savedScripts.update(s => [...s.filter(x => x.name !== n), { name: n, content: c }]); }
    deleteScript(n: string) { this.savedScripts.update(s => s.filter(x => x.name !== n)); }
    getScript(n: string) { return this.savedScripts().find(s => s.name === n)?.content; }

    getNoteContent(t: string) { return this.notes().find(n => n.title === t)?.content || null; }

    updateNoteContent(t: string, c: string) {
        let found = false;
        this.notes.update(n => {
            const idx = n.findIndex(x => x.title === t);
            if (idx !== -1) { found = true; n[idx] = { ...n[idx], content: c }; return [...n]; }
            return n;
        });
        return found;
    }

    deleteNoteByTitle(t: string) {
        let found = false;
        this.notes.update(n => {
            const prevLen = n.length;
            const filtered = n.filter(x => x.title !== t);
            if (filtered.length !== prevLen) found = true;
            return filtered;
        });
        return found;
    }

    updatePlanStatus(t: string, s: string) {
        let found = false;
        this.planSteps.update(steps => {
            const idx = steps.findIndex(x => x.title.toLowerCase().includes(t.toLowerCase()));
            if (idx !== -1) {
                found = true;
                steps[idx] = { ...steps[idx], status: s as any };
                return [...steps];
            }
            return steps;
        });
        return found;
    }

    addFile(f: any) { this.files.update(fs => [...fs, { ...f, id: Math.random().toString() }]); }
    getFile(n: string) { return this.files().find(f => f.name === n); }
    deleteFile(id: string) { this.files.update(fs => fs.filter(f => f.id !== id)); }

    async generateCoPilotResponse(u: string) { console.log("CoPilot Request:", u); }
    logAction(m: string) { console.log("System Action:", m); }
    addSystemMessage(t: string) { this.messages.update(m => [...m, { role: 'model', type: 'system', text: t, displayHtml: t }]); }
    addMessage(m: ChatMessage) { this.messages.update(msgs => [...msgs, m]); }
    playMusic(id: string) { this.audioService.playTrackById(id); }
    endRoutine() { this.routineBlocks.set([]); }

    startPomodoro(m: number) {
        // Ensure we clear previous
        if (this.timerInterval) clearInterval(this.timerInterval);

        this.activeWidget.set({ type: 'pomodoro', data: { current: m * 60, isPaused: false } });
        this.widgetVisible.set(true);

        this.timerInterval = setInterval(() => {
            this.activeWidget.update(w => {
                if (w.type === 'pomodoro' && !w.data.isPaused && w.data.current > 0) return { ...w, data: { ...w.data, current: w.data.current - 1 } };
                return w;
            });
        }, 1000);
    }

    toggleTimerPause() {
        this.activeWidget.update(w => {
            if (w.type === 'pomodoro') return { ...w, data: { ...w.data, isPaused: !w.data.isPaused } };
            return w;
        });
    }

    stopWidget() {
        this.activeWidget.set({ type: 'none', data: null });
        if (this.timerInterval) clearInterval(this.timerInterval);
    }

    updatePersona(p: string) { this.userPersona.set(p); }
    setZenMode(v: boolean) { this.zenMode.set(v); }

    triggerManualRefresh() {
        this.processTurn("Context Refresh: Please check current state and update if necessary.");
    }

    addPlanStep(t: string, d: string) {
        this.planSteps.update(s => [...s, { id: Math.random().toString(), title: t, description: d, status: 'pending' }]);
    }
    insertPlanStep(id: string, t: string) {
        this.planSteps.update(s => {
            const idx = s.findIndex(x => x.id === id);
            if (idx === -1) return s;
            const copy = [...s];
            copy.splice(idx + 1, 0, { id: Math.random().toString(), title: t, description: '', status: 'pending' });
            return copy;
        });
    }
    updatePlanStep(id: string, t: string, d: string) {
        this.planSteps.update(s => s.map(x => x.id === id ? { ...x, title: t, description: d } : x));
    }
    deletePlanStep(id: string) {
        this.planSteps.update(s => s.filter(x => x.id !== id));
    }
    movePlanStep(id: string, dir: 'up' | 'down') {
        this.planSteps.update(steps => {
            const idx = steps.findIndex(s => s.id === id);
            if (idx === -1) return steps;
            const newSteps = [...steps];
            if (dir === 'up' && idx > 0) {
                [newSteps[idx], newSteps[idx - 1]] = [newSteps[idx - 1], newSteps[idx]];
            } else if (dir === 'down' && idx < steps.length - 1) {
                [newSteps[idx], newSteps[idx + 1]] = [newSteps[idx + 1], newSteps[idx]];
            }
            return newSteps;
        });
    }

    addNote(t: string, c: string) {
        this.notes.update(n => [...n, { id: Math.random().toString(), title: t, content: c }]);
    }
    updateNote(id: string, t: string, c: string) {
        this.notes.update(n => n.map(x => x.id === id ? { ...x, title: t, content: c } : x));
    }
    deleteNote(id: string) {
        this.notes.update(n => n.filter(x => x.id !== id));
    }
}