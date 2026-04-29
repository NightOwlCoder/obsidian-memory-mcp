# Architecture

> Technical design of the RAG-enhanced Obsidian memory system

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Actions                              │
│  ┌─────────────────┐              ┌──────────────────┐          │
│  │ Edit in Obsidian│              │ LLM creates      │          │
│  │ (human)         │              │ entity (AI)      │          │
│  └────────┬────────┘              └────────┬─────────┘          │
└───────────┼──────────────────────────────────┼──────────────────┘
            │                                  │
            ▼                                  ▼
    ┌───────────────┐                 ┌───────────────┐
    │ Obsidian .md  │◄────────────────│ Memory MCP    │
    │ Files         │                 │ (writes)      │
    └───────┬───────┘                 └───────────────┘
            │
            │ (file system event)
            │
            ▼
    ┌────────────────────────────────────────────────┐
    │          File Watcher (chokidar)               │
    │  • Watches both vaults                         │
    │  • Debounces changes (100ms)                   │
    │  • Triggers re-embedding on change             │
    └────────────────┬───────────────────────────────┘
                     │
                     ▼
    ┌────────────────────────────────────────────────┐
    │         Embedding Pipeline                     │
    │  ┌──────────────┐      ┌──────────────┐       │
    │  │ Parse MD     │─────▶│ Nomic v1     │       │
    │  │ (frontmatter,│      │ Embeddings   │       │
    │  │  wikilinks)  │      │ (768-dim)    │       │
    │  └──────────────┘      └──────┬───────┘       │
    └─────────────────────────────────┼──────────────┘
                                      │
                                      ▼
    ┌────────────────────────────────────────────────┐
    │      PostgreSQL + PGVector                     │
    │  ┌──────────────────────────────────────────┐ │
    │  │ vector_chunks                            │ │
    │  │ • id (UUID)                              │ │
    │  │ • entity_name                            │ │
    │  │ • content (text)                         │ │
    │  │ • embedding (vector(768))                │ │
    │  │ • created_at, modified_at                │ │
    │  │ • metadata (JSONB)                       │ │
    │  └──────────────────────────────────────────┘ │
    └────────────────┬───────────────────────────────┘
                     │
                     │ (query)
                     ▼
    ┌────────────────────────────────────────────────┐
    │         Memory MCP Search                      │
    │  search_nodes(query, options)                  │
    │  ┌──────────────┐      ┌──────────────┐       │
    │  │ Embed query  │─────▶│ Vector       │       │
    │  │ with Nomic v1│      │ similarity   │       │
    │  │              │      │ search       │       │
    │  └──────────────┘      └──────┬───────┘       │
    │                               │                │
    │  ┌──────────────────────────────┐             │
    │  │ Ranking & Filtering          │             │
    │  │ • Relevance                  │             │
    │  │ • Recency                    │             │
    │  │ • Hybrid (0.7 rel + 0.3 rec) │             │
    │  └──────────────────────────────┘             │
    └────────────────┬───────────────────────────────┘
                     │
                     ▼
            ┌────────────────┐
            │ LLM receives   │
            │ search results │
            └────────────────┘
```

## Components

### 1. File Watcher

**Purpose**: Monitor Obsidian vaults for changes and trigger re-indexing

**Technology**: `chokidar` (Node.js file system watcher)

**Watched Paths**:
- `/Users/sibagy/fileZ/obsidian/vault` (work)
- `/Users/sibagy/fileZ/obsidian/pessoAll` (personal)

**Events Handled**:
```typescript
watcher
  .on('add', (path) => embedAndStore(path))
  .on('change', (path) => updateEmbedding(path))
  .on('unlink', (path) => deleteFromVector(path))
  .on('ready', () => console.log('Watching...'))
```

**Debouncing**: 100ms to avoid rapid re-indexing on save

### 2. Embedding Pipeline

**Model**: Nomic Embed v1 (nomic-ai/nomic-embed-text-v1)
- **Dimensions**: 768
- **Context**: 8192 tokens
- **Languages**: Multilingual support
- **Performance**: 50-100 docs/sec on M4

**Process**:
```python
# Python embedder service
from sentence_transformers import SentenceTransformer

model = SentenceTransformer('nomic-ai/nomic-embed-text-v1', trust_remote_code=True)

def embed(text: str) -> list[float]:
    # Add task prefix and normalize
    prefixed_text = f"search_document: {text}"
    embedding = model.encode(prefixed_text, normalize_embeddings=True)
    return embedding.tolist()
```

**Node.js Integration**:
```typescript
// Call Python embedder via child_process
import { spawn } from 'child_process';

async function embedText(text: string): Promise<number[]> {
  const python = spawn('python', ['embedder.py']);
  python.stdin.write(JSON.stringify({ text }));
  // ... receive embedding
}
```

### 3. Vector Storage

**Database Schema**:
```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE vector_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(768) NOT NULL,
  
  -- Metadata for filtering/sorting
  created_at TIMESTAMP DEFAULT NOW(),
  modified_at TIMESTAMP DEFAULT NOW(),
  entity_type TEXT,
  tags TEXT[],
  
  -- Graph connections
  outgoing_relations JSONB,
  incoming_relations JSONB,
  
  -- Search optimization
  CONSTRAINT unique_entity_file UNIQUE(entity_name, file_path)
);

-- Indexes
CREATE INDEX ON vector_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX idx_modified ON vector_chunks (modified_at DESC);
CREATE INDEX idx_entity_name ON vector_chunks (entity_name);
CREATE INDEX idx_tags ON vector_chunks USING GIN (tags);
```

**Storage Layer API**:
```typescript
class VectorStorage {
  async embed(filePath: string, content: string): Promise<void>
  async search(query: string, options: SearchOptions): Promise<SearchResult[]>
  async update(filePath: string, content: string): Promise<void>
  async delete(filePath: string): Promise<void>
  async getStats(): Promise<StorageStats>
}
```

### 4. Search Engine

**Hybrid Ranking Algorithm**:
```typescript
function hybridScore(
  similarity: number,
  modifiedAt: Date,
  sortBy: string
): number {
  switch (sortBy) {
    case 'relevance':
      return similarity;
      
    case 'modified':
      const daysSince = daysBetween(modifiedAt, now());
      return 1 / (1 + daysSince); // Exponential decay
      
    case 'relevance+recency':
      const recencyScore = 1 / (1 + daysBetween(modifiedAt, now()));
      return (similarity * 0.7) + (recencyScore * 0.3);
      
    default:
      return similarity;
  }
}
```

**Query Pipeline**:
```typescript
async function searchNodes(query: string, options: SearchOptions) {
  // 1. Embed query
  const queryEmbedding = await embedder.embed(query);
  
  // 2. Build SQL with filters
  const sql = buildSearchSQL(options);
  
  // 3. Execute vector search
  const results = await db.query(sql, [
    queryEmbedding,
    options.minSimilarity || 0.7,
    options.maxResults || 10
  ]);
  
  // 4. Post-process and rank
  const ranked = rankResults(results, options.sortBy);
  
  // 5. Enrich with graph data
  return enrichWithRelations(ranked);
}
```

## Data Flow

### Scenario 1: Manual Edit in Obsidian

```
User edits Sergio.md
    ↓
File system emits 'change' event
    ↓
File watcher detects change (debounced)
    ↓
Read Sergio.md content
    ↓
Parse frontmatter + extract metadata
    ↓
Send to Nomic v1 for embedding
    ↓
Update vector_chunks table
    ↓
Search now returns updated content
```

**Timing**: ~500ms total (mostly embedding)

### Scenario 2: LLM Creates Entity

```
LLM calls create_entities([{name: "Doug", ...}])
    ↓
Memory MCP writes Doug.md to /vault/memory/people/
    ↓
File watcher detects new file
    ↓
Embed Doug.md
    ↓
Store in vector_chunks
    ↓
Future searches find Doug
```

**Timing**: ~1s total

### Scenario 3: LLM Searches Memory

```
LLM calls search_nodes("PE developer goals")
    ↓
Embed query with Nomic v1 (~50ms)
    ↓
PGVector cosine similarity search (~20ms)
    ↓
Rank by relevance+recency (~5ms)
    ↓
Enrich with relations (~10ms)
    ↓
Return results
```

**Timing**: ~100ms total

## Performance Characteristics

### Indexing

| Operation | Time | Notes |
|-----------|------|-------|
| Single file | ~500ms | Nomic v1 embedding |
| 100 files | ~2 min | Batched, ~50 docs/sec |
| 1000 files | ~20 min | Parallel batches |
| 10000 files | ~3 hours | First-time only |

### Search

| Results | Time | Notes |
|---------|------|-------|
| 10 results | <50ms | Typical query |
| 100 results | <100ms | Large result set |
| 1000 results | <500ms | Max recommended |

### Memory Usage

| Component | Memory | Notes |
|-----------|--------|-------|
| Nomic v1 model | ~550MB | Loaded once |
| Vector index | ~1KB/doc | 1M docs = 1GB |
| File watcher | ~10MB | Per vault |
| Node.js runtime | ~100MB | Base |

**Total for 10K docs**: ~2.5GB

## Scalability

### Current Capacity
- **Documents**: Up to 100K markdown files
- **Total storage**: Up to 10GB of text
- **Search latency**: <100ms for 95th percentile
- **Concurrent searches**: 10+ simultaneous queries

### Bottlenecks
1. **Embedding**: CPU-bound, ~500ms per doc
2. **Vector search**: Memory-bound for large indexes
3. **File watching**: OS limits on open files

### Scaling Strategies
1. **Horizontal**: Multiple embedding workers
2. **Caching**: Keep hot embeddings in memory
3. **Sharding**: Separate work/personal indexes
4. **Incremental**: Only re-embed changed sections

## Error Handling

### File Watcher Failures
```typescript
watcher.on('error', async (error) => {
  console.error('Watcher error:', error);
  // Attempt restart after 5s
  setTimeout(() => restartWatcher(), 5000);
});
```

### Embedding Failures
```typescript
async function embedWithRetry(text: string, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await embedder.embed(text);
    } catch (error) {
      if (i === retries - 1) throw error;
      await sleep(1000 * Math.pow(2, i)); // Exponential backoff
    }
  }
}
```

### Database Connection Loss
```typescript
// Connection pool with auto-reconnect
const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  // Retry logic built-in
});
```

## Security Considerations

### Data Privacy
- **Local-first**: All processing on your machine
- **No external APIs**: Zero data leaves your network
- **Encrypted at rest**: PostgreSQL supports encryption
- **Access control**: Unix file permissions on vaults

### Input Validation
```typescript
// Sanitize file paths
function validatePath(path: string): boolean {
  // Must be within vault directories
  const resolved = resolve(path);
  return vaultPaths.some(vault => resolved.startsWith(vault));
}

// Sanitize search queries
function sanitizeQuery(query: string): string {
  // Limit length
  if (query.length > 1000) {
    query = query.substring(0, 1000);
  }
  // Strip SQL injection attempts
  return query.replace(/[;'"\\]/g, '');
}
```

## Monitoring

### Key Metrics

```typescript
interface SystemMetrics {
  // Storage
  totalDocuments: number;
  totalChunks: number;
  indexSize: number; // bytes
  
  // Performance
  avgSearchLatency: number; // ms
  avgEmbeddingTime: number; // ms
  
  // Health
  watcherActive: boolean;
  lastIndexTime: Date;
  failedEmbeddings: number;
}
```

### Logging

```typescript
// Structured logging
logger.info('Search completed', {
  query,
  results: results.length,
  latency: elapsed,
  sortBy: options.sortBy
});

logger.error('Embedding failed', {
  filePath,
  error: error.message,
  retries: attemptCount
});
```

## Future Enhancements

### Short-term
- [ ] Chunk-level embeddings (vs file-level)
- [ ] BM25 hybrid search (semantic + keyword)
- [ ] Query expansion (find similar terms)

### Medium-term
- [ ] Incremental embeddings (only changed sections)
- [ ] Multi-modal search (images, tables)
- [ ] Cross-vault linking detection

### Long-term
- [ ] Distributed indexing for >100K docs
- [ ] Real-time collaboration support
- [ ] Graph neural networks for relation prediction
