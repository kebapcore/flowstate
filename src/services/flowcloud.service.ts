import { Injectable, signal } from '@angular/core';

/**
 * FlowCloud Service - Browser Compatible
 * 
 * FlowCloud'dan şifreli dosyaları çeker ve sessionStorage'da cache'ler.
 * Sayfa refresh edilene kadar tekrar çekmez.
 */

const FLOWCLOUD_URL = 'https://flowcloud.onrender.com';
const ORIGIN_URL = 'https://flowstate.onrender.com';
const CACHE_PREFIX = 'flowcloud_cache_';

// Dosya listesi
const INSTRUCTION_FILES = [
    'system_base.txt',
    'agent_creation.txt',
    'dj_mode.txt',
    'note_system.txt',
    'routine_management.txt',
    'test_extra.txt'
] as const;

type InstructionFile = typeof INSTRUCTION_FILES[number];

export interface FlowCloudInstructions {
    system_base: string;
    agent_creation: string;
    dj_mode: string;
    note_system: string;
    routine_management: string;
    test_extra: string;
}

@Injectable({
    providedIn: 'root'
})
export class FlowCloudService {

    // Signal to track loading state
    isLoaded = signal(false);
    isLoading = signal(false);
    loadError = signal<string | null>(null);

    // Cached instructions
    private instructions: FlowCloudInstructions = {
        system_base: '',
        agent_creation: '',
        dj_mode: '',
        note_system: '',
        routine_management: '',
        test_extra: ''
    };

    /**
     * HMAC-SHA256 imzalama (Browser SubtleCrypto API)
     */
    private async createSignature(key: string, payload: string): Promise<string> {
        const encoder = new TextEncoder();
        const keyData = encoder.encode(key);
        const payloadData = encoder.encode(payload);

        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            keyData,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );

        const signature = await crypto.subtle.sign('HMAC', cryptoKey, payloadData);

        // Convert to hex
        return Array.from(new Uint8Array(signature))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    /**
     * FlowCloud'dan tek dosya çek
     */
    private async fetchFile(filename: string, accessKey: string): Promise<string> {
        // Check cache first
        const cached = sessionStorage.getItem(CACHE_PREFIX + filename);
        if (cached) {
            console.log(`📦 [FlowCloud] Cache hit: ${filename}`);
            return cached;
        }

        const targetUrl = `${FLOWCLOUD_URL}/api/proxy/files/${filename}`;
        const timestamp = Date.now().toString();
        const payload = `${timestamp}:${filename}`;
        const signature = await this.createSignature(accessKey, payload);

        const headers = {
            'X-App-Request': '1',
            'Origin': ORIGIN_URL,
            'x-flowcloud-date': timestamp,
            'x-flowcloud-signature': signature
        };

        const response = await fetch(targetUrl, { headers });

        if (!response.ok) {
            throw new Error(`FlowCloud Error: ${response.status} ${response.statusText}`);
        }

        const content = await response.text();

        // Cache it
        sessionStorage.setItem(CACHE_PREFIX + filename, content);
        console.log(`☁️ [FlowCloud] Fetched and cached: ${filename}`);

        return content;
    }

    /**
     * Tüm instruction dosyalarını yükle
     * Sayfa refresh edilene kadar tekrar çekmez.
     */
    async loadInstructions(accessKey: string): Promise<FlowCloudInstructions> {
        // Already loaded this session?
        if (this.isLoaded()) {
            return this.instructions;
        }

        // Check if all files are in sessionStorage
        const allCached = INSTRUCTION_FILES.every(f =>
            sessionStorage.getItem(CACHE_PREFIX + f) !== null
        );

        if (allCached) {
            console.log('📦 [FlowCloud] All instructions loaded from cache');
            this.instructions = {
                system_base: sessionStorage.getItem(CACHE_PREFIX + 'system_base.txt') || '',
                agent_creation: sessionStorage.getItem(CACHE_PREFIX + 'agent_creation.txt') || '',
                dj_mode: sessionStorage.getItem(CACHE_PREFIX + 'dj_mode.txt') || '',
                note_system: sessionStorage.getItem(CACHE_PREFIX + 'note_system.txt') || '',
                routine_management: sessionStorage.getItem(CACHE_PREFIX + 'routine_management.txt') || '',
                test_extra: sessionStorage.getItem(CACHE_PREFIX + 'test_extra.txt') || ''
            };
            this.isLoaded.set(true);
            return this.instructions;
        }

        // Fetch all files
        this.isLoading.set(true);
        this.loadError.set(null);

        try {
            const results = await Promise.all(
                INSTRUCTION_FILES.map(f => this.fetchFile(f, accessKey))
            );

            this.instructions = {
                system_base: results[0],
                agent_creation: results[1],
                dj_mode: results[2],
                note_system: results[3],
                routine_management: results[4],
                test_extra: results[5]
            };

            this.isLoaded.set(true);
            console.log('✅ [FlowCloud] All instructions loaded successfully');

            return this.instructions;

        } catch (error: any) {
            console.error('❌ [FlowCloud] Load error:', error);
            this.loadError.set(error.message);
            throw error;
        } finally {
            this.isLoading.set(false);
        }
    }

    /**
     * Get cached instructions (sync)
     */
    getInstructions(): FlowCloudInstructions {
        return this.instructions;
    }

    /**
     * Get combined system prompt
     */
    getSystemPrompt(): string {
        const i = this.instructions;
        return [
            i.system_base,
            i.agent_creation,
            i.dj_mode,
            i.note_system,
            i.routine_management,
            i.test_extra
        ].filter(Boolean).join('\n\n');
    }

    /**
     * Clear cache (for debugging)
     */
    clearCache(): void {
        INSTRUCTION_FILES.forEach(f => {
            sessionStorage.removeItem(CACHE_PREFIX + f);
        });
        this.isLoaded.set(false);
        console.log('🗑️ [FlowCloud] Cache cleared');
    }
}
