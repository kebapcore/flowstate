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
      [class.bg-[#1E1F20]]="!flowService.wallpaper() && flowService.theme() === 'material'"
      [class.bg-black]="!flowService.wallpaper() && flowService.theme() === 'cold'"
      [class.bg-opacity-80]="!!flowService.wallpaper() && flowService.theme() === 'material'"
      [class.bg-opacity-60]="!!flowService.wallpaper() && flowService.theme() === 'cold'"
      [class.backdrop-blur-xl]="!!flowService.wallpaper()"
      [class.border]="flowService.theme() === 'cold'"
      [class.border-white-10]="flowService.theme() === 'cold'"
      [class.md:rounded-[32px]]="flowService.theme() === 'material'"
      [class.md:rounded-2xl]="flowService.theme() === 'cold'"
    >
      
      <!-- ==================== AGENT MODE ==================== -->
      @if (flowService.activeAgent()) {
          <!-- (Agent Chat UI) -->
          <div class="flex-1 flex flex-col h-full animate-in fade-in slide-in-from-right-4">
              <div class="flex items-center justify-between mb-4 border-b border-[#444746] pb-4">
                  <div class="flex items-center gap-3">
                      <div class="w-10 h-10 rounded-full bg-[#D0BCFF] text-[#381E72] flex items-center justify-center shadow-lg">
                          <span class="material-symbols-outlined">smart_toy</span>
                      </div>
                      <div>
                          <h2 class="text-[#F2F2F2] font-bold text-lg leading-tight">{{ flowService.activeAgent()?.name }}</h2>
                          <div class="text-[#C4C7C5] text-[10px] uppercase tracking-wider">AI Agent Session</div>
                      </div>
                  </div>
                  <button (click)="flowService.closeAgent()" class="w-8 h-8 rounded-full bg-[#2B2930] hover:bg-[#FFB4AB] hover:text-[#690005] text-[#C4C7C5] flex items-center justify-center transition-colors">
                      <span class="material-symbols-outlined text-lg">close</span>
                  </button>
              </div>
              <div class="flex-1 overflow-y-auto space-y-4 pr-1 custom-scrollbar mb-4" #agentScroll>
                  @for (msg of flowService.activeAgent()?.messages; track $index) {
                      <div [class]="'flex ' + (msg.role === 'user' ? 'justify-end' : 'justify-start')">
                          <div [class]="'max-w-[90%] px-4 py-3 text-xs leading-relaxed rounded-2xl shadow-sm ' + (msg.role === 'user' ? 'bg-[#4F378B] text-[#EADDFF] rounded-br-sm' : 'bg-[#2B2930] text-[#E3E3E3] rounded-bl-sm')">
                               <div class="prose prose-invert prose-p:text-inherit" [innerHTML]="msg.displayHtml"></div>
                          </div>
                      </div>
                  }
                  @if (flowService.activeAgent()?.isLoading) {
                      <div class="flex justify-start">
                          <div class="bg-[#2B2930] px-4 py-3 rounded-2xl rounded-bl-sm flex gap-1"><span class="w-1.5 h-1.5 bg-[#8E918F] rounded-full animate-bounce"></span><span class="w-1.5 h-1.5 bg-[#8E918F] rounded-full animate-bounce delay-75"></span><span class="w-1.5 h-1.5 bg-[#8E918F] rounded-full animate-bounce delay-150"></span></div>
                      </div>
                  }
              </div>
              <div class="relative">
                  <textarea [(ngModel)]="agentInput" (keydown.enter)="sendAgentMessage($event)" placeholder="Message..." class="w-full bg-[#131314] border border-[#444746] rounded-2xl pl-4 pr-12 py-3 text-sm text-[#E3E3E3] focus:outline-none focus:border-[#D0BCFF] resize-none shadow-inner" rows="1"></textarea>
                  <button (click)="sendAgentMessage()" [disabled]="!agentInput.trim() || flowService.activeAgent()?.isLoading" class="absolute right-2 top-2 w-8 h-8 rounded-full bg-[#D0BCFF] text-[#381E72] flex items-center justify-center hover:scale-105 transition-transform disabled:opacity-50 disabled:scale-100"><span class="material-symbols-outlined text-sm">arrow_upward</span></button>
              </div>
          </div>
      } 
      <!-- ==================== TEST RUNNER MODE ==================== -->
      @else if (flowService.activeTest()) {
          <div class="flex-1 flex flex-col h-full animate-in fade-in slide-in-from-right-4">
              <!-- Header -->
              <div class="flex items-center justify-between mb-6 border-b border-[#444746] pb-4">
                  <div class="flex items-center gap-3">
                      <div class="w-10 h-10 rounded-full bg-[#D0BCFF] text-[#381E72] flex items-center justify-center shadow-lg">
                          <span class="material-symbols-outlined">quiz</span>
                      </div>
                      <div>
                          <h2 class="text-[#F2F2F2] font-bold text-lg leading-tight truncate max-w-[200px]">{{ flowService.activeTest()?.topic }}</h2>
                          <div class="text-[#C4C7C5] text-[10px] uppercase tracking-wider">Interactive Assessment</div>
                      </div>
                  </div>
                  <button (click)="flowService.closeTest()" class="w-8 h-8 rounded-full bg-[#2B2930] hover:bg-[#FFB4AB] hover:text-[#690005] text-[#C4C7C5] flex items-center justify-center transition-colors">
                      <span class="material-symbols-outlined text-lg">close</span>
                  </button>
              </div>

              <!-- Questions List -->
              <div class="flex-1 overflow-y-auto space-y-8 pr-1 custom-scrollbar pb-10">
                  @for (q of flowService.activeTest()?.questions; track q.id; let idx = $index) {
                      <div class="p-4 bg-[#2B2930] rounded-2xl border border-[#444746]">
                          <div class="flex gap-3 mb-4">
                              <span class="text-[#D0BCFF] font-bold font-mono text-lg opacity-50">0{{idx+1}}</span>
                              <div class="text-[#E3E3E3] font-medium leading-relaxed">{{ q.question }}</div>
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
                                   class="w-full text-left px-4 py-3 rounded-xl transition-all border flex items-center gap-3 group relative overflow-hidden"
                                   [class.bg-[#1E1F20]]="!isQuestionAnswered(q.id)"
                                   [class.hover:bg-[#444746]]="!isQuestionAnswered(q.id)"
                                   [class.border-transparent]="!isQuestionAnswered(q.id)"
                                   [class.bg-green-900/30]="isQuestionAnswered(q.id) && opt.key === q.correctKey"
                                   [class.border-green-500/50]="isQuestionAnswered(q.id) && opt.key === q.correctKey"
                                   [class.text-green-100]="isQuestionAnswered(q.id) && opt.key === q.correctKey"
                                   [class.bg-red-900/30]="isQuestionAnswered(q.id) && getUserAnswer(q.id) === opt.key && opt.key !== q.correctKey"
                                   [class.border-red-500/50]="isQuestionAnswered(q.id) && getUserAnswer(q.id) === opt.key && opt.key !== q.correctKey"
                                   [class.opacity-50]="isQuestionAnswered(q.id) && opt.key !== q.correctKey && getUserAnswer(q.id) !== opt.key"
                                 >
                                     <span class="w-6 h-6 rounded-full border border-white/20 flex items-center justify-center text-xs font-bold"
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
                             <div class="mt-4 p-3 rounded-xl bg-[#1E1F20] border border-white/5 animate-in fade-in slide-in-from-top-2">
                                <div class="flex items-center gap-2 mb-1 text-[10px] uppercase tracking-wider font-bold opacity-60">
                                   <span class="material-symbols-outlined text-sm">lightbulb</span> Explanation
                                </div>
                                <p class="text-xs text-[#C4C7C5] leading-relaxed">{{ q.explanation }}</p>
                             </div>
                          }
                      </div>
                  }

                  @if (flowService.activeTest()?.completed) {
                     <div class="text-center py-6 animate-in zoom-in duration-500">
                        <div class="w-16 h-16 rounded-full bg-[#D0BCFF] text-[#381E72] flex items-center justify-center mx-auto mb-4 shadow-[0_0_30px_rgba(208,188,255,0.4)]">
                            <span class="material-symbols-outlined text-[32px]">emoji_events</span>
                        </div>
                        <h3 class="text-xl font-bold text-[#F2F2F2] mb-1">Quiz Completed!</h3>
                        <p class="text-sm text-[#C4C7C5]">Your results have been sent to the AI for analysis.</p>
                        <button (click)="flowService.closeTest()" class="mt-4 px-6 py-2 rounded-full bg-[#444746] hover:bg-[#5E5E5E] text-white text-sm font-medium transition-colors">Close Quiz</button>
                     </div>
                  }
              </div>
          </div>
      }
      
      <!-- ==================== STANDARD MODE ==================== -->
      @else {
      
      <!-- Title -->
      <h2 class="text-xl font-medium text-[#F2F2F2] mb-6 px-1">
          {{ flowService.appMode() === 'study' ? 'Curriculum' : 'Game Plan' }}
      </h2>

      <!-- Segmented Tab Switcher -->
      <div class="flex bg-[#2B2930] p-1 rounded-full mb-6 relative">
        <!-- ROUTINE (For Study Mode it's critical) -->
        @if (flowService.activeModules().routine) {
            <button 
            (click)="activeTab.set('routine')"
            class="flex-1 py-2.5 text-xs font-medium rounded-full transition-all duration-200 z-10"
            [class.bg-[#444746]]="activeTab() === 'routine'"
            [class.text-[#F2F2F2]]="activeTab() === 'routine'"
            [class.text-[#C4C7C5]]="activeTab() !== 'routine'"
            [class.shadow-md]="activeTab() === 'routine'"
            >
            Routine
            </button>
        }
        
        <button 
          (click)="activeTab.set('plan')"
          class="flex-1 py-2.5 text-xs font-medium rounded-full transition-all duration-200 z-10"
          [class.bg-[#444746]]="activeTab() === 'plan'"
          [class.text-[#F2F2F2]]="activeTab() === 'plan'"
          [class.text-[#C4C7C5]]="activeTab() !== 'plan'"
          [class.shadow-md]="activeTab() === 'plan'"
        >
          {{ flowService.appMode() === 'study' ? 'Lessons' : 'Tasks' }}
        </button>
        <button 
          (click)="activeTab.set('notes')"
          class="flex-1 py-2.5 text-xs font-medium rounded-full transition-all duration-200 z-10"
          [class.bg-[#444746]]="activeTab() === 'notes'"
          [class.text-[#F2F2F2]]="activeTab() === 'notes'"
          [class.text-[#C4C7C5]]="activeTab() !== 'notes'"
          [class.shadow-md]="activeTab() === 'notes'"
        >
          Notes
        </button>

        <!-- FILES -->
        @if (flowService.activeModules().files) {
            <button (click)="activeTab.set('files')" class="flex-1 py-2.5 text-xs font-medium rounded-full transition-all duration-200 z-10" [class.bg-[#444746]]="activeTab() === 'files'" [class.text-[#F2F2F2]]="activeTab() === 'files'" [class.text-[#C4C7C5]]="activeTab() !== 'files'">Files</button>
        }
      </div>

      <!-- Content Area -->
      <div class="flex-1 overflow-y-auto pr-1 -mr-2 custom-scrollbar pb-20">
        
        <!-- ROUTINE VIEW -->
        @if (activeTab() === 'routine' && flowService.activeModules().routine) {
           @if (flowService.routineBlocks().length === 0) {
              <div class="flex flex-col items-center justify-center mt-20 opacity-30 text-[#C4C7C5]">
                <span class="material-symbols-outlined text-5xl mb-3">schedule</span>
                <p class="text-sm font-medium">Ask Flowstate to "Plan a session"</p>
              </div>
           }
           <div class="relative pl-2 space-y-4"> 
             <div class="absolute left-[54px] top-4 bottom-4 w-[2px] bg-[#2B2930] -z-0"></div>
             @for (block of flowService.routineBlocks(); track block.id) {
               <div class="relative flex gap-4 z-10 group">
                 <div class="w-10 text-right pt-2 flex flex-col items-end flex-shrink-0">
                   <!-- Use block.time explicitly as requested -->
                   <span class="text-[10px] font-medium text-[#C4C7C5] leading-tight" [class.line-through]="block.status === 'completed' || block.status === 'skipped'" [class.opacity-50]="block.status === 'skipped'">
                      {{ block.startTime }}
                   </span>
                   <span class="text-[9px] text-[#8E918F] font-medium">{{ block.duration }}</span>
                 </div>
                 <div class="relative mt-2.5 w-3 h-3 rounded-full border-2 border-[#1E1F20] shadow-sm flex-shrink-0 transition-colors duration-500" [class.bg-[#D0BCFF]]="block.status === 'active'" [class.scale-125]="block.status === 'active'" [class.bg-[#444746]]="block.status === 'upcoming'" [class.bg-[#2B2930]]="block.status === 'completed'" [class.bg-red-900]="block.status === 'skipped'">
                   @if (block.status === 'active') { <div class="absolute -inset-1 bg-[#D0BCFF] rounded-full animate-ping opacity-30"></div> }
                 </div>
                 <div class="flex-1 p-5 rounded-[20px] transition-all duration-500 border relative overflow-hidden" 
                    [class.bg-[#2B2930]]="block.status !== 'active'" 
                    [class.border-[#444746]/50]="block.status !== 'active'" 
                    [class.opacity-60]="block.status === 'completed'" 
                    [class.opacity-40]="block.status === 'skipped'" 
                    [class.bg-[#4F378B]]="block.status === 'active'" 
                    [class.text-[#EADDFF]]="block.status === 'active'" 
                    [class.shadow-xl]="block.status === 'active'" 
                    [class.border-[#D0BCFF]/30]="block.status === 'active'">
                   
                   <!-- REMAINING TIME OVERLAY FOR ACTIVE BLOCK -->
                   @if (block.status === 'active' && block.remainingLabel) {
                       <div class="absolute top-0 right-0 px-3 py-1 bg-black/20 rounded-bl-xl text-[10px] font-bold tracking-wider animate-in fade-in">
                          {{ block.remainingLabel }}
                       </div>
                   }

                   <div class="flex justify-between items-start mb-1"><h4 class="text-sm font-medium leading-snug">{{ block.title }}</h4>@if(block.type==='break'){<span class="material-symbols-outlined text-[16px] opacity-70">coffee</span>}</div>
                   @if(block.description){<p class="text-[11px] leading-relaxed opacity-80 mb-2">{{ block.description }}</p>}
                   <div class="text-[10px] uppercase tracking-wider opacity-70 font-semibold flex justify-between"><span>{{ block.type }}</span>@if(block.status==='skipped'){<span>SKIPPED</span>}</div>
                 </div>
               </div>
             }
           </div>
        }

        <!-- PLAN VIEW -->
        @if (activeTab() === 'plan') {
          <div class="mb-8 px-1">
            <div class="flex items-center justify-between mb-2">
              <span class="text-[10px] font-bold text-[#C4C7C5] uppercase tracking-wider">{{ flowService.appMode() === 'study' ? 'Course Progress' : 'Completion' }}</span>
              <span class="text-xs font-bold text-[#D0BCFF]">{{ flowService.completionPercentage() }}%</span>
            </div>
            <div class="h-2 w-full bg-[#2B2930] rounded-full overflow-hidden">
              <div class="h-full bg-[#D0BCFF] shadow-[0_0_10px_rgba(208,188,255,0.4)] transition-all duration-700 ease-out rounded-full" [style.width.%]="flowService.completionPercentage()"></div>
            </div>
          </div>

          <div class="space-y-3">
            @if (flowService.planSteps().length === 0) {
              <div class="flex flex-col items-center justify-center mt-20 opacity-30 text-[#C4C7C5]">
                <span class="material-symbols-outlined text-5xl mb-3">map</span>
                <p class="text-sm font-medium">Ready to map out {{ flowService.appMode() === 'study' ? 'curriculum' : 'ideas' }}.</p>
              </div>
            }

            @for (step of flowService.planSteps(); track step.id) {
              <div class="relative pl-6 group">
                 <div class="absolute left-[11px] top-6 bottom-[-24px] w-0.5 bg-[#444746] group-last:hidden"></div>
                 
                 <div class="flex items-start gap-4">
                   <div class="relative z-10 flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all mt-0.5" [class.border-[#D0BCFF]]="step.status === 'active' || step.status === 'finished'" [class.bg-[#D0BCFF]]="step.status === 'finished'" [class.border-[#444746]]="step.status === 'pending'" [class.bg-[#1E1F20]]="step.status !== 'finished'">
                      @if (step.status === 'finished') { <span class="material-symbols-outlined text-[#381E72] text-[14px] font-bold">check</span> } @else if (step.status === 'active') { <div class="w-2 h-2 bg-[#D0BCFF] rounded-full animate-pulse"></div> }
                   </div>
                   <div class="flex-1 p-4 rounded-[20px] transition-all duration-300 border border-transparent group/card hover:bg-[#2B2930]" [class.bg-[#2B2930]]="step.status === 'active'" [class.shadow-md]="step.status === 'active'">
                      <div class="flex justify-between items-start">
                        <h4 class="text-sm font-medium mb-1 transition-colors" [class.text-[#F2F2F2]]="step.status === 'active'" [class.text-[#E3E3E3]]="step.status === 'finished'" [class.text-[#8E918F]]="step.status === 'pending'" [class.line-through]="step.status === 'finished'">{{ step.title }}</h4>
                        <div class="flex items-center opacity-0 group-hover/card:opacity-100 transition-opacity">
                          <button (click)="moveStep(step, 'up')" class="text-[#8E918F] hover:text-[#E3E3E3] p-1"><span class="material-symbols-outlined text-[16px]">arrow_upward</span></button>
                          <button (click)="moveStep(step, 'down')" class="text-[#8E918F] hover:text-[#E3E3E3] p-1"><span class="material-symbols-outlined text-[16px]">arrow_downward</span></button>
                          <div class="w-px h-3 bg-[#444746] mx-1"></div>
                          <button (click)="editPlanStep(step)" class="text-[#8E918F] hover:text-[#D0BCFF] p-1"><span class="material-symbols-outlined text-[16px]">edit</span></button>
                          <button (click)="deletePlanStep(step.id)" class="text-[#8E918F] hover:text-[#FFB4AB] p-1"><span class="material-symbols-outlined text-[16px]">delete</span></button>
                        </div>
                      </div>
                      <!-- ENHANCED: Display Step Description -->
                      @if(step.description) { <p class="text-xs text-[#C4C7C5] leading-relaxed mt-1 opacity-90">{{ step.description }}</p> }
                   </div>
                 </div>
              </div>
            }

            <button (click)="startNewPlanStep()" class="w-full py-4 mt-4 border border-dashed border-[#444746] rounded-[20px] text-xs text-[#8E918F] hover:text-[#E3E3E3] hover:border-[#8E918F] hover:bg-[#2B2930] transition-all flex items-center justify-center space-x-2">
              <span class="material-symbols-outlined text-sm">add_circle</span><span>Add {{ flowService.appMode() === 'study' ? 'Lesson' : 'Step' }}</span>
            </button>
          </div>
        }

        <!-- NOTES VIEW -->
        @if (activeTab() === 'notes') {
          <div class="flex justify-between items-center mb-5 px-1">
            <span class="text-[10px] font-bold text-[#C4C7C5] uppercase tracking-wider">Notebook</span>
            <button (click)="startNewNote()" class="w-8 h-8 rounded-full bg-[#D0BCFF] hover:bg-[#EADDFF] text-[#381E72] flex items-center justify-center transition-colors shadow-sm" title="Create Note"><span class="material-symbols-outlined text-lg">add</span></button>
          </div>
          <div class="grid grid-cols-1 gap-4">
            @if (flowService.notes().length === 0) {
              <div class="text-center mt-20 opacity-30 text-[#C4C7C5]"><span class="material-symbols-outlined text-5xl mb-2">description</span><p class="text-sm">Empty notebook.</p></div>
            }
            @for (note of flowService.notes(); track note.id) {
              <div class="bg-[#2B2930] rounded-[24px] p-5 hover:shadow-lg transition-all group relative border border-transparent hover:border-[#444746]">
                <div class="absolute top-4 right-4 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity bg-[#2B2930] pl-2">
                  <button (click)="editNote(note)" class="text-[#C4C7C5] hover:text-[#D0BCFF] p-1.5 hover:bg-[#444746] rounded-full transition-colors"><span class="material-symbols-outlined text-[16px]">edit</span></button>
                  <button (click)="deleteNote(note.id)" class="text-[#C4C7C5] hover:text-[#FFB4AB] p-1.5 hover:bg-[#444746] rounded-full transition-colors"><span class="material-symbols-outlined text-[16px]">delete</span></button>
                </div>
                <h3 class="text-[#D0BCFF] text-xs font-bold uppercase tracking-wide mb-3 truncate pr-16">{{ note.title }}</h3>
                <div class="prose prose-invert prose-sm text-[#E3E3E3] text-sm leading-relaxed line-clamp-4" [innerHTML]="render(note.content)"></div>
              </div>
            }
          </div>
        }
        
        <!-- FILES VIEW -->
        @if (activeTab() === 'files' && flowService.activeModules().files) {
             <div class="min-h-[100px] border-2 border-dashed border-[#444746] rounded-[24px] p-6 flex flex-col items-center justify-center text-[#8E918F] transition-all hover:border-[#D0BCFF] hover:bg-[#2B2930]/50 mb-6 group cursor-pointer" (dragover)="onDragOver($event)" (drop)="onDrop($event)">
                @if (flowService.files().length === 0) { <span class="material-symbols-outlined text-3xl mb-2 group-hover:text-[#D0BCFF] transition-colors">cloud_upload</span><p class="text-xs text-center">Drag & Drop files here</p> } @else { <div class="flex flex-col items-center"><span class="material-symbols-outlined text-2xl mb-1 text-[#D0BCFF]">add_circle</span><p class="text-[10px]">Add more files</p></div> }
            </div>
             <!-- ... Files lists logic ... -->
        }
      </div>
      } 

      <!-- (Editor and Preview Logic kept identical) -->
      @if (showEditor()) {
        <div class="absolute inset-0 z-50 bg-[#1E1F20] flex flex-col p-6 animate-in fade-in zoom-in-95 duration-200">
           <div class="flex items-center justify-between mb-8">
             <h3 class="text-[#F2F2F2] text-lg font-medium">{{ editorMode() === 'note' ? (editId() ? 'Edit Note' : 'New Note') : (editId() ? 'Edit Step' : 'New Step') }}</h3>
             <button (click)="showEditor.set(false)" class="w-8 h-8 rounded-full bg-[#2B2930] flex items-center justify-center text-[#C4C7C5] hover:text-white transition-colors"><span class="material-symbols-outlined text-sm">close</span></button>
           </div>
           <div class="flex-1 flex flex-col space-y-4">
             <input [(ngModel)]="editTitle" [placeholder]="editorMode() === 'note' ? 'Title...' : 'Step...'" class="w-full bg-[#2B2930] border-none rounded-2xl px-5 py-4 text-[#E3E3E3] placeholder-[#5E5E5E] focus:outline-none focus:ring-2 focus:ring-[#D0BCFF] text-lg font-medium">
             <textarea [(ngModel)]="editContent" [placeholder]="editorMode() === 'note' ? 'Start writing...' : 'Add details...'" class="flex-1 w-full bg-[#2B2930] border-none rounded-2xl px-5 py-4 text-[#E3E3E3] placeholder-[#5E5E5E] focus:outline-none focus:ring-2 focus:ring-[#D0BCFF] resize-none text-sm leading-relaxed"></textarea>
           </div>
           <div class="flex justify-end pt-6">
              <button (click)="save()" [disabled]="!editTitle() || (editorMode() === 'note' && !editContent())" class="bg-[#D0BCFF] hover:bg-[#EADDFF] disabled:opacity-50 disabled:cursor-not-allowed text-[#381E72] px-8 py-3 rounded-full text-sm font-medium transition-all shadow-md active:scale-95">Save</button>
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