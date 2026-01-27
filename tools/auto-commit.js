
const fs = require('fs');
const { exec } = require('child_process');

// Configuration
const WATCH_DIR = './src';
const DEBOUNCE_MS = 3000;

console.log(`
╔════════════════════════════════════════╗
║    FLOWSTATE AUTO-COMMIT SYSTEM        ║
║    Watching: ${WATCH_DIR}                   ║
╚════════════════════════════════════════╝
`);

let debounceTimer;

function runGitCommand() {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const commitMsg = `AI Update: ${timestamp}`;
    
    // Command chain: Add -> Commit -> Push
    const command = `git add . && git commit -m "${commitMsg}" && git push`;

    console.log(`\n🔄 Syncing changes... [${timestamp}]`);

    exec(command, (error, stdout, stderr) => {
        if (error) {
            // Ignore "nothing to commit" errors
            if (stdout.includes('nothing to commit')) {
                console.log("─ No changes to commit.");
            } else {
                console.error(`❌ Error: ${error.message}`);
            }
            return;
        }
        if (stdout) console.log(`─ ${stdout.trim()}`);
        if (stderr) console.error(`─ ${stderr.trim()}`);
        console.log("✅ GitHub Sync Complete.\n");
    });
}

try {
    fs.watch(WATCH_DIR, { recursive: true }, (eventType, filename) => {
        if (filename) {
            // Ignore hidden files or generated noise if any
            if (filename.startsWith('.')) return;
            
            console.log(`📝 File modified: ${filename}`);
            
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(runGitCommand, DEBOUNCE_MS);
        }
    });
    console.log("👀 Watching for file changes...");
} catch (e) {
    console.error("Failed to start watcher:", e);
}
