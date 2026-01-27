import { Injectable, signal, computed, inject } from '@angular/core';
import { FlowCloudService } from './flow-cloud.service';

export interface MusicTrack {
  id: string;
  name: string;
  description: string;
  url: string;
  mood: string;
}

@Injectable({
  providedIn: 'root'
})
export class AudioService {
  private flowCloud = inject(FlowCloudService);
  
  // Library is now dynamic and reactive
  library = signal<MusicTrack[]>([]);

  private audio = new Audio();
  
  // State - Defaulting to MOOG (Main) instead of SILENCE
  currentTrackId = signal<string>('main');
  isPlaying = signal(false);
  volume = signal(0.3);

  // Queue State
  queue = signal<string[]>([]);
  queueIndex = signal(0);

  // Derived
  currentTrack = computed(() => this.library().find(t => t.id === this.currentTrackId()) || this.library()[0]);

  constructor() {
    this.audio.volume = this.volume();
    this.audio.crossOrigin = "anonymous";
    this.audio.loop = true; // Default loop
    
    // Auto-advance mechanism for playlists
    this.audio.onended = () => {
        this.playNext();
    };

    // Robust error handling
    this.audio.onerror = (e) => {
        console.warn("Audio Playback Failed:", this.audio.error);
        this.isPlaying.set(false);
    };
  }

  // Called by FlowStateService after fetching from Cloud
  setLibrary(tracks: MusicTrack[]) {
      this.library.set(tracks);
  }

  /**
   * Browser Autoplay Unlocker
   * Call this on first user interaction (click/keydown)
   */
  async tryUnlockAudio() {
      if (this.audio.paused && this.currentTrackId() !== 'MUSIC_SILENCE') {
          this.safePlay();
      }
  }

  async playTrackById(id: string) {
    if (id === 'MUSIC_SILENCE') {
        this.stop();
        this.currentTrackId.set(id);
        return;
    }

    const track = this.library().find(t => t.id === id);
    if (!track) {
      // If requested track not found (e.g. before library load), just set ID
      // It will play when library loads if we call this again, or we wait.
      console.warn(`Track ID ${id} not found.`);
      return;
    }
    
    // Single track play replaces queue
    this.queue.set([id]);
    this.queueIndex.set(0);

    // If we are already playing this track, ensure it's playing, otherwise restart
    if (id === this.currentTrackId() && this.isPlaying()) {
        return; 
    }

    this.currentTrackId.set(id);

    // SECURE URL RESOLUTION
    let finalUrl = track.url;
    if (finalUrl.startsWith('cloud://')) {
        const filename = finalUrl.replace('cloud://', '');
        try {
            // Fetch as blob with signed headers
            finalUrl = await this.flowCloud.fetchFileUrl(filename);
        } catch (e) {
            console.error("Failed to resolve secure audio URL", e);
            this.isPlaying.set(false);
            return;
        }
    }

    // Set source and force play (Auto-play logic)
    this.audio.src = finalUrl;
    this.audio.load();
    this.audio.loop = true; // Single track loops by default
    this.safePlay();
  }

  playPlaylist(ids: string[]) {
      if (!ids || ids.length === 0) {
          this.stop();
          return;
      }
      
      this.queue.set(ids);
      this.queueIndex.set(0);
      this._playQueueAtIndex(0);
  }

  playNext() {
      this._playQueueAtIndex(this.queueIndex() + 1);
  }
  
  private async _playQueueAtIndex(index: number) {
      const q = this.queue();
      
      // Loop Playlist logic
      if (index >= q.length) {
          if (q.length > 0) {
              this.queueIndex.set(0);
              this._playQueueAtIndex(0);
          } else {
              this.stop();
          }
          return;
      }

      const id = q[index];
      this.queueIndex.set(index);

      if (id === 'MUSIC_SILENCE') {
          this.currentTrackId.set(id);
          this.stop(); 
          return;
      }

      const track = this.library().find(t => t.id === id);
      if (!track) {
          this.playNext();
          return;
      }

      this.currentTrackId.set(id);

      // SECURE URL RESOLUTION (QUEUE)
      let finalUrl = track.url;
      if (finalUrl.startsWith('cloud://')) {
          const filename = finalUrl.replace('cloud://', '');
          try {
              finalUrl = await this.flowCloud.fetchFileUrl(filename);
          } catch (e) {
              console.error("Queue: Failed to resolve secure audio URL, skipping", e);
              this.playNext();
              return;
          }
      }

      this.audio.src = finalUrl;
      this.audio.load();
      
      this.audio.loop = (q.length === 1);
      this.safePlay();
  }

  togglePlay() {
    if (this.currentTrackId() === 'MUSIC_SILENCE') {
      const firstTrack = this.library().find(t => t.id !== 'MUSIC_SILENCE');
      if (firstTrack) {
          this.playTrackById(firstTrack.id);
      }
      return;
    }

    if (this.isPlaying()) {
      this.audio.pause();
      this.isPlaying.set(false);
    } else {
      this.safePlay();
    }
  }

  private async safePlay() {
      try {
          const promise = this.audio.play();
          if (promise !== undefined) {
              await promise;
              this.isPlaying.set(true);
          }
      } catch (error: any) {
          if (error.name !== 'AbortError' && error.name !== 'NotAllowedError') {
              console.error("Audio Playback Error:", error);
          }
          this.isPlaying.set(false);
      }
  }

  stop() {
    this.audio.pause();
    this.audio.currentTime = 0;
    this.isPlaying.set(false);
  }

  setVolume(val: number) {
    this.volume.set(val);
    this.audio.volume = val;
  }
}