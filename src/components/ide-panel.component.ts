
import { Component, inject, signal, effect, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IdeService } from '../services/ide.service';
import { FlowStateService } from '../services/flow-state.service';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-ide-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="h-full flex flex-col bg-[#131314] text-[#E3E3E3] font-mono text-sm border-r border-[#444746] select-none"
         [class.glass-panel-ultra]="flowService.extraGlassMode()"
    >
      <!-- IDE Header -->
      <div class="flex items-center justify-between px-4 py-2 border-b border-[#444746] bg-[#1E1F20]">
         <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-[#D0BCFF]">terminal</span>
            <span class="font-bold tracking-wider text-xs">FLOWSTATE IDE</span>
            <div *ngIf="ideService.isBooting()" class="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
            <div *ngIf="ideService.isReady()" class="w-2 h-2 bg-green-500 rounded-full"></div>
         </div>
         
         <div class="flex bg-black/20 rounded-lg p-0.5 border border-white/5">
            <button (click)="activeTab.set('code')" class="px-3 py-1 rounded hover:bg-white/10 transition-colors flex items-center gap-2" [class.bg-white-10]="activeTab() === 'code'" [class.text-[#D0BCFF]]="activeTab() === 'code'">
               <span class="material-symbols-outlined text-[14px]">code</span> Code
            </button>
            <button (click)="activeTab.set('preview')" class="px-3 py-1 rounded hover:bg-white/10 transition-colors flex items-center gap-2" [class.bg-white-10]="activeTab() === 'preview'" [class.text-[#D0BCFF]]="activeTab() === 'preview'">
               <span class="material-symbols-outlined text-[14px]">preview</span> Preview
            </button>
            <button (click)="activeTab.set('terminal')" class="px-3 py-1 rounded hover:bg-white/10 transition-colors flex items-center gap-2" [class.bg-white-10]="activeTab() === 'terminal'" [class.text-[#D0BCFF]]="activeTab() === 'terminal'">
               <span class="material-symbols-outlined text-[14px]">dvr</span> Logs
            </button>
         </div>

         <button (click)="exitIde()" class="text-[#8E918F] hover:text-white p-1" title="Minimize IDE">
            <span class="material-symbols-outlined text-[18px]">close_fullscreen</span>
         </button>
      </div>

      <!-- MAIN CONTENT AREA -->
      <div class="flex-1 flex overflow-hidden">
         
         <!-- File Tree (Visible in Code Mode) -->
         <div *ngIf="activeTab() === 'code'" class="w-56 border-r border-[#444746] bg-[#18181b] flex flex-col">
            <div class="px-3 py-2 text-[10px] font-bold text-[#5E5E5E] uppercase tracking-wider flex justify-between items-center">
                <span>Explorer</span>
                <button (click)="ideService.refreshFileList()" class="hover:text-white text-[#5E5E5E]" title="Refresh">
                    <span class="material-symbols-outlined text-[12px]">refresh</span>
                </button>
            </div>
            <div class="flex-1 overflow-y-auto custom-scrollbar">
               <div *ngFor="let file of ideService.fileTree()" 
                    (click)="openFile(file)"
                    class="px-3 py-1.5 cursor-pointer hover:bg-white/5 flex items-center gap-2 transition-colors whitespace-nowrap overflow-hidden"
                    [class.text-[#D0BCFF]]="currentFile() === file"
                    [class.bg-white-5]="currentFile() === file"
                    [title]="file"
               >
                  <span class="material-symbols-outlined text-[14px] opacity-70 flex-shrink-0">
                    {{ file.includes('/') ? 'subdirectory_arrow_right' : 'description' }}
                  </span>
                  <span class="truncate text-xs">{{ file }}</span>
               </div>
               
               <div *ngIf="ideService.fileTree().length === 0" class="px-3 py-4 text-xs text-[#5E5E5E] italic text-center">
                  <div *ngIf="ideService.isBooting()" class="animate-pulse">Initializing FS...</div>
                  <div *ngIf="!ideService.isBooting()">No files found.<br>Use 'Refresh'.</div>
               </div>
            </div>
         </div>

         <!-- Editor / Preview / Terminal -->
         <div class="flex-1 flex flex-col relative bg-[#0d0d0d]">
            
            <!-- CODE EDITOR -->
            <div *ngIf="activeTab() === 'code'" class="absolute inset-0 flex flex-col">
                <div *ngIf="!currentFile()" class="flex-1 flex flex-col items-center justify-center text-[#444746]">
                   <span class="material-symbols-outlined text-4xl mb-2">code_blocks</span>
                   <p>Select a file to edit</p>
                </div>
                <div *ngIf="currentFile()" class="flex-1 flex flex-col relative">
                   <div class="flex items-center justify-between px-4 py-2 bg-[#1E1F20] border-b border-[#444746]">
                      <span class="text-xs text-[#C4C7C5] truncate max-w-[300px]">{{ currentFile() }}</span>
                      <button (click)="saveFile()" class="text-[#D0BCFF] text-xs hover:underline flex items-center gap-1 bg-white/5 px-2 py-1 rounded border border-white/5 hover:bg-white/10">
                         <span class="material-symbols-outlined text-[12px]">save</span> Save
                      </button>
                   </div>
                   <textarea 
                      [(ngModel)]="fileContent" 
                      class="flex-1 w-full h-full bg-[#0d0d0d] text-[#C4C7C5] p-4 font-mono text-xs focus:outline-none resize-none leading-relaxed custom-scrollbar"
                      spellcheck="false"
                   ></textarea>
                </div>
            </div>

            <!-- PREVIEW -->
            <div *ngIf="activeTab() === 'preview'" class="absolute inset-0 bg-white">
                <iframe 
                   *ngIf="safeServerUrl(); else noServer"
                   [src]="safeServerUrl()" 
                   class="w-full h-full border-none"
                ></iframe>
                <ng-template #noServer>
                   <div class="w-full h-full bg-[#131314] flex flex-col items-center justify-center text-[#5E5E5E]">
                      <span class="material-symbols-outlined text-4xl mb-2">wifi_off</span>
                      <p>Server not running</p>
                      <button (click)="ideService.runCommand('npm run dev')" class="mt-4 px-4 py-2 bg-[#2B2930] hover:bg-[#D0BCFF] hover:text-[#381E72] rounded text-xs transition-colors">Try 'npm run dev'</button>
                   </div>
                </ng-template>
            </div>

            <!-- TERMINAL -->
            <div *ngIf="activeTab() === 'terminal'" class="absolute inset-0 bg-black p-4 overflow-y-auto custom-scrollbar font-mono text-xs" #terminalContainer>
               <div *ngFor="let log of ideService.logs()" class="whitespace-pre-wrap mb-1 text-[#C4C7C5] border-b border-white/5 pb-0.5">{{ log }}</div>
               <div class="h-4"></div> <!-- Spacer -->
            </div>

         </div>
      </div>
    </div>
  `
})
export class IdePanelComponent implements AfterViewChecked {
  ideService = inject(IdeService);
  flowService = inject(FlowStateService);
  sanitizer = inject(DomSanitizer);
  
  @ViewChild('terminalContainer') terminalContainer!: ElementRef;

  activeTab = signal<'code' | 'preview' | 'terminal'>('code');
  currentFile = signal<string | null>(null);
  fileContent = '';

  constructor() {
      // Auto-switch to preview if server becomes ready
      effect(() => {
          if (this.ideService.serverUrl()) {
              this.activeTab.set('preview');
          }
      });
  }

  ngAfterViewChecked() {
      // Auto-scroll terminal
      if (this.activeTab() === 'terminal' && this.terminalContainer) {
          try {
              this.terminalContainer.nativeElement.scrollTop = this.terminalContainer.nativeElement.scrollHeight;
          } catch(e) {}
      }
  }

  safeServerUrl(): SafeResourceUrl | null {
      const url = this.ideService.serverUrl();
      return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  }

  async openFile(path: string) {
      try {
          const content = await this.ideService.readFile(path);
          this.fileContent = content;
          this.currentFile.set(path);
      } catch (e) {
          console.error("Failed to read file", e);
      }
  }

  async saveFile() {
      if (this.currentFile()) {
          await this.ideService.writeFile(this.currentFile()!, this.fileContent);
      }
  }

  exitIde() {
      this.flowService.updateModule('ide', false);
  }
}
