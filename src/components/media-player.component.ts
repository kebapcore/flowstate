import { Component, Input, ViewChild, ElementRef, signal, effect, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-media-player',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="bg-[#1E1F20] rounded-xl overflow-hidden border border-[#444746] group relative select-none flex flex-col h-full w-full">
      
      <!-- Media Element -->
      <div class="relative bg-black flex-1 flex justify-center items-center w-full overflow-hidden">
        @if (type === 'video') {
          <video 
            #mediaRef
            [src]="src" 
            class="w-full h-full object-contain"
            (click)="togglePlay()"
            (timeupdate)="onTimeUpdate()"
            (loadedmetadata)="onMetadataLoaded()"
            (ended)="onEnded()"
          ></video>
        } @else {
          <audio 
            #mediaRef
            [src]="src"
            (timeupdate)="onTimeUpdate()"
            (loadedmetadata)="onMetadataLoaded()"
            (ended)="onEnded()"
          ></audio>
          <!-- Audio Visualizer Placeholder -->
          <div class="absolute inset-0 flex items-center justify-center gap-1 opacity-50 bg-[#131314]">
             <div class="w-1 h-3 bg-[#D0BCFF] rounded-full animate-pulse"></div>
             <div class="w-1 h-5 bg-[#D0BCFF] rounded-full animate-pulse delay-75"></div>
             <div class="w-1 h-4 bg-[#D0BCFF] rounded-full animate-pulse delay-150"></div>
             <div class="w-1 h-6 bg-[#D0BCFF] rounded-full animate-pulse delay-100"></div>
             <div class="w-1 h-3 bg-[#D0BCFF] rounded-full animate-pulse"></div>
          </div>
        }

        <!-- Play Overlay (Video Only - Center) -->
        @if (type === 'video' && !isPlaying() && !isHoveringControls) {
           <button 
             (click)="togglePlay()"
             class="absolute inset-0 z-10 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors"
           >
             <div class="w-16 h-16 rounded-full bg-[#D0BCFF]/90 flex items-center justify-center pl-1 shadow-lg backdrop-blur-sm transition-transform hover:scale-105">
               <span class="material-symbols-outlined text-[#381E72] text-[32px]">play_arrow</span>
             </div>
           </button>
        }
      </div>

      <!-- Controls Bar -->
      <div 
        class="bg-[#2B2930] p-3 flex flex-col gap-2 transition-opacity duration-300 border-t border-[#444746]"
        (mouseenter)="isHoveringControls = true"
        (mouseleave)="isHoveringControls = false"
      >
        <!-- Scrubber -->
        <div 
          class="relative h-1.5 w-full bg-[#444746] rounded-full cursor-pointer group/scrubber hover:h-2 transition-all"
          (click)="seek($event)"
        >
          <div 
            class="absolute top-0 left-0 h-full bg-[#D0BCFF] rounded-full pointer-events-none"
            [style.width.%]="progressPercent()"
          ></div>
          <!-- Thumb (visible on hover) -->
          <div 
            class="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-[#EADDFF] rounded-full shadow-md opacity-0 group-hover/scrubber:opacity-100 transition-opacity pointer-events-none"
            [style.left.%]="progressPercent()"
          ></div>
        </div>

        <div class="flex items-center justify-between mt-1 px-1">
          <div class="flex items-center gap-3">
            <button (click)="togglePlay()" class="text-[#E3E3E3] hover:text-white transition-colors p-1 hover:bg-white/5 rounded-full">
              <span class="material-symbols-outlined text-[24px]">{{ isPlaying() ? 'pause' : 'play_arrow' }}</span>
            </button>
            
            <div class="text-[11px] font-mono text-[#C4C7C5] tracking-wide">
              {{ formatTime(currentTime()) }} / {{ formatTime(duration()) }}
            </div>
          </div>

          <!-- Volume -->
          <div class="flex items-center gap-2 group/volume bg-black/20 rounded-full px-3 py-1">
             <button (click)="toggleMute()" class="text-[#C4C7C5] hover:text-[#E3E3E3]">
                <span class="material-symbols-outlined text-[18px]">
                  {{ volume() === 0 ? 'volume_off' : 'volume_up' }}
                </span>
             </button>
             <input 
               type="range" 
               min="0" max="1" step="0.1"
               [value]="volume()"
               (input)="setVolume($event)"
               class="w-16 h-1 bg-[#444746] rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:bg-[#D0BCFF] [&::-webkit-slider-thumb]:rounded-full"
             >
          </div>
        </div>
      </div>
    </div>
  `
})
export class MediaPlayerComponent implements OnDestroy {
  @Input() src: string = '';
  @Input() type: 'audio' | 'video' = 'audio';

  @ViewChild('mediaRef') mediaRef!: ElementRef<HTMLMediaElement>;

  isPlaying = signal(false);
  currentTime = signal(0);
  duration = signal(0);
  volume = signal(1);
  isHoveringControls = false;

  progressPercent = signal(0);

  async togglePlay() {
    const el = this.mediaRef.nativeElement;
    if (el.paused) {
      try {
         await el.play();
         this.isPlaying.set(true);
      } catch(e: any) {
          // Ignore interrupted errors
          if(e.name !== 'AbortError' && e.name !== 'NotAllowedError') console.error(e);
          this.isPlaying.set(false);
      }
    } else {
      el.pause();
      this.isPlaying.set(false);
    }
  }

  onTimeUpdate() {
    const el = this.mediaRef.nativeElement;
    this.currentTime.set(el.currentTime);
    this.progressPercent.set((el.currentTime / el.duration) * 100 || 0);
  }

  onMetadataLoaded() {
    const el = this.mediaRef.nativeElement;
    this.duration.set(el.duration);
    this.volume.set(el.volume);
  }

  onEnded() {
    this.isPlaying.set(false);
    this.mediaRef.nativeElement.currentTime = 0;
  }

  seek(event: MouseEvent) {
    const el = this.mediaRef.nativeElement;
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    const x = event.clientX - rect.left;
    const percent = x / rect.width;
    el.currentTime = percent * el.duration;
  }

  setVolume(event: Event) {
    const val = parseFloat((event.target as HTMLInputElement).value);
    this.mediaRef.nativeElement.volume = val;
    this.volume.set(val);
  }

  toggleMute() {
    if (this.volume() > 0) {
      this.mediaRef.nativeElement.volume = 0;
      this.volume.set(0);
    } else {
      this.mediaRef.nativeElement.volume = 1;
      this.volume.set(1);
    }
  }

  formatTime(seconds: number): string {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  ngOnDestroy() {
    // Cleanup if needed
  }
}