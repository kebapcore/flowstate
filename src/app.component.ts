
import { Component, signal, inject, effect, ViewChild, ElementRef, AfterViewInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatComponent } from './components/chat.component';
import { SidebarComponent } from './components/sidebar.component';
import { PlanPanelComponent } from './components/plan-panel.component';
import { FlowStateService, Session } from './services/flow-state.service';
import { AudioService } from './services/audio.service';
import { DevPanelComponent } from './components/dev-panel.component';
import { SettingsModalComponent } from './components/settings-modal.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, ChatComponent, SidebarComponent, PlanPanelComponent, DevPanelComponent, SettingsModalComponent],
  template: `
    <div class="relative h-screen w-screen overflow-hidden text-[#E3E3E3] font-sans transition-colors duration-500"
         [class.bg-[#131314]]="!flowService.extraGlassMode()"
         [class.bg-[#000]]="flowService.extraGlassMode()"
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

      <!-- EXTRA GLASS MODE: Dynamic Backgrounds (Blobs & Noise) -->
      @if (flowService.extraGlassMode()) {
         <div class="fixed inset-0 z-0 overflow-hidden pointer-events-none">
             <div class="glass-blob blob-1"></div>
             <div class="glass-blob blob-2"></div>
             <div class="glass-blob blob-3"></div>
             <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40"></div>
             <div class="glass-noise"></div>
         </div>
      }

      <!-- LANDING PAGE OVERLAY -->
      @if (flowService.appMode() === 'landing') {
          <div class="absolute inset-0 z-50 flex flex-col pointer-events-auto bg-gradient-to-br from-[#131314] via-[#0b0b0c] to-[#000000]">
              
              <!-- TOP LEFT FLOATING MENU & HISTORY -->
              <div class="absolute top-8 left-8 z-50 group flex flex-col gap-4 items-start animate-in fade-in slide-in-from-left-4 duration-500">
                  <!-- MAIN ACTION BUTTON -->
                  <div class="relative">
                      <button class="w-12 h-12 rounded-full bg-[#D0BCFF] text-[#381E72] flex items-center justify-center shadow-lg hover:scale-110 transition-transform peer">
                          <span class="material-symbols-outlined text-2xl">add</span>
                      </button>
                      
                      <!-- HOVER MENU -->
                      <div class="absolute top-0 left-14 flex gap-2 opacity-0 -translate-x-2 pointer-events-none peer-hover:opacity-100 peer-hover:translate-x-0 peer-hover:pointer-events-auto hover:opacity-100 hover:translate-x-0 hover:pointer-events-auto transition-all duration-300">
                          <button (click)="flowService.createSession('chat')" class="flex items-center gap-2 px-4 py-2.5 bg-[#2B2930] hover:bg-[#D0BCFF] hover:text-[#381E72] rounded-full border border-white/10 shadow-xl transition-all whitespace-nowrap">
                              <span class="material-symbols-outlined text-[18px]">chat_bubble</span>
                              <span class="text-sm font-medium">Chat</span>
                          </button>
                          <button (click)="flowService.createSession('workspace')" class="flex items-center gap-2 px-4 py-2.5 bg-[#2B2930] hover:bg-[#D0BCFF] hover:text-[#381E72] rounded-full border border-white/10 shadow-xl transition-all whitespace-nowrap">
                              <span class="material-symbols-outlined text-[18px]">space_dashboard</span>
                              <span class="text-sm font-medium">Workspace</span>
                          </button>
                      </div>
                  </div>

                  <!-- HISTORY LIST -->
                  <div class="mt-4 w-64 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2 space-y-2 opacity-0 group-hover:opacity-100 transition-opacity duration-500 delay-100">
                      <div class="text-[10px] uppercase font-bold text-[#5E5E5E] tracking-widest mb-2 pl-1">Recent Sessions</div>
                      
                      @if (flowService.sessions().length === 0) {
                          <div class="text-xs text-[#5E5E5E] pl-1">No history yet.</div>
                      }

                      @for (session of flowService.sessions(); track session.id) {
                          <div class="group/item relative p-3 rounded-xl bg-[#18181b] hover:bg-[#2B2930] border border-transparent hover:border-white/5 transition-all cursor-pointer flex items-center gap-3" (click)="flowService.loadSession(session.id)">
                              <div class="w-8 h-8 rounded-lg flex items-center justify-center bg-white/5 text-[#C4C7C5]">
                                  <span class="material-symbols-outlined text-[16px]">
                                      {{ session.type === 'chat' ? 'chat' : 'grid_view' }}
                                  </span>
                              </div>
                              <div class="flex-1 min-w-0">
                                  <div class="text-sm font-medium text-[#E3E3E3] truncate">{{ session.title || 'Untitled' }}</div>
                                  <div class="text-[10px] text-[#8E918F]">{{ formatDate(session.lastModified) }}</div>
                              </div>
                              <button (click)="$event.stopPropagation(); flowService.deleteSession(session.id)" class="opacity-0 group-hover/item:opacity-100 p-1 text-[#5E5E5E] hover:text-red-400 transition-opacity">
                                  <span class="material-symbols-outlined text-[14px]">close</span>
                              </button>
                          </div>
                      }
                  </div>
              </div>

              <!-- HERO CENTER -->
              <div class="flex-1 flex flex-col items-center justify-center text-center animate-in zoom-in duration-700 p-6">
                 <div class="w-24 h-24 bg-gradient-to-br from-[#D0BCFF] to-[#9A82DB] rounded-[32px] flex items-center justify-center text-[#381E72] shadow-[0_0_60px_rgba(208,188,255,0.2)] mb-8">
                     <span class="material-symbols-outlined text-[48px]">bolt</span>
                 </div>
                 <h1 class="text-5xl md:text-7xl font-light tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white to-white/50 mb-6 drop-shadow-sm">Flowstate</h1>
                 <p class="text-lg md:text-xl text-[#8E918F] font-light max-w-lg leading-relaxed mb-10">
                    A dedicated environment for deep work, creative writing, and structured thinking.
                 </p>
                 <button (click)="flowService.createSession('workspace')" class="px-8 py-4 bg-[#D0BCFF] hover:bg-[#EADDFF] text-[#381E72] rounded-full text-base font-bold tracking-wide transition-transform hover:scale-105 active:scale-95 shadow-lg flex items-center gap-2">
                     <span>Start Now</span>
                     <span class="material-symbols-outlined">arrow_forward</span>
                 </button>
              </div>
          </div>
      }

      <!-- Main Content Wrapper -->
      <div 
         class="absolute inset-0 z-10 flex p-0 md:p-3 gap-3 transition-all duration-700 ease-in-out"
         [class.blur-md]="flowService.showSettings()"
         [class.opacity-50]="flowService.showSettings()"
         [class.justify-center]="flowService.appMode() === 'landing'"
         [class.flex-row-reverse]="flowService.layoutMode() === 'reversed'"
      >
        <!-- LEFT SIDEBAR (Workspace Mode Only) -->
        <!-- IDE MODE: Expands to 50% width -->
        <div 
           *ngIf="flowService.activeSession()?.type === 'workspace'"
           class="hidden md:block transition-all duration-700 ease-in-out h-full flex-shrink-0 relative overflow-hidden"
           [class.w-0]="!flowService.leftSidebarOpen() || flowService.zenMode()"
           [class.opacity-0]="!flowService.leftSidebarOpen() || flowService.zenMode()"
           
           [class.w-[300px]]="flowService.leftSidebarOpen() && !flowService.zenMode() && !flowService.activeModules().ide"
           [class.w-[50vw]]="flowService.leftSidebarOpen() && !flowService.zenMode() && flowService.activeModules().ide"
           
           [class.mr-0]="!flowService.leftSidebarOpen()"
        >
          <app-sidebar class="h-full block w-full"></app-sidebar>
        </div>

        <!-- MOBILE MENU (Workspace Only) -->
        @if (flowService.appMode() !== 'landing' && flowService.activeSession()?.type === 'workspace') {
            <button 
            class="md:hidden absolute top-4 left-4 z-50 p-3 bg-[#2B2930] rounded-full text-white shadow-lg border border-white/5 active:scale-95 transition-transform"
            (click)="showMobileSidebar.set(!showMobileSidebar())"
            >
            <span class="material-symbols-outlined text-[20px]">menu</span>
            </button>
        }

        <!-- CENTER CHAT AREA -->
        <div 
          class="flex-1 h-full relative flex flex-col min-w-0 overflow-hidden shadow-sm transition-all duration-700"
          [class.rounded-[32px]]="flowService.theme() === 'material' && flowService.appMode() !== 'landing'"
          [class.rounded-2xl]="flowService.theme() === 'cold' && flowService.appMode() !== 'landing'"
          [class.md:max-w-3xl]="flowService.appMode() === 'landing'"
          [class.w-full]="flowService.appMode() === 'landing' || flowService.activeSession()?.type === 'chat'"
          [class.flex-none]="flowService.appMode() === 'landing'"
        >
          <app-chat class="h-full w-full"></app-chat>
          
          <!-- Toggle Plan Button (Workspace Only) - HIDDEN IN IDE MODE -->
          @if (flowService.appMode() !== 'landing' && flowService.activeSession()?.type === 'workspace' && !flowService.zenMode() && !flowService.activeModules().ide) {
             <button 
               (click)="flowService.rightPanelOpen.set(!flowService.rightPanelOpen())"
               class="absolute top-6 z-40 flex items-center gap-2 pl-4 pr-5 py-2.5 bg-[#D0BCFF] hover:bg-[#EADDFF] text-[#381E72] rounded-full shadow-lg transition-all text-sm font-medium active:scale-95 group animate-in fade-in zoom-in"
               [class.right-6]="flowService.layoutMode() === 'standard'"
               [class.left-6]="flowService.layoutMode() === 'reversed'"
               [class.glass-panel-ultra]="flowService.extraGlassMode()"
               [class.text-white]="flowService.extraGlassMode()"
             >
               <span class="material-symbols-outlined text-[20px] group-hover:rotate-12 transition-transform">checklist</span>
               <span class="hidden sm:inline">{{ flowService.appMode() === 'study' ? 'Curriculum' : 'Plan' }}</span>
             </button>
          } 

          <!-- Open Left Sidebar Button (If Closed but NOT Zen - Workspace Only) -->
          @if (flowService.activeSession()?.type === 'workspace' && !flowService.leftSidebarOpen() && !flowService.zenMode() && flowService.appMode() !== 'landing') {
              <button 
               (click)="flowService.toggleLeftSidebar()"
               class="absolute top-6 z-40 w-10 h-10 bg-[#2B2930] hover:bg-[#322F35] text-[#C4C7C5] rounded-full shadow-lg transition-all flex items-center justify-center animate-in fade-in zoom-in"
               [class.left-6]="flowService.layoutMode() === 'standard'"
               [class.right-6]="flowService.layoutMode() === 'reversed'"
               [class.glass-panel-ultra]="flowService.extraGlassMode()"
             >
               <span class="material-symbols-outlined">last_page</span>
             </button>
          }

          <!-- EMERGENCY ZEN EXIT BUTTON (Only visible in Zen Mode) -->
          @if (flowService.zenMode()) {
            <button 
               (click)="flowService.toggleZenMode()"
               class="absolute bottom-6 left-6 z-50 pl-3 pr-4 py-3 bg-[#1E1F20] hover:bg-[#2B2930] border border-white/10 text-[#C4C7C5] hover:text-white rounded-full shadow-2xl transition-all flex items-center justify-center gap-2 animate-in fade-in zoom-in group"
               [class.glass-panel-ultra]="flowService.extraGlassMode()"
             >
               <span class="material-symbols-outlined text-[20px] group-hover:-rotate-90 transition-transform">dock_to_right</span>
               <span class="text-xs font-bold uppercase tracking-wider">Exit Zen</span>
             </button>
          }
        </div>

        <!-- RIGHT PANEL (Workspace Only) -->
        <!-- FORCED HIDDEN IN IDE MODE -->
        <div 
          *ngIf="flowService.activeSession()?.type === 'workspace' && !flowService.activeModules().ide"
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
                 class="absolute top-1/2 -translate-y-1/2 h-24 w-4 z-50 cursor-col-resize flex items-center justify-center group opacity-0 hover:opacity-100 transition-opacity"
                 [class.left-[-10px]]="flowService.layoutMode() === 'standard'"
                 [class.right-[-10px]]="flowService.layoutMode() === 'reversed'"
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

      <!-- DEV PANEL -->
      @if (flowService.showDevPanel()) {
        <app-dev-panel></app-dev-panel>
      }

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
  
  showMobileSidebar = signal(false);
  isResizing = false;

  constructor() {
     // Default to landing
     this.flowService.appMode.set('landing');
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey && event.shiftKey && (event.key === 'd' || event.key === 'D')) {
          event.preventDefault();
          this.flowService.toggleDevPanel();
      }
  }

  isMobile() { return window.innerWidth < 768; }
  onGlobalClick() { this.audioService.tryUnlockAudio(); }

  startResizing(event: MouseEvent) {
      this.isResizing = true;
      event.preventDefault();
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
  }

  onMouseMove(event: MouseEvent) {
      if (!this.isResizing) return;
      // In reversed layout, the resize math might need inversion, but let's stick to simple width calculation for now
      // Assuming right panel is always the resizable one regardless of position
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

  formatDate(ts: number) {
      return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' });
  }

  ngAfterViewInit() {}
}
