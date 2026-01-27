import { Component, inject, signal, computed, effect, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FlowStateService, Note, PlanStep, RoutineBlock, UserFile } from '../services/flow-state.service';
import { marked } from 'marked';
import { DomSanitizer, SafeResourceUrl, SafeHtml } from '@angular/platform-browser';
import { MediaPlayerComponent } from './media-player.component';

@Component({
  selector: 'app-plan-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, MediaPlayerComponent],
  template: `
    <div 
      class="h-full flex flex-col w-full relative p-6 pt-20 md:pt-6 transition-all duration-700 ease-in-out"
      [class.font-sans]="flowService.theme() === 'cold'"
      [class.bg-[#121212]]="!flowService.wallpaper() && flowService.theme() === 'material'"
      [class.bg-black]="!flowService.wallpaper() && flowService.theme() === 'cold'"
      [class.bg-opacity-90]="!!flowService.wallpaper()"
      [class.backdrop-blur-2xl]="!!flowService.wallpaper()"
      [class.border-l]="flowService.theme() === 'cold'"
      [class.border-white-5]="flowService.theme() === 'cold'"
      [class.md:rounded-[32px]]="flowService.theme() === 'material'"
      [class.md:rounded-2xl]="flowService.theme() === 'cold'"
    >
      
      <!-- ==================== AGENT MODE ==================== -->
      @if (flowService.activeAgent()) {
          <!-- (Agent Chat UI) -->
          <div class="flex-1 flex flex-col h-full animate-in fade-in slide-in-from-right-4">
              <div class="flex items-center justify-between mb-5 border-b border-[#2B2930] pb-4">
                  <div class="flex items-center gap-4">
                      <div class="w-10 h-10 rounded-xl bg-[#D0BCFF] text-[#381E72] flex items-center justify-center shadow-lg">
                          <span class="material-symbols-outlined text-xl">smart_toy</span>
                      </div>
                      <div>
                          <h2 class="text-[#F2F2F2] font-bold text-base leading-tight">{{ flowService.activeAgent()?.name }}</h2>
                          <div class="text-[#8E918F] text-xs uppercase tracking-wider mt-0.5">Session Active</div>
                      </div>
                  </div>
                  <button (click)="flowService.closeAgent()" class="w-8 h-8 rounded-full hover:bg-white/5 text-[#8E918F] flex items-center justify-center transition-colors">
                      <span class="material-symbols-outlined text-xl">close</span>
                  </button>
              </div>
              <div class="flex-1 overflow-y-auto space-y-4 pr-1 custom-scrollbar mb-4" #agentScroll>
                  @for (msg of flowService.activeAgent()?.messages; track $index) {
                      <div [class]="'flex ' + (msg.role === 'user' ? 'justify-end' : 'justify-start')">
                          <div [class]="'max-w-[90%] px-5 py-3 text-sm leading-relaxed rounded-2xl ' + (msg.role === 'user' ? 'bg-[#27272a] text-[#E3E3E3]' : 'bg-[#18181b] text-[#C4C7C5] border border-white/5')">
                               <div class="prose prose-invert prose-p:text-inherit" [innerHTML]="msg.displayHtml"></div>
                          </div>
                      </div>
                  }
              </div>
              <div class="relative">
                  <textarea [(ngModel)]="agentInput" (keydown.enter)="sendAgentMessage($event)" placeholder="Message..." class="w-full bg-[#18181b] border border-[#2B2930] rounded-2xl pl-5 pr-12 py-4 text-sm text-[#E3E3E3] focus:outline-none focus:border-[#444746] resize-none shadow-inner" rows="1"></textarea>
                  <button (click)="sendAgentMessage()" [disabled]="!agentInput.trim() || flowService.activeAgent()?.isLoading" class="absolute right-3 top-3 w-8 h-8 rounded-xl text-[#D0BCFF] flex items-center justify-center hover:bg-white/5 transition-all disabled:opacity-30"><span class="material-symbols-outlined text-lg">arrow_upward</span></button>
              </div>
          </div>
      } 
      <!-- ==================== TEST RUNNER MODE ==================== -->
      @else if (flowService.activeTest()) {
          <div class="flex-1 flex flex-col h-full animate-in fade-in slide-in-from-right-4">
              <!-- Header -->
              <div class="flex items-center justify-between mb-5 border-b border-[#2B2930] pb-4">
                  <div class="flex items-center gap-4">
                      <div class="w-10 h-10 rounded-xl bg-[#D0BCFF] text-[#381E72] flex items-center justify-center shadow-lg">
                          <span class="material-symbols-outlined text-xl">quiz</span>
                      </div>
                      <div>
                          <h2 class="text-[#F2F2F2] font-bold text-base leading-tight truncate max-w-[200px]">{{ flowService.activeTest()?.topic }}</h2>
                          <div class="text-[#8E918F] text-xs uppercase tracking-wider mt-0.5">Assessment</div>
                      </div>
                  </div>
                  <button (click)="flowService.closeTest()" class="w-8 h-8 rounded-full hover:bg-white/5 text-[#8E918F] flex items-center justify-center transition-colors">
                      <span class="material-symbols-outlined text-xl">close</span>
                  </button>
              </div>

              <!-- Questions List -->
              <div class="flex-1 overflow-y-auto space-y-8 pr-2 custom-scrollbar pb-10">
                  @for (q of flowService.activeTest()?.questions; track q.id; let idx = $index) {
                      <div class="p-5 bg-[#18181b] rounded-2xl border border-white/5 shadow-sm">
                          <div class="flex gap-4 mb-4">
                              <span class="text-[#D0BCFF] font-bold font-mono text-lg opacity-40">0{{idx+1}}</span>
                              <div class="text-[#E3E3E3] font-medium leading-relaxed text-base">{{ q.question }}</div>
                          </div>

                          <!-- AUDIO PLAYER EMBED -->
                          @if (q.audioUrl) {
                              <div class="mb-5 h-20">
                                  <app-media-player [src]="q.audioUrl" type="audio"></app-media-player>
                              </div>
                          }

                          <div class="space-y-2">
                             @for (opt of q.options; track opt.key) {
                                 <button 
                                   (click)="answerQuestion(q.id, opt.key)"
                                   [disabled]="isQuestionAnswered(q.id)"
                                   class="w-full text-left px-4 py-3.5 rounded-xl transition-all border flex items-center gap-4 group relative overflow-hidden"
                                   [class.bg-[#1E1F20]]="!isQuestionAnswered(q.id)"
                                   [class.hover:bg-[#27272a]]="!isQuestionAnswered(q.id)"
                                   [class.border-transparent]="!isQuestionAnswered(q.id)"
                                   [class.bg-green-900/20]="isQuestionAnswered(q.id) && opt.key === q.correctKey"
                                   [class.border-green-500/30]="isQuestionAnswered(q.id) && opt.key === q.correctKey"
                                   [class.text-green-100]="isQuestionAnswered(q.id) && opt.key === q.correctKey"
                                   [class.bg-red-900/20]="isQuestionAnswered(q.id) && getUserAnswer(q.id) === opt.key && opt.key !== q.correctKey"
                                   [class.border-red-500/30]="isQuestionAnswered(q.id) && getUserAnswer(q.id) === opt.key && opt.key !== q.correctKey"
                                   [class.opacity-50]="isQuestionAnswered(q.id) && opt.key !== q.correctKey && getUserAnswer(q.id) !== opt.key"
                                 >
                                     <span class="w-6 h-6 rounded-lg border border-white/10 flex items-center justify-center text-xs font-bold"
                                        [class.bg-green-500]="isQuestionAnswered(q.id) && opt.key === q.correctKey"
                                        [class.bg-red-500]="isQuestionAnswered(q.id) && getUserAnswer(q.id) === opt.key && opt.key !== q.correctKey"
                                        [class.border-transparent]="isQuestionAnswered(q.id) && (opt.key === q.correctKey || getUserAnswer(q.id) === opt.key)"
                                     >
                                        {{ opt.key }}
                                     </span>
                                     <span class="text-sm">{{ opt.text }}</span>
                                 </button>
                             }
                          </div>

                          <!-- Explanation Box -->
                          @if (isQuestionAnswered(q.id)) {
                             <div class="mt-4 p-4 rounded-xl bg-black/30 border border-white/5 animate-in fade-in slide-in-from-top-2">
                                <div class="flex items-center gap-2 mb-1 text-[10px] uppercase tracking-wider font-bold opacity-50">
                                   <span class="material-symbols-outlined text-sm">lightbulb</span> Insight
                                </div>
                                <p class="text-sm text-[#C4C7C5] leading-relaxed">{{ q.explanation }}</p>
                             </div>
                          }
                      </div>
                  }
              </div>
          </div>
      }
      
      <!-- ==================== STANDARD MODE ==================== -->
      @else {
      
      <!-- Header -->
      <div class="flex justify-between items-center mb-6 px-1">
          <h2 class="text-base font-semibold text-[#E3E3E3] tracking-wide uppercase">
              {{ flowService.appMode() === 'study' ? 'Curriculum' : 'Workspace' }}
          </h2>
          <!-- Tab Switcher (Compact) -->
          <div class="flex bg-[#18181b] p-1 rounded-xl border border-white/5">
                @if (flowService.activeModules().routine) {
                    <button (click)="activeTab.set('routine')" class="px-4 py-1.5 text-xs font-bold rounded-lg transition-colors" [class.bg-[#27272a]]="activeTab() === 'routine'" [class.text-white]="activeTab() === 'routine'" [class.text-[#8E918F]]="activeTab() !== 'routine'">Routine</button>
                }
                <button (click)="activeTab.set('plan')" class="px-4 py-1.5 text-xs font-bold rounded-lg transition-colors" [class.bg-[#27272a]]="activeTab() === 'plan'" [class.text-white]="activeTab() === 'plan'" [class.text-[#8E918F]]="activeTab() !== 'plan'">Plan</button>
                <button (click)="activeTab.set('notes')" class="px-4 py-1.5 text-xs font-bold rounded-lg transition-colors" [class.bg-[#27272a]]="activeTab() === 'notes'" [class.text-white]="activeTab() === 'notes'" [class.text-[#8E918F]]="activeTab() !== 'notes'">Notes</button>
                @if (flowService.activeModules().files) {
                    <button (click)="activeTab.set('files')" class="px-4 py-1.5 text-xs font-bold rounded-lg transition-colors" [class.bg-[#27272a]]="activeTab() === 'files'" [class.text-white]="activeTab() === 'files'" [class.text-[#8E918F]]="activeTab() !== 'files'">Files</button>
                }
          </div>
      </div>

      <!-- Content Area -->
      <div class="flex-1 overflow-y-auto pr-1 -mr-2 custom-scrollbar pb-24 relative">
        
        <!-- ROUTINE VIEW -->
        @if (activeTab() === 'routine' && flowService.activeModules().routine) {
           @if (flowService.routineBlocks().length === 0) {
              <div class="flex flex-col items-center justify-center mt-20 opacity-20 text-[#C4C7C5]">
                <span class="material-symbols-outlined text-5xl mb-3">schedule</span>
                <p class="text-sm font-medium">No schedule</p>
              </div>
           }

           <!-- PRE-START OVERLAY -->
           @if (minutesUntilStart() > 0) {
              <div class="absolute inset-0 z-30 flex flex-col items-center justify-center backdrop-blur-md bg-black/40 rounded-xl text-center p-6 animate-in fade-in duration-500">
                  <span class="material-symbols-outlined text-4xl mb-4 text-[#D0BCFF] animate-bounce">hourglass_top</span>
                  <h3 class="text-xl font-bold text-white mb-2">Upcoming Session</h3>
                  <p class="text-sm text-[#C4C7C5] max-w-[200px] mb-6">Your routine hasn't started yet. Take a breath.</p>
                  <div class="bg-[#18181b] border border-[#444746] rounded-xl px-4 py-2 flex items-center gap-2">
                     <span class="text-xs uppercase font-bold text-[#8E918F] tracking-wider">Starts in</span>
                     <span class="text-lg font-mono font-bold text-[#E3E3E3]">{{ minutesUntilStart() }}m</span>
                  </div>
              </div>
           }

           <div class="relative pl-0 space-y-4" [class.opacity-30]="minutesUntilStart() > 0" [class.pointer-events-none]="minutesUntilStart() > 0"> 
             <!-- Timeline line -->
             <div class="absolute left-[54px] top-4 bottom-4 w-px bg-[#27272a] -z-0"></div>
             
             @for (block of flowService.routineBlocks(); track block.id) {
               <div class="relative flex gap-5 z-10 group items-start">
                 
                 <!-- Time Column (Outside Card) -->
                 <div class="w-[50px] text-right pt-2.5 flex flex-col items-end flex-shrink-0">
                   <span class="text-xs font-mono text-[#8E918F] leading-tight" [class.line-through]="block.status === 'completed' || block.status === 'skipped'" [class.opacity-50]="block.status === 'skipped'">
                      {{ block.startTime }}
                   </span>
                 </div>

                 <!-- Timeline Dot -->
                 <div class="relative mt-3 w-2.5 h-2.5 rounded-full border border-[#27272a] flex-shrink-0 transition-all duration-500 bg-[#18181b]" 
                    [class.bg-[#D0BCFF]]="block.status === 'active'" 
                    [class.border-[#D0BCFF]]="block.status === 'active'" 
                    [class.scale-125]="block.status === 'active'"
                    [class.opacity-50]="block.status === 'completed'"
                 >
                   @if (block.status === 'active') { <div class="absolute -inset-1 bg-[#D0BCFF] rounded-full animate-ping opacity-30"></div> }
                 </div>

                 <!-- Card -->
                 <div class="flex-1 p-5 rounded-2xl transition-all duration-500 border relative overflow-hidden group/card shadow-sm" 
                    [class.bg-[#18181b]]="block.status !== 'active'" 
                    [class.border-[#27272a]]="block.status !== 'active'" 
                    [class.opacity-60]="block.status === 'completed'" 
                    [class.opacity-40]="block.status === 'skipped'" 
                    
                    [class.bg-[#1d1b24]]="block.status === 'active'" 
                    [class.border-[#D0BCFF]/30]="block.status === 'active'"
                    [class.shadow-md]="block.status === 'active'"
                 >
                   
                   <!-- REMAINING TIME OVERLAY FOR ACTIVE BLOCK -->
                   @if (block.status === 'active' && block.remainingLabel) {
                       <div class="absolute top-4 right-4 text-xs font-bold tracking-wider animate-in fade-in text-[#D0BCFF]">
                          {{ block.remainingLabel }}
                       </div>
                   }

                   <div class="flex justify-between items-start mb-1">
                       <h4 class="text-sm font-bold leading-snug" [class.text-[#F2F2F2]]="block.status === 'active'" [class.text-[#E3E3E3]]="block.status !== 'active'">{{ block.title }}</h4>
                   </div>
                   
                   @if(block.description){<p class="text-xs leading-relaxed opacity-70 mb-3 text-[#C4C7C5] max-w-[90%]">{{ block.description }}</p>}
                   
                   <div class="flex items-center gap-2">
                       <span class="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md bg-white/5 text-[#8E918F]">{{ block.type }}</span>
                       <span class="text-[10px] text-[#5E5E5E]">{{ block.duration }}</span>
                   </div>
                 </div>
               </div>
             }
           </div>
        }

        <!-- PLAN VIEW -->
        @if (activeTab() === 'plan') {
          <div class="mb-8 px-1">
            <div class="flex items-center justify-between mb-2">
              <span class="text-[10px] font-bold text-[#5E5E5E] uppercase tracking-wider">Progress</span>
              <span class="text-xs font-bold text-[#C4C7C5] font-mono">{{ flowService.completionPercentage() }}%</span>
            </div>
            <div class="h-1.5 w-full bg-[#18181b] rounded-full overflow-hidden">
              <div class="h-full bg-[#D0BCFF] transition-all duration-700 ease-out rounded-full" [style.width.%]="flowService.completionPercentage()"></div>
            </div>
          </div>

          <div class="space-y-4">
            @if (flowService.planSteps().length === 0) {
              <div class="flex flex-col items-center justify-center mt-20 opacity-20 text-[#C4C7C5]">
                <span class="material-symbols-outlined text-5xl mb-3">map</span>
                <p class="text-sm font-medium">Empty plan</p>
              </div>
            }

            @for (step of flowService.planSteps(); track step.id) {
              <div class="relative pl-8 group">
                 <!-- Connecting Line -->
                 <div class="absolute left-[11px] top-6 bottom-[-16px] w-px bg-[#27272a] group-last:hidden"></div>
                 
                 <div class="flex items-start gap-4">
                   <div class="relative z-10 flex-shrink-0 w-6 h-6 rounded-full border flex items-center justify-center transition-all mt-0.5 bg-[#121212]" 
                        [class.border-[#D0BCFF]]="step.status === 'active'" 
                        [class.border-[#5E5E5E]]="step.status === 'pending'"
                        [class.border-[#D0BCFF]/50]="step.status === 'finished'"
                        [class.text-[#D0BCFF]]="step.status === 'finished'"
                   >
                      @if (step.status === 'finished') { <span class="material-symbols-outlined text-sm font-bold">check</span> } 
                      @else if (step.status === 'active') { <div class="w-2 h-2 bg-[#D0BCFF] rounded-full animate-pulse"></div> }
                   </div>
                   
                   <div class="flex-1 p-5 rounded-2xl transition-all duration-300 border border-transparent group/card hover:bg-[#18181b] hover:border-[#27272a]">
                      <div class="flex justify-between items-start">
                        <h4 class="text-sm font-medium mb-1 transition-colors" [class.text-[#F2F2F2]]="step.status === 'active'" [class.text-[#8E918F]]="step.status === 'pending'" [class.line-through]="step.status === 'finished'" [class.opacity-50]="step.status === 'finished'">{{ step.title }}</h4>
                        
                        <!-- Actions on Hover -->
                        <div class="flex items-center opacity-0 group-hover/card:opacity-100 transition-opacity ml-2 bg-[#121212] rounded-lg p-0.5 border border-white/5">
                          <button (click)="moveStep(step, 'up')" class="text-[#5E5E5E] hover:text-[#C4C7C5] p-1"><span class="material-symbols-outlined text-[16px]">arrow_upward</span></button>
                          <button (click)="moveStep(step, 'down')" class="text-[#5E5E5E] hover:text-[#C4C7C5] p-1"><span class="material-symbols-outlined text-[16px]">arrow_downward</span></button>
                          <button (click)="editPlanStep(step)" class="text-[#5E5E5E] hover:text-[#D0BCFF] p-1 ml-1"><span class="material-symbols-outlined text-[16px]">edit</span></button>
                          <button (click)="deletePlanStep(step.id)" class="text-[#5E5E5E] hover:text-red-400 p-1 ml-1"><span class="material-symbols-outlined text-[16px]">delete</span></button>
                        </div>
                      </div>
                      @if(step.description) { <p class="text-xs text-[#8E918F] leading-relaxed line-clamp-3">{{ step.description }}</p> }
                   </div>
                 </div>
              </div>
            }

            <button (click)="startNewPlanStep()" class="w-full py-4 mt-6 border border-dashed border-[#27272a] rounded-2xl text-xs text-[#5E5E5E] hover:text-[#C4C7C5] hover:border-[#444746] hover:bg-[#18181b] transition-all flex items-center justify-center gap-2">
              <span class="material-symbols-outlined text-base">add</span><span>Add Step</span>
            </button>
          </div>
        }

        <!-- NOTES VIEW -->
        @if (activeTab() === 'notes') {
          <div class="flex justify-between items-center mb-5 px-1">
            <span class="text-[10px] font-bold text-[#5E5E5E] uppercase tracking-wider">Entries</span>
            <button (click)="startNewNote()" class="w-8 h-8 rounded-lg bg-[#27272a] hover:bg-[#D0BCFF] hover:text-[#381E72] text-[#C4C7C5] flex items-center justify-center transition-colors" title="Create Note"><span class="material-symbols-outlined text-lg">add</span></button>
          </div>
          <div class="grid grid-cols-1 gap-3">
            @if (flowService.notes().length === 0) {
              <div class="text-center mt-20 opacity-20 text-[#C4C7C5]"><span class="material-symbols-outlined text-5xl mb-3">description</span><p class="text-sm">No notes</p></div>
            }
            @for (note of flowService.notes(); track note.id) {
              <div class="bg-[#18181b] rounded-2xl p-5 hover:border-[#444746] transition-all group relative border border-white/5 cursor-pointer shadow-sm" (click)="editNote(note)">
                <div class="absolute top-4 right-4 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity bg-[#18181b] pl-2 z-10">
                  <button (click)="$event.stopPropagation(); deleteNote(note.id)" class="text-[#5E5E5E] hover:text-red-400 p-1.5 rounded hover:bg-white/5 transition-colors"><span class="material-symbols-outlined text-sm">delete</span></button>
                </div>
                <h3 class="text-[#E3E3E3] text-sm font-bold mb-2 truncate pr-8">{{ note.title }}</h3>
                <div class="prose prose-invert prose-sm text-[#8E918F] text-xs leading-relaxed line-clamp-4" [innerHTML]="render(note.content)"></div>
              </div>
            }
          </div>
        }
        
        <!-- FILES VIEW -->
        @if (activeTab() === 'files' && flowService.activeModules().files) {
             <div class="min-h-[100px] border border-dashed border-[#27272a] rounded-2xl p-6 flex flex-col items-center justify-center text-[#5E5E5E] transition-all hover:border-[#D0BCFF] hover:bg-[#18181b] mb-6 group cursor-pointer" (dragover)="onDragOver($event)" (drop)="onDrop($event)">
                @if (flowService.files().length === 0) { <span class="material-symbols-outlined text-3xl mb-2 group-hover:text-[#D0BCFF] transition-colors">cloud_upload</span><p class="text-xs text-center">Drag files here</p> } @else { <div class="flex flex-col items-center"><span class="material-symbols-outlined text-2xl mb-2 text-[#D0BCFF]">add_circle</span><p class="text-xs">Add another file</p></div> }
            </div>
             <div class="space-y-3">
                 @for (file of flowService.files(); track file.id) {
                     <div class="flex items-center gap-4 p-3 rounded-xl hover:bg-[#18181b] border border-transparent hover:border-white/5 group transition-colors">
                         <div class="w-10 h-10 rounded-lg bg-[#27272a] flex items-center justify-center">
                             <span class="material-symbols-outlined text-[#8E918F] text-xl">{{ getIcon(file) }}</span>
                         </div>
                         <span class="text-sm text-[#C4C7C5] truncate flex-1 font-medium">{{ file.name }}</span>
                         <button (click)="deleteFile(file.id)" class="opacity-0 group-hover:opacity-100 text-[#5E5E5E] hover:text-red-400 p-2"><span class="material-symbols-outlined text-lg">close</span></button>
                     </div>
                 }
             </div>
        }
      </div>
      } 

      <!-- (Editor and Preview Logic kept identical but visually refined) -->
      @if (showEditor()) {
        <div class="absolute inset-0 z-50 bg-[#121212] flex flex-col p-8 animate-in fade-in zoom-in-95 duration-200">
           <div class="flex items-center justify-between mb-8">
             <h3 class="text-[#F2F2F2] text-sm font-bold uppercase tracking-wide">{{ editorMode() === 'note' ? (editId() ? 'Edit Note' : 'New Note') : (editId() ? 'Edit Step' : 'New Step') }}</h3>
             <button (click)="showEditor.set(false)" class="w-9 h-9 rounded-full hover:bg-[#2B2930] flex items-center justify-center text-[#8E918F] hover:text-white transition-colors"><span class="material-symbols-outlined text-xl">close</span></button>
           </div>
           <div class="flex-1 flex flex-col space-y-6">
             <input [(ngModel)]="editTitle" [placeholder]="editorMode() === 'note' ? 'Title...' : 'Step...'" class="w-full bg-transparent border-b border-[#2B2930] px-0 py-3 text-[#E3E3E3] placeholder-[#444746] focus:outline-none focus:border-[#D0BCFF] text-xl font-bold transition-colors">
             <textarea [(ngModel)]="editContent" [placeholder]="editorMode() === 'note' ? 'Start writing...' : 'Add details...'" class="flex-1 w-full bg-transparent border-none px-0 py-2 text-[#C4C7C5] placeholder-[#444746] focus:outline-none resize-none text-base leading-7"></textarea>
           </div>
           <div class="flex justify-end pt-6">
              <button (click)="save()" [disabled]="!editTitle() || (editorMode() === 'note' && !editContent())" class="bg-[#D0BCFF] hover:bg-[#EADDFF] disabled:opacity-50 disabled:cursor-not-allowed text-[#381E72] px-8 py-3 rounded-full text-sm font-bold transition-all shadow-lg active:scale-95">Save</button>
           </div>
        </div>
      }
    </div>
  `
})
export class PlanPanelComponent {
  flowService = inject(FlowStateService);
  sanitizer = inject(DomSanitizer);
  agentInput = '';
  @ViewChild('agentScroll') private agentScroll!: ElementRef;
  activeTab = signal<'plan' | 'notes' | 'routine' | 'files'>('routine');
  showEditor = signal(false);
  editorMode = signal<'note' | 'plan'>('note');
  editId = signal<string | null>(null);
  editTitle = signal('');
  editContent = signal('');
  insertAfterId = signal<string | null>(null);
  previewFile = signal<UserFile | null>(null);
  previewTextContent = signal<SafeHtml>('');
  previewLoading = signal(false);
  imageFiles = computed(() => this.flowService.files().filter(f => this.detectType(f) === 'image'));
  otherFiles = computed(() => this.flowService.files().filter(f => this.detectType(f) !== 'image'));

  // Calculate minutes until first block starts
  minutesUntilStart = computed(() => {
     const blocks = this.flowService.routineBlocks();
     if(blocks.length === 0) return 0;
     
     // Find earliest start time
     let earliestMins = 24 * 60; 
     blocks.forEach(b => {
         const [h, m] = b.startTime.split(':').map(Number);
         const total = h * 60 + m;
         if (total < earliestMins) earliestMins = total;
     });

     const now = new Date();
     const currentMins = now.getHours() * 60 + now.getMinutes();

     if (currentMins < earliestMins) {
         return earliestMins - currentMins;
     }
     return 0;
  });

  constructor() {
      effect(() => {
          const modules = this.flowService.activeModules();
          const current = this.activeTab();
          if (current === 'routine' && !modules.routine) this.activeTab.set('plan');
          if (current === 'files' && !modules.files) this.activeTab.set('plan');
      }, { allowSignalWrites: true });
      effect(() => { this.flowService.activeAgent(); setTimeout(() => { if (this.agentScroll) { try { this.agentScroll.nativeElement.scrollTop = this.agentScroll.nativeElement.scrollHeight; } catch(e){} } }, 100); });
  }

  // TEST HELPERS
  isQuestionAnswered(qId: string) {
      const test = this.flowService.activeTest();
      return test?.userAnswers.some(a => a.questionId === qId) ?? false;
  }
  getUserAnswer(qId: string) {
      const test = this.flowService.activeTest();
      return test?.userAnswers.find(a => a.questionId === qId)?.answerKey;
  }
  answerQuestion(qId: string, key: string) {
      const test = this.flowService.activeTest();
      if(test) this.flowService.handleQuizAnswer(test.id, qId, key);
  }

  sendAgentMessage(event?: KeyboardEvent) { if (event && event.shiftKey) return; if (event) event.preventDefault(); if (!this.agentInput.trim()) return; this.flowService.sendAgentMessage(this.agentInput); this.agentInput = ''; }
  render(text: string) { return marked.parse(text); }
  detectType(file: UserFile): 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'unknown' { const type = file.type.toLowerCase(); const name = file.name.toLowerCase(); if (type.startsWith('image/') || name.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/)) return 'image'; if (type.startsWith('video/') || name.match(/\.(mp4|webm|ogg|mov)$/)) return 'video'; if (type.startsWith('audio/') || name.match(/\.(mp3|wav|m4a|aac)$/)) return 'audio'; if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'; if (type.startsWith('text/') || name.match(/\.(txt|md|json|js|ts|py|html|css|csv|xml)$/)) return 'text'; return 'unknown'; }
  isImage(f: UserFile) { return this.detectType(f) === 'image'; } isVideo(f: UserFile) { return this.detectType(f) === 'video'; } isAudio(f: UserFile) { return this.detectType(f) === 'audio'; } isPdf(f: UserFile) { return this.detectType(f) === 'pdf'; } isText(f: UserFile) { return this.detectType(f) === 'text'; }
  getFileTypeLabel(f: UserFile): string { const t = this.detectType(f); if (t !== 'unknown') return t.toUpperCase(); return f.name.split('.').pop()?.toUpperCase() || 'FILE'; }
  getIcon(file: UserFile): string { const t = this.detectType(file); if (t === 'image') return 'image'; if (t === 'video') return 'movie'; if (t === 'audio') return 'headphones'; if (t === 'pdf') return 'picture_as_pdf'; if (t === 'text') return 'description'; return 'draft'; }
  getSafeUrl(file: UserFile): SafeResourceUrl { return this.sanitizer.bypassSecurityTrustResourceUrl(file.url); }
  async openPreview(file: UserFile) { this.previewFile.set(file); if (this.isText(file)) { this.previewLoading.set(true); try { const resp = await fetch(file.url); const text = await resp.text(); if (file.name.endsWith('.md')) { this.previewTextContent.set(marked.parse(text)); } else { this.previewTextContent.set(this.sanitizer.bypassSecurityTrustHtml(`<pre><code>${text}</code></pre>`)); } } catch(e) { this.previewTextContent.set('Failed to load text content.'); } finally { this.previewLoading.set(false); } } }
  closePreview() { this.previewFile.set(null); this.previewTextContent.set(''); }
  onDragOver(e: DragEvent) { if (!this.flowService.activeModules().files) return; e.preventDefault(); e.stopPropagation(); }
  onDrop(e: DragEvent) { if (!this.flowService.activeModules().files) return; e.preventDefault(); e.stopPropagation(); if (e.dataTransfer && e.dataTransfer.files.length > 0) { const file = e.dataTransfer.files[0]; const reader = new FileReader(); reader.onload = (ev) => { const url = ev.target?.result as string; this.flowService.addFile({ name: file.name, url: url, type: file.type || 'unknown' }); }; reader.readAsDataURL(file); } }
  deleteFile(id: string) { if(confirm('Delete file?')) { this.flowService.deleteFile(id); } }
  deleteNote(id: string) { if(confirm('Delete this note?')) { this.flowService.deleteNote(id); } }
  startNewNote() { this.setupEditor('note', null, '', ''); }
  editNote(note: Note) { this.setupEditor('note', note.id, note.title, note.content); }
  deletePlanStep(id: string) { if(confirm('Delete this step?')) { this.flowService.deletePlanStep(id); } }
  startNewPlanStep() { this.setupEditor('plan', null, '', ''); }
  insertStepAfter(id: string) { this.insertAfterId.set(id); this.setupEditor('plan', null, '', ''); }
  editPlanStep(step: PlanStep) { this.setupEditor('plan', step.id, step.title, step.description); }
  moveStep(step: PlanStep, direction: 'up' | 'down') { this.flowService.movePlanStep(step.id, direction); }
  private setupEditor(mode: 'note' | 'plan', id: string | null, title: string, content: string) { this.editorMode.set(mode); this.editId.set(id); this.editTitle.set(title); this.editContent.set(content); if (id !== null) this.insertAfterId.set(null); this.showEditor.set(true); }
  save() { if (!this.editTitle().trim()) return; if (this.editorMode() === 'note') { if (this.editId()) { this.flowService.updateNote(this.editId() as string, this.editTitle(), this.editContent()); } else { this.flowService.addNote(this.editTitle(), this.editContent()); } } else { if (this.editId()) { this.flowService.updatePlanStep(this.editId() as string, this.editTitle(), this.editContent()); } else if (this.insertAfterId() !== null) { this.flowService.insertPlanStep(this.insertAfterId()!, this.editTitle()); this.insertAfterId.set(null); } else { this.flowService.addPlanStep(this.editTitle(), this.editContent()); } } this.showEditor.set(false); }
}