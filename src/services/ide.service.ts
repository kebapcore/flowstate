
import { Injectable, signal } from '@angular/core';
import { WebContainer } from '@webcontainer/api';

@Injectable({
  providedIn: 'root'
})
export class IdeService {
  private webContainerInstance: WebContainer | null = null;
  
  // Signals
  isBooting = signal(false);
  isReady = signal(false);
  serverUrl = signal<string | null>(null);
  logs = signal<string[]>([]);
  fileTree = signal<string[]>([]); // List of full file paths
  
  constructor() {}

  async boot() {
    // Prevent double booting
    if (this.isReady()) return;
    if (this.isBooting()) return;
    
    this.isBooting.set(true);
    this.addLog("⚡ System: Initializing WebContainer...");

    try {
      this.webContainerInstance = await WebContainer.boot();
      this.isReady.set(true);
      this.addLog("✅ System: IDE Ready.");
      
      // Monitor server ready events
      this.webContainerInstance.on('server-ready', (port, url) => {
        this.addLog(`🌐 Server Ready: ${url}`);
        this.serverUrl.set(url);
      });
      
      this.webContainerInstance.on('error', (err) => {
        console.error('WebContainer Error:', err);
        this.addLog(`❌ Internal Error: ${err.message}`);
      });

      await this.refreshFileList();
    } catch (e: any) {
      console.error("IDE Boot Failed:", e);
      this.addLog(`❌ Boot Error: ${e.message}`);
      if (!window.crossOriginIsolated) {
         this.addLog("⚠️ Critical: Cross-Origin Isolation not enabled. Headers missing.");
      }
    } finally {
      this.isBooting.set(false);
    }
  }

  async writeFile(path: string, content: string) {
    if (!this.webContainerInstance) await this.boot();
    if (!this.webContainerInstance) {
        this.addLog(`❌ Write Failed: IDE not ready (${path})`);
        throw new Error("IDE not initialized");
    }

    try {
        // 1. Ensure Directory Exists (mkdir -p)
        if (path.includes('/')) {
            const dir = path.substring(0, path.lastIndexOf('/'));
            if (dir && dir !== '.') {
                await this.webContainerInstance.fs.mkdir(dir, { recursive: true });
            }
        }

        // 2. Write File
        this.addLog(`📄 Writing: ${path}`);
        await this.webContainerInstance.fs.writeFile(path, content);
        
        // 3. Refresh List
        await this.refreshFileList();
    } catch (e: any) {
        console.error(`Write Error (${path}):`, e);
        this.addLog(`❌ Write Error: ${e.message}`);
        throw e; // Re-throw so FlowState knows it failed
    }
  }

  async readFile(path: string): Promise<string> {
    if (!this.webContainerInstance) await this.boot();
    if (!this.webContainerInstance) throw new Error("IDE not ready");

    try {
        const uint8 = await this.webContainerInstance.fs.readFile(path);
        return new TextDecoder().decode(uint8);
    } catch (e: any) {
        console.error(`Read Error (${path}):`, e);
        this.addLog(`❌ Read Error: ${e.message}`);
        throw e;
    }
  }

  async runCommand(cmd: string) {
    if (!this.webContainerInstance) await this.boot();
    if (!this.webContainerInstance) return;

    try {
        const [command, ...args] = cmd.split(' ');
        this.addLog(`> ${cmd}`);

        const process = await this.webContainerInstance.spawn(command, args);

        process.output.pipeTo(new WritableStream({
          write: (data) => {
            const clean = data.replace(/\u001b\[[0-9;]*m/g, ''); // Strip ANSI
            this.addLog(clean);
          }
        }));

        const exitCode = await process.exit;
        if (exitCode !== 0) {
          this.addLog(`⚠️ Process exited with code ${exitCode}`);
        } else {
            this.addLog(`✓ Process finished`);
        }
        
        await this.refreshFileList();
    } catch (e: any) {
        console.error("Command execution failed:", e);
        this.addLog(`❌ Command Error: ${e.message}`);
    }
  }

  async refreshFileList() {
      if (!this.webContainerInstance) return;
      
      try {
          const files = await this.recursiveReaddir('.');
          // CRITICAL: Create NEW array reference
          this.fileTree.set([...files]);
      } catch (e: any) {
          console.error("List Files Error:", e);
          this.addLog(`❌ File List Error: ${e.message}`);
      }
  }

  // Recursive Helper
  private async recursiveReaddir(dir: string): Promise<string[]> {
      if (!this.webContainerInstance) return [];
      
      const dirents = await this.webContainerInstance.fs.readdir(dir, { withFileTypes: true });
      let files: string[] = [];

      for (const dirent of dirents) {
          const fullPath = dir === '.' ? dirent.name : `${dir}/${dirent.name}`;
          if (dirent.isDirectory()) {
              // Ignore node_modules for sanity in UI
              if (dirent.name !== 'node_modules' && dirent.name !== '.git') {
                   const children = await this.recursiveReaddir(fullPath);
                   files = [...files, ...children];
              }
          } else {
              files.push(fullPath);
          }
      }
      return files;
  }

  private addLog(msg: string) {
    this.logs.update(prev => [...prev.slice(-199), msg]); // Keep last 200
  }
}
