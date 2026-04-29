# Daemon Implementation Plan

**Status**: Ready for Implementation  
**Created**: 2025-01-11  
**Estimated Effort**: 2-3 hours

---

## Problem Statement

Current FileWatcher in MCP server:
- Only runs when Cline is open
- Uses old single-embedding indexing (not observation-level chunking)
- No Docling, no image OCR
- 100ms debounce (triggers 300+ times during 30s of typing)

**User Need**: Edit files in Obsidian → automatically indexed → searchable via MCP, even when Cline is closed.

---

## Solution Architecture

### System Overview

```
┌─────────────────────────────────────────────────┐
│           Obsidian (Always Running)             │
└────────────┬────────────────────────────────────┘
             │ (saves files on every keystroke)
             ▼
┌─────────────────────────────────────────────────┐
│   Standalone Watcher Daemon (macOS launchd)     │
│   - Watches vault directories 24/7              │
│   - 1-minute smart debouncing (typing settled)  │
│   - Uses shared indexing pipeline               │
│   - Observation-level chunking                  │
│   - Docling HybridChunker                       │
│   - Image OCR with inline injection             │
│   - ~100MB RAM footprint                        │
│   - Logs to /tmp/obsidian-indexer.log           │
└────────────┬────────────────────────────────────┘
             │ (indexes changes)
             ▼
┌─────────────────────────────────────────────────┐
│        PostgreSQL + Vector Storage              │
│        (Always up-to-date)                      │
└────────────┬────────────────────────────────────┘
             │ (searches when needed)
             ▼
┌─────────────────────────────────────────────────┐
│    Memory MCP Server (Only when Cline open)     │
│    - Provides search_nodes + other tools        │
│    - No file watching (daemon handles it)       │
│    - Logs to /tmp/obsidian-mcp.log              │
└─────────────────────────────────────────────────┘
```

### Key Improvements

1. **Shared Indexing Pipeline**: Both daemon and batch indexer use same logic
2. **Smart Debouncing**: 60-second timer resets on each save (typing settled detection)
3. **Comprehensive Logging**: Rotating logs at 1MB, 5 files max
4. **Always Running**: Independent of Cline/MCP connection status

---

## Implementation Checklist

### Phase 1: Shared Indexing Pipeline (30 min)

- [ ] Create `utils/indexingPipeline.ts`
  - [ ] Extract `indexFile()` from `scripts/index.ts`
  - [ ] Extract `buildFileMap()` helper
  - [ ] Extract `getAllMarkdownFiles()` helper
  - [ ] Add proper error handling
- [ ] Update `scripts/index.ts` to use shared pipeline
- [ ] Test: Verify batch indexing still works

### Phase 2: Rotating Logger (20 min)

- [ ] Install dependencies: `npm install winston winston-daily-rotate-file`
- [ ] Create `utils/logger.ts`
  - [ ] `createLogger()` function with rotation config
  - [ ] Export `daemonLogger` for daemon
  - [ ] Export `mcpLogger` for MCP server
  - [ ] Configure 1MB rotation, 5 files max
- [ ] Test: Create test logs, verify rotation

### Phase 3: Enhanced FileWatcher (20 min)

- [ ] Update `watcher/FileWatcher.ts`
  - [ ] Import shared `indexFile()` from pipeline
  - [ ] Import `daemonLogger` from logger
  - [ ] Change `debounceMs` from 100 to 60000 (1 minute)
  - [ ] Replace `indexFile()` method with shared pipeline call
  - [ ] Add comprehensive logging (see Logging Points section)
  - [ ] Make debounce configurable via env var
- [ ] Test: Verify timer resets on rapid changes

### Phase 4: Standalone Daemon (20 min)

- [ ] Create `standalone-watcher.ts`
  - [ ] Import FileWatcher and VectorStorage
  - [ ] Import daemonLogger
  - [ ] Initialize both vault watchers
  - [ ] Add graceful shutdown handlers
  - [ ] Add startup logging
- [ ] Update `package.json`:
  - [ ] Add build script for standalone-watcher
- [ ] Update `tsconfig.json` if needed
- [ ] Build: `npm run build`
- [ ] Test: Run manually, verify watching works

### Phase 5: launchd Service (15 min)

- [ ] Create `launchd/` directory
- [ ] Create `launchd/com.sibagy.obsidian-indexer.plist`
  - [ ] Configure paths (node, standalone-watcher.js)
  - [ ] Add environment variables
  - [ ] Configure log paths
  - [ ] Set RunAtLoad and KeepAlive
- [ ] Validate XML syntax

### Phase 6: Installation Scripts (20 min)

- [ ] Create `scripts/install-daemon.sh`
  - [ ] Build TypeScript
  - [ ] Copy plist to ~/Library/LaunchAgents
  - [ ] Load service with launchctl
  - [ ] Display status and log paths
- [ ] Create `scripts/uninstall-daemon.sh`
  - [ ] Unload service
  - [ ] Remove plist
- [ ] Create `scripts/restart-daemon.sh`
  - [ ] Unload and reload service
- [ ] Make scripts executable: `chmod +x scripts/*.sh`

### Phase 7: Add Logging Throughout (30 min)

- [ ] Add logging to `utils/indexingPipeline.ts` (see Logging Points)
- [ ] Add logging to `standalone-watcher.ts` (see Logging Points)
- [ ] Add logging to `index.ts` (MCP server) (see Logging Points)
- [ ] Update FileWatcher logging (already done in Phase 3)

### Phase 8: Testing (20 min)

- [ ] Install daemon: `./scripts/install-daemon.sh`
- [ ] Verify running: `launchctl list | grep obsidian-indexer`
- [ ] Watch logs: `tail -f /tmp/obsidian-indexer.log`
- [ ] Edit test file in Obsidian with unique words
- [ ] Wait 1 minute, verify indexing in logs
- [ ] Search via MCP, verify results
- [ ] Test log rotation (generate >1MB logs)
- [ ] Test restart: `./scripts/restart-daemon.sh`
- [ ] Test uninstall: `./scripts/uninstall-daemon.sh`

---

## File Structure

```
ai/memory/obsidian-memory-mcp/
├── standalone-watcher.ts        (NEW - daemon entry point)
├── launchd/                     (NEW - macOS service config)
│   └── com.sibagy.obsidian-indexer.plist
├── scripts/
│   ├── install-daemon.sh        (NEW)
│   ├── uninstall-daemon.sh      (NEW)
│   ├── restart-daemon.sh        (NEW)
│   └── index.ts                 (UPDATE - use shared pipeline)
├── utils/
│   ├── indexingPipeline.ts      (NEW - shared indexing logic)
│   ├── logger.ts                (NEW - rotating logs)
│   ├── chunker.ts               (existing)
│   ├── doclingChunker.ts        (existing)
│   └── markdownUtils.ts         (existing)
└── watcher/
    └── FileWatcher.ts           (UPDATE - 60s debounce + pipeline)
```

---

## Code Specifications

### 1. utils/logger.ts

```typescript
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

export function createLogger(
  name: string,
  logFilePath: string
): winston.Logger {
  
  const fileTransport = new DailyRotateFile({
    filename: logFilePath,
    maxSize: '1m',      // 1MB per file
    maxFiles: 5,        // Keep 5 files max
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length > 0 
          ? ' ' + JSON.stringify(meta) 
          : '';
        return `[${timestamp}] ${level.toUpperCase().padEnd(7)} | ${message}${metaStr}`;
      })
    )
  });
  
  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    transports: [fileTransport]
  });
}

// Pre-configured loggers
export const daemonLogger = createLogger(
  'daemon',
  process.env.DAEMON_LOG_FILE || '/tmp/obsidian-indexer.log'
);

export const mcpLogger = createLogger(
  'mcp',
  process.env.MCP_LOG_FILE || '/tmp/obsidian-mcp.log'
);
```

### 2. utils/indexingPipeline.ts

```typescript
/**
 * Shared indexing pipeline used by:
 * - Batch indexer (scripts/index.ts)
 * - Daemon watcher (standalone-watcher.ts)
 */

import { VectorStorage } from '../storage/VectorStorage.js';
import { parseMarkdown } from './markdownUtils.js';
import { getEntityNameFromPath } from './pathUtils.js';
import { chunkWithDocling, chunkImageWithDocling } from './doclingChunker.js';
import { daemonLogger as logger } from './logger.js';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

export async function indexFile(
  vectorStorage: VectorStorage,
  filePath: string,
  indexingRoot: string
): Promise<boolean> {
  const startTime = Date.now();
  
  try {
    logger.debug('Indexing file: ' + path.basename(filePath));
    
    // Build image map fresh each run
    logger.debug('Building file map...');
    const imageMap = await buildFileMap(indexingRoot);
    logger.debug('Mapped ' + imageMap.size + ' non-markdown files');
    
    // Read and parse
    const content = await fs.readFile(filePath, 'utf-8');
    const entityName = getEntityNameFromPath(filePath);
    
    if (!entityName) {
      logger.error('Could not extract entity name from: ' + filePath);
      return false;
    }
    
    const parsed = parseMarkdown(content, entityName);
    const isMemoryEntity = filePath.includes('/memory/');
    
    if (isMemoryEntity) {
      // MEMORY ENTITY: Observation-level + Relation-level chunking
      logger.info('Memory entity detected: ' + entityName, {
        observations: parsed.observations.length,
        relations: parsed.relations.length
      });
      
      let chunkIndex = 0;
      const totalChunks = parsed.observations.length + parsed.relations.length;
      
      if (totalChunks === 0) {
        logger.warn('No observations or relations: ' + filePath);
        return false;
      }
      
      // Chunk each observation
      for (const obs of parsed.observations) {
        const chunkContent = `${entityName} (${parsed.metadata.entityType || 'unknown'}): ${obs}`;
        await vectorStorage.storeChunk(
          entityName, filePath, chunkContent,
          chunkIndex++, totalChunks,
          parsed.metadata.entityType || 'unknown',
          []
        );
      }
      
      // Chunk each relation with category
      for (const relation of parsed.relations) {
        const category = relation.category || 'uncategorized';
        const chunkContent = `${entityName} ${relation.relationType} ${relation.to} (${category})`;
        await vectorStorage.storeChunk(
          entityName, filePath, chunkContent,
          chunkIndex++, totalChunks,
          'relation',
          [category]
        );
      }
      
      logger.info('✓ Indexed memory entity: ' + entityName, {
        chunks: totalChunks,
        elapsed: (Date.now() - startTime) + 'ms'
      });
      
    } else {
      // VAULT NOTE: Docling HybridChunker with image OCR
      logger.info('Vault note detected: ' + entityName);
      
      try {
        // STEP 1: Process images with OCR
        let processedContent = content;
        const standardMatches = [...content.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)];
        const wikiMatches = [...content.matchAll(/!\[\[([^\]]+)\]\]/g)];
        
        interface ImageMatch {
          fullMatch: string;
          imagePath: string;
          matchIndex: number;
        }
        
        const allMatches: ImageMatch[] = [
          ...standardMatches.map(m => ({
            fullMatch: m[0],
            imagePath: m[2],
            matchIndex: m.index!
          })),
          ...wikiMatches.map(m => ({
            fullMatch: m[0],
            imagePath: m[1],
            matchIndex: m.index!
          }))
        ].sort((a, b) => b.matchIndex - a.matchIndex);
        
        if (allMatches.length > 0) {
          logger.info('Found ' + allMatches.length + ' images in ' + path.basename(filePath));
          
          for (const imageMatch of allMatches) {
            const { fullMatch, imagePath, matchIndex } = imageMatch;
            
            if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
              continue;
            }
            
            let imageName = path.basename(imagePath).split('|')[0];
            const absoluteImagePath = imageMap.get(imageName);
            
            if (!absoluteImagePath) {
              logger.warn('Image not found: ' + imageName);
              continue;
            }
            
            logger.debug('OCR image: ' + imageName);
            
            try {
              const imageChunks = await chunkImageWithDocling(absoluteImagePath, 512);
              
              if (imageChunks.length > 0) {
                const ocrText = imageChunks.map(chunk => chunk.content).join(' ');
                const replacement = `\n[Image OCR: ${ocrText}]\n`;
                
                processedContent = 
                  processedContent.slice(0, matchIndex) + 
                  replacement + 
                  processedContent.slice(matchIndex + fullMatch.length);
                
                logger.debug('✓ OCR complete: ' + imageName);
              }
            } catch (imageError) {
              logger.error('OCR failed for ' + imagePath, { error: imageError });
            }
          }
        }
        
        // STEP 2: Write processed content to temp file
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'docling-'));
        const tmpFile = path.join(tmpDir, path.basename(filePath));
        await fs.writeFile(tmpFile, processedContent, 'utf-8');
        
        try {
          // STEP 3: Chunk with Docling
          logger.debug('Chunking with Docling...');
          const doclingChunks = await chunkWithDocling(tmpFile, 512);
          
          if (doclingChunks.length === 0) {
            logger.warn('No chunks generated: ' + filePath);
            return false;
          }
          
          logger.debug('Created ' + doclingChunks.length + ' chunks');
          
          // Build breadcrumb context
          let currentDir = path.dirname(filePath);
          let vaultRoot: string | null = null;
          
          for (let j = 0; j < 10; j++) {
            try {
              await fs.access(path.join(currentDir, '.obsidian'));
              vaultRoot = currentDir;
              break;
            } catch {}
            const parentDir = path.dirname(currentDir);
            if (parentDir === currentDir) break;
            currentDir = parentDir;
          }
          
          let breadcrumb = '';
          if (vaultRoot) {
            const vaultName = path.basename(vaultRoot);
            const relativePath = path.relative(vaultRoot, filePath);
            const pathWithoutExt = relativePath.replace(/\.md$/, '');
            breadcrumb = `${vaultName}/${pathWithoutExt}: `;
          } else {
            const rootFolderName = path.basename(indexingRoot);
            const relativePath = path.relative(indexingRoot, filePath);
            const pathWithoutExt = relativePath.replace(/\.md$/, '');
            breadcrumb = `${rootFolderName}/${pathWithoutExt}: `;
          }
          
          // Store chunks
          for (let i = 0; i < doclingChunks.length; i++) {
            const contentWithContext = `${breadcrumb}${doclingChunks[i].content}`;
            await vectorStorage.storeChunk(
              entityName, filePath, contentWithContext,
              i, doclingChunks.length,
              'document',
              []
            );
          }
          
          logger.info('✓ Indexed vault note: ' + entityName, {
            chunks: doclingChunks.length,
            elapsed: (Date.now() - startTime) + 'ms'
          });
          
        } finally {
          await fs.rm(tmpDir, { recursive: true, force: true });
        }
        
      } catch (error) {
        logger.error('Docling failed for ' + filePath + ', skipping', { error });
        return false;
      }
    }
    
    return true;
    
  } catch (error) {
    logger.error('Failed to index ' + filePath, { error: error.message });
    return false;
  }
}

export async function buildFileMap(rootDir: string): Promise<Map<string, string>> {
  const fileMap = new Map<string, string>();
  
  async function scan(dir: string) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'venv') {
          continue;
        }
        
        if (entry.isDirectory()) {
          await scan(fullPath);
        } else if (entry.isFile() && !entry.name.endsWith('.md')) {
          fileMap.set(entry.name, fullPath);
        }
      }
    } catch (error) {
      // Silently skip inaccessible directories
    }
  }
  
  await scan(rootDir);
  return fileMap;
}

export async function getAllMarkdownFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  
  async function scan(currentDir: string) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      if (entry.name.startsWith('.') || 
          entry.name === 'node_modules' || 
          entry.name === 'venv' ||
          entry.name === '.git') {
        continue;
      }
      
      if (entry.isDirectory()) {
        await scan(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  }
  
  await scan(dir);
  return files;
}
```

### 3. standalone-watcher.ts

```typescript
#!/usr/bin/env node
/**
 * Standalone daemon that watches Obsidian vaults for changes
 * and keeps the vector database synchronized.
 * 
 * Runs independently of MCP server.
 * Installed as macOS launchd service.
 */

import { FileWatcher } from './watcher/FileWatcher.js';
import { VectorStorage } from './storage/VectorStorage.js';
import { daemonLogger as logger } from './utils/logger.js';

async function main() {
  logger.info('='.repeat(60));
  logger.info('Obsidian Indexer Daemon Starting');
  logger.info('='.repeat(60));
  
  const vectorStorage = new VectorStorage();
  const watcher = new FileWatcher(vectorStorage);
  
  // Get vault paths from environment
  const vaultWork = process.env.VAULT_WORK || '/Users/sibagy/fileZ/obsidian/vault';
  const vaultPersonal = process.env.VAULT_PERSONAL || '/Users/sibagy/fileZ/obsidian/pessoAll';
  const debounceMs = parseInt(process.env.FILE_WATCH_DEBOUNCE_MS || '60000');
  
  logger.info('Configuration:');
  logger.info('  Vault (Work): ' + vaultWork);
  logger.info('  Vault (Personal): ' + vaultPersonal);
  logger.info('  Debounce: ' + (debounceMs / 1000) + ' seconds');
  logger.info('  Database: ' + (process.env.DATABASE_URL || 'default'));
  logger.info('  Log Level: ' + (process.env.LOG_LEVEL || 'info'));
  
  try {
    // Start watching
    await watcher.watch(vaultWork);
    await watcher.watch(vaultPersonal);
    
    logger.info('='.repeat(60));
    logger.info('✓ Daemon Ready - Watching for changes');
    logger.info('='.repeat(60));
    
  } catch (error) {
    logger.error('Failed to start daemon', { error: error.message });
    process.exit(1);
  }
  
  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutdown signal received');
    logger.info('Closing watchers...');
    await watcher.close();
    logger.info('Closing database connection...');
    await vectorStorage.close();
    logger.info('✓ Daemon stopped');
    process.exit(0);
  };
  
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  
  // Keep process alive
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  });
  
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason });
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
```

### 4. watcher/FileWatcher.ts Updates

```typescript
import { daemonLogger as logger } from '../utils/logger.js';
import { indexFile } from '../utils/indexingPipeline.js';

export class FileWatcher {
  private debounceMs: number = parseInt(process.env.FILE_WATCH_DEBOUNCE_MS || '60000');
  
  watch(vaultPath: string): void {
    logger.info('Starting watch: ' + vaultPath);
    
    const watcher = chokidar.watch(vaultPath, {
      ignored: [/(^|[\/\\])\../, /node_modules/, /venv/, /\.git/],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50
      }
    });
    
    watcher
      .on('add', (path) => {
        logger.debug('File added: ' + path);
        this.handleAdd(path);
      })
      .on('change', (path) => {
        logger.debug('File changed: ' + path);
        this.handleChange(path);
      })
      .on('unlink', (path) => {
        logger.warn('File deleted: ' + path);
        this.handleDelete(path);
      })
      .on('ready', () => {
        logger.info('✓ Watching: ' + vaultPath);
      })
      .on('error', (error) => {
        logger.error('Watcher error', { error: error.message });
      });
    
    this.watchers.set(vaultPath, watcher);
  }
  
  private async handleChange(filePath: string): Promise<void> {
    if (!filePath.endsWith('.md')) return;
    
    const existing = this.pendingUpdates.get(filePath);
    if (existing) {
      clearTimeout(existing);
      logger.debug('Timer reset: ' + path.basename(filePath) + ' (60s)');
    } else {
      logger.debug('Timer started: ' + path.basename(filePath) + ' (60s)');
    }
    
    const timeout = setTimeout(async () => {
      logger.info('Typing settled: ' + path.basename(filePath));
      
      const vaultRoot = this.getVaultRoot(filePath);
      const success = await indexFile(this.vectorStorage, filePath, vaultRoot);
      
      if (success) {
        logger.info('✓ Re-indexed: ' + path.basename(filePath));
      } else {
        logger.error('✗ Failed to re-index: ' + path.basename(filePath));
      }
      
      this.pendingUpdates.delete(filePath);
    }, this.debounceMs);
    
    this.pendingUpdates.set(filePath, timeout);
  }
  
  private getVaultRoot(filePath: string): string {
    // Find vault root by looking for parent containing the file
    for (const [vaultPath] of this.watchers) {
      if (filePath.startsWith(vaultPath)) {
        return vaultPath;
      }
    }
    return path.dirname(filePath);
  }
}
```

### 5. launchd/com.sibagy.obsidian-indexer.plist

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.sibagy.obsidian-indexer</string>
    
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/Users/sibagy/fileZ/projZ/SIbagyPersonal/ai/memory/obsidian-memory-mcp/dist/standalone-watcher.js</string>
    </array>
    
    <key>EnvironmentVariables</key>
    <dict>
        <key>DATABASE_URL</key>
        <string>postgresql://localhost:5432/obsidian_memory</string>
        <key>VAULT_WORK</key>
        <string>/Users/sibagy/fileZ/obsidian/vault</string>
        <key>VAULT_PERSONAL</key>
        <string>/Users/sibagy/fileZ/obsidian/pessoAll</string>
        <key>FILE_WATCH_DEBOUNCE_MS</key>
        <string>60000</string>
        <key>LOG_LEVEL</key>
        <string>info</string>
        <key>DAEMON_LOG_FILE</key>
        <string>/tmp/obsidian-indexer.log</string>
    </dict>
    
    <key>RunAtLoad</key>
    <true/>
    
    <key>KeepAlive</key>
    <true/>
    
    <key>StandardOutPath</key>
    <string>/tmp/obsidian-indexer.log</string>
    
    <key>StandardErrorPath</key>
    <string>/tmp/obsidian-indexer.error.log</string>
    
    <key>WorkingDirectory</key>
    <string>/Users/sibagy/fileZ/projZ/SIbagyPersonal/ai/memory/obsidian-memory-mcp</string>
</dict>
</plist>
```

### 6. scripts/install-daemon.sh

```bash
#!/bin/bash
set -e

PROJECT_DIR="/Users/sibagy/fileZ/projZ/SIbagyPersonal/ai/memory/obsidian-memory-mcp"
PLIST_SOURCE="$PROJECT_DIR/launchd/com.sibagy.obsidian-indexer.plist"
PLIST_TARGET="$HOME/Library/LaunchAgents/com.sibagy.obsidian-indexer.plist"

echo "=================================================="
echo "  Obsidian Indexer Daemon - Installation"
echo "=================================================="
echo ""

# Build TypeScript
echo "1. Building TypeScript..."
cd "$PROJECT_DIR"
npm run build
echo "   ✓ Build complete"
echo ""

# Copy plist
echo "2. Installing launchd service..."
mkdir -p "$HOME/Library/LaunchAgents"
cp "$PLIST_SOURCE" "$PLIST_TARGET"
echo "   ✓ Plist installed: $PLIST_TARGET"
echo ""

# Unload existing (if any)
echo "3. Loading service..."
launchctl unload "$PLIST_TARGET" 2>/dev/null || true
launchctl load "$PLIST_TARGET"
echo "   ✓ Service loaded"
echo ""

# Wait a moment for service to start
sleep 2

# Check status
echo "4. Verifying service..."
if launchctl list | grep -q "com.sibagy.obsidian-indexer"; then
    echo "   ✓ Service running"
else
    echo "   ✗ Service not running - check error log"
fi
echo ""

echo "=================================================="
echo "  Installation Complete"
echo "=================================================="
echo ""
echo "Service Name: com.sibagy.obsidian-indexer"
echo ""
echo "Commands:"
echo "  Status:  launchctl list | grep obsidian-indexer"
echo "  Logs:    tail -f /tmp/obsidian-indexer.log"
echo "  Errors:  tail -f /tmp/obsidian-indexer.error.log"
echo "  Restart: ./scripts/restart-daemon.sh"
echo "  Remove:  ./scripts/uninstall-daemon.sh"
echo ""
echo "The daemon is now watching your vaults for changes."
echo "Edits will be indexed 60 seconds after typing stops."
echo ""
```

### 7. scripts/uninstall-daemon.sh

```bash
#!/bin/bash
PLIST="$HOME/Library/LaunchAgents/com.sibagy.obsidian
