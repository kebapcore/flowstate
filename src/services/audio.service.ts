import { Injectable, signal, computed } from '@angular/core';

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
  readonly library: MusicTrack[] = [
    { 
      id: 'MUSIC_TELL', 
      name: 'Tell Me', 
      description: 'Kpop şarkısı, aşk ve itiraf hakkında, pembe dünya, romantizm', 
      url: 'https://fastcdn.onrender.com/tellme',
      mood: 'romantic'
    },
    { 
      id: 'REUNITED', 
      name: 'Reunited', 
      description: 'Sakin, Undertale müziği. Proje başlangıçları ve ortalarında, kahve molalarında mükemmel..', 
      url: 'https://fastcdn.onrender.com/reunited',
      mood: 'creative'
    },
    {
      id: 'MUSIC_SILENCE',
      name: 'Silence',
      description: 'Complete silence.',
      url: '',
      mood: 'calm'
    },
    {
      id: 'MUSIC_FALLING',
      name: 'Falling Down',
      description: 'Lil Peep & XXXTENTACION. Melankolik, yağmurlu, depresif ve duygusal kırılma anları için.',
      url: 'https://fastcdn.onrender.com/fallingdown',
      mood: 'sad'
    },
    {
      id: 'MUSIC_HOME',
      name: 'Home',
      description: 'Undertale OST. Ev sıcaklığı, güvenli alan, huzur ve nostalji. Toriel sizi karşılıyor gibi.',
      url: 'https://cs1.mp3.pm/listen/127837738/bktHOWpISU9aS1RVZWVDSmtObmtRZzBPaHcvdkpuRUJhOVdKOHVOYjgxbU9NaXdDWnFxSG9QRUcyWVZKenZJMDJHMkFkRGZlNk5wS0xmK2JoWjJJMng0SmRmWFA5bFJvTXBrYlhIaUM4Ynd0YnRYUitzYWNRMk1xZzNSQ1FoU3g/Undertale_-_Home_(mp3.pm).mp3',
      mood: 'cozy'
    },
    {
      id: 'MUSIC_MOOG',
      name: 'Moog City',
      description: 'C418 (Minecraft). İnşa etme, dünyayı yaratma, bloklar ve saf yaratıcılık akışı.',
      url: 'https://cs1.mp3.pm/listen/171229068/bktHOWpISU9aS1RVZWVDSmtObmtRZzBPaHcvdkpuRUJhOVdKOHVOYjgxbW90ejI4ZXhIK0pQSWtUWjdGRUgwYnhvSXMzSWFvc3QvUURjNGF6dnFoN0doK2RTM2lFY2d1RVFVSDRHdlpVSk53MEtQV1hEbEcyMmlxV2hsWlVOTFo/C418Muzyka_s_MAJNKRAFTA_-_Moog_City_Minecraft_OST_(mp3.pm).mp3',
      mood: 'creative'
    },
    {
      id: 'MUSIC_LFY',
      name: 'Love For You',
      description: 'Aşk, kelebekler, olumlu duygular. Tatlı, sweet....',
      url: 'https://cs1.mp3.pm/listen/243420564/bktHOWpISU9aS1RVZWVDSmtObmtRZzBPaHcvdkpuRUJhOVdKOHVOYjgxbkU3OTU1VDRLZzJmN1c4UllhVTdLZlBDNS9lYTlFdWNxcHVjUE9iOWtBdlZuYlZ2OHl5dXppMHF0TENzQmF0T3lVNVFvbmZDMzY3aFFRdzFoUmszMWI/loveli_lori_-_love_for_you_(mp3.pm).mp3',
      mood: 'cute'
    }
  ];

  private audio = new Audio();
  
  // State
  currentTrackId = signal<string>('MUSIC_SILENCE');
  isPlaying = signal(false);
  volume = signal(0.3);

  // Derived
  currentTrack = computed(() => this.library.find(t => t.id === this.currentTrackId()) || this.library[2]);

  constructor() {
    this.audio.loop = true;
    this.audio.volume = this.volume();
  }

  playTrackById(id: string) {
    if (id === this.currentTrackId() && this.isPlaying()) return; 

    const track = this.library.find(t => t.id === id);
    if (!track) {
      console.warn(`Track ID ${id} not found.`);
      return;
    }

    this.currentTrackId.set(id);

    if (id === 'MUSIC_SILENCE') {
      this.stop();
      return;
    }

    this.audio.src = track.url;
    this.audio.load();
    this.safePlay();
  }

  togglePlay() {
    if (this.currentTrackId() === 'MUSIC_SILENCE') {
      this.playTrackById('REUNITED'); 
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
          // Ignore interruption errors which happen if play/pause are toggled rapidly
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