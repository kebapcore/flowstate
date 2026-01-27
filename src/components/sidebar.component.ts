import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FlowStateService, ThemeType } from '../services/flow-state.service';
import { AudioService } from '../services/audio.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div 
      class="h-full flex flex-col p-5 w-full text-[#E3E3E3] transition-all duration-700 ease-in-out relative z-10"
      [class.md:rounded-[32px]]="flowService.theme() === 'material'"
      [class.md:rounded-2xl]="flowService.theme() === 'cold'"
      [class.bg-[#121212]]="!flowService.wallpaper() && flowService.theme() === 'material'"
      [class.bg-black]="!flowService.wallpaper() && flowService.theme() === 'cold'"
      [class.bg-opacity-90]="!!flowService.wallpaper()"
      [class.backdrop-blur-2xl]="!!flowService.wallpaper()"
      [class.border-r]="flowService.theme() === 'cold'"
      [class.border-white-5]="flowService.theme() === 'cold'"
      [class.font-sans]="flowService.theme() === 'cold'"
    >
      <!-- Branding & Close (Hidden in Zen) -->
      @if (!flowService.zenMode()) {
        <div class="flex items-center justify-between mb-10 px-1 animate-in fade-in duration-500">
           <div class="flex items-center gap-3">
              <div class="w-8 h-8 bg-white/5 border border-white/10 rounded-lg flex items-center justify-center text-[#E3E3E3]">
                <span class="material-symbols-outlined text-[18px]">bolt</span>
              </div>
              <div class="flex flex-col">
                <span class="text-sm font-semibold tracking-tight text-[#F2F2F2]">Flowstate</span>
              </div>
           </div>
           <!-- Close Sidebar Button (Mobile/Desktop) -->
           <button 
             (click)="flowService.toggleLeftSidebar()"
             class="w-8 h-8 rounded-lg hover:bg-white/5 border border-transparent hover:border-white/5 flex items-center justify-center text-[#8E918F] transition-all"
             title="Close Sidebar"
           >
             <span class="material-symbols-outlined text-[18px]">first_page</span>
           </button>
        </div>

        <!-- Current Project Context (Hidden in Zen AND Study Mode) -->
        @if (flowService.appMode() !== 'study') {
            <div class="mb-8 flex-shrink-0 animate-in fade-in duration-500">
            <div class="flex items-center justify-between mb-3 px-1">
                <div class="text-[10px] uppercase tracking-widest text-[#5E5E5E] font-bold">Context</div>
                <button 
                (click)="flowService.triggerManualRefresh()" 
                [disabled]="flowService.isLoading()"
                class="text-[#5E5E5E] hover:text-[#D0BCFF] transition-colors"
                title="Refresh AI Context"
                >
                <span class="material-symbols-outlined text-[14px]">refresh</span>
                </button>
            </div>
            
            <div class="bg-[#18181b] border border-white/5 rounded-2xl p-4 transition-all hover:border-[#D0BCFF]/20 relative overflow-hidden group">
                <h3 class="text-[#F2F2F2] font-medium mb-1 truncate text-sm">{{ flowService.metadata().title }}</h3>
                <p class="text-xs text-[#8E918F] line-clamp-2 mb-3 leading-relaxed">{{ flowService.metadata().slogan }}</p>
                
                <div class="flex flex-wrap gap-1.5">
                @for (kw of keywords(); track $index) {
                    <span class="px-2 py-0.5 rounded-md text-[9px] bg-white/5 text-[#C4C7C5] border border-white/5">{{kw}}</span>
                }
                </div>
            </div>
            </div>

            <!-- Project Details List (Hidden in Zen) -->
            <div class="flex-1 overflow-y-auto space-y-6 px-1 custom-scrollbar animate-in fade-in duration-500">
                <div class="group">
                    <div class="text-[10px] uppercase tracking-widest text-[#5E5E5E] font-bold mb-2">Problem</div>
                    <div class="text-xs text-[#C4C7C5] leading-relaxed">{{ flowService.metadata().problem }}</div>
                </div>
                <div class="group">
                    <div class="text-[10px] uppercase tracking-widest text-[#5E5E5E] font-bold mb-2">Audience</div>
                    <div class="text-xs text-[#C4C7C5] leading-relaxed">{{ flowService.metadata().audience }}</div>
                </div>
            </div>
        } @else {
             <!-- In Study Mode, we fill the space to push controls down -->
             <div class="flex-1"></div>
        }

      } @else {
        <!-- Zen Mode Filler -->
        <div class="flex-1 flex flex-col items-center justify-center text-[#444746] animate-in fade-in duration-1000">
           <span class="material-symbols-outlined text-4xl mb-4 opacity-20">self_improvement</span>
        </div>
      }

      <!-- Bottom Controls (ALWAYS VISIBLE) - CONTROL DECK -->
      <div class="mt-4 flex-shrink-0 relative z-20 flex flex-col gap-3">
        
        <!-- WIDGET AREA (Dynamic - Depends on Routine Module) -->
        @if (flowService.activeModules().routine && flowService.activeWidget().type !== 'none' && flowService.widgetVisible()) {
            <!-- Dashboard Instrument Style instead of Solid Block -->
            <div class="bg-[#0f0f10] rounded-2xl p-4 border border-[#D0BCFF]/20 shadow-lg animate-in slide-in-from-bottom-4 fade-in duration-300 relative overflow-hidden">
                <!-- Subtle Glow -->
                <div class="absolute -right-4 -top-4 w-20 h-20 bg-[#D0BCFF]/5 rounded-full blur-2xl pointer-events-none"></div>

                <!-- Pomodoro -->
                @if (flowService.activeWidget().type === 'pomodoro') {
                    <div class="flex items-center justify-between relative z-10">
                        <div class="flex items-center space-x-3">
                            <span class="material-symbols-outlined text-[#D0BCFF] animate-pulse">timer</span>
                            <div>
                                <div class="text-2xl font-bold text-[#F2F2F2] font-mono leading-none tracking-tight">
                                    {{ formatTime(flowService.activeWidget().data.current) }}
                                </div>
                                <div class="text-[9px] text-[#D0BCFF] uppercase tracking-wider font-semibold mt-1">Deep Focus</div>
                            </div>
                        </div>
                        <button (click)="flowService.toggleTimerPause()" class="w-8 h-8 rounded-full border border-[#D0BCFF]/30 text-[#D0BCFF] hover:bg-[#D0BCFF] hover:text-[#381E72] flex items-center justify-center transition-all">
                            <span class="material-symbols-outlined text-lg">{{ flowService.activeWidget().data.isPaused ? 'play_arrow' : 'pause' }}</span>
                        </button>
                    </div>
                }

                <!-- Checklist -->
                @if (flowService.activeWidget().type === 'checklist') {
                    <div class="space-y-2 relative z-10">
                    <div class="text-[9px] text-[#D0BCFF] uppercase tracking-wider font-bold mb-2">Active Tasks</div>
                    @for (item of flowService.activeWidget().data.items; track $index) {
                        <div class="flex items-center space-x-2 group cursor-pointer" (click)="item.checked = !item.checked">
                            <div class="w-3 h-3 rounded-[3px] border border-[#5E5E5E] flex items-center justify-center transition-colors" [class.bg-[#D0BCFF]]="item.checked" [class.border-[#D0BCFF]]="item.checked">
                                @if(item.checked) { <span class="material-symbols-outlined text-[10px] text-[#381E72]">check</span> }
                            </div>
                            <span class="text-xs text-[#C4C7C5] group-hover:text-white transition-colors" [class.line-through]="item.checked" [class.opacity-50]="item.checked">{{ item.text }}</span>
                        </div>
                    }
                    </div>
                }
            </div>
        }

        <!-- Audio Player Pill - Blended into Control Deck -->
        <div class="bg-[#18181b] border border-white/5 p-2 pr-4 rounded-xl flex items-center gap-3 transition-colors hover:border-white/10 group">
           <button 
             (click)="audioService.togglePlay()"
             class="w-9 h-9 rounded-lg bg-white/5 hover:bg-[#D0BCFF] hover:text-[#381E72] flex items-center justify-center text-[#E3E3E3] transition-all active:scale-95 flex-shrink-0">
             <span class="material-symbols-outlined text-[18px]">{{ audioService.isPlaying() ? 'pause' : 'play_arrow' }}</span>
           </button>
           
           <div class="flex-1 min-w-0 flex flex-col justify-center h-full">
             <div class="text-xs text-[#E3E3E3] font-medium truncate group-hover:text-white transition-colors">
               {{ audioService.currentTrack()?.name || 'Silence' }}
             </div>
             <div class="text-[10px] text-[#8E918F] truncate">
               {{ audioService.currentTrack()?.mood || 'Calm' }}
             </div>
           </div>

           <!-- Volume Mini -->
            <div class="group/vol relative flex items-center">
              <span class="material-symbols-outlined text-[#5E5E5E] text-[16px] group-hover/vol:text-[#C4C7C5] transition-colors">volume_up</span>
              <input 
               type="range" 
               min="0" max="1" step="0.1" 
               [value]="audioService.volume()" 
               (input)="updateVolume($event)"
               class="absolute bottom-6 -right-2 w-20 origin-bottom-right -rotate-90 opacity-0 group-hover/vol:opacity-100 transition-opacity bg-[#444746] h-1 rounded-full appearance-none cursor-pointer accent-[#D0BCFF]"
             >
            </div>
        </div>

        <!-- Utility Row (Routine Controls & Persona) -->
        <div class="flex gap-2">
            @if (flowService.activeModules().routine && flowService.routineBlocks().length > 0) {
                 <!-- Zen Toggle -->
                <button 
                (click)="flowService.toggleZenMode()"
                class="flex-1 py-2 rounded-lg bg-white/5 border border-transparent hover:border-white/10 text-[#C4C7C5] hover:text-white flex items-center justify-center transition-all"
                [title]="flowService.zenMode() ? 'Exit Zen Mode' : 'Enter Zen Mode'"
                >
                <span class="material-symbols-outlined text-[18px]">{{ flowService.zenMode() ? 'dock_to_right' : 'fullscreen' }}</span>
                </button>

                 <!-- Widget Toggle -->
                <button 
                (click)="flowService.toggleWidgetVisibility()"
                class="flex-1 py-2 rounded-lg bg-white/5 border border-transparent hover:border-white/10 text-[#C4C7C5] hover:text-white flex items-center justify-center transition-all"
                [class.opacity-50]="flowService.activeWidget().type === 'none'"
                title="Toggle Widget"
                >
                <span class="material-symbols-outlined text-[18px]">{{ flowService.widgetVisible() ? 'visibility_off' : 'visibility' }}</span>
                </button>
            }

            @if (!flowService.zenMode()) {
            <button 
                (click)="flowService.openSettings()"
                class="flex-1 flex items-center justify-center space-x-2 py-2 rounded-lg border border-white/5 hover:bg-white/5 text-[#C4C7C5] hover:text-white transition-all active:scale-[0.98]"
                title="Adjust Persona"
            >
                <span class="material-symbols-outlined text-[18px]">tune</span>
            </button>
            }
        </div>

      </div>
    </div>
  `
})
export class SidebarComponent {
  flowService = inject(FlowStateService);
  audioService = inject(AudioService);

  get keywords() {
    const kw = this.flowService.metadata().keywords;
    return () => kw ? kw.split(',').slice(0, 3) : [];
  }

  updateVolume(e: Event) {
    const val = parseFloat((e.target as HTMLInputElement).value);
    this.audioService.setVolume(val);
  }

  endRoutine() {
    if(confirm('Stop current routine?')) {
      this.flowService.endRoutine();
    }
  }

  formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
}