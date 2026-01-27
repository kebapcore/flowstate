import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FlowStateService } from '../services/flow-state.service';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div 
      class="h-full flex flex-col p-4 w-full bg-[#121212] border-r border-[#27272a] overflow-hidden"
    >
      <!-- Top Action -->
      <div class="flex items-center justify-between mb-6">
         <span class="text-sm font-bold text-[#E3E3E3] tracking-wide">Workspaces</span>
         <button (click)="flowService.toggleLeftSidebar()" class="text-[#5E5E5E] hover:text-white">
             <span class="material-symbols-outlined">first_page</span>
         </button>
      </div>

      <!-- New Chat Button -->
      <button 
        (click)="flowService.createNewChat()"
        class="w-full py-3 px-4 bg-[#2B2930] hover:bg-[#D0BCFF] hover:text-[#381E72] text-[#E3E3E3] rounded-xl flex items-center justify-center gap-2 transition-all mb-6 font-medium shadow-md active:scale-95 group"
      >
        <span class="material-symbols-outlined text-lg">add</span>
        <span>New Flow</span>
      </button>

      <!-- Chat List -->
      <div class="flex-1 overflow-y-auto custom-scrollbar space-y-2">
          @if (flowService.savedChats().length === 0) {
              <div class="text-center py-10 opacity-30 text-[#8E918F]">
                  <span class="material-symbols-outlined text-3xl mb-2">history</span>
                  <p class="text-xs">No history</p>
              </div>
          }

          @for (chat of flowService.savedChats(); track chat.id) {
              <div 
                class="group relative flex items-center p-3 rounded-lg cursor-pointer transition-colors border border-transparent"
                [class.bg-[#2B2930]]="flowService.currentChatId() === chat.id"
                [class.border-[#444746]]="flowService.currentChatId() === chat.id"
                [class.hover:bg-[#1E1F20]]="flowService.currentChatId() !== chat.id"
                (click)="flowService.loadChatSession(chat.id)"
              >
                  <span class="material-symbols-outlined text-[#8E918F] text-lg mr-3">chat_bubble_outline</span>
                  <div class="flex-1 min-w-0">
                      <div class="text-sm text-[#E3E3E3] truncate font-medium">{{ chat.title }}</div>
                      <div class="text-[10px] text-[#5E5E5E]">{{ formatDate(chat.lastModified) }}</div>
                  </div>
                  
                  <button 
                    (click)="$event.stopPropagation(); flowService.deleteChatSession(chat.id)"
                    class="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/20 hover:text-red-400 text-[#5E5E5E] rounded transition-all"
                  >
                      <span class="material-symbols-outlined text-sm">delete</span>
                  </button>
              </div>
          }
      </div>
      
      <!-- User Profile Section -->
      <div class="pt-4 border-t border-[#27272a] mt-2">
          @if (authService.user()) {
              <div class="flex items-center gap-3 p-2 rounded-xl bg-[#1E1F20] border border-[#444746]">
                  @if(authService.profile()?.avatar_url) {
                      <img [src]="authService.profile()?.avatar_url" class="w-8 h-8 rounded-full">
                  } @else {
                      <div class="w-8 h-8 rounded-full bg-[#D0BCFF] text-[#381E72] flex items-center justify-center font-bold">
                          {{ authService.profile()?.full_name?.charAt(0) || 'U' }}
                      </div>
                  }
                  <div class="flex-1 min-w-0">
                      <div class="text-xs font-bold text-[#E3E3E3] truncate">{{ authService.profile()?.full_name || 'User' }}</div>
                      <button (click)="authService.signOut()" class="text-[10px] text-[#8E918F] hover:text-red-400">Sign Out</button>
                  </div>
              </div>
          } @else {
              <button (click)="authService.signInWithGoogle()" class="w-full py-2 bg-white text-black rounded-lg flex items-center justify-center gap-2 text-xs font-bold hover:bg-gray-200 transition-colors">
                  <img src="https://www.svgrepo.com/show/475656/google-color.svg" class="w-4 h-4">
                  Sign in with Google
              </button>
              <div class="text-center mt-2 text-[10px] text-[#5E5E5E]">Sync your flows across devices</div>
          }
      </div>
    </div>
  `
})
export class SidebarComponent {
  flowService = inject(FlowStateService);
  authService = inject(AuthService);

  formatDate(ts: number): string {
      return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
}