import { Component, ElementRef, ViewChild, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FlowStateService, UserFile } from '../services/flow-state.service';
import { FlowScriptService } from '../services/flow-script.service';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div 
      class="flex flex-col h-full relative transition-all duration-700 ease-in-out"
      [class.font-sans]="flowService.theme() === 'cold'"
      [class.bg-[#1E1F20]]="!flowService.wallpaper() && flowService.theme() === 'material'"
      [class.bg-transparent]="flowService.appMode() === 'landing'" 
      [class.bg-black]="!flowService.wallpaper() && flowService.theme() === 'cold' && flowService.appMode() !== 'landing'"
      [class.bg-opacity-80]="!!flowService.wallpaper() && flowService.theme() === 'material'"
      [class.backdrop-blur-xl]="!!flowService.wallpaper() && flowService.appMode() !== 'landing'"
      [class.md:rounded-[32px]]="flowService.theme() === 'material' && flowService.appMode() !== 'landing'"
      [class.md:rounded-2xl]="flowService.theme() === 'cold' && flowService.appMode() !== 'landing'"
      (dragover)="onDragOver($event)"
      (dragleave)="onDragLeave($event)"
      (drop)="onDrop($event)"
    >
      <!-- Gradient Header (Hidden in Landing) -->
      @if (flowService.appMode() !== 'landing') {
        <div 
            class="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b z-10 pointer-events-none"
            [class.from-[#1E1F20]]="!flowService.wallpaper() && flowService.theme() === 'material'"
            [class.from-black]="!flowService.wallpaper() && flowService.theme() === 'cold'"
            [class.from-transparent]="!!flowService.wallpaper()"
        ></div>
      }

      <!-- DRAG OVERLAY -->
      @if (isDragging()) {
         <div class="absolute inset-0 z-50 bg-[#2B2930]/90 backdrop-blur-sm flex items-center justify-center flex-col text-[#D0BCFF] animate-in fade-in duration-200 pointer-events-none border-2 border-dashed border-[#D0BCFF] m-4 rounded-[32px]">
             <span class="material-symbols-outlined text-6xl mb-4">cloud_upload</span>
             <p class="text-lg font-medium">Drop files to add to chat</p>
         </div>
      }
      
      <!-- Content Container -->
      <div 
         class="flex-1 overflow-y-auto px-4 md:px-20 pt-12 pb-36 scroll-smooth" 
         #scrollContainer 
         [class.opacity-30]="showEditor()" 
         [class.pointer-events-none]="showEditor()"
         (click)="handleClick($event)"
      >
        <!-- In Landing Mode, we just need spacing, no header spacer -->
        <div class="h-10"></div>

        @for (msg of flowService.messages(); track $index) {
          @if (!msg.hidden) {
            
            <!-- Message Bubble -->
            <div [class]="'flex mb-8 ' + (msg.role === 'user' ? 'justify-end' : 'justify-start') + ' animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out'">
                
                <!-- Avatar (Model Only) -->
                @if(msg.role === 'model' && flowService.appMode() !== 'landing') {
                  <div class="w-8 h-8 rounded-full bg-gradient-to-br from-[#D0BCFF] to-[#EADDFF] flex-shrink-0 mr-4 mt-1 flex items-center justify-center shadow-md">
                    <span class="material-symbols-outlined text-[#381E72] text-[16px]">auto_awesome</span>
                  </div>
                }

                <div 
                  [class]="'max-w-[85%] md:max-w-[75%] px-7 py-5 shadow-sm text-[15px] leading-7 ' + 
                  (msg.role === 'user' 
                    ? (flowService.theme() === 'material' ? 'bg-[#4F378B] text-[#EADDFF] rounded-[24px] rounded-br-sm' : 'bg-[#4F378B] text-white rounded-xl border border-white/10')
                    : (flowService.theme() === 'material' ? 'bg-[#2B2930] text-[#E3E3E3] rounded-[24px] rounded-bl-sm' : 'bg-[#000000]/50 border border-white/10 text-[#E3E3E3] rounded-xl backdrop-blur-md'))"
                >
                  <!-- ATTACHMENTS DISPLAY -->
                  @if (msg.attachments && msg.attachments.length > 0) {
                      <div class="flex flex-wrap gap-2 mb-3">
                         @for (file of msg.attachments; track file.id) {
                            <div class="bg-black/20 rounded-lg p-2 flex items-center gap-2 max-w-[200px] border border-white/5">
                                <span class="material-symbols-outlined text-xs opacity-70">
                                   {{ getIcon(file) }}
                                </span>
                                <span class="text-xs truncate font-medium">{{ file.name }}</span>
                            </div>
                         }
                      </div>
                  }
                  
                  <div class="prose prose-invert prose-p:text-inherit prose-headings:text-inherit prose-strong:text-inherit max-w-none" [innerHTML]="msg.displayHtml"></div>
                </div>
              </div>
          }
        }

        @if (flowService.isLoading()) {
          <div class="flex justify-start mb-8 animate-pulse">
             @if(flowService.appMode() !== 'landing') {
                <div class="w-8 h-8 rounded-full bg-[#2B2930] flex-shrink-0 mr-4 mt-1 flex items-center justify-center">
                    <span class="material-symbols-outlined text-[#C4C7C5] text-[16px]">more_horiz</span>
                </div>
             }
            <div class="bg-[#2B2930] rounded-[24px] rounded-bl-sm px-6 py-4 flex items-center space-x-3">
              <span class="text-[#C4C7C5] text-xs font-medium">Thinking</span>
              <div class="typing-indicator flex space-x-1">
                <span class="w-1 h-1 bg-[#D0BCFF] rounded-full"></span>
                <span class="w-1 h-1 bg-[#D0BCFF] rounded-full"></span>
                <span class="w-1 h-1 bg-[#D0BCFF] rounded-full"></span>
              </div>
            </div>
          </div>
        }
      </div>

      <!-- Floating Input Area -->
      <!-- Absolute centering trick to guarantee alignment -->
      <div class="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-3xl px-4 z-20" [class.opacity-30]="showEditor()" [class.pointer-events-none]="showEditor()">
        
        <div 
          class="relative w-full shadow-2xl shadow-black/30 min-h-[72px] transition-all duration-300"
          [class.bg-[#2B2930]]="flowService.theme() === 'material'"
          [class.rounded-[32px]]="flowService.theme() === 'material'"
          [class.bg-black/80]="flowService.theme() === 'cold'"
          [class.backdrop-blur-md]="flowService.theme() === 'cold'"
          [class.border]="flowService.theme() === 'cold'"
          [class.border-white-10]="flowService.theme() === 'cold'"
          [class.rounded-2xl]="flowService.theme() === 'cold'"
        >
          <!-- ATTACHMENT PREVIEW AREA -->
          @if (pendingFiles().length > 0) {
              <div class="px-4 pt-3 flex flex-wrap gap-2">
                 @for (file of pendingFiles(); track file.name) {
                     <div class="relative group animate-in zoom-in duration-200">
                         <div class="h-14 w-14 rounded-xl bg-[#1E1F20] border border-[#444746] flex flex-col items-center justify-center overflow-hidden">
                             @if (file.type.startsWith('image/') && file.url) {
                                 <img [src]="file.url" class="w-full h-full object-cover opacity-80">
                             } @else {
                                 <span class="material-symbols-outlined text-[#D0BCFF] text-xl">{{ getIcon(file) }}</span>
                                 <span class="text-[8px] text-[#C4C7C5] mt-1 max-w-full truncate px-1">{{ file.name.split('.').pop() }}</span>
                             }
                         </div>
                         <button (click)="removeFile(file)" class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] shadow-sm hover:scale-110 transition-transform">
                             <span class="material-symbols-outlined text-[10px]">close</span>
                         </button>
                     </div>
                 }
              </div>
          }

          <!-- Input Field Wrapper -->
          <div class="flex items-end w-full px-2 py-3 gap-2">
             <!-- PLUS BUTTON (File Picker) -->
             <button 
                (click)="fileInput.click()"
                class="w-10 h-10 mb-1 flex items-center justify-center text-[#C4C7C5] hover:text-[#E3E3E3] hover:bg-white/5 rounded-full transition-colors active:scale-95 flex-shrink-0"
                title="Attach files"
             >
                <span class="material-symbols-outlined text-[24px]">add_circle</span>
             </button>
             <input #fileInput type="file" multiple class="hidden" (change)="handleFileSelect($event)">

             <div class="flex-1 flex flex-wrap items-center bg-transparent py-2 min-h-[48px]">
                <textarea 
                   [(ngModel)]="userInput" 
                   (keydown.enter)="onEnter($event)"
                   [placeholder]="flowService.appMode() === 'landing' ? 'I want to build...' : 'Type your idea...'"
                   class="flex-1 min-w-[150px] bg-transparent text-[#E3E3E3] focus:outline-none resize-none placeholder-[#8E918F] transition-all text-[15px] leading-relaxed self-center"
                   rows="1"
                   style="min-height: 24px; max-height: 120px;"
                   autofocus
                ></textarea>
             </div>
             <button 
                (click)="sendMessage()"
                [disabled]="(!userInput.trim() && pendingFiles().length === 0) || flowService.isLoading()"
                class="w-12 h-12 mb-0.5 flex items-center justify-center bg-[#D0BCFF] hover:bg-[#EADDFF] text-[#381E72] rounded-full transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-90 flex-shrink-0"
             >
                <span class="material-symbols-outlined text-[20px]">arrow_upward</span>
             </button>
          </div>
        </div>
      </div>
    </div>
  `
})
export class ChatComponent {
  flowService = inject(FlowStateService);
  flowScript = inject(FlowScriptService);
  
  userInput = '';
  showMenu = signal(false);
  showEditor = signal(false);
  
  // File Handling
  pendingFiles = signal<UserFile[]>([]);
  isDragging = signal(false);

  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  constructor() {
    effect(() => { this.flowService.messages(); setTimeout(() => this.scrollToBottom(), 100); });
  }

  // --- INTERACTION HANDLER ---
  handleClick(event: MouseEvent) {
      const target = event.target as HTMLElement;
      
      // 1. START QUIZ BUTTON (Triggers Right Panel Mode)
      const testBtn = target.closest('.test-run-btn') as HTMLElement;
      if (testBtn) {
          const testId = testBtn.dataset['testid'];
          if (testId) {
              this.flowService.activateTest(testId);
          }
          return;
      }

      // 2. AGENT CARD
      const btn = target.closest('.agent-run-btn') as HTMLElement;
      if (btn) {
          const configStr = btn.getAttribute('data-config');
          if (configStr) {
              try {
                  const jsonStr = decodeURIComponent(configStr);
                  const config = JSON.parse(jsonStr);
                  if(config.systemPrompt) config.systemPrompt = decodeURIComponent(config.systemPrompt);
                  this.flowService.activateAgent(config);
              } catch(e) {}
          }
      }
  }

  onEnter(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.sendMessage();
    }
  }

  toggleMenu() { this.showMenu.update(v => !v); }
  openEditor() { this.showMenu.set(false); this.showEditor.set(true); }
  closeEditor() { this.showEditor.set(false); }

  async sendMessage() {
    if ((!this.userInput.trim() && this.pendingFiles().length === 0) || this.flowService.isLoading()) return;
    
    const text = this.userInput;
    const files = [...this.pendingFiles()];
    
    this.userInput = '';
    this.pendingFiles.set([]); // Clear pending immediately
    
    this.flowService.sendMessage(text, files);
  }

  scrollToBottom() {
    try { this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight; } catch(err) { }
  }

  // --- FILE HANDLING ---

  handleFileSelect(event: Event) {
      const input = event.target as HTMLInputElement;
      if (input.files && input.files.length > 0) {
          this.processFiles(Array.from(input.files));
      }
      input.value = ''; // Reset
  }

  onDragOver(e: DragEvent) {
      e.preventDefault();
      e.stopPropagation();
      this.isDragging.set(true);
  }

  onDragLeave(e: DragEvent) {
      e.preventDefault();
      e.stopPropagation();
      // Only disable if leaving the window or main container
      if ((e.relatedTarget as HTMLElement) === null) {
        this.isDragging.set(false);
      }
  }

  onDrop(e: DragEvent) {
      e.preventDefault();
      e.stopPropagation();
      this.isDragging.set(false);
      
      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
          this.processFiles(Array.from(e.dataTransfer.files));
      }
  }

  async processFiles(files: File[]) {
      for (const file of files) {
          try {
              const base64 = await this.fileToBase64(file);
              const userFile: UserFile = {
                  id: Math.random().toString(36),
                  name: file.name,
                  type: file.type || 'application/octet-stream',
                  url: URL.createObjectURL(file), // For preview
                  base64: base64
              };
              this.pendingFiles.update(current => [...current, userFile]);
          } catch (e) {
              console.error("File processing failed", e);
          }
      }
  }

  removeFile(file: UserFile) {
      this.pendingFiles.update(current => current.filter(f => f !== file));
  }

  fileToBase64(file: File): Promise<string> {
      return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => {
              const result = reader.result as string;
              // Remove data:mime/type;base64, prefix
              const base64 = result.split(',')[1];
              resolve(base64);
          };
          reader.onerror = error => reject(error);
      });
  }

  getIcon(file: UserFile): string {
      const type = file.type.toLowerCase();
      if (type.startsWith('image/')) return 'image';
      if (type.startsWith('video/')) return 'movie';
      if (type.startsWith('audio/')) return 'headphones';
      if (type === 'application/pdf') return 'picture_as_pdf';
      return 'draft';
  }
}