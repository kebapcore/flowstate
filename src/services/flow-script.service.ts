import { Injectable, inject } from '@angular/core';
import { FlowStateService, UserFile } from './flow-state.service';

declare var loadPyodide: any;

@Injectable({
  providedIn: 'root'
})
export class FlowScriptService {
  private flowState = inject(FlowStateService);
  private pyodide: any = null;
  private lastResult: any = null;
  private agents: Record<string, string> = {}; // ID -> System Instruction
  private lastCreatedAgentInstruction: string | null = null;
  
  // Global context storage for Python callbacks
  private currentContext: any = {};

  constructor() {
     // Expose helpers for Pyodide to call back into JS
     (window as any).getFlowScriptInput = (key: string) => {
         // Return raw value from context if exists, otherwise try resolving as string interpolation
         if (key in this.currentContext) return this.currentContext[key];
         return this.resolveVariables(`[${key}]`, this.currentContext);
     };

     (window as any).setFlowScriptOutput = (key: string, value: any) => {
         this.currentContext[key] = value;
         // Also update lastResult so getOutput works if they want to use that pattern
         this.lastResult = value; 
     };
  }

  async executeScript(scriptContent: string, prompt: string) {
    const context: any = { prompt, answer: '' };
    this.currentContext = context;
    this.lastResult = null;
    this.agents = {};

    try {
        // 1. Parse Blocks
        // We only extract top-level blocks to define the flow structure.
        const blocks = this.parseBlocks(scriptContent);

        // 2. Run beforePrompt
        if (blocks.beforePrompt) {
          await this.runBlock(blocks.beforePrompt, context);
        }

        // 3. Run Prompt or Override (Main Execution Phase)
        // If overridePrompt was defined at TOP LEVEL, it takes precedence here.
        if (blocks.overridePrompt) {
          context.answer = this.resolveVariables(blocks.overridePrompt, context);
        } else if (blocks.prompt) {
          const aiPrompt = this.resolveVariables(blocks.prompt, context);
          this.flowState.logAction('Asking AI...');
          
          const response = await this.flowState.generateRawResponse(aiPrompt);
          if (response.startsWith("Error")) {
             throw new Error(`AI Request Failed: ${response}`);
          }
          context.answer = response;
        }

        // 4. Run afterPrompt
        if (blocks.afterPrompt) {
          await this.runBlock(blocks.afterPrompt, context);
        }

        // 5. Output result (Success)
        // We use context.answer because it might have been updated by 'afterPrompt' via nested overridePrompt
        if (context.answer) {
          this.flowState.addMessage({
            role: 'model',
            type: 'text',
            text: context.answer,
            displayHtml: this.flowState.renderMarkdown(context.answer)
          });
        }
    } catch (error: any) {
        // CRITICAL: Fail-Fast Error Display
        console.error("Script Execution Failed", error);
        this.flowState.addMessage({
            role: 'model',
            type: 'system', 
            text: '🛑 Script Execution Failed!',
            displayHtml: `
                <div class="bg-[#3c1e1e] border border-[#ffb4ab]/30 rounded-xl p-4 text-[#ffb4ab] mt-2 shadow-lg animate-in fade-in slide-in-from-bottom-2">
                    <div class="flex items-center gap-2 mb-2 pb-2 border-b border-[#ffb4ab]/20">
                        <span class="material-symbols-outlined text-xl">error_outline</span>
                        <span class="font-bold text-sm tracking-wide">EXECUTION HALTED</span>
                    </div>
                    <div class="font-mono text-xs opacity-90 whitespace-pre-wrap leading-relaxed break-words">${error.message || "Unknown error occurred."}</div>
                </div>
            `
        });
    }
  }

  private parseBlocks(script: string) {
    const normalize = (s: string) => s.replace(/\r\n/g, '\n');
    const content = normalize(script);

    // Regex to find TOP LEVEL blocks. 
    // Uses [\s\S]*? for non-greedy matching of content between tags.
    const extract = (name: string) => {
      // Regex explanation:
      // start\s+${name} : Matches 'start BlockName' (case insensitive from 'i' flag)
      // ([\s\S]*?)      : Captures content
      // end\s+${name}   : Matches 'end BlockName'
      const regex = new RegExp(`start\\s+${name}([\\s\\S]*?)end\\s+${name}`, 'i');
      const match = content.match(regex);
      return match ? match[1].trim() : null;
    };

    const passPrompt = /pass\s+Prompt/i.test(content);

    return {
      beforePrompt: extract('beforePrompt'),
      prompt: passPrompt ? null : extract('Prompt'),
      // This extracts top-level overridePrompt. 
      // Nested overridePrompt inside afterPrompt is handled by runBlock.
      overridePrompt: extract('overridePrompt'),
      afterPrompt: extract('afterPrompt')
    };
  }

  private async runBlock(blockContent: string, context: any) {
    const lines = blockContent.split('\n');
    let i = 0;

    while (i < lines.length) {
      let line = lines[i].trim();
      
      if (!line || line.startsWith('#')) {
        i++; continue;
      }

      // 0. NESTED OVERRIDE PROMPT (Support for Manifesto Example 3)
      if (line.match(/^start\s+overridePrompt/i)) {
          // Consume lines until end overridePrompt
          let buffer = '';
          i++; 
          while (i < lines.length) {
              const innerLineRaw = lines[i];
              // IMPORTANT: Trim before checking end tag to ignore indentation
              if (innerLineRaw.trim().match(/^end\s+overridePrompt/i)) {
                  break;
              }
              buffer += innerLineRaw + '\n';
              i++;
          }
          // Set the answer context
          context.answer = this.resolveVariables(buffer.trim(), context);
          i++; // Skip the 'end' line (index of break)
          continue;
      }

      // 1. MICRO AI: "runAI as AGENT_ID(...)"
      // This needs specific parsing because it has the "as" keyword before the parens.
      const runAsMatch = line.match(/^runAI\s+as\s+(\w+)\s*\(/i);
      
      if (runAsMatch) {
          const agentId = runAsMatch[1];
          const args = this.extractMultilineArgs(lines, i);
          await this.runCommand('runAI_Agent', [agentId, args.content], context);
          i = args.nextIndex;

      } 
      // 2. GENERIC COMMANDS: "CommandName(...)"
      else {
        const cmdStartMatch = line.match(/^(\w+)\s*\(/);
        
        if (cmdStartMatch) {
            const cmd = cmdStartMatch[1];
            const args = this.extractMultilineArgs(lines, i);
            await this.runCommand(cmd, [args.content], context);
            i = args.nextIndex;

        } else if (line.match(/^getOutput\s+as\s+/i)) {
             const varMatch = line.match(/getOutput\s+as\s+"([^"]+)"/i);
             if (varMatch) {
               context[varMatch[1]] = this.lastResult;
             }
             i++;
        } else if (line.match(/^setID\s+as\s+/i)) {
              // Associates the last created instruction with an ID
              const idMatch = line.match(/setID\s+as\s+"([^"]+)"/i);
              if (idMatch && this.lastCreatedAgentInstruction) {
                  this.agents[idMatch[1]] = this.lastCreatedAgentInstruction;
                  this.flowState.logAction(`Agent Registered: ${idMatch[1]}`);
              } else {
                  throw new Error("setID called without a preceding createAI command.");
              }
              i++;
        } else if (line.match(/^flow\s+expand/i)) {
             // Just a declaration, skip
             i++;
        } else {
             // Unknown text line or partial content. Ignore to be safe.
             i++; 
        }
      }
    }
  }

  // Helper to handle multi-line function calls like execute(...)
  private extractMultilineArgs(lines: string[], startIndex: number): { content: string, nextIndex: number } {
      let line = lines[startIndex];
      // let openParenIndex = line.indexOf('(');
      let currentIndex = startIndex;

      let buffer = line;
      let openCount = (line.match(/\(/g) || []).length;
      let closeCount = (line.match(/\)/g) || []).length;

      while (closeCount < openCount && currentIndex < lines.length - 1) {
          currentIndex++;
          const nextLine = lines[currentIndex];
          buffer += '\n' + nextLine;
          openCount += (nextLine.match(/\(/g) || []).length;
          closeCount += (nextLine.match(/\)/g) || []).length;
      }

      // Extract content between first ( and last )
      const fullContent = buffer;
      const firstParen = fullContent.indexOf('(');
      const lastParen = fullContent.lastIndexOf(')');
      
      return {
          content: fullContent.substring(firstParen + 1, lastParen),
          nextIndex: currentIndex + 1
      };
  }

  private async runCommand(cmd: string, args: string[], context: any) {
    // args[0] is usually the entire block inside the parentheses
    const rawArgs = args[0] || '';
    const resolve = (val: string) => this.resolveVariables(val, context);

    try {
        switch (cmd) {
        case 'log':
             const logContent = this.stripQuotes(rawArgs);
            this.flowState.logAction(resolve(logContent));
            break;
        
        case 'createNote':
            const params = this.parseNamedParams(rawArgs);
            if (!params['title']) throw new Error("createNote missing 'title'. Usage: createNote(title=\"...\", content=\"...\")");
            this.flowState.addNote(resolve(params['title']), resolve(params['content'] || ''));
            break;

        case 'getNote':
            const noteTitle = resolve(this.stripQuotes(rawArgs));
            const noteContent = this.flowState.getNoteContent(noteTitle);
            if (noteContent === null) throw new Error(`Note not found: "${noteTitle}"`);
            this.lastResult = noteContent;
            break;

        case 'updateNote':
            const upParams = this.parseNamedParams(rawArgs);
            const upTitle = resolve(upParams['title']); 
            const upContent = resolve(upParams['content']);
            
            if(!upTitle || !upContent) throw new Error("updateNote requires 'title' and 'content'");
            const updated = this.flowState.updateNoteContent(upTitle, upContent);
            if (!updated) throw new Error(`Cannot update note. Note not found: "${upTitle}"`);
            break;

        case 'deleteNote':
            const delTitle = resolve(this.stripQuotes(rawArgs));
            const deleted = this.flowState.deleteNoteByTitle(delTitle);
            if (!deleted) throw new Error(`Cannot delete note. Note not found: "${delTitle}"`);
            break;
            
        case 'updatePlan':
            const planParams = this.parseNamedParams(rawArgs);
            const task = resolve(planParams['task']);
            const status = resolve(planParams['status']);
            if(!task || !status) throw new Error("updatePlan requires 'task' and 'status'");
            
            const planUpdated = this.flowState.updatePlanStatus(task, status);
            if(!planUpdated) throw new Error(`Task not found in plan: "${task}"`);
            break;

        case 'execute':
            await this.ensurePyodide();

            // Setup the fs module in Python to bridge to JS
            await this.pyodide.runPythonAsync(`
import js
class FlowScriptInterface:
    def get_input(self, key):
        return js.getFlowScriptInput(key)
    def set_output(self, key, value):
        js.setFlowScriptOutput(key, value)
    # Alias for convenience
    def set_var(self, key, value):
        self.set_output(key, value)
fs = FlowScriptInterface()
            `);

            // CLEANUP: The user might provide arguments like `execute( ...code... , inputs=["x"])`
            // We need to strip anything after the code block that looks like flowscript metadata args
            // to prevent Python syntax errors.
            let cleanPyCode = rawArgs;
            // Pattern: Separated by comma, optional whitespace, 'inputs' or 'outputs' equals something
            // We split by the LAST occurrence of `, inputs=` if it exists, roughly.
            if (cleanPyCode.includes(', inputs=')) {
                cleanPyCode = cleanPyCode.split(', inputs=')[0];
            } else if (cleanPyCode.includes(',inputs=')) {
                cleanPyCode = cleanPyCode.split(',inputs=')[0];
            }
            
            // Also resolve variables if they are used directly in code (legacy support)
            const pyCode = resolve(cleanPyCode);
            
            // AUTOMATIC WRAPPING:
            // Ensure proper indentation for the wrapped function
            const lines = pyCode.split('\n');
            const indented = lines.map(l => '    ' + l).join('\n');
            const wrapped = `
async def main():
${indented}

await main()
`;
            try {
                await this.pyodide.loadPackagesFromImports(wrapped);
                this.lastResult = await this.pyodide.runPythonAsync(wrapped);
            } catch (e: any) {
                let msg = e.message || String(e);
                if(msg.includes('PythonError:')) {
                   msg = msg.split('PythonError:')[1].trim();
                }
                throw new Error(`Python Logic Error:\n${msg}`);
            }
            break;

        case 'createAI':
            // Stores the instruction for the NEXT setID command
            const instruction = resolve(this.stripQuotes(rawArgs));
            this.lastCreatedAgentInstruction = instruction;
            break;

        case 'runAI':
            const aiParams = this.parseNamedParams(rawArgs);
            // Support simple syntax: runAI("Prompt") or runAI(prompt="Prompt")
            let prompt = aiParams['prompt'];
            if (!prompt) {
                // Positional argument fallback
                prompt = this.stripQuotes(rawArgs.trim());
            }
            
            if (!prompt) throw new Error("runAI requires a prompt.");
            
            const aiResp = await this.flowState.generateRawResponse(resolve(prompt));
            if (aiResp.startsWith("Error")) throw new Error(`AI Generation Error: ${aiResp}`);
            this.lastResult = aiResp;
            break;

        case 'runAI_Agent':
            // usage: runAI as ID("Prompt")
            const agentId = args[0];
            let agentPrompt = resolve(this.stripQuotes(args[1])); 

            const agentInstruction = this.agents[agentId];
            if (!agentInstruction) throw new Error(`Agent '${agentId}' not defined. Use createAI then setID.`);
            
            this.flowState.logAction(`Agent ${agentId} is thinking...`);
            const agentResp = await this.flowState.generateRawResponse(agentPrompt, agentInstruction);
            
            if (agentResp.startsWith("Error")) throw new Error(`Agent '${agentId}' Failed: ${agentResp}`);
            this.lastResult = agentResp;
            break;
        
        case 'saveFile':
            const fileParams = this.parseNamedParams(rawArgs);
            const name = resolve(fileParams['name']);
            const url = resolve(fileParams['url']);
            if(!name || !url) throw new Error("saveFile requires 'name' and 'url'");
            
            this.flowState.addFile({ name, url, type: 'binary' });
            this.lastResult = "File Saved";
            break;

        case 'deleteFile':
            const delName = resolve(this.stripQuotes(rawArgs));
            this.flowState.deleteFile(delName);
            this.lastResult = "File Deleted";
            break;
        
        case 'getFile':
            const getName = resolve(this.stripQuotes(rawArgs));
            const file = this.flowState.getFile(getName);
            if (!file) throw new Error(`File '${getName}' not found.`);
            this.lastResult = file.url;
            break;
        
        case 'changeMusic':
            const musicParams = this.parseNamedParams(rawArgs);
            const mood = resolve(musicParams['mood'] || 'calm');
            let trackId = 'MUSIC_SILENCE';
            if (mood.includes('focus')) trackId = 'MUSIC_MOOG';
            if (mood.includes('sad')) trackId = 'MUSIC_FALLING';
            if (mood.includes('energetic')) trackId = 'MUSIC_TELL';
            if (mood.includes('calm')) trackId = 'REUNITED';
            if (mood.includes('romantic')) trackId = 'MUSIC_TELL';
            if (mood.includes('creative')) trackId = 'MUSIC_MOOG';
            this.flowState.playMusic(trackId);
            break;
        
        default:
             throw new Error(`Unknown Command: ${cmd}`);
        }
    } catch(e) {
        throw e;
    }
  }

  private async ensurePyodide() {
    if (this.pyodide) return;
    if (typeof loadPyodide === 'undefined') throw new Error("Python engine not loaded. Check internet connection.");
    
    this.flowState.logAction('Booting Python Engine...');
    try {
        this.pyodide = await loadPyodide();
    } catch(e: any) {
        throw new Error(`Failed to load Python Engine: ${e.message}`);
    }
  }

  private resolveVariables(text: string, context: any): string {
    if (!text) return '';
    
    // Replace [var] with value.
    // Handle nested dot notation: [meta.title]
    return text.replace(/\[([\w\.]+)\]/g, (match, path) => {
      const parts = path.split('.');
      let val = context[parts[0]];
      
      // If the variable itself is a JSON string, try to parse it to access props
      if (typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) {
         try { val = JSON.parse(val); } catch(e) {}
      }

      for (let i = 1; i < parts.length; i++) {
        if (val === undefined || val === null) break;
        val = val[parts[i]];
      }
      return val !== undefined ? String(val) : match;
    });
  }

  // Robust argument parser for key="value" or key="""value"""
  private parseNamedParams(str: string): Record<string, string> {
    const result: Record<string, string> = {};
    let remaining = str;

    // 1. Match Triple Quoted Strings: key="""value"""
    const tripleQuoteRegex = /(\w+)\s*=\s*"""([\s\S]*?)"""/g;
    let match;
    while ((match = tripleQuoteRegex.exec(str)) !== null) {
        result[match[1]] = match[2];
        remaining = remaining.replace(match[0], '');
    }

    // 2. Match Single Quoted Strings: key="value"
    // Note: This regex needs to be careful not to match inside triple quotes if possible,
    // but typically users use one or the other.
    const singleQuoteRegex = /(\w+)\s*=\s*"([^"]*)"/g;
    while ((match = singleQuoteRegex.exec(str)) !== null) {
        if (!result[match[1]]) { // Don't overwrite triple quotes which are more specific
            result[match[1]] = match[2];
        }
    }

    return result;
  }

  private stripQuotes(str: string): string {
      const s = str.trim();
      if (s.startsWith('"""') && s.endsWith('"""')) return s.slice(3, -3);
      if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
      return s;
  }
}