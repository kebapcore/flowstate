import { Component, ElementRef, ViewChild, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FlowStateService, UserFile } from '../services/flow-state.service';
import { toPng } from 'html-to-image';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div 
      class="flex flex-col h-full relative transition-all duration-700 ease-in-out"
      [class.font-sans]="flowService.theme() === 'cold'"
      [class.bg-[#121212]]="!flowService.wallpaper() && flowService.theme() === 'material'"
      [class.bg-transparent]="flowService.appMode() === 'landing'" 
      [class.bg-black]="!flowService.wallpaper() && flowService.theme() === 'cold' && flowService.appMode() !== 'landing'"
      [class.bg-opacity-90]="!!flowService.wallpaper() && flowService.theme() === 'material'"
      [class.backdrop-blur-2xl]="!!flowService.wallpaper() && flowService.appMode() !== 'landing'"
      [class.md:rounded-[32px]]="flowService.theme() === 'material' && flowService.appMode() !== 'landing'"
      [class.md:rounded-2xl]="flowService.theme() === 'cold' && flowService.appMode() !== 'landing'"
      (dragover)="onDragOver($event)"
      (dragleave)="onDragLeave($event)"
      (drop)="onDrop($event)"
    >
      <!-- Gradient Header (Hidden in Landing) -->
      @if (flowService.appMode() !== 'landing') {
        <div 
            class="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b z-10 pointer-events-none"
            [class.from-[#121212]]="!flowService.wallpaper()"
            [class.from-transparent]="!!flowService.wallpaper()"
            [class.to-transparent]="true"
        ></div>
      }

      <!-- DRAG OVERLAY -->
      @if (isDragging()) {
         <div class="absolute inset-0 z-50 bg-[#000000]/80 backdrop-blur-sm flex items-center justify-center flex-col text-[#D0BCFF] animate-in fade-in duration-200 pointer-events-none border-2 border-dashed border-[#D0BCFF]/50 m-6 rounded-[24px]">
             <span class="material-symbols-outlined text-6xl mb-4">cloud_upload</span>
             <p class="text-xl font-light">Drop files to context</p>
         </div>
      }
      
      <!-- Content Container -->
      <div 
         class="flex-1 overflow-y-auto px-4 md:px-0 pt-12 pb-36 scroll-smooth" 
         #scrollContainer 
         (click)="handleClick($event)"
      >
        <!-- In Landing Mode, we just need spacing, no header spacer -->
        <div class="h-10"></div>

        <!-- System Loading State -->
        @if (!flowService.isSystemReady()) {
            <div class="flex flex-col items-center justify-center h-full opacity-60 animate-pulse">
                <span class="material-symbols-outlined text-3xl mb-4 text-[#8E918F]">cloud_sync</span>
                <p class="text-xs font-medium text-[#8E918F] tracking-wide uppercase">Initializing Core</p>
            </div>
        } @else {

          <div class="max-w-3xl mx-auto w-full flex flex-col px-4 md:px-8">
            @for (msg of flowService.messages(); track $index) {
                @if (!msg.hidden) {
                
                <!-- Message Row -->
                <div [class]="'flex mb-8 ' + (msg.role === 'user' ? 'justify-end' : 'justify-start') + ' animate-in fade-in slide-in-from-bottom-2 duration-500 ease-out'">
                    
                    <!-- Avatar (Model Only) - Minimalist -->
                    @if(msg.role === 'model' && flowService.appMode() !== 'landing') {
                        <div class="w-7 h-7 rounded-lg bg-gradient-to-tr from-[#D0BCFF] to-white flex-shrink-0 mr-4 mt-1 flex items-center justify-center shadow-lg opacity-90">
                        <span class="material-symbols-outlined text-[#381E72] text-[14px] font-bold">auto_awesome</span>
                        </div>
                    }

                    <div 
                        [class]="'max-w-[85%] md:max-w-[80%] ' + 
                        (msg.role === 'user' 
                        ? 'bg-[#27272a] text-[#F2F2F2] rounded-2xl rounded-tr-sm px-6 py-4 shadow-md' 
                        : 'bg-transparent text-[#E3E3E3] pl-0 py-1')"
                    >
                        <!-- ATTACHMENTS DISPLAY -->
                        @if (msg.attachments && msg.attachments.length > 0) {
                            <div class="flex flex-wrap gap-2 mb-3">
                            @for (file of msg.attachments; track file.id) {
                                <div class="bg-black/20 rounded-md p-1.5 px-3 flex items-center gap-2 max-w-[200px] border border-white/5">
                                    <span class="material-symbols-outlined text-xs opacity-70">
                                        {{ getIcon(file) }}
                                    </span>
                                    <span class="text-xs truncate font-medium opacity-80">{{ file.name }}</span>
                                </div>
                            }
                            </div>
                        }
                        
                        <div class="prose prose-invert prose-p:text-inherit prose-headings:text-inherit prose-strong:text-white prose-p:leading-relaxed max-w-none text-[15px] font-light" [innerHTML]="msg.displayHtml"></div>
                    </div>
                </div>
                }
            }

            @if (flowService.isLoading()) {
                <div class="flex justify-start mb-8 animate-pulse">
                    @if(flowService.appMode() !== 'landing') {
                        <div class="w-7 h-7 rounded-lg bg-[#27272a] flex-shrink-0 mr-4 mt-1 flex items-center justify-center">
                            <span class="material-symbols-outlined text-[#5E5E5E] text-[14px]">more_horiz</span>
                        </div>
                    }
                    <div class="flex items-center space-x-2 py-2">
                        <span class="text-[#5E5E5E] text-xs uppercase tracking-wider font-bold">Thinking</span>
                        <div class="typing-indicator flex space-x-1">
                        <span class="w-1 h-1 bg-[#8E918F] rounded-full"></span>
                        <span class="w-1 h-1 bg-[#8E918F] rounded-full"></span>
                        <span class="w-1 h-1 bg-[#8E918F] rounded-full"></span>
                        </div>
                    </div>
                </div>
            }
          </div>

        } <!-- End System Ready Check -->
      </div>

      <!-- Floating Input Area -->
      <div class="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-20">
        
        <div 
          class="relative w-full shadow-2xl shadow-black/50 min-h-[64px] transition-all duration-300 bg-[#18181b] border border-white/10 rounded-[28px] overflow-hidden backdrop-blur-md"
        >
          <!-- ATTACHMENT PREVIEW AREA -->
          @if (pendingFiles().length > 0) {
              <div class="px-4 pt-3 flex flex-wrap gap-2 bg-black/20 border-b border-white/5 pb-2">
                 @for (file of pendingFiles(); track file.name) {
                     <div class="relative group animate-in zoom-in duration-200">
                         <div class="h-10 w-10 rounded-lg bg-[#27272a] border border-white/10 flex flex-col items-center justify-center overflow-hidden">
                             @if (file.type.startsWith('image/') && file.url) {
                                 <img [src]="file.url" class="w-full h-full object-cover opacity-80">
                             } @else {
                                 <span class="material-symbols-outlined text-[#D0BCFF] text-base">{{ getIcon(file) }}</span>
                             }
                         </div>
                         <button (click)="removeFile(file)" class="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-500 text-white flex items-center justify-center shadow-sm hover:scale-110 transition-transform">
                             <span class="material-symbols-outlined text-[8px]">close</span>
                         </button>
                     </div>
                 }
              </div>
          }

          <!-- Input Field Wrapper -->
          <div class="flex items-end w-full px-3 py-3 gap-3">
             <!-- PLUS BUTTON (File Picker) -->
             <button 
                (click)="openFilePicker()"
                class="w-9 h-9 mb-1 flex items-center justify-center text-[#8E918F] hover:text-[#E3E3E3] hover:bg-white/5 rounded-full transition-colors active:scale-95 flex-shrink-0"
                title="Attach files"
             >
                <span class="material-symbols-outlined text-[20px]">add</span>
             </button>
             <input #fileInput type="file" multiple class="hidden" (change)="handleFileSelect($event)">

             <div class="flex-1 flex flex-wrap items-center bg-transparent py-2 min-h-[44px]">
                <textarea 
                   [(ngModel)]="userInput" 
                   (keydown.enter)="onEnter($event)"
                   [placeholder]="!flowService.isSystemReady() ? 'System Initializing...' : (flowService.appMode() === 'landing' ? 'Start a new project...' : 'Type to flow...')"
                   [disabled]="!flowService.isSystemReady()"
                   class="flex-1 min-w-[150px] bg-transparent text-[#E3E3E3] focus:outline-none resize-none placeholder-[#5E5E5E] transition-all text-[15px] leading-relaxed self-center disabled:opacity-50 font-light"
                   rows="1"
                   style="min-height: 24px; max-height: 120px;"
                   autofocus
                ></textarea>
             </div>
             <button 
                (click)="sendMessage()"
                [disabled]="(!userInput.trim() && pendingFiles().length === 0) || flowService.isLoading() || !flowService.isSystemReady()"
                class="w-10 h-10 mb-0.5 flex items-center justify-center bg-[#D0BCFF] hover:bg-[#EADDFF] text-[#381E72] rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 flex-shrink-0 shadow-lg"
             >
                <span class="material-symbols-outlined text-[18px]">arrow_upward</span>
             </button>
          </div>
        </div>
      </div>
    </div>
  `
})
export class ChatComponent {
  flowService = inject(FlowStateService);
  
  userInput = '';
  
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
      const agentBtn = target.closest('.agent-run-btn') as HTMLElement;
      if (agentBtn) {
          const configStr = agentBtn.getAttribute('data-config');
          if (configStr) {
              try {
                  const jsonStr = decodeURIComponent(configStr);
                  const config = JSON.parse(jsonStr);
                  if(config.systemPrompt) config.systemPrompt = decodeURIComponent(config.systemPrompt);
                  this.flowService.activateAgent(config);
              } catch(e) {}
          }
          return;
      }
      
      // 3. DESIGN DOWNLOAD BUTTON
      const designBtn = target.closest('.design-export-btn') as HTMLElement;
      if (designBtn) {
          const designId = designBtn.dataset['designId'];
          if (designId) {
              this.downloadDesign(designId, designBtn);
          }
          return;
      }

      // 4. BACKGROUND SELECTOR
      const bgBtn = target.closest('.background-selector-btn') as HTMLElement;
      if (bgBtn) {
          const url = bgBtn.dataset['url'];
          if (url) {
              this.flowService.setWallpaper(url);
              this.flowService.addSystemMessage(`Wallpaper updated successfully.`);
          }
          return;
      }

      // 5. CODE EXECUTION WIDGET TOGGLE
      const codeToggle = target.closest('.code-widget-toggle') as HTMLElement;
      if (codeToggle) {
          const container = codeToggle.closest('.code-widget-container');
          if (container) {
              const content = container.querySelector('.code-widget-content');
              const chevron = container.querySelector('.chevron');
              if (content) {
                  content.classList.toggle('hidden');
                  // Rotate Chevron
                  if (chevron) {
                      if (content.classList.contains('hidden')) {
                          chevron.classList.remove('rotate-180');
                      } else {
                          chevron.classList.add('rotate-180');
                      }
                  }
              }
          }
      }
  }

  async downloadDesign(designId: string, button: HTMLElement) {
      const containerId = `design-container-${designId}`;
      const container = document.getElementById(containerId);
      
      if (!container) {
          console.error("Design container not found:", containerId);
          return;
      }

      // Find the specific preview element to capture, ignoring the toolbar/buttons
      const previewElement = container.querySelector('.design-preview') as HTMLElement;
      
      if (!previewElement) {
          console.error("Preview element not found inside container");
          return;
      }

      const originalText = button.innerHTML;
      button.innerHTML = '<span class="material-symbols-outlined text-[16px] animate-spin">refresh</span> Processing...';
      button.style.pointerEvents = 'none';

      try {
          // Use html-to-image to generate blob
          const dataUrl = await toPng(previewElement, { 
              cacheBust: true,
              skipFonts: true, // Speeds up generation
              backgroundColor: null // Transparent background support
          });

          // 1. Download to PC
          const link = document.createElement('a');
          const dateStr = new Date().toISOString().split('T')[0];
          const filename = `Design_${dateStr}_${designId.substring(0,6)}.png`;
          link.download = filename;
          link.href = dataUrl;
          link.click();

          // 2. Add to Files Tab
          // Convert Data URL to base64 string (strip header)
          const base64 = dataUrl.split(',')[1];
          
          const userFile: UserFile = {
              id: Math.random().toString(36),
              name: filename,
              type: 'image/png',
              url: dataUrl,
              base64: base64,
              description: `AI generated design at ${dateStr}`
          };
          
          this.flowService.addFile(userFile);
          
          // Ensure Files module is active so user sees it eventually
          this.flowService.updateModule('files', true);

          button.innerHTML = '<span class="material-symbols-outlined text-[16px]">check</span> Saved';
          setTimeout(() => {
             button.innerHTML = originalText;
             button.style.pointerEvents = 'auto';
          }, 2000);

      } catch (error) {
          console.error("Design export failed:", error);
          button.innerHTML = '<span class="material-symbols-outlined text-[16px]">error</span> Failed';
          setTimeout(() => {
             button.innerHTML = originalText;
             button.style.pointerEvents = 'auto';
          }, 2000);
      }
  }

  onEnter(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.sendMessage();
    }
  }

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

  openFilePicker() {
    this.fileInput.nativeElement.click();
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