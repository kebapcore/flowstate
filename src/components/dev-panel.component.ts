import { Component, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FlowStateService } from '../services/flow-state.service';

@Component({
  selector: 'app-dev-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex justify-end animate-in fade-in duration-200" (click)="close()">
      <div 
        class="w-full max-w-2xl h-full bg-[#131314] shadow-2xl flex flex-col border-l border-[#444746] animate-in slide-in-from-right duration-300"
        (click)="$event.stopPropagation()"
      >
        <!-- Header -->
        <div class="h-16 px-6 flex items-center justify-between border-b border-[#444746] bg-[#1E1F20]">
          <div class="flex items-center gap-3">
             <div class="px-2 py-1 rounded bg-red-900/30 border border-red-500/30 text-red-400 text-[10px] font-bold tracking-wider uppercase">Dev Engine</div>
             <h2 class="text-[#E3E3E3] font-medium">Core Configuration</h2>
          </div>
          <button (click)="close()" class="w-8 h-8 rounded-full hover:bg-[#2B2930] flex items-center justify-center text-[#C4C7C5] transition-colors">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <!-- Warning -->
        <div class="px-6 py-3 bg-red-900/10 border-b border-red-500/20 text-red-200 text-xs flex items-center gap-2">
           <span class="material-symbols-outlined text-[16px]">terminal</span>
           <span>Developer Access: Changes affect application logic and connectivity immediately.</span>
        </div>

        <div class="flex-1 overflow-y-auto custom-scrollbar">
            <!-- GIT AUTO-COMMIT INFO -->
            <div class="p-6 border-b border-[#444746] bg-[#1d1c21]">
                <h3 class="text-[#E3E3E3] text-sm font-bold uppercase tracking-wide mb-3 flex items-center gap-2">
                    <span class="material-symbols-outlined text-sm text-[#D0BCFF]">sync_alt</span> Auto-Commit System
                </h3>
                <div class="bg-[#131314] rounded-lg p-4 border border-[#444746] flex flex-col gap-3">
                    <p class="text-xs text-[#C4C7C5] leading-relaxed">
                        To enable real-time backup of AI modifications to GitHub, run the watcher script in your terminal:
                    </p>
                    <div class="bg-[#000] rounded px-3 py-2 border border-white/5 flex items-center justify-between">
                        <code class="font-mono text-xs text-[#9cdcfe]">node tools/auto-commit.js</code>
                        <button class="text-[#8E918F] hover:text-white" title="Copy" (click)="copyCmd()">
                            <span class="material-symbols-outlined text-sm">content_copy</span>
                        </button>
                    </div>
                    <div class="flex items-center gap-2 text-[10px] text-[#5E5E5E]">
                        <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                        <span>Watches /src for changes & pushes to origin</span>
                    </div>
                </div>
            </div>

            <!-- API Configuration -->
            <div class="p-6 border-b border-[#444746] bg-[#18181b]">
                <h3 class="text-[#E3E3E3] text-sm font-bold uppercase tracking-wide mb-4 flex items-center gap-2">
                    <span class="material-symbols-outlined text-sm text-[#D0BCFF]">api</span> API Settings
                </h3>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <!-- API KEY -->
                    <div class="space-y-2">
                        <label class="text-[10px] text-[#8E918F] font-bold uppercase tracking-wider">Gemini API Key</label>
                        <div class="relative">
                            <input 
                                type="password" 
                                [(ngModel)]="tempKey"
                                placeholder="sk-..."
                                class="w-full bg-[#131314] border border-[#444746] rounded-lg px-3 py-2 text-sm text-[#E3E3E3] focus:outline-none focus:border-[#D0BCFF] font-mono tracking-wide"
                            >
                        </div>
                        <p class="text-[10px] text-[#5E5E5E]">Overrides env variable. Stored locally.</p>
                    </div>

                    <!-- MODEL SELECTION -->
                    <div class="space-y-2">
                        <label class="text-[10px] text-[#8E918F] font-bold uppercase tracking-wider">Active Model</label>
                        <select 
                            [(ngModel)]="tempModel"
                            class="w-full bg-[#131314] border border-[#444746] rounded-lg px-3 py-2 text-sm text-[#E3E3E3] focus:outline-none focus:border-[#D0BCFF]"
                        >
                            <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                            <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                            <option value="gemini-3-flash-preview">Gemini 3 Flash Preview</option>
                            <option value="gemini-1.5-flash">Gemini 1.5 Flash (Legacy)</option>
                        </select>
                    </div>
                </div>
            </div>

            <!-- System Instruction Editor -->
            <div class="flex flex-col h-[500px]">
                 <div class="px-6 py-4 border-b border-[#444746] bg-[#18181b] flex items-center justify-between">
                     <h3 class="text-[#E3E3E3] text-sm font-bold uppercase tracking-wide flex items-center gap-2">
                        <span class="material-symbols-outlined text-sm text-[#D0BCFF]">psychology</span> System Prompt
                     </h3>
                     <span class="text-[10px] text-[#5E5E5E]">Hot-swappable</span>
                 </div>
                 <textarea 
                    [(ngModel)]="tempInstruction"
                    class="flex-1 bg-[#131314] text-[#C4C7C5] font-mono text-xs p-6 resize-none focus:outline-none leading-relaxed border-none"
                    spellcheck="false"
                 ></textarea>
            </div>
        </div>

        <!-- Footer -->
        <div class="p-6 border-t border-[#444746] bg-[#1E1F20] flex justify-between items-center">
           <button 
             (click)="reset()"
             class="text-red-400 hover:text-red-300 text-xs font-medium hover:underline flex items-center gap-2"
           >
             <span class="material-symbols-outlined text-[16px]">restart_alt</span>
             Reset Defaults
           </button>

           <div class="flex gap-3">
             <button (click)="close()" class="px-5 py-2 rounded-full border border-[#444746] text-[#C4C7C5] text-xs font-medium hover:bg-[#2B2930]">Cancel</button>
             <button (click)="save()" class="px-6 py-2 rounded-full bg-[#D0BCFF] text-[#381E72] text-xs font-bold hover:bg-[#EADDFF] shadow-lg">Apply Configuration</button>
           </div>
        </div>
      </div>
    </div>
  `
})
export class DevPanelComponent {
  flowService = inject(FlowStateService);
  tempInstruction = '';
  tempKey = '';
  tempModel = '';

  constructor() {
    effect(() => {
        // Initialize with current value when panel opens
        if (this.flowService.showDevPanel()) {
            this.tempInstruction = this.flowService.systemInstructionTemplate();
            this.tempKey = this.flowService.apiKey();
            this.tempModel = this.flowService.selectedModel();
        }
    });
  }

  close() {
    this.flowService.showDevPanel.set(false);
  }

  reset() {
      if(confirm('Are you sure you want to reset the system instructions to the original default? This cannot be undone.')) {
          this.flowService.resetSystemInstruction();
          this.tempInstruction = this.flowService.systemInstructionTemplate();
      }
  }

  save() {
      // 1. Update Key
      // Always call updateApiKey to ensure state sync, especially if user clears it
      this.flowService.updateApiKey(this.tempKey);
      
      // 2. Update Model
      if (this.tempModel !== this.flowService.selectedModel()) {
          this.flowService.setModel(this.tempModel);
      }

      // 3. Update Instruction
      this.flowService.systemInstructionTemplate.set(this.tempInstruction);
      
      this.flowService.addSystemMessage("🛠️ Dev Engine: Configuration Updated");
      this.close();
  }

  copyCmd() {
      navigator.clipboard.writeText('node tools/auto-commit.js');
      this.flowService.addSystemMessage('📋 Command copied to clipboard');
  }
}