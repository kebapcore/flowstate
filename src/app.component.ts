import { Component, signal, inject, effect, ViewChild, ElementRef, AfterViewInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatComponent } from './components/chat.component';
import { SidebarComponent } from './components/sidebar.component';
import { PlanPanelComponent } from './components/plan-panel.component';
import { FlowStateService } from './services/flow-state.service';
import { AudioService } from './services/audio.service';
import { DevPanelComponent } from './components/dev-panel.component';
import { SettingsModalComponent } from './components/settings-modal.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, ChatComponent, SidebarComponent, PlanPanelComponent, DevPanelComponent, SettingsModalComponent],
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

      <!-- ASH PARTICLES (Landing Mode Only) -->
      @if (flowService.appMode() === 'landing') {
          <canvas #ashCanvas class="absolute inset-0 z-[1] pointer-events-none opacity-50"></canvas>
      }

      <!-- ZERO UI LANDING OVERLAY (Hero Section) -->
      @if (flowService.appMode() === 'landing' && flowService.messages().length === 0) {
          <div class="absolute inset-0 z-50 flex flex-col items-center justify-center pointer-events-none animate-out fade-out duration-700 fill-mode-forwards">
             
             <!-- Logo & Manifesto -->
             <div class="text-center mb-24 animate-in fade-in zoom-in duration-1000 delay-200 px-4">
                <div class="w-20 h-20 bg-[#D0BCFF] rounded-full flex items-center justify-center text-[#381E72] mx-auto mb-6 shadow-[0_0_40px_rgba(208,188,255,0.3)]">
                    <span class="material-symbols-outlined text-[40px]">bolt</span>
                </div>
                <h1 class="text-4xl md:text-5xl font-light tracking-tight text-[#F2F2F2] mb-4">Flowstate</h1>
                <p class="text-lg text-[#C4C7C5] font-light tracking-wide max-w-md mx-auto leading-relaxed">
                   Produce, work, redesign and brainstorm in a deep flow state.
                </p>
             </div>
          </div>
      }

      <!-- Main Content Wrapper -->
      <div 
         class="absolute inset-0 z-10 flex p-0 md:p-3 gap-3 transition-all duration-700 ease-in-out"
         [class.blur-md]="flowService.showSettings()"
         [class.opacity-50]="flowService.showSettings()"
         [class.justify-center]="flowService.appMode() === 'landing'"
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

        <!-- MOBILE MENU (Only if not landing) -->
        @if (flowService.appMode() !== 'landing') {
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
          [class.w-full]="flowService.appMode() === 'landing'"
          [class.flex-none]="flowService.appMode() === 'landing'" 
        >
          <app-chat class="h-full w-full"></app-chat>
          
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

          <!-- Open Left Sidebar Button (If Closed but NOT Zen) -->
          @if (!flowService.leftSidebarOpen() && !flowService.zenMode() && flowService.appMode() !== 'landing') {
              <button 
               (click)="flowService.toggleLeftSidebar()"
               class="absolute top-6 left-6 z-40 w-10 h-10 bg-[#2B2930] hover:bg-[#322F35] text-[#C4C7C5] rounded-full shadow-lg transition-all flex items-center justify-center animate-in fade-in zoom-in"
             >
               <span class="material-symbols-outlined">last_page</span>
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

  @ViewChild('ashCanvas') ashCanvas!: ElementRef<HTMLCanvasElement>;
  private particles: any[] = [];
  private animationFrameId: any;

  constructor() {
    // Force Landing State on Init if no data
    if (this.flowService.planSteps().length === 0 && this.flowService.notes().length === 0) {
        this.flowService.appMode.set('landing');
        this.flowService.leftSidebarOpen.set(false);
        this.flowService.rightPanelOpen.set(false);
    } else {
        // Restore project state if data exists
        this.flowService.appMode.set('project'); // Default fallback
        this.flowService.leftSidebarOpen.set(true);
        this.flowService.rightPanelOpen.set(true);
    }

    // React to app mode changes to start/stop particles
    effect(() => {
        if (this.flowService.appMode() === 'landing') {
            setTimeout(() => this.initParticles(), 100);
        } else {
            this.stopParticles();
        }
    });
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
      // Toggle Dev Panel on Ctrl + Shift + D
      if (event.ctrlKey && event.shiftKey && (event.key === 'd' || event.key === 'D')) {
          event.preventDefault();
          this.flowService.toggleDevPanel();
      }
  }

  isMobile() { return window.innerWidth < 768; }

  // --- AUDIO UNLOCKER ---
  onGlobalClick() {
      // First user interaction unlocks audio context
      this.audioService.tryUnlockAudio();
  }

  // --- PARTICLES SYSTEM ---

  ngAfterViewInit() {
      if(this.flowService.appMode() === 'landing') {
          this.initParticles();
      }
  }

  initParticles() {
      if (!this.ashCanvas) return;
      const canvas = this.ashCanvas.nativeElement;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;

      // Create particles
      this.particles = [];
      const count = 60; // Moderate amount
      for (let i = 0; i < count; i++) {
          this.particles.push(this.createParticle(canvas.width, canvas.height));
      }

      this.animateParticles();
  }

  createParticle(w: number, h: number) {
      // Spawn mostly on sides
      const side = Math.random() > 0.5 ? 'left' : 'right';
      const x = side === 'left' ? Math.random() * (w * 0.2) : w - Math.random() * (w * 0.2);
      
      return {
          x: x,
          y: Math.random() * h,
          size: Math.random() * 2 + 0.5,
          speedX: (Math.random() - 0.5) * 0.5, // Slow drift
          speedY: (Math.random() - 0.5) * 0.5,
          opacity: Math.random() * 0.5 + 0.1
      };
  }

  stopParticles() {
      if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
  }

  animateParticles() {
      if (!this.ashCanvas) return;
      const canvas = this.ashCanvas.nativeElement;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Chat Box Exclusion Zone (Approximate center)
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const safeW = 750; // Chat box width + margin
      const safeH = 200; // Chat box height area + margin
      const safeLeft = centerX - safeW / 2;
      const safeRight = centerX + safeW / 2;
      const safeTop = centerY - safeH / 2;
      const safeBottom = centerY + safeH / 2;

      this.particles.forEach(p => {
          p.x += p.speedX;
          p.y += p.speedY;

          // Wrap around edges
          if (p.x < 0) p.x = canvas.width;
          if (p.x > canvas.width) p.x = 0;
          if (p.y < 0) p.y = canvas.height;
          if (p.y > canvas.height) p.y = 0;

          // COLLISION AVOIDANCE with Center Box
          if (p.x > safeLeft && p.x < safeRight && p.y > safeTop && p.y < safeBottom) {
               // Push away towards nearest edge
               const distLeft = Math.abs(p.x - safeLeft);
               const distRight = Math.abs(p.x - safeRight);
               
               if (distLeft < distRight) {
                   p.x -= 1; // Push left
               } else {
                   p.x += 1; // Push right
               }
          }

          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(200, 200, 200, ${p.opacity})`;
          ctx.fill();
      });

      this.animationFrameId = requestAnimationFrame(() => this.animateParticles());
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