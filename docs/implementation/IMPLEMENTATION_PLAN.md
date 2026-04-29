# Implementation Plan

> Phase-by-phase guide to building the RAG-enhanced memory system

## Overview

**Timeline**: 2-3 weeks
**Effort**: ~80 hours total
**Team**: 1 developer (you)

## Phases

### Phase 1: Foundation (Week 1, Days 1-2)

**Goal**: Set up database, embedding pipeline, basic vector storage

#### Tasks

1. **PostgreSQL + PGVector Setup** (2 hours)
   ```bash
   # Install PostgreSQL (if needed)
   brew install postgresql@16
   
   # Start service
   brew services start postgresql@16
   
   # Create database
   createdb obsidian_memory
   
   # Install PGVector
   psql obsidian_memory -c "CREATE EXTENSION vector;"
   ```

2. **Schema Creation** (1 hour)
   - Create `vector_chunks` table
   - Create indexes (vector, timestamp, tags)
   - Add helper functions
   - Test with sample data

3. **BGE-M3 Embedding Service** (4 hours)
   - Install Python dependencies
   - Create `embedder.py` service
   - Test embedding quality
   - Add Node.js bridge via child_process
   - Implement embedding cache

4. **Vector Storage Layer** (3 hours)
   - Create `VectorStorage` class
   - Implement: `embed()`, `search()`, `update()`, `delete()`
   - Add connection pooling
   - Write unit tests

**Deliverables**:
- ✅ Working PostgreSQL + PGVector database
- ✅ BGE-M3 embeddings service
- ✅ Vector storage layer with tests

**Success Criteria**:
- Can embed a markdown file
- Can store embedding in database
- Can search and retrieve similar documents

---

### Phase 2: File Watching (Week 1, Days 3-4)

**Goal**: Auto-sync Obsidian changes to vector database

#### Tasks

1. **File Watcher Implementation** (3 hours)
   ```typescript
   // watcher/FileWatcher.ts
   import chokidar from 'chokidar';
   
   export class FileWatcher {
     private watchers: Map<string, FSWatcher>;
     
     watch(vaultPath: string, handlers: WatchHandlers) {
       const watcher = chokidar.watch(vaultPath, {
         ignored: /(^|[\/\\])\../, // ignore dotfiles
         persistent: true,
         ignoreInitial: true,
         awaitWriteFinish: {
           stabilityThreshold: 100,
           pollInterval: 100
         }
       });
       
       watcher
         .on('add', handlers.onAdd)
         .on('change', handlers.onChange)
         .on('unlink', handlers.onDelete);
         
       this.watchers.set(vaultPath, watcher);
     }
   }
   ```

2. **Debouncing & Batching** (2 hours)
   - Implement 100ms debounce
   - Batch multiple rapid changes
   - Handle file renames gracefully

3. **Integration with Vector Storage** (2 hours)
   - Connect watcher to embedding pipeline
   - Handle errors (file locked, embedding failed)
   - Log all operations

4. **Testing** (3 hours)
   - Test rapid edits
   - Test bulk operations (copy folder)
   - Test edge cases (delete while editing)

**Deliverables**:
- ✅ File watcher service
- ✅ Auto-sync from Obsidian to vector DB
- ✅ Comprehensive tests

**Success Criteria**:
- Edit a file in Obsidian → embedding updates within 1s
- Create new file → automatically indexed
- Delete file → removed from vector DB

---

### Phase 3: Enhanced Search (Week 1, Day 5 + Week 2, Days 1-2)

**Goal**: Implement RAG-powered `search_nodes` tool

#### Tasks

1. **Search Implementation** (4 hours)
   ```typescript
   // storage/MarkdownStorageManager.ts
   async searchNodes(
     query: string,
     maxResults: number = 10,
     includeFields: string[] = ["observations", "relations"]
   ): Promise<SearchResult> {
     // 1. Embed query
     const queryEmbedding = await this.embedder.embed(query);
     
     // 2. Vector search with PGVector
     const sql = `
       SELECT 
         entity_name,
         content,
         modified_at,
         created_at,
         1 - (embedding <=> $1) as similarity
       FROM vector_chunks
       WHERE 1 - (embedding <=> $1) >= $2
       ORDER BY similarity DESC
       LIMIT $3
     `;
     
     const results = await this.db.query(sql, [
       `[${queryEmbedding.join(',')}]`,
       0.7, // minSimilarity
       maxResults
     ]);
     
     // 3. Enrich with graph data
     return this.enrichResults(results, includeFields);
   }
   ```

2. **Multiple Sort Strategies** (3 hours)
   - Implement: relevance, modified, created, hybrid
   - Add recency score calculation
   - Test each strategy

3. **Date Filtering** (2 hours)
   - Add dateFilter parameter
   - Build dynamic SQL with date clauses
   - Test various date ranges

4. **Response Formatting** (2 hours)
   - Match existing response format
   - Add metadata (searchType, sortedBy, etc.)
   - Include similarity scores

5. **Integration Testing** (3 hours)
   - Test with real vault data
   - Compare old vs new search results
   - Validate response format

**Deliverables**:
- ✅ RAG-powered search_nodes
- ✅ Multiple sorting strategies
- ✅ Date filtering support

**Success Criteria**:
- Semantic search works: "PE goals" finds relevant notes
- Sort by modified returns recent notes first
- Date filtering correctly limits results
- Existing MCP tools still work

---

### Phase 4: Initial Indexing (Week 2, Days 3-4)

**Goal**: Create scripts to index existing vaults

#### Tasks

1. **Indexing Script** (3 hours)
   ```typescript
   // scripts/index.ts
   import { VectorStorage } from '../storage/VectorStorage';
   import { glob } from 'glob';
   
   async function indexVault(vaultPath: string) {
     const storage = new VectorStorage();
     const files = await glob(`${vaultPath}/**/*.md`);
     
     console.log(`Indexing ${files.length} files...`);
     
     for (let i = 0; i < files.length; i++) {
       const file = files[i];
       try {
         await storage.embed(file);
         if (i % 10 === 0) {
           console.log(`Progress: ${i}/${files.length}`);
         }
       } catch (error) {
         console.error(`Failed to index ${file}:`, error);
       }
     }
     
     console.log('Indexing complete!');
   }
   ```

2. **Parallel Processing** (2 hours)
   - Batch files in groups of 10
   - Process batches in parallel
   - Show progress bar

3. **Resume Support** (2 hours)
   - Track indexed files
   - Skip already-indexed (check modified_at)
   - Resume from failure

4. **NPM Scripts** (1 hour)
   ```json
   {
     "scripts": {
       "index": "tsx scripts/index.ts",
       "index:work": "tsx scripts/index.ts --vault=$VAULT_WORK",
       "index:personal": "tsx scripts/index.ts --vault=$VAULT_PERSONAL",
       "reindex": "tsx scripts/index.ts --force",
       "stats": "tsx scripts/stats.ts"
     }
   }
   ```

**Deliverables**:
- ✅ Indexing scripts for both vaults
- ✅ Progress tracking
- ✅ Resume support

**Success Criteria**:
- Can index 1000 files in ~20 minutes
- Progress is visible
- Can resume from interruption
- Stats command shows indexed file count

---

### Phase 5: Testing & Optimization (Week 2, Day 5 + Week 3, Days 1-2)

**Goal**: Ensure quality, performance, reliability

#### Tasks

1. **Search Quality Tests** (4 hours)
   - Test 20 real-world queries
   - Measure precision/recall
   - Compare to baseline (old search)
   - Document findings

2. **Performance Benchmarks** (3 hours)
   - Measure search latency (p50, p95, p99)
   - Measure embedding time
   - Measure indexing throughput
   - Profile hot paths

3. **Edge Case Testing** (3 hours)
   - Empty files
   - Very large files (>1MB)
   - Binary files (should skip)
   - Concurrent edits
   - Database connection loss

4. **Optimization** (4 hours)
   - Add embedding cache (LRU, 1000 items)
   - Optimize SQL queries
   - Add connection pooling
   - Tune PGVector index parameters

**Deliverables**:
- ✅ Test suite with >90% coverage
- ✅ Performance benchmarks
- ✅ Optimizations implemented

**Success Criteria**:
- Search quality: precision >80%
- Search latency: p95 <100ms
- No crashes in 24-hour stress test

---

### Phase 6: Documentation & Deployment (Week 3, Days 3-5)

**Goal**: Polish and ship

#### Tasks

1. **Documentation** (4 hours)
   - Complete all .md files
   - Add inline code comments
   - Write migration guide
   - Create troubleshooting guide

2. **Deployment Scripts** (2 hours)
   ```bash
   # deploy.sh
   #!/bin/bash
   set -e
   
   echo "Building project..."
   npm run build
   
   echo "Running migrations..."
   psql $DATABASE_URL < sql/schema_with_vectors.sql
   
   echo "Indexing vaults..."
   npm run index
   
   echo "Deployment complete!"
   ```

3. **MCP Configuration Update** (1 hour)
   - Update Cline MCP settings
   - Test with actual LLM
   - Verify all tools work

4. **Second Mac Setup** (2 hours)
   - Follow own setup guide
   - Fix any gaps
   - Update documentation

5. **.clinerules Update** (1 hour)
   ```markdown
   ## Memory Management via Obsidian
   
   ### Storage Backend
   - Primary: Obsidian vault + RAG
   - Format: Markdown with vector embeddings
   - Search: Semantic via search_nodes
   
   ### Memory Retrieval
   - MANDATORY: search_nodes("Sergio") on chat start
   - Use sortBy for recency or relevance
   - Use dateFilter for time-bounded queries
   
   ### Performance
   - Search is fast (<100ms)
   - No need to minimize calls
   - Prefer specific queries over broad ones
   ```

**Deliverables**:
- ✅ Complete documentation
- ✅ Deployment automation
- ✅ Second Mac validated

**Success Criteria**:
- Setup on fresh Mac takes <30 min
- All documentation accurate
- LLM can use memory effectively

---

## Risk Mitigation

### Risk: Indexing Too Slow
**Mitigation**: Parallel batching, optimize embedding batch size

### Risk: Search Quality Poor
**Mitigation**: Tune similarity threshold, add BM25 hybrid, experiment with chunk size

### Risk: File Watcher Misses Changes
**Mitigation**: Periodic full scan (daily), checksums to detect drift

### Risk: Database Corruption
**Mitigation**: Daily backups, WAL archiving, replicas

---

## Resource Requirements

### Hardware
- **Development**: M4 Mac (16GB RAM minimum)
- **Production**: Same machine (no separate server needed)
- **Storage**: ~5GB for 10K notes + indexes

### Software
- Node.js 18+
- PostgreSQL 16+
- Python 3.9+
- 10GB disk space (embeddings, indexes)

### Time
- **Full-time**: 2 weeks
- **Part-time**: 3-4 weeks
- **Maintenance**: ~2 hours/month

---

## Success Metrics

### Functional
- [ ] All 6 MCP tools working
- [ ] Semantic search returns relevant results
- [ ] File watching syncs within 1s
- [ ] Can index 10K files

### Performance
- [ ] Search latency p95 <100ms
- [ ] Indexing >50 docs/sec
- [ ] Memory usage <4GB

### Quality
- [ ] Search precision >80%
- [ ] Zero data loss
- [ ] <1 error per 1000 operations

---

## Post-Launch

### Week 1 After Launch
- Monitor logs for errors
- Collect search quality feedback
- Tune similarity thresholds

### Week 2-4
- Implement missing features
- Optimize based on usage patterns
- Add monitoring dashboards

### Month 2+
- Plan next enhancements
- Consider multi-modal search
- Explore graph neural networks

---

## Phase Summary

| Phase | Duration | Effort | Key Deliverable |
|-------|----------|--------|-----------------|
| 1. Foundation | 2 days | 10h | Vector storage working |
| 2. File Watching | 2 days | 10h | Auto-sync working |
| 3. Enhanced Search | 3 days | 14h | RAG search working |
| 4. Initial Indexing | 2 days | 8h | Vaults indexed |
| 5. Testing | 3 days | 14h | Quality validated |
| 6. Documentation | 3 days | 10h | Ready to ship |
| **Total** | **15 days** | **66h** | **Production ready** |

Let's build this! 🚀
