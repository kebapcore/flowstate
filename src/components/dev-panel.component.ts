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
             <div class="px-2 py-1 rounded bg-red-900/30 border border-red-500/30 text-red-400 text-[10px] font-bold tracking-wider uppercase">Dev Mode</div>
             <h2 class="text-[#E3E3E3] font-medium">System Instructions</h2>
          </div>
          <button (click)="close()" class="w-8 h-8 rounded-full hover:bg-[#2B2930] flex items-center justify-center text-[#C4C7C5] transition-colors">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <!-- Warning -->
        <div class="px-6 py-3 bg-red-900/10 border-b border-red-500/20 text-red-200 text-xs flex items-center gap-2">
           <span class="material-symbols-outlined text-[16px]">warning</span>
           Changes here affect the AI's core behavior immediately. Use with caution.
        </div>

        <!-- Editor -->
        <div class="flex-1 relative">
          <textarea 
            [(ngModel)]="tempInstruction"
            class="w-full h-full bg-[#131314] text-[#C4C7C5] font-mono text-xs p-6 resize-none focus:outline-none leading-relaxed"
            spellcheck="false"
          ></textarea>
        </div>

        <!-- Footer -->
        <div class="p-6 border-t border-[#444746] bg-[#1E1F20] flex justify-between items-center">
           <button 
             (click)="reset()"
             class="text-red-400 hover:text-red-300 text-xs font-medium hover:underline flex items-center gap-2"
           >
             <span class="material-symbols-outlined text-[16px]">restart_alt</span>
             Reset to Default
           </button>

           <div class="flex gap-3">
             <button (click)="close()" class="px-5 py-2 rounded-full border border-[#444746] text-[#C4C7C5] text-xs font-medium hover:bg-[#2B2930]">Cancel</button>
             <button (click)="save()" class="px-6 py-2 rounded-full bg-[#D0BCFF] text-[#381E72] text-xs font-bold hover:bg-[#EADDFF] shadow-lg">Save Changes</button>
           </div>
        </div>
      </div>
    </div>
  `
})
export class DevPanelComponent {
  flowService = inject(FlowStateService);
  tempInstruction = '';

  constructor() {
    effect(() => {
        // Initialize with current value when panel opens
        if (this.flowService.showDevPanel()) {
            this.tempInstruction = this.flowService.systemInstructionTemplate();
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
      this.flowService.systemInstructionTemplate.set(this.tempInstruction);
      this.flowService.addSystemMessage("🛠️ System Instructions Updated");
      this.close();
  }
}