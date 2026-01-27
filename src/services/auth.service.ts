import { Injectable, signal } from '@angular/core';
import { supabase } from '../lib/supabase-client';
import { User } from '@supabase/supabase-js';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  user = signal<User | null>(null);
  profile = signal<{ avatar_url?: string, full_name?: string } | null>(null);

  constructor() {
    this.initialize();
  }

  private async initialize() {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) {
      this.user.set(data.session.user);
      this.setProfile(data.session.user);
    }

    supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user || null;
      this.user.set(currentUser);
      if (currentUser) {
        this.setProfile(currentUser);
      } else {
        this.profile.set(null);
      }
    });
  }

  private setProfile(user: User) {
    this.profile.set({
      avatar_url: user.user_metadata['avatar_url'],
      full_name: user.user_metadata['full_name']
    });
  }

  async signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });
    if (error) console.error('Login error:', error);
  }

  async signOut() {
    await supabase.auth.signOut();
    this.user.set(null);
    this.profile.set(null);
  }
}