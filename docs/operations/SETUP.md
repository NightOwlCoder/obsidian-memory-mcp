# Setup Guide

> Step-by-step setup instructions for Obsidian RAG Memory MCP

**Last Updated**: 2025-01-07  
**Status**: ✅ Phase 4 Complete - Indexing Scripts Ready  
**Machine**: M4 Mac (primary), will validate on second Mac

## Quick Links

- [Phase 1: Foundation](#phase-1-foundation) ← **Current**
- [Phase 2: File Watching](#phase-2-file-watching)
- [Phase 3: Enhanced Search](#phase-3-enhanced-search)
- [Phase 4: Initial Indexing](#phase-4-initial-indexing)
- [Phase 5: Testing](#phase-5-testing)
- [Phase 6: Deployment](#phase-6-deployment)

---

## Prerequisites Check

Before starting, verify you have:

```bash
# Node.js 18+
node --version  # Should be v18.x.x or higher
npm --version   # Should be 9.x.x or higher

# Python 3.9+
python3 --version  # Should be 3.9+ or higher
pip3 --version

# Git
git --version

# Disk space
df -h .  # Should have 20GB+ free
```

**If missing any**: See [REQUIREMENTS.md](./REQUIREMENTS.md) for installation.

---

## Phase 1: Foundation

**Goal**: Set up database, embedding pipeline, basic vector storage

### Step 1.1: PostgreSQL Installation

```bash
# Install PostgreSQL 17
brew install postgresql@17

# Verify installation
psql --version
# Expected: psql (PostgreSQL) 17.x

# Start service
brew services start postgresql@17

# Verify it's running
brew services list | grep postgresql
# Expected: postgresql@17 started
```

**Status**: ✅ Complete

**Notes**: 
- Installed PostgreSQL 17.6 (later than planned 16.x, fully compatible)
- Database cluster auto-initialized at `/opt/homebrew/var/postgresql@17`
- Service started successfully with `brew services start postgresql@17`

---

### Step 1.2: PGVector Extension

```bash
# Install PGVector
brew install pgvector

# Verify installation
brew list pgvector
# Should show installation path
```

**Status**: ✅ Complete

**Notes**:
- Installed PGVector 0.8.1
- 88 files, 511.5KB

---

### Step 1.3: Create Database

```bash
# Create database
psql -d postgres -c "CREATE DATABASE obsidian_memory;"

# Verify creation
psql -l | grep obsidian_memory
# Should show obsidian_memory in list

# Connect and enable PGVector
psql obsidian_memory -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Verify extension
psql obsidian_memory -c "SELECT * FROM pg_extension WHERE extname = 'vector';"
# Should show vector extension
```

**Status**: ✅ Complete

**Notes**:
- Database `obsidian_memory` created successfully
- PGVector extension enabled (version 0.8.1)
- Verified extension is active and ready

---

### Step 1.4: Database Schema

```bash
# Create schema file first
cd ai/memory/obsidian-memory-mcp
mkdir -p sql

# Apply schema
psql obsidian_memory < sql/schema_with_vectors.sql
```

**Status**: ✅ Complete

**Schema File**: `ai/memory/obsidian-memory-mcp/sql/schema_with_vectors.sql`

**Notes**:
- Schema file created with vector_chunks table
- Table includes: entity_name, content, embedding vector(1024), timestamps, metadata
- 7 indexes created: vector (ivfflat), timestamps, entity lookups, tags
- Schema applied successfully
- Warning about low data for ivfflat index is expected (will improve with data)

---

### Step 1.5: Python Virtual Environment

```bash
# Navigate to project
cd ai/memory/obsidian-memory-mcp

# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Verify activation (should show venv path)
which python3
# Expected: /Users/sibagy/fileZ/projZ/SIbagyPersonal/ai/memory/obsidian-memory-mcp/venv/bin/python3

# Upgrade pip
pip install --upgrade pip
```

**Status**: ✅ Complete

**Notes**:
- Virtual environment created with Python 3.13
- Location: `ai/memory/obsidian-memory-mcp/venv/`
- Virtual environment keeps Python packages isolated
- Must activate before using: `source venv/bin/activate`
- To deactivate: `deactivate`

---

### Step 1.6: Python Dependencies

```bash
# Create requirements.txt (in ai/memory/obsidian-memory-mcp/)
cat > requirements.txt << 'EOF'
sentence-transformers>=3.0.0
torch>=2.6.0
transformers>=4.40.0
numpy>=1.26.0
EOF

# Install dependencies (with venv activated)
pip install -r requirements.txt

# Test installation
python -c "from sentence_transformers import SentenceTransformer; print('✓ Imports work')"
# Expected: ✓ Imports work
```

**Status**: ✅ Complete

**Notes**:
- Updated versions for Python 3.13 compatibility
- Installed versions: torch 2.8.0, transformers 4.57.0, sentence-transformers 5.1.1
- Total 31 packages installed successfully
- Make sure venv is activated first (you'll see `(venv)` in prompt)

---

### Step 1.7: Download BGE-M3 Model

```bash
# Make sure venv is activated first!
# Download model (takes ~30 seconds, 2GB download)
# Note: Disable hf_transfer to avoid dependency issues
HF_HUB_ENABLE_HF_TRANSFER=0 python << 'EOF'
from sentence_transformers import SentenceTransformer
print("Downloading BGE-M3 model...")
model = SentenceTransformer('BAAI/bge-m3')
print("✓ Model downloaded successfully")
embedding = model.encode("test")
print(f"✓ Test embedding generated: {len(embedding)} dimensions")
EOF

# Expected output:
# Downloading BGE-M3 model...
# ✓ Model downloaded successfully
# ✓ Test embedding generated: 1024 dimensions
```

**Status**: ✅ Complete

**Model Location**: `~/.cache/torch/sentence_transformers/BAAI_bge-m3/`

**Notes**:
- Download took ~2 minutes (2.27GB model)
- Successfully generated 1024-dimension test embedding
- Model now cached locally for future use
- Need to set `HF_HUB_ENABLE_HF_TRANSFER=0` to avoid hf_transfer dependency

---

### Step 1.8: Node.js Dependencies

```bash
# Navigate to project
cd ai/memory/obsidian-memory-mcp

# Install dependencies
npm install

# Verify installation
npm list --depth=0
# Should show all dependencies
```

**Status**: ✅ Complete

**Notes**:
- All dependencies installed successfully
- Auto-ran `npm run build` during install (via prepare script)
- Build completed successfully

---

### Step 1.9: Build Project

```bash
# Build TypeScript
npm run build

# Verify build
ls dist/index.js
# Should exist

# Test MCP server starts
node dist/index.js
# Should output: Obsidian Memory MCP Server running...
# Press Ctrl+C to stop
```

**Status**: ✅ Complete

**Notes**:
- Build automatically ran during `npm install` (prepare script)
- Output: `dist/index.js` (11KB)
- TypeScript compilation successful
- MCP server binary is executable

---

## Phase 2: File Watching & Vector Storage

**Status**: ✅ Complete

**Goal**: Auto-sync Obsidian changes to vector database

### Step 2.1: Create Python Embedder Service

**File**: `ai/memory/obsidian-memory-mcp/embeddings/embedder.py`

**Status**: ✅ Complete

**Notes**:
- BGE-M3 embedding service via stdin/stdout
- Generates 1024-dimensional embeddings
- Tested and working ({"dimension": 1024} confirmed)
- Reads JSON from stdin: `{"text": "content"}`
- Outputs JSON to stdout: `{"embedding": [1024 floats], "dimension": 1024}`

---

### Step 2.2: Create VectorStorage Class

**File**: `ai/memory/obsidian-memory-mcp/storage/VectorStorage.ts`

**Status**: ✅ Complete

**Notes**:
- PostgreSQL connection pooling
- Spawns Python embedder as subprocess
- Methods: `storeEntity()`, `search()`, `update()`, `delete()`, `getStats()`
- Search supports: relevance, recency, hybrid, date filtering
- Compiled to `dist/storage/VectorStorage.js` (8.3KB)

---

### Step 2.3: Create FileWatcher Class

**File**: `ai/memory/obsidian-memory-mcp/watcher/FileWatcher.ts`

**Status**: ✅ Complete

**Notes**:
- Uses chokidar for file system watching
- Watches both vaults simultaneously
- Debounces rapid changes (100ms)
- Auto-indexes: add, change, delete events
- Ignores: dotfiles, node_modules, venv, .git
- Compiled to `dist/watcher/FileWatcher.js`

---

### Step 2.4: Install Dependencies

**Packages Added**: pg, @types/pg, chokidar, @types/node (17 packages total)

**Status**: ✅ Complete

**Notes**:
- Created `.npmrc` to fix npm registry auth issue
- All packages installed successfully
- No vulnerabilities found

---

### Phase 2 Summary

**Files Created**:
- `embeddings/embedder.py` - BGE-M3 embedding service
- `storage/VectorStorage.ts` - PostgreSQL + vector operations
- `watcher/FileWatcher.ts` - File system monitoring
- `.npmrc` - NPM registry configuration

**Capabilities Added**:
- ✅ Generate 1024-dim embeddings locally
- ✅ Store embeddings in PostgreSQL + PGVector
- ✅ Search with similarity, recency, hybrid sorting
- ✅ Watch Obsidian vaults for changes
- ✅ Auto-index on file add/change/delete
- ✅ Debounce rapid changes

**Next**: Phase 3 will integrate VectorStorage with MarkdownStorageManager to add RAG-powered semantic search to the existing `search_nodes` tool.

---

## Phase 3: Enhanced Search

**Status**: ✅ Complete

**Goal**: Integrate RAG semantic search into existing search_nodes tool

### Step 3.1: Enhance MarkdownStorageManager

**File**: `ai/memory/obsidian-memory-mcp/storage/MarkdownStorageManager.ts`

**Changes**:
- Added VectorStorage integration
- Replaced exact-match search with RAG semantic search
- Added support for `sortBy` parameter (relevance, modified, created, relevance+recency)
- Added support for `dateFilter` parameter (after/before)
- Added support for `minSimilarity` threshold
- Maintained backward compatibility with old API

**Status**: ✅ Complete

---

### Step 3.2: Update index.ts MCP Handler

**File**: `ai/memory/obsidian-memory-mcp/index.ts`

**Changes**:
- Updated search_nodes handler to use new options object
- Pass maxResults and includeFields correctly

**Status**: ✅ Complete

---

### Step 3.3: Build and Verify

**Compiled Files**:
- `dist/index.js` (11KB) - Updated with new API
- `dist/storage/MarkdownStorageManager.js` (14KB) - Now with RAG
- `dist/storage/VectorStorage.js` (8.3KB) - RAG engine
- `dist/watcher/FileWatcher.js` - Auto-sync

**Status**: ✅ Complete

---

### Phase 3 Summary

**searchNodes Tool Now Supports**:
```typescript
search_nodes(query, {
  maxResults: 10,
  includeFields: ["observations", "relations"],
  sortBy: "relevance" | "modified" | "created" | "relevance+recency",
  dateFilter: { after: "2025-01-01", before: "2025-01-31" },
  minSimilarity: 0.7
})
```

**Search Capabilities**:
- ✅ Semantic similarity (fuzzy matching)
- ✅ Sort by relevance (cosine similarity)
- ✅ Sort by modified date (most recent first)
- ✅ Sort by created date
- ✅ Hybrid sort (70% relevance + 30% recency)
- ✅ Date range filtering
- ✅ Similarity threshold tuning
- ✅ Backward compatible with old API

**Next**: Phase 4 will create indexing scripts to populate the vector database with existing memory files.

---

## Phase 4: Initial Indexing

**Status**: ✅ Complete

**Goal**: Create scripts to bulk-index existing memory files

### Step 4.1: Create Indexing Script

**File**: `ai/memory/obsidian-memory-mcp/scripts/index.ts`

**Status**: ✅ Complete

**Features**:
- Bulk index all .md files from memory directory
- Progress bar with stats
- Error handling and reporting
- Supports --memory-dir and --force flags
- Uses VectorStorage for embedding and storage

**Usage**:
```bash
npm run index                              # Index default memory dir
npm run index -- --memory-dir /path       # Index specific directory
npm run reindex                            # Force reindex all
```

---

### Step 4.2: Create Stats Script

**File**: `ai/memory/obsidian-memory-mcp/scripts/stats.ts`

**Status**: ✅ Complete

**Features**:
- Show total entities and database size
- Entity type breakdown
- Recently modified entities
- Database connection status

**Usage**:
```bash
npm run stats    # Display database statistics
```

**Sample Output**:
```
📊 Obsidian Memory Vector Database Stats

📦 Storage:
   Total entities: 0
   Database size: 1688 kB
   Oldest entity: N/A
   Newest entity: N/A

🔌 Database:
   Connection: postgresql://localhost:5432/obsidian_memory
   Status: ✅ Connected
```

---

### Step 4.3: Install tsx

**Package**: tsx@4.20.6

**Status**: ✅ Complete

**Notes**:
- Installed as dev dependency
- Enables running TypeScript scripts directly
- No build step needed for scripts

---

### Step 4.4: Add NPM Scripts

**Added to package.json**:
```json
{
  "scripts": {
    "index": "tsx scripts/index.ts",
    "stats": "tsx scripts/stats.ts",
    "reindex": "tsx scripts/index.ts --force"
  }
}
```

**Status**: ✅ Complete

---

### Phase 4 Summary

**Scripts Created**:
- `scripts/index.ts` - Bulk indexing with progress
- `scripts/stats.ts` - Database diagnostics

**NPM Commands**:
- `npm run index` - Index memory files
- `npm run stats` - Show database stats
- `npm run reindex` - Force reindex all

**Current State**:
- ✅ Database ready (0 entities, 1.7MB)
- ✅ Indexing scripts tested and working
- ✅ Memory directory exists (empty)
- ⏳ Ready to index when memory files are created

**Next**: Phase 5 (Testing) will validate search quality, performance, and end-to-end functionality with the MCP server.

---

## Phase 5: Testing

**Status**: ⏳ Not started

(Will be filled in as we implement)

---

## Phase 6: Deployment

**Status**: ⏳ Not started

(Will be filled in as we implement)

---

## Environment Variables

Create `.env` file in `ai/memory/obsidian-memory-mcp/`:

```bash
# Database
DATABASE_URL=postgresql://localhost:5432/obsidian_memory

# Vault paths
export VAULT_WORK=/Users/sibagy/fileZ/obsidian/work
export VAULT_PERSONAL=/Users/sibagy/fileZ/obsidian/personal

# Embeddings
EMBEDDING_MODEL=BAAI/bge-m3
EMBEDDING_DIMENSION=1024
EMBEDDING_BATCH_SIZE=10

# Optional: Logging
LOG_LEVEL=info
LOG_FILE=logs/obsidian-rag.log
```

**Status**: ⏳ Not created

---

## Troubleshooting Log

### Issue 1: [Title]

**Date**: YYYY-MM-DD  
**Problem**: Description  
**Solution**: What worked  
**Commands**: 
```bash
# Commands used
```

---

## Machine-Specific Notes

### Primary Mac (M4)

- Hostname: [TBD]
- OS Version: macOS [TBD]
- Setup Date: 2025-01-07
- Status: 🚧 In Progress

### Secondary Mac

- Hostname: [TBD]
- OS Version: [TBD]
- Setup Date: [TBD]
- Status: ⏳ Not started

---

## Validation Checklist

After completing all phases:

- [ ] PostgreSQL running
- [ ] PGVector extension enabled
- [ ] Database schema created
- [ ] BGE-M3 model downloaded
- [ ] Python dependencies installed
- [ ] Node.js dependencies installed
- [ ] Project builds successfully
- [ ] File watcher working
- [ ] Search returns results
- [ ] Both vaults indexed
- [ ] Tests passing
- [ ] MCP server configured in Cline

---

## Status Legend

- ⏳ Not started
- 🚧 In progress
- ✅ Complete
- ❌ Failed / Blocked
- ⚠️ Needs attention

---

## Next Steps

1. **Start Phase 1**: Follow steps 1.1-1.8 above
2. **Document**: Update status and notes as we go
3. **Test**: Verify each step before moving to next
4. **Commit**: Git commit after each major milestone

---

## Quick Commands Reference

```bash
# Check PostgreSQL status
brew services list | grep postgresql

# Start PostgreSQL
brew services start postgresql@16

# Stop PostgreSQL
brew services stop postgresql@16

# Connect to database
psql obsidian_memory

# Activate Python venv
cd ai/memory/obsidian-memory-mcp
source venv/bin/activate

# Deactivate venv
deactivate

# Rebuild project
cd ai/memory/obsidian-memory-mcp && npm run build

# Run tests
npm test

# Check logs
tail -f logs/obsidian-rag.log
```

---

## Files Created This Session (Phase 1)

- [x] `venv/` (Python virtual environment)
- [x] `sql/schema_with_vectors.sql` (PostgreSQL schema with vector support)
- [x] `requirements.txt` (Python dependencies)
- [ ] `.env` (will create when needed)
- [ ] `embeddings/embedder.py` (Phase 2)
- [ ] `storage/VectorStorage.ts` (Phase 2)
- [ ] `watcher/FileWatcher.ts` (Phase 2)

## Important Notes

### Python Virtual Environment

**Always activate venv before Python work**:
```bash
cd ai/memory/obsidian-memory-mcp
source venv/bin/activate
```

You'll see `(venv)` in your terminal prompt when activated.

**Why use venv?**
- Isolates project dependencies
- Prevents conflicts with system Python
- Makes project portable to other machines
- Easy to recreate if needed

**Recreating venv on another machine**:
```bash
cd ai/memory/obsidian-memory-mcp
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

---

**Remember**: Update this file after completing each step!
