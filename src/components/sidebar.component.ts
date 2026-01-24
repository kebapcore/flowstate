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
      class="h-full flex flex-col p-6 w-full text-[#E3E3E3] transition-all duration-700 ease-in-out relative z-10"
      [class.md:rounded-[32px]]="flowService.theme() === 'material'"
      [class.md:rounded-2xl]="flowService.theme() === 'cold'"
      [class.bg-[#1E1F20]]="!flowService.wallpaper() && flowService.theme() === 'material'"
      [class.bg-black]="!flowService.wallpaper() && flowService.theme() === 'cold'"
      [class.bg-opacity-80]="!!flowService.wallpaper() && flowService.theme() === 'material'"
      [class.bg-opacity-60]="!!flowService.wallpaper() && flowService.theme() === 'cold'"
      [class.backdrop-blur-xl]="!!flowService.wallpaper()"
      [class.border]="flowService.theme() === 'cold'"
      [class.border-white-10]="flowService.theme() === 'cold'"
      [class.font-sans]="flowService.theme() === 'cold'"
    >
      <!-- Branding & Close (Hidden in Zen) -->
      @if (!flowService.zenMode()) {
        <div class="flex items-center justify-between mb-8 px-2 animate-in fade-in duration-500">
           <div class="flex items-center space-x-3">
              <div class="w-10 h-10 bg-[#D0BCFF] rounded-full flex items-center justify-center text-[#381E72]">
                <span class="material-symbols-outlined text-[22px]">bolt</span>
              </div>
              <div class="flex flex-col">
                <span class="text-xl font-medium tracking-tight text-[#F2F2F2]">Flowstate</span>
                <span class="text-[10px] uppercase tracking-wider text-[#C4C7C5] font-medium opacity-60">Creative Lab</span>
              </div>
           </div>
           <!-- Close Sidebar Button (Mobile/Desktop) -->
           <button 
             (click)="flowService.toggleLeftSidebar()"
             class="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-[#C4C7C5]"
             title="Close Sidebar"
           >
             <span class="material-symbols-outlined">first_page</span>
           </button>
        </div>

        <!-- Current Project Context (Hidden in Zen AND Study Mode) -->
        @if (flowService.appMode() !== 'study') {
            <div class="mb-6 flex-shrink-0 animate-in fade-in duration-500">
            <div class="flex items-center justify-between mb-3 px-2">
                <div class="text-[11px] font-medium text-[#C4C7C5]">Project Context</div>
                <button 
                (click)="flowService.triggerManualRefresh()" 
                [disabled]="flowService.isLoading()"
                class="text-[#C4C7C5] hover:text-[#D0BCFF] transition-colors p-1 rounded-full hover:bg-white/5 active:scale-95"
                title="Refresh AI Context"
                >
                <span class="material-symbols-outlined text-[18px]">refresh</span>
                </button>
            </div>
            
            <div class="bg-[#2B2930] rounded-[24px] p-5 transition-all hover:bg-[#322F35] relative overflow-hidden group">
                <h3 class="text-[#F2F2F2] font-medium mb-1.5 truncate text-[15px]">{{ flowService.metadata().title }}</h3>
                <p class="text-xs text-[#C4C7C5] line-clamp-2 mb-4 leading-relaxed opacity-80">{{ flowService.metadata().slogan }}</p>
                
                <div class="flex flex-wrap gap-2">
                @for (kw of keywords(); track $index) {
                    <span class="px-3 py-1 rounded-full text-[10px] bg-[#1E1F20] text-[#C4C7C5] border border-white/5 font-medium">{{kw}}</span>
                }
                </div>
                <!-- Glass effect for cold mode -->
                @if (flowService.theme() === 'cold') {
                <div class="absolute inset-0 border border-white/5 rounded-[24px] pointer-events-none"></div>
                }
            </div>
            </div>

            <!-- Project Details List (Hidden in Zen) -->
            <div class="flex-1 overflow-y-auto space-y-6 px-2 custom-scrollbar animate-in fade-in duration-500">
            <div class="group">
                <div class="flex items-center space-x-2 text-[11px] text-[#C4C7C5] font-medium mb-2 opacity-60 group-hover:opacity-100 transition-opacity">
                <span class="material-symbols-outlined text-[14px]">psychology_alt</span>
                <span>Core Problem</span>
                </div>
                <div class="text-sm text-[#E3E3E3] leading-relaxed pl-2 border-l-2 border-[#444746] py-1">{{ flowService.metadata().problem }}</div>
            </div>
            <div class="group">
                <div class="flex items-center space-x-2 text-[11px] text-[#C4C7C5] font-medium mb-2 opacity-60 group-hover:opacity-100 transition-opacity">
                <span class="material-symbols-outlined text-[14px]">groups</span>
                <span>Target Audience</span>
                </div>
                <div class="text-sm text-[#E3E3E3] leading-relaxed pl-2 border-l-2 border-[#444746] py-1">{{ flowService.metadata().audience }}</div>
            </div>
            </div>
        } @else {
             <!-- In Study Mode, we fill the space to push controls down -->
             <div class="flex-1"></div>
        }

      } @else {
        <!-- Zen Mode Filler -->
        <div class="flex-1 flex flex-col items-center justify-center text-[#444746] animate-in fade-in duration-1000">
           <span class="material-symbols-outlined text-4xl mb-4">self_improvement</span>
           <span class="text-xs font-medium tracking-widest uppercase">Zen Mode</span>
        </div>
      }

      <!-- Bottom Controls (ALWAYS VISIBLE) -->
      <div class="mt-6 space-y-3 flex-shrink-0 relative z-20">
        
        <!-- WIDGET AREA (Dynamic - Depends on Routine Module) -->
        @if (flowService.activeModules().routine) {
            @if (flowService.activeWidget().type !== 'none' && flowService.widgetVisible()) {
            <div class="bg-[#4F378B] rounded-[24px] p-4 mb-3 shadow-lg animate-in slide-in-from-bottom-4 fade-in duration-300 border border-[#D0BCFF]/20 relative">
                
                <!-- Pomodoro -->
                @if (flowService.activeWidget().type === 'pomodoro') {
                    <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-3">
                        <span class="material-symbols-outlined text-[#EADDFF]">timer</span>
                        <div>
                        <div class="text-2xl font-bold text-[#EADDFF] font-mono leading-none">
                            {{ formatTime(flowService.activeWidget().data.current) }}
                        </div>
                        <div class="text-[10px] text-[#D0BCFF] uppercase tracking-wider">Deep Focus</div>
                        </div>
                    </div>
                    <button (click)="flowService.toggleTimerPause()" class="w-10 h-10 rounded-full bg-[#EADDFF] text-[#381E72] flex items-center justify-center hover:scale-105 transition-transform">
                        <span class="material-symbols-outlined">{{ flowService.activeWidget().data.isPaused ? 'play_arrow' : 'pause' }}</span>
                    </button>
                    </div>
                }

                <!-- Checklist -->
                @if (flowService.activeWidget().type === 'checklist') {
                    <div class="space-y-2">
                    <div class="text-[10px] text-[#D0BCFF] uppercase tracking-wider font-bold mb-1">Checklist</div>
                    @for (item of flowService.activeWidget().data.items; track $index) {
                        <div class="flex items-center space-x-2">
                            <button class="w-4 h-4 rounded border border-[#D0BCFF] flex items-center justify-center" (click)="item.checked = !item.checked">
                            @if(item.checked) { <span class="material-symbols-outlined text-[12px] text-[#EADDFF]">check</span> }
                            </button>
                            <span class="text-sm text-[#EADDFF]" [class.line-through]="item.checked" [class.opacity-50]="item.checked">{{ item.text }}</span>
                        </div>
                    }
                    </div>
                }
            </div>
            }
        }

        <!-- Audio Player Pill -->
        <div class="bg-[#2B2930] p-2 pr-4 rounded-full flex items-center gap-3 transition-colors hover:bg-[#322F35]">
           <button 
             (click)="audioService.togglePlay()"
             class="w-10 h-10 rounded-full bg-[#D0BCFF] hover:bg-[#EADDFF] flex items-center justify-center text-[#381E72] transition-transform active:scale-95 flex-shrink-0">
             <span class="material-symbols-outlined text-[20px]">{{ audioService.isPlaying() ? 'pause' : 'play_arrow' }}</span>
           </button>
           
           <div class="flex-1 min-w-0 flex flex-col justify-center h-full">
             <div class="text-xs text-[#F2F2F2] font-medium truncate">
               {{ audioService.currentTrack()?.name || 'Silence' }}
             </div>
             <div class="text-[10px] text-[#C4C7C5] truncate opacity-70">
               {{ audioService.currentTrack()?.mood || 'Calm' }}
             </div>
           </div>

           <!-- Volume Mini -->
            <div class="group relative flex items-center">
              <span class="material-symbols-outlined text-[#C4C7C5] text-[18px]">volume_up</span>
              <input 
               type="range" 
               min="0" max="1" step="0.1" 
               [value]="audioService.volume()" 
               (input)="updateVolume($event)"
               class="absolute bottom-6 -right-2 w-20 origin-bottom-right -rotate-90 opacity-0 group-hover:opacity-100 transition-opacity bg-[#444746] h-1 rounded-full appearance-none cursor-pointer accent-[#D0BCFF]"
             >
            </div>
        </div>

        <!-- NEW: ROUTINE CONTROLS (Only visible when routine is active and module enabled) -->
        @if (flowService.activeModules().routine && flowService.routineBlocks().length > 0) {
            <div class="flex gap-2 animate-in fade-in slide-in-from-bottom-2">
                <!-- Toggle Panels (Zen Mode) -->
                <button 
                (click)="flowService.toggleZenMode()"
                class="flex-1 py-3 rounded-2xl bg-[#444746] hover:bg-[#5E5E5E] text-white flex items-center justify-center transition-colors shadow-md"
                [title]="flowService.zenMode() ? 'Exit Zen Mode' : 'Enter Zen Mode'"
                >
                <span class="material-symbols-outlined text-[20px]">{{ flowService.zenMode() ? 'dock_to_right' : 'fullscreen' }}</span>
                </button>

                <!-- Toggle Widget -->
                <button 
                (click)="flowService.toggleWidgetVisibility()"
                class="flex-1 py-3 rounded-2xl bg-[#444746] hover:bg-[#5E5E5E] text-white flex items-center justify-center transition-colors shadow-md"
                [class.opacity-50]="flowService.activeWidget().type === 'none'"
                title="Toggle Widget"
                >
                <span class="material-symbols-outlined text-[20px]">{{ flowService.widgetVisible() ? 'visibility_off' : 'visibility' }}</span>
                </button>
            </div>
        }

        <!-- AI Persona Settings Button (ALWAYS VISIBLE NOW) -->
        @if (!flowService.zenMode()) {
          <button 
            (click)="flowService.openSettings()"
            class="w-full flex items-center justify-center space-x-2 py-3.5 rounded-full border border-[#444746] hover:bg-[#2B2930] hover:border-transparent text-xs text-[#C4C7C5] hover:text-[#F2F2F2] transition-all font-medium active:scale-[0.98]"
          >
            <span class="material-symbols-outlined text-[18px]">tune</span>
            <span>Adjust Persona</span>
          </button>
        }
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