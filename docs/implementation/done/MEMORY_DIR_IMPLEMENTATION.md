# MEMORY_DIR Implementation Plan

> Feature #17 from ROADMAP.md - Flexible memory entity location

**Status**: Ready for Implementation  
**Priority**: P0  
**Effort**: M (8-12 hours)  
**Created**: 2025-01-13

---

## Problem Statement

Currently, memory entities MUST be located inside Obsidian vaults:
- Hard-coded path detection: `filePath.includes('/memory/')`
- MCP writes entities to `MEMORY_DIR` which must be under a vault
- Cannot support standalone memory directories outside vaults

**User need:** Store memory entities in separate location (e.g., `/separate/memory/`) while still indexing vault notes normally.

---

## Solution Design

### Core Abstraction

**Single concept: MEMORY_ROOT**

```typescript
// Order of precedence:
const MEMORY_ROOT = 
  process.env.MEMORY_DIR ||                    // Explicit override
  path.join(VAULT_PERSONAL, 'memory') ||      // Default in personal vault (user's memory)
  path.join(VAULT_WORK, 'memory');            // Fallback to work vault
```

### Environment Variables

```bash
# NEW - Optional override for memory entity location
MEMORY_DIR=/custom/path/to/memory

# EXISTING - Vault locations
VAULT_WORK=/path/to/work/vault
VAULT_PERSONAL=/path/to/personal/vault
```

### Detection Logic

**Before (hard-coded):**
```typescript
const isMemoryEntity = filePath.includes('/memory/');
```

**After (abstracted):**
```typescript
const MEMORY_ROOT = getMemoryRoot();
const isMemoryEntity = filePath.startsWith(MEMORY_ROOT);
```

---

## Implementation Steps

### Step 1: Add Memory Root Utility (2h)

**New file:** `ai/memory/obsidian-memory-mcp/utils/memoryRoot.ts`

```typescript
import path from 'path';

/**
 * Get the root directory for memory entities
 * 
 * Priority:
 * 1. MEMORY_DIR env var (explicit override)
 * 2. VAULT_WORK/memory (default)
 * 3. VAULT_PERSONAL/memory (fallback)
 * 
 * @returns Absolute path to memory root directory
 */
export function getMemoryRoot(): string {
  const memoryDir = process.env.MEMORY_DIR;
  
  if (memoryDir) {
    return path.resolve(memoryDir);
  }
  
  const vaultWork = process.env.VAULT_WORK;
  if (vaultWork) {
    return path.join(vaultWork, 'memory');
  }
  
  const vaultPersonal = process.env.VAULT_PERSONAL;
  if (vaultPersonal) {
    return path.join(vaultPersonal, 'memory');
  }
  
  throw new Error('No memory root configured: set MEMORY_DIR, VAULT_WORK, or VAULT_PERSONAL');
}

/**
 * Check if a path is inside a vault directory
 * 
 * @param filePath Path to check
 * @returns True if path is under VAULT_WORK or VAULT_PERSONAL
 */
export function isInsideVault(filePath: string): boolean {
  const vaultWork = process.env.VAULT_WORK;
  const vaultPersonal = process.env.VAULT_PERSONAL;
  
  return (
    (vaultWork && filePath.startsWith(path.resolve(vaultWork))) ||
    (vaultPersonal && filePath.startsWith(path.resolve(vaultPersonal)))
  );
}

/**
 * Check if memory root is inside a vault
 * 
 * @returns True if MEMORY_ROOT is under a vault
 */
export function isMemoryInsideVault(): boolean {
  const memoryRoot = getMemoryRoot();
  return isInsideVault(memoryRoot);
}
```

**Tests:** `utils/memoryRoot.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getMemoryRoot, isInsideVault, isMemoryInsideVault } from './memoryRoot';

describe('memoryRoot', () => {
  const originalEnv = process.env;
  
  beforeEach(() => {
    process.env = { ...originalEnv };
  });
  
  afterEach(() => {
    process.env = originalEnv;
  });
  
  describe('getMemoryRoot', () => {
    it('prioritizes MEMORY_DIR', () => {
      process.env.MEMORY_DIR = '/custom/memory';
      process.env.VAULT_WORK = '/vault/work';
      expect(getMemoryRoot()).toBe('/custom/memory');
    });
    
    it('falls back to VAULT_WORK/memory', () => {
      delete process.env.MEMORY_DIR;
      process.env.VAULT_WORK = '/vault/work';
      expect(getMemoryRoot()).toBe('/vault/work/memory');
    });
    
    it('falls back to VAULT_PERSONAL/memory', () => {
      delete process.env.MEMORY_DIR;
      delete process.env.VAULT_WORK;
      process.env.VAULT_PERSONAL = '/vault/personal';
      expect(getMemoryRoot()).toBe('/vault/personal/memory');
    });
    
    it('throws if no memory root configured', () => {
      delete process.env.MEMORY_DIR;
      delete process.env.VAULT_WORK;
      delete process.env.VAULT_PERSONAL;
      expect(() => getMemoryRoot()).toThrow();
    });
  });
  
  describe('isInsideVault', () => {
    it('returns true for paths inside VAULT_WORK', () => {
      process.env.VAULT_WORK = '/vault/work';
      expect(isInsideVault('/vault/work/notes/file.md')).toBe(true);
    });
    
    it('returns true for paths inside VAULT_PERSONAL', () => {
      process.env.VAULT_PERSONAL = '/vault/personal';
      expect(isInsideVault('/vault/personal/notes/file.md')).toBe(true);
    });
    
    it('returns false for paths outside vaults', () => {
      process.env.VAULT_WORK = '/vault/work';
      expect(isInsideVault('/separate/memory/file.md')).toBe(false);
    });
  });
  
  describe('isMemoryInsideVault', () => {
    it('returns true when MEMORY_DIR is inside vault', () => {
      process.env.VAULT_WORK = '/vault/work';
      process.env.MEMORY_DIR = '/vault/work/memory';
      expect(isMemoryInsideVault()).toBe(true);
    });
    
    it('returns false when MEMORY_DIR is outside vaults', () => {
      process.env.VAULT_WORK = '/vault/work';
      process.env.MEMORY_DIR = '/separate/memory';
      expect(isMemoryInsideVault()).toBe(false);
    });
  });
});
```

### Step 2: Update Path Utilities (1h)

**File:** `ai/memory/obsidian-memory-mcp/utils/pathUtils.ts`

**Before:**
```typescript
export function isMemoryEntity(filePath: string): boolean {
  return filePath.includes('/memory/');
}
```

**After:**
```typescript
import { getMemoryRoot } from './memoryRoot.js';

export function isMemoryEntity(filePath: string): boolean {
  const memoryRoot = getMemoryRoot();
  return filePath.startsWith(memoryRoot);
}
```

### Step 3: Update Watcher Configuration (2h)

**File:** `ai/memory/obsidian-memory-mcp/standalone-watcher.ts`

**Changes:**

```typescript
import { getMemoryRoot, isMemoryInsideVault } from './utils/memoryRoot.js';

// Build watch paths
const watchPaths: string[] = [];

// Always watch vaults
if (vaultWork) {
  watchPaths.push(vaultWork);
  console.log('Watching work vault:', vaultWork);
}

if (vaultPersonal) {
  watchPaths.push(vaultPersonal);
  console.log('Watching personal vault:', vaultPersonal);
}

// Add MEMORY_DIR only if outside vaults
const memoryRoot = getMemoryRoot();
if (!isMemoryInsideVault()) {
  watchPaths.push(memoryRoot);
  console.log('Watching separate memory directory:', memoryRoot);
} else {
  console.log('Memory entities inside vault, no additional watch needed');
}

// Initialize watcher
const watcher = chokidar.watch(watchPaths, {
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 60000,  // 60s debounce
    pollInterval: 100
  },
  ignored: [
    /node_modules/,
    /.git/,
    /.obsidian/,
    /.trash/
  ]
});
```

### Step 4: Update File Map Building (1h)

**File:** `ai/memory/obsidian-memory-mcp/utils/fileMapBuilder.ts`

**Add helper:**

```typescript
import { getMemoryRoot, isMemoryInsideVault } from './memoryRoot.js';

/**
 * Build file maps for all watched directories
 * Avoids duplicate scans if memory root is inside a vault
 */
export async function buildAllFileMaps(): Promise<Map<string, string>> {
  const allFiles = new Map<string, string>();
  
  // Build map for work vault
  const vaultWork = process.env.VAULT_WORK;
  if (vaultWork) {
    const workFiles = await buildFileMap(vaultWork);
    workFiles.forEach((path, name) => allFiles.set(name, path));
  }
  
  // Build map for personal vault
  const vaultPersonal = process.env.VAULT_PERSONAL;
  if (vaultPersonal) {
    const personalFiles = await buildFileMap(vaultPersonal);
    personalFiles.forEach((path, name) => allFiles.set(name, path));
  }
  
  // Build map for memory root only if outside vaults
  if (!isMemoryInsideVault()) {
    const memoryRoot = getMemoryRoot();
    const memoryFiles = await buildFileMap(memoryRoot);
    memoryFiles.forEach((path, name) => allFiles.set(name, path));
  }
  
  return allFiles;
}
```

**Update callers:**

```typescript
// In vaultNoteIndexer.ts
const imageMap = await buildAllFileMaps();
```

### Step 5: Update MCP Storage (1h)

**File:** `ai/memory/obsidian-memory-mcp/storage/MarkdownStorageManager.ts`

**Update entity creation:**

```typescript
import { getMemoryRoot } from '../utils/memoryRoot.js';

async createEntities(entities: Entity[]): Promise<void> {
  const memoryRoot = getMemoryRoot();
  
  for (const entity of entities) {
    const entityType = entity.entityType || 'general';
    const entityDir = path.join(memoryRoot, entityType);
    
    // Ensure directory exists
    await fs.mkdir(entityDir, { recursive: true });
    
    // Write entity file
    const filePath = path.join(entityDir, `${entity.name}.md`);
    const content = generateMarkdown(entity);
    await fs.writeFile(filePath, content, 'utf-8');
  }
}
```

### Step 6: Update Daemon Configuration (2h)

**File:** `ai/memory/obsidian-memory-mcp/launchd/com.sibagy.obsidian-indexer.plist`

**Add environment variable:**

```xml
<key>EnvironmentVariables</key>
<dict>
  <key>VAULT_WORK</key>
  <string>/Users/sibagy/fileZ/obsidian/vault</string>
  
  <key>VAULT_PERSONAL</key>
  <string>/Users/sibagy/fileZ/obsidian/pessoAll</string>
  
  <!-- NEW: Optional memory directory override -->
  <key>MEMORY_DIR</key>
  <string></string>
  
  <key>DATABASE_URL</key>
  <string>postgresql://localhost:5432/obsidian_memory</string>
  
  <key>LOG_LEVEL</key>
  <string>info</string>
</dict>
```

**File:** `ai/memory/obsidian-memory-mcp/scripts/install-daemon.sh`

**Add parameter:**

```bash
#!/bin/bash

# Accept optional MEMORY_DIR parameter
MEMORY_DIR="${MEMORY_DIR:-}"

# Validate at least one vault is configured
if [[ -z "$VAULT_WORK" ]] && [[ -z "$VAULT_PERSONAL" ]]; then
  echo "❌ Error: At least one vault must be configured"
  echo "   Set VAULT_WORK or VAULT_PERSONAL environment variable"
  exit 1
fi

# Update plist with MEMORY_DIR if provided
if [[ -n "$MEMORY_DIR" ]]; then
  sed -i '' "s|<key>MEMORY_DIR</key>.*<string></string>|<key>MEMORY_DIR</key><string>$MEMORY_DIR</string>|" \
    "$PLIST_PATH"
  echo "✓ MEMORY_DIR configured: $MEMORY_DIR"
fi
```

**Usage:**

```bash
# Default: memory inside vaults
VAULT_WORK=/vault/work ./scripts/install-daemon.sh

# Override: separate memory directory
VAULT_WORK=/vault/work MEMORY_DIR=/custom/memory ./scripts/install-daemon.sh
```

### Step 7: Update Documentation (1h)

**File:** `ai/memory/obsidian-memory-mcp/README.md`

**Add section:**

```markdown
## Memory Entity Location

By default, memory entities are stored in `<vault>/memory/` directories.

### Custom Memory Location

To store memory entities outside your vaults:

```bash
# Set MEMORY_DIR before installing daemon
export MEMORY_DIR=/path/to/custom/memory
./scripts/install-daemon.sh
```

**When to use:**
- Backup memory entities to separate location
- Share memory across multiple vault instances
- Version control memory separately from notes

**Behavior:**
- If `MEMORY_DIR` is inside a vault: no additional monitoring needed
- If `MEMORY_DIR` is outside vaults: daemon adds separate file watch
- MCP always writes new entities to configured memory root
```

---

## Testing Strategy

### Unit Tests

1. **memoryRoot.ts** ✅
   - Test env var precedence
   - Test vault detection logic
   - Test error cases

2. **pathUtils.ts**
   - Test isMemoryEntity with custom MEMORY_DIR
   - Test both inside/outside vault scenarios

### Integration Tests

1. **Scenario A: Memory inside vault (default)**
   ```bash
   VAULT_WORK=/vault/work
   # MEMORY_DIR not set
   
   Expected:
   - Memory root: /vault/work/memory
   - Watch paths: [/vault/work]
   - File map: vault only
   ```

2. **Scenario B: Memory outside vaults**
   ```bash
   VAULT_WORK=/vault/work
   MEMORY_DIR=/separate/memory
   
   Expected:
   - Memory root: /separate/memory
   - Watch paths: [/vault/work, /separate/memory]
   - File map: vault + memory
   ```

3. **Scenario C: Memory in work, search personal**
   ```bash
   VAULT_WORK=/vault/work
   VAULT_PERSONAL=/vault/personal
   MEMORY_DIR=/vault/work/memory
   
   Expected:
   - Memory root: /vault/work/memory
   - Watch paths: [/vault/work, /vault/personal]
   - File map: both vaults
   ```

### Manual Testing

1. **Create entity via MCP**
   - Verify file written to correct location
   - Check daemon picks up new file
   - Verify indexing works

2. **Edit entity in Obsidian**
   - Modify file in memory root
   - Check daemon detects change
   - Verify reindexing works

3. **Search test**
   - Query for memory entity
   - Query for vault note
   - Verify both work correctly

---

## Rollback Plan

If issues arise:

1. **Quick fix:** Unset MEMORY_DIR
   ```bash
   unset MEMORY_DIR
   ./scripts/restart-daemon.sh
   ```

2. **Full rollback:** Revert commits
   ```bash
   git revert <commit-hash>
   ./scripts/restart-daemon.sh
   ./reindex-all.sh
   ```

3. **Data safety:** Memory entities unchanged
   - Files remain in place
   - No data loss
   - Just indexing behavior changes

---

## Migration Guide

### For Existing Users

**No changes required** - defaults work as before:
- Memory entities stay in `<vault>/memory/`
- No configuration changes needed
- Backward compatible

### For New Custom Setup

```bash
# 1. Create custom memory directory
mkdir -p /custom/memory/{people,projects,general}

# 2. Move existing entities (optional)
mv /vault/work/memory/* /custom/memory/

# 3. Configure daemon
VAULT_WORK=/vault/work \
MEMORY_DIR=/custom/memory \
./scripts/install-daemon.sh

# 4. Reindex
./reindex-all.sh
```

---

## Success Criteria

- ✅ Memory entities can be stored outside vaults
- ✅ Backward compatible with existing setups
- ✅ No duplicate watches or file scans
- ✅ MCP writes to correct location
- ✅ Daemon monitors all necessary paths
- ✅ All tests pass
- ✅ Documentation updated

---

## Timeline

| Day | Tasks | Hours |
|-----|-------|-------|
| **1** | Step 1-2: Core utilities + tests | 3h |
| **2** | Step 3-4: Watcher + file map | 3h |
| **3** | Step 5-6: MCP + daemon config | 3h |
| **4** | Step 7 + testing + docs | 3h |

**Total:** 12 hours over 4 days

---

**Ready to begin implementation!**



---
augment logs to show the final memory path.
Current log entries:
```
[2025-10-13 12:25:09] INFO    | ============================================================
[2025-10-13 12:25:09] INFO    | Obsidian Indexer Daemon Starting
[2025-10-13 12:25:09] INFO    | ============================================================
[2025-10-13 12:25:09] INFO    | Configuration:
[2025-10-13 12:25:09] INFO    |   Vault (Work): /Users/sibagy/fileZ/obsidian/work
[2025-10-13 12:25:09] INFO    |   Vault (Personal): /Users/sibagy/fileZ/obsidian/personal
[2025-10-13 12:25:09] INFO    |   Debounce: 60 seconds
[2025-10-13 12:25:09] INFO    |   Database: postgresql://localhost:5432/obsidian_memory
[2025-10-13 12:25:09] INFO    |   Log Level: debug
[2025-10-13 12:25:09] INFO    | Starting watchers...
[2025-10-13 12:25:09] INFO    | Starting watch: /Users/sibagy/fileZ/obsidian/work
[2025-10-13 12:25:09] INFO    | Starting watch: /Users/sibagy/fileZ/obsidian/personal
[2025-10-13 12:25:09] INFO    | ============================================================
[2025-10-13 12:25:09] INFO    | ✓ Daemon Ready - Watching for changes
[2025-10-13 12:25:09] INFO    | ============================================================
[2025-10-13 12:25:10] INFO    | ✓ Ready: /Users/sibagy/fileZ/obsidian/work
[2025-10-13 12:25:10] INFO    | ✓ Ready: /Users/sibagy/fileZ/obsidian/personal
```
