import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class FlowCloudService {
  private readonly baseUrl = 'https://flowcloud.onrender.com';
  private readonly accessKey = 'NVV'; // Provided in prompt
  
  // Cache storage
  private cache: Map<string, string> = new Map();
  // Blob URL Cache to prevent re-fetching large files
  private urlCache: Map<string, string> = new Map();

  // Fallback instructions in case of network failure
  private fallbacks: Record<string, string> = {
    'system_base.txt': `You are Flowstate v3.0 (Cloud Connected).
    You are a sophisticated Creative Engine & Master Tutor designed to help users enter a state of deep work.
    
    ### CORE IDENTITY
    - **Tone:** Adaptive (match user's configured persona).
    - **Goal:** Transform raw ideas into structured concepts.
    - **Method:** Use the "Assessment Triad" (Level, Availability, Goal) before starting big projects.`,
    
    'note_system.txt': `### NOTE MANAGEMENT
    - Use the 'manageNotes' tool to save important information.
    - If the user brainstorms something valuable, ask to save it as a note.
    - Context aware: You have access to created notes. Refer to them.`,
    
    'routine_management.txt': `### ROUTINE MANAGEMENT
    - Use 'createRoutine' to build schedules.
    - Focus on 'Deep Work' blocks (25-90 mins).
    - Respect the user's time availability.`,
    
    'agent_creation.txt': `### AGENT CREATION
    - You can spawn sub-agents for specific tasks (e.g., "Socrates" for debating).
    - To create an agent, generate a card with the syntax [createAI NAME=... DESC=... SYSTEM_PROMPT=...] in your text response.
    - CRITICAL: When the tool returns a 'widgetToken' (e.g. [[WIDGET_AGENT:xyz]]), you MUST include this exact token in your final response to display the agent card to the user.`,
    
    'test_extra.txt': `### INTERACTIVE TESTS
    - Use 'createInteractiveTest' to verify knowledge.
    - Make questions challenging but fair.
    - Provide explanations for every answer.
    - CRITICAL: When the tool returns a 'widgetToken' (e.g. [[WIDGET_TEST:xyz]]), you MUST include this exact token in your final response to display the quiz UI.`,
    
    'dj_mode.txt': `### DJ / MUSIC SYSTEM
    - You control the atmosphere.
    - Use 'setSystemState' with 'musicId' to change tracks based on the conversation mood.`,

    'music_list.txt': `[
      { 
        "id": "MUSIC_TELL", 
        "name": "Waltz of Flowers", 
        "description": "Tchaikovsky. Romantic, sweeping, orchestral.", 
        "url": "https://upload.wikimedia.org/wikipedia/commons/transcoded/3/30/Tchaikovsky_-_Waltz_of_the_Flowers.ogg/Tchaikovsky_-_Waltz_of_the_Flowers.ogg.mp3",
        "mood": "romantic"
      },
      { 
        "id": "REUNITED", 
        "name": "Gymnopédie No.1", 
        "description": "Erik Satie. Calm, meditative, piano.", 
        "url": "https://upload.wikimedia.org/wikipedia/commons/transcoded/e/e3/Erik_Satie_-_Gymnop%C3%A9die_No.1.ogg/Erik_Satie_-_Gymnop%C3%A9die_No.1.ogg.mp3",
        "mood": "creative"
      },
      {
        "id": "MUSIC_SILENCE",
        "name": "Silence",
        "description": "Complete silence.",
        "url": "",
        "mood": "calm"
      },
      {
        "id": "MUSIC_FALLING",
        "name": "Prelude in E Minor",
        "description": "Chopin. Melancholic, piano, sad.", 
        "url": "https://upload.wikimedia.org/wikipedia/commons/transcoded/3/30/Chopin_-_Prelude_in_E_Minor_%28Op._28_No._4%29.ogg/Chopin_-_Prelude_in_E_Minor_%28Op._28_No._4%29.ogg.mp3",
        "mood": "sad"
      },
      {
        "id": "MUSIC_HOME",
        "name": "Clair de Lune",
        "description": "Debussy. Cozy, ethereal, classic.", 
        "url": "https://upload.wikimedia.org/wikipedia/commons/transcoded/f/f5/Claude_Debussy_-_Clair_de_lune.ogg/Claude_Debussy_-_Clair_de_lune.ogg.mp3",
        "mood": "cozy"
      },
      {
        "id": "MUSIC_MOOG",
        "name": "Brandenburg No.3",
        "description": "Bach. Energetic, structured, baroque flow.", 
        "url": "https://upload.wikimedia.org/wikipedia/commons/transcoded/1/1a/Johann_Sebastian_Bach_-_Brandenburg_Concerto_No._3%2C_BWV_1048_-_I._Allegro.ogg/Johann_Sebastian_Bach_-_Brandenburg_Concerto_No._3%2C_BWV_1048_-_I._Allegro.ogg.mp3",
        "mood": "creative"
      },
      {
        "id": "MUSIC_LFY",
        "name": "Piano Sonata 16",
        "description": "Mozart. Bright, playful, sweet.", 
        "url": "https://upload.wikimedia.org/wikipedia/commons/transcoded/f/f6/Mozart_-_Piano_Sonata_No._16_in_C_Major%2C_K.545_%281st_Mvt%29.ogg/Mozart_-_Piano_Sonata_No._16_in_C_Major%2C_K.545_%281st_Mvt%29.ogg.mp3",
        "mood": "cute"
      }
    ]`
  };

  constructor() {}

  /**
   * Fetches a text file from FlowCloud.
   */
  async fetchInstruction(filename: string): Promise<string> {
    if (this.cache.has(filename)) {
      return this.cache.get(filename)!;
    }

    try {
      console.log(`[FlowCloud] Fetching Text: ${filename}`);
      const response = await this.makeSecureRequest(filename);
      const text = await response.text();
      this.cache.set(filename, text);
      return text;
    } catch (error) {
      console.warn(`[FlowCloud] Failed to fetch ${filename}. Using fallback.`, error);
      return this.fallbacks[filename] || "";
    }
  }

  /**
   * Fetches a binary file (audio/image) and returns a Blob URL.
   * This is critical for <audio> elements to work with custom headers.
   */
  async fetchFileUrl(filename: string): Promise<string> {
    if (this.urlCache.has(filename)) {
      return this.urlCache.get(filename)!;
    }

    try {
      console.log(`[FlowCloud] Fetching Blob: ${filename}`);
      const response = await this.makeSecureRequest(filename);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      this.urlCache.set(filename, objectUrl);
      return objectUrl;
    } catch (error) {
      console.error(`[FlowCloud] Failed to fetch blob ${filename}`, error);
      throw error;
    }
  }

  /**
   * Shared Secure Request Logic
   */
  private async makeSecureRequest(filename: string): Promise<Response> {
    const timestamp = Date.now().toString();
    const myOrigin = window.location.origin; 
    const payload = `${timestamp}:${filename}`;
    const signature = await this.hmacSha256(this.accessKey, payload);

    const url = `${this.baseUrl}/api/proxy/files/${filename}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-App-Request': '1',
        'Origin': myOrigin,
        'x-flowcloud-date': timestamp,
        'x-flowcloud-signature': signature
      }
    });

    if (!response.ok) {
      throw new Error(`FlowCloud responded with ${response.status}`);
    }

    return response;
  }

  private async hmacSha256(key: string, data: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key);
    const msgData = encoder.encode(data);

    const cryptoKey = await window.crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBuffer = await window.crypto.subtle.sign(
      'HMAC',
      cryptoKey,
      msgData
    );

    return Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}