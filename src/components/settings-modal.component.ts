import { Component, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FlowStateService, ThemeType, ModuleState } from '../services/flow-state.service';

@Component({
  selector: 'app-settings-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300" (click)="close()">
      <div 
        class="bg-[#1E1F20] rounded-[28px] w-full max-w-md shadow-2xl overflow-hidden scale-in transition-transform flex flex-col max-h-[90vh] border border-[#444746]"
        (click)="$event.stopPropagation()"
      >
        <!-- Modal Header -->
        <div class="px-8 py-6 pb-2 flex items-center justify-between">
          <div>
            <h3 class="text-[#F2F2F2] text-xl font-normal">Settings</h3>
            <p class="text-sm text-[#C4C7C5] mt-1">Configure your workspace.</p>
          </div>
          <button (click)="close()" class="w-8 h-8 rounded-full bg-[#2B2930] text-[#C4C7C5] flex items-center justify-center hover:bg-[#444746] hover:text-white transition-colors">
            <span class="material-symbols-outlined text-sm">close</span>
          </button>
        </div>

        <!-- TABS -->
        <div class="px-8 flex space-x-6 border-b border-[#444746] mt-4">
           <button 
             (click)="activeTab.set('persona')"
             class="pb-3 text-sm font-medium transition-colors relative"
             [class.text-[#D0BCFF]]="activeTab() === 'persona'"
             [class.text-[#8E918F]]="activeTab() !== 'persona'"
           >
             Persona
             @if (activeTab() === 'persona') { <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-[#D0BCFF]"></div> }
           </button>
           <button 
             (click)="activeTab.set('appearance')"
             class="pb-3 text-sm font-medium transition-colors relative"
             [class.text-[#D0BCFF]]="activeTab() === 'appearance'"
             [class.text-[#8E918F]]="activeTab() !== 'appearance'"
           >
             Appearance
             @if (activeTab() === 'appearance') { <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-[#D0BCFF]"></div> }
           </button>
           <button 
             (click)="activeTab.set('modules')"
             class="pb-3 text-sm font-medium transition-colors relative"
             [class.text-[#D0BCFF]]="activeTab() === 'modules'"
             [class.text-[#8E918F]]="activeTab() !== 'modules'"
           >
             Modules
             @if (activeTab() === 'modules') { <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-[#D0BCFF]"></div> }
           </button>
        </div>

        <!-- Modal Content (Scrollable) -->
        <div class="p-8 pt-6 space-y-6 overflow-y-auto custom-scrollbar">
          
          <!-- PERSONA TAB -->
          @if (activeTab() === 'persona') {
            <div class="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <p class="text-xs text-[#C4C7C5]">Shape your thinking partner.</p>

                <!-- NEW MODEL SELECTOR -->
                 <div>
                    <div class="text-xs font-bold text-[#C4C7C5] uppercase tracking-wider mb-2">AI Model</div>
                    <div class="relative">
                        <select 
                            [(ngModel)]="tempModel"
                            class="w-full bg-[#131314] border border-[#444746] rounded-xl px-4 py-3 text-sm text-[#E3E3E3] focus:outline-none focus:border-[#D0BCFF] focus:ring-1 focus:ring-[#D0BCFF] appearance-none cursor-pointer transition-all hover:border-[#8E918F]"
                        >
                            <option value="gemini-2.5-flash">Gemini 2.5 Flash (gemini-2.5-flash)</option>
                            <option value="gemini-2.5-pro">Gemini 2.5 Pro (gemini-2.5-pro)</option>
                            <option value="gemini-3-flash-preview">Gemini 3 Flash (gemini-3-flash-preview)</option>
                        </select>
                        <div class="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-[#C4C7C5]">
                            <span class="material-symbols-outlined text-sm">expand_more</span>
                        </div>
                    </div>
                </div>

                <div class="h-px bg-[#444746]/50 my-4"></div>

                <div class="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                    <button (click)="setPreset('buddy')" class="px-4 py-2 rounded-xl bg-[#2B2930] hover:bg-[#D0BCFF] hover:text-[#381E72] text-xs font-medium text-[#C4C7C5] transition-colors whitespace-nowrap">Friendly</button>
                    <button (click)="setPreset('pro')" class="px-4 py-2 rounded-xl bg-[#2B2930] hover:bg-[#D0BCFF] hover:text-[#381E72] text-xs font-medium text-[#C4C7C5] transition-colors whitespace-nowrap">Professional</button>
                    <button (click)="setPreset('steve')" class="px-4 py-2 rounded-xl bg-[#2B2930] hover:bg-[#D0BCFF] hover:text-[#381E72] text-xs font-medium text-[#C4C7C5] transition-colors whitespace-nowrap">Visionary</button>
                </div>

                <div class="space-y-2">
                    <textarea 
                    [(ngModel)]="tempPersona"
                    rows="5"
                    class="w-full bg-[#131314] border border-[#444746] rounded-2xl p-4 text-sm text-[#E3E3E3] placeholder-[#5E5E5E] focus:outline-none focus:border-[#D0BCFF] focus:ring-1 focus:ring-[#D0BCFF] resize-none leading-relaxed transition-all"
                    placeholder="Define specific traits..."
                    ></textarea>
                </div>
            </div>
          }

          <!-- APPEARANCE TAB -->
          @if (activeTab() === 'appearance') {
            <div class="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                
                <!-- Theme Selector -->
                <div>
                    <div class="text-xs font-bold text-[#C4C7C5] uppercase tracking-wider mb-3">Theme Mode</div>
                    <div class="grid grid-cols-2 gap-3">
                        <button 
                          (click)="tempTheme = 'material'"
                          class="relative p-4 rounded-2xl border transition-all text-left group overflow-hidden"
                          [class.bg-[#4F378B]]="tempTheme === 'material'"
                          [class.border-transparent]="tempTheme === 'material'"
                          [class.bg-[#2B2930]]="tempTheme !== 'material'"
                          [class.border-[#444746]]="tempTheme !== 'material'"
                        >
                           <div class="text-sm font-medium mb-1" [class.text-[#EADDFF]]="tempTheme === 'material'" [class.text-[#E3E3E3]]="tempTheme !== 'material'">Material</div>
                           <div class="text-[10px] opacity-70" [class.text-[#D0BCFF]]="tempTheme === 'material'" [class.text-[#C4C7C5]]="tempTheme !== 'material'">Round, Pop, Modern</div>
                           <!-- Preview Circle -->
                           <div class="absolute -bottom-4 -right-4 w-12 h-12 bg-white/10 rounded-full group-hover:scale-150 transition-transform duration-500"></div>
                        </button>

                        <button 
                          (click)="tempTheme = 'cold'"
                          class="relative p-4 rounded-xl border transition-all text-left group overflow-hidden"
                          [class.bg-black]="tempTheme === 'cold'"
                          [class.border-white-20]="tempTheme === 'cold'"
                          [class.bg-[#2B2930]]="tempTheme !== 'cold'"
                          [class.border-[#444746]]="tempTheme !== 'cold'"
                        >
                           <div class="text-sm font-medium mb-1 text-[#E3E3E3]">Cold</div>
                           <div class="text-[10px] text-[#C4C7C5] opacity-70">Strict, Linear, Glass</div>
                           <!-- Preview Box -->
                           <div class="absolute -bottom-4 -right-4 w-10 h-10 border border-white/10 rounded-lg group-hover:rotate-12 transition-transform duration-500"></div>
                        </button>
                    </div>
                </div>

                <!-- Wallpaper Input -->
                <div>
                    <div class="text-xs font-bold text-[#C4C7C5] uppercase tracking-wider mb-3">Wallpaper</div>
                    <div class="relative">
                        <input 
                            [(ngModel)]="tempWallpaper"
                            placeholder="Paste Image URL..."
                            class="w-full bg-[#131314] border border-[#444746] rounded-xl px-4 py-3 text-sm text-[#E3E3E3] placeholder-[#5E5E5E] focus:outline-none focus:border-[#D0BCFF] focus:ring-1 focus:ring-[#D0BCFF] transition-all"
                        >
                        @if(tempWallpaper) {
                            <button (click)="tempWallpaper = ''" class="absolute right-3 top-3 text-[#5E5E5E] hover:text-[#E3E3E3]">
                                <span class="material-symbols-outlined text-sm">close</span>
                            </button>
                        }
                    </div>
                    <p class="text-[10px] text-[#8E918F] mt-2">Set a URL to enable glassmorphism mode.</p>
                </div>

            </div>
          }

          <!-- MODULES TAB (New) -->
          @if (activeTab() === 'modules') {
             <div class="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <p class="text-xs text-[#C4C7C5]">Toggle features to customize your experience and save AI tokens.</p>
                
                <div class="space-y-3">
                   <!-- CORE (Locked) -->
                   <div class="flex items-center justify-between p-4 bg-[#2B2930] rounded-2xl border border-[#444746] opacity-70 cursor-not-allowed">
                       <div>
                          <div class="flex items-center gap-2 mb-1">
                              <span class="text-sm font-medium text-[#E3E3E3]">Core System</span>
                              <span class="px-1.5 py-0.5 rounded bg-[#4F378B] text-[#EADDFF] text-[9px] font-bold tracking-wider">CORE</span>
                          </div>
                          <div class="text-[10px] text-[#C4C7C5]">Notes, Planning, and Basic Persona.</div>
                       </div>
                       <span class="material-symbols-outlined text-[#D0BCFF] opacity-50">toggle_on</span>
                   </div>

                   <!-- FILES SYSTEM -->
                   <div class="flex items-center justify-between p-4 bg-[#2B2930] rounded-2xl border border-[#444746]">
                       <div>
                          <div class="text-sm font-medium text-[#E3E3E3] mb-1">Files System</div>
                          <div class="text-[10px] text-[#C4C7C5]">Drag & drop, Previews, File Context.</div>
                       </div>
                       <button (click)="toggleModule('files', !flowService.activeModules().files)" class="text-[#D0BCFF] hover:text-[#EADDFF] transition-colors">
                           <span class="material-symbols-outlined text-[32px]">{{ flowService.activeModules().files ? 'toggle_on' : 'toggle_off' }}</span>
                       </button>
                   </div>

                   <!-- ROUTINE & FOCUS -->
                   <div class="flex items-center justify-between p-4 bg-[#2B2930] rounded-2xl border border-[#444746]">
                       <div>
                          <div class="flex items-center gap-2 mb-1">
                             <span class="text-sm font-medium text-[#E3E3E3]">Routine & Focus</span>
                             <span class="px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-200 text-[9px] font-bold tracking-wider">🧪 BETA</span>
                          </div>
                          <div class="text-[10px] text-[#C4C7C5]">Time blocking, Pomodoro, Zen Mode.</div>
                       </div>
                       <button (click)="toggleModule('routine', !flowService.activeModules().routine)" class="text-[#D0BCFF] hover:text-[#EADDFF] transition-colors">
                           <span class="material-symbols-outlined text-[32px]">{{ flowService.activeModules().routine ? 'toggle_on' : 'toggle_off' }}</span>
                       </button>
                   </div>
                </div>
             </div>
          }
        </div>

        <!-- Modal Footer -->
        <div class="px-8 py-6 pt-2 flex justify-end bg-[#1E1F20]">
          <button 
            (click)="saveSettings()"
            class="bg-[#D0BCFF] hover:bg-[#EADDFF] text-[#381E72] px-6 py-3 rounded-full text-sm font-medium transition-transform active:scale-95 shadow-md"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  `
})
export class SettingsModalComponent {
  flowService = inject(FlowStateService);
  activeTab = signal<'persona' | 'appearance' | 'modules'>('persona');
  
  // Temp State
  tempPersona = '';
  tempTheme: ThemeType = 'material';
  tempWallpaper = '';
  tempModel = 'gemini-2.5-pro';

  constructor() {
    effect(() => {
        // Init temp state when opened
        if (this.flowService.showSettings()) {
            this.tempPersona = this.flowService.userPersona();
            this.tempTheme = this.flowService.theme();
            this.tempWallpaper = this.flowService.wallpaper() || '';
            this.tempModel = this.flowService.selectedModel(); 
            this.activeTab.set('persona');
        }
    });
  }

  close() {
    this.flowService.showSettings.set(false);
  }

  saveSettings() {
    this.flowService.updatePersona(this.tempPersona);
    this.flowService.setTheme(this.tempTheme);
    this.flowService.setWallpaper(this.tempWallpaper.trim() || null);
    this.flowService.setModel(this.tempModel);
    this.close();
  }

  toggleModule(key: keyof ModuleState, value: boolean) {
      this.flowService.updateModule(key, value);
  }

  setPreset(type: 'buddy' | 'pro' | 'steve') {
    switch(type) {
      case 'buddy':
        this.tempPersona = "You are a friendly, energetic, and supportive creative partner. Act like a close friend ('kanka'). Be casual, avoid stiffness/corporate talk, and focus on keeping the momentum going. Use emojis occasionally.";
        break;
      case 'pro':
        this.tempPersona = "You are a senior product strategist. Be professional, concise, and analytical. Focus on market fit, feasibility, and structured execution. Avoid fluff.";
        break;
      case 'steve':
        this.tempPersona = "You are a visionary perfectionist like Steve Jobs. Demand simplicity and excellence. Be critical of mediocrity. Focus on the user experience and the 'soul' of the idea.";
        break;
    }
  }
}