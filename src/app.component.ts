import { Component, signal, inject, effect, ViewChild, ElementRef, AfterViewInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatComponent } from './components/chat.component';
import { SidebarComponent } from './components/sidebar.component';
import { PlanPanelComponent } from './components/plan-panel.component';
import { FlowStateService } from './services/flow-state.service';
import { AudioService } from './services/audio.service';
import { SettingsModalComponent } from './components/settings-modal.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, ChatComponent, SidebarComponent, PlanPanelComponent, SettingsModalComponent],
  template: `
    <div class="relative h-screen w-screen overflow-hidden bg-[#131314] text-[#E3E3E3] font-sans"
         (mousemove)="onMouseMove($event)" 
         (mouseup)="onMouseUp()"
         (click)="onGlobalClick()"
    >
      
      <!-- GLOBAL WALLPAPER LAYER -->
      @if (flowService.wallpaper()) {
        <div class="fixed inset-0 z-0">
           <img [src]="flowService.wallpaper()" class="w-full h-full object-cover opacity-60">
           <div class="absolute inset-0 bg-black/40"></div>
        </div>
      }

      <!-- LANDING PAGE LAYOUT (AppMode === 'landing' AND Overlay Active) -->
      <!-- Only shows when we want the marketing/intro view -->
      @if (flowService.appMode() === 'landing' && flowService.messages().length === 0 && flowService.showLandingOverlay()) {
          <div class="absolute inset-0 z-50 overflow-y-auto bg-black custom-scrollbar animate-in fade-in duration-700">
             <!-- Header -->
             <div class="flex flex-col items-center pt-24 pb-12 px-4">
                <h1 class="text-5xl md:text-7xl font-bold tracking-tight text-[#F2F2F2] mb-2 flex items-center gap-4">
                    Flowstate
                    <span class="px-3 py-1 bg-[#D0BCFF] text-[#381E72] text-xs font-bold rounded-full tracking-widest uppercase align-middle">Alpha</span>
                </h1>
                <p class="text-xl text-[#8E918F] font-light tracking-wide max-w-2xl text-center leading-relaxed mb-8">
                   Produce, work, redesign and brainstorm in a deep flow state.
                </p>

                <!-- CTA BUTTON -->
                <button 
                  (click)="startProject()"
                  class="group relative px-8 py-4 bg-[#D0BCFF] hover:bg-[#EADDFF] text-[#381E72] rounded-full font-bold text-lg shadow-xl hover:shadow-2xl transition-all active:scale-95 flex items-center gap-3 overflow-hidden"
                >
                   <span class="material-symbols-outlined text-2xl group-hover:rotate-90 transition-transform duration-300">add_circle</span>
                   <span>Create Project</span>
                   <div class="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                </button>
                
                <div class="mt-8 text-[#5E5E5E] animate-bounce">
                    <span class="material-symbols-outlined text-2xl">keyboard_arrow_down</span>
                </div>
             </div>

             <!-- Video Embed -->
             <div class="w-full max-w-[1920px] mx-auto aspect-video mb-24 px-4 md:px-0">
                 <iframe 
                    class="w-full h-full rounded-xl shadow-2xl border border-[#333]" 
                    src="https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=0" 
                    title="Flowstate Demo"
                    frameborder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowfullscreen>
                 </iframe>
             </div>

             <!-- Features Section -->
             <div class="max-w-6xl mx-auto px-6 pb-48 space-y-32">
                 @for (item of features; track $index) {
                     <div class="flex flex-col md:flex-row items-center gap-12" [class.md:flex-row-reverse]="$index % 2 !== 0">
                         <!-- GIF/Image -->
                         <div class="flex-1 w-full">
                             <div class="aspect-video bg-[#1E1F20] rounded-2xl overflow-hidden border border-[#333] shadow-lg group">
                                 <img [src]="item.gif" class="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-500">
                             </div>
                         </div>
                         <!-- Text -->
                         <div class="flex-1 text-center md:text-left">
                             <h3 class="text-3xl font-bold text-[#E3E3E3] mb-4">{{ item.title }}</h3>
                             <p class="text-lg text-[#C4C7C5] leading-relaxed">{{ item.desc }}</p>
                         </div>
                     </div>
                 }
             </div>
          </div>
      }

      <!-- Main Content Wrapper (Visible when NOT in full landing mode, OR chat is active, OR overlay dismissed) -->
      <div 
         class="absolute inset-0 z-10 flex p-0 md:p-3 gap-3 transition-all duration-700 ease-in-out"
         [class.blur-md]="flowService.showSettings()"
         [class.opacity-0]="flowService.appMode() === 'landing' && flowService.messages().length === 0 && flowService.showLandingOverlay()"
         [class.pointer-events-none]="flowService.appMode() === 'landing' && flowService.messages().length === 0 && flowService.showLandingOverlay()"
      >
        <!-- LEFT SIDEBAR -->
        <div 
           class="hidden md:block transition-all duration-700 ease-in-out h-full flex-shrink-0 relative overflow-hidden"
           [class.w-0]="!flowService.leftSidebarOpen() || flowService.zenMode()"
           [class.opacity-0]="!flowService.leftSidebarOpen() || flowService.zenMode()"
           [class.w-[300px]]="flowService.leftSidebarOpen() && !flowService.zenMode()"
           [class.mr-0]="!flowService.leftSidebarOpen()"
        >
          <app-sidebar class="h-full block w-[300px]"></app-sidebar>
        </div>

        <!-- OPEN SIDEBAR BUTTON (Far Left) -->
        <!-- Only visible if sidebar is closed and we are NOT in Zen Mode -->
        @if (!flowService.leftSidebarOpen() && !flowService.zenMode()) {
            <button 
                (click)="flowService.toggleLeftSidebar()"
                class="absolute left-4 top-1/2 -translate-y-1/2 z-50 w-10 h-16 bg-[#1E1F20] border border-[#333] hover:bg-[#2B2930] hover:text-white text-[#8E918F] rounded-r-xl flex items-center justify-center transition-all shadow-xl"
                title="Open Sidebar"
            >
                <span class="material-symbols-outlined text-xl">chevron_right</span>
            </button>
        }

        <!-- CENTER CHAT AREA -->
        <div 
          class="flex-1 h-full relative flex flex-col min-w-0 overflow-hidden shadow-sm transition-all duration-700"
          [class.rounded-[32px]]="flowService.theme() === 'material' && flowService.appMode() !== 'landing'"
          [class.rounded-2xl]="flowService.theme() === 'cold' && flowService.appMode() !== 'landing'"
          [class.md:max-w-3xl]="flowService.appMode() === 'landing'"
          [class.w-full]="flowService.appMode() === 'landing'"
          [class.flex-none]="flowService.appMode() === 'landing'" 
          [class.mx-auto]="flowService.appMode() === 'landing'"
        >
          <app-chat class="h-full w-full"></app-chat>
          
          <!-- ALPHA BADGE IN ZERO UI (If in landing mode but NOT marketing overlay) -->
          @if (flowService.appMode() === 'landing' && !flowService.showLandingOverlay()) {
              <div class="absolute top-6 left-6 z-40 bg-[#D0BCFF]/10 border border-[#D0BCFF]/20 text-[#D0BCFF] px-2 py-0.5 rounded text-[10px] font-bold tracking-wider pointer-events-none animate-in fade-in">
                  ALPHA
              </div>
          }

          <!-- Toggle Plan Button (Not in landing) -->
          @if (flowService.appMode() !== 'landing' && !flowService.zenMode()) {
             <button 
               (click)="flowService.rightPanelOpen.set(!flowService.rightPanelOpen())"
               class="absolute top-6 right-6 z-40 flex items-center gap-2 pl-4 pr-5 py-2.5 bg-[#D0BCFF] hover:bg-[#EADDFF] text-[#381E72] rounded-full shadow-lg transition-all text-sm font-medium active:scale-95 group animate-in fade-in zoom-in"
             >
               <span class="material-symbols-outlined text-[20px] group-hover:rotate-12 transition-transform">checklist</span>
               <span class="hidden sm:inline">{{ flowService.appMode() === 'study' ? 'Curriculum' : 'Plan' }}</span>
             </button>
          } 

          <!-- EMERGENCY ZEN EXIT BUTTON (Only visible in Zen Mode) -->
          @if (flowService.zenMode()) {
            <button 
               (click)="flowService.toggleZenMode()"
               class="absolute bottom-6 left-6 z-50 pl-3 pr-4 py-3 bg-[#1E1F20] hover:bg-[#2B2930] border border-white/10 text-[#C4C7C5] hover:text-white rounded-full shadow-2xl transition-all flex items-center justify-center gap-2 animate-in fade-in zoom-in group"
             >
               <span class="material-symbols-outlined text-[20px] group-hover:-rotate-90 transition-transform">dock_to_right</span>
               <span class="text-xs font-bold uppercase tracking-wider">Exit Zen</span>
             </button>
          }
        </div>

        <!-- RIGHT PANEL -->
        <div 
          class="relative h-full transition-all duration-700 cubic-bezier(0.2, 0.0, 0, 1.0) flex-shrink-0"
          [class.w-0]="!flowService.rightPanelOpen() || flowService.zenMode()"
          [class.opacity-0]="!flowService.rightPanelOpen() || flowService.zenMode()"
          [class.translate-x-full]="(!flowService.rightPanelOpen() || flowService.zenMode()) && isMobile()"
          [class.translate-x-0]="flowService.rightPanelOpen() && !flowService.zenMode()"
          [style.width.px]="(!flowService.rightPanelOpen() || flowService.zenMode()) ? 0 : (isMobile() ? '100%' : flowService.rightPanelWidth())"
        >
          <!-- Drag Handle -->
          @if (flowService.rightPanelOpen() && !flowService.zenMode() && !isMobile()) {
              <div 
                 class="absolute left-[-10px] top-1/2 -translate-y-1/2 h-24 w-4 z-50 cursor-col-resize flex items-center justify-center group opacity-0 hover:opacity-100 transition-opacity"
                 (mousedown)="startResizing($event)"
              >
                  <div class="w-1.5 h-full rounded-full bg-[#444746] group-hover:bg-[#D0BCFF] transition-colors shadow-lg"></div>
              </div>
          }

          <div 
            class="w-full h-full overflow-hidden shadow-sm md:block"
            [class.rounded-[32px]]="flowService.theme() === 'material'"
            [class.rounded-2xl]="flowService.theme() === 'cold'"
          >
             <app-plan-panel class="h-full block"></app-plan-panel>
          </div>
        </div>
      </div>

      <!-- SETTINGS -->
      @if (flowService.showSettings()) {
        <app-settings-modal></app-settings-modal>
      }
    </div>
  `
})
export class AppComponent implements AfterViewInit {
  flowService = inject(FlowStateService);
  audioService = inject(AudioService);
  
  isResizing = false;

  features = [
      { title: 'Deep Context', desc: 'Flowstate remembers your files, links, and previous conversations to build a comprehensive project context.', gif: 'https://picsum.photos/600/400?grayscale' },
      { title: 'Interactive Planning', desc: 'Turn vague ideas into structured plans. Track progress with dynamic checklists and timelines.', gif: 'https://picsum.photos/600/401?grayscale' },
      { title: 'Live Collaboration', desc: 'Talk to your AI partner in real-time with low-latency voice interaction.', gif: 'https://picsum.photos/600/402?grayscale' },
      { title: 'Knowledge Verification', desc: 'Auto-generated quizzes ensure you truly understand the concepts you are exploring.', gif: 'https://picsum.photos/600/403?grayscale' },
      { title: 'Visual Generation', desc: 'Create UI mockups, charts, and illustrations on the fly to visualize your thoughts.', gif: 'https://picsum.photos/600/404?grayscale' },
      { title: 'Zen Focus', desc: 'Minimize distractions with a dedicated focus mode designed for deep work sessions.', gif: 'https://picsum.photos/600/405?grayscale' }
  ];

  constructor() {
    // If no messages, force landing mode initially
    if (this.flowService.messages().length === 0) {
        this.flowService.appMode.set('landing');
        this.flowService.leftSidebarOpen.set(false);
        this.flowService.rightPanelOpen.set(false);
    } 
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
      // (Dev Panel Removed)
  }

  startProject() {
      // Dismiss the landing overlay to reveal the Zero UI input
      this.flowService.showLandingOverlay.set(false);
      
      // Auto-focus input happens in ChatComponent via effect(), 
      // but clicking this button will trigger UI update.
  }

  isMobile() { return window.innerWidth < 768; }

  onGlobalClick() {
      this.audioService.tryUnlockAudio();
  }

  ngAfterViewInit() {
      // Removed particles logic
  }

  startResizing(event: MouseEvent) {
      this.isResizing = true;
      event.preventDefault();
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
  }

  onMouseMove(event: MouseEvent) {
      if (!this.isResizing) return;
      const newWidth = window.innerWidth - event.clientX - 12;
      this.flowService.setRightPanelWidth(newWidth);
  }

  onMouseUp() {
      if (this.isResizing) {
          this.isResizing = false;
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
      }
  }
}