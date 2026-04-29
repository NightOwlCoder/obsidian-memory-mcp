# ADR 003: RAG Integration Strategy

**Date**: 2025-01-07  
**Status**: Accepted  
**Deciders**: Sergio, Kova (AI assistant)

## Context

Need to decide how to integrate RAG (Retrieval Augmented Generation) capabilities into the existing Obsidian memory MCP while maintaining the graph structure and Obsidian compatibility.

### Requirements

1. Semantic search across entire knowledge base (~10K notes, 2 vaults)
2. Maintain graph structure (entities, relations, observations)
3. Keep Obsidian markdown files as source of truth
4. Auto-sync when files change
5. Support multiple sort strategies (relevance, recency, hybrid)

## Decision

**Chosen: Dual-Layer Architecture**

Combine graph structure (existing) with vector search (new):

```
┌────────────────────────────────────────┐
│     Obsidian Markdown Files            │
│     (Source of Truth)                  │
└──────────┬─────────────────────────────┘
           │
           │ (File Watcher)
           │
    ┌──────▼──────┐
    │   Memory    │
    │    MCP      │
    └──────┬──────┘
           │
    ┏━━━━━━▼━━━━━━┓━━━━━━━━━┓
    ┃ Graph       ┃ Vector  ┃
    ┃ Structure   ┃ Search  ┃
    ┃ (entities,  ┃ (RAG,   ┃
    ┃  relations) ┃  BGE-M3)┃
    ┗━━━━━━━━━━━━━┛━━━━━━━━━┛
```

### Rationale

#### Why Not Pure RAG?

**Problem**: Lose structured relationships
- Can't traverse graph: "Who does Sergio report to?"
- Can't enforce constraints: "All projects must have owner"
- Can't visualize in Obsidian graph view
- Harder to manage entity lifecycle

#### Why Not Pure Graph?

**Problem**: Limited search capabilities
- Exact match only: "PE goals" won't find "Principal Engineer career"
- No fuzzy matching: Typos break search
- No semantic similarity: "mentorship" won't find "mentor" relation
- No recency sorting: Can't find "recent work"

#### Why Hybrid Works

**Best of Both**:
- Graph: Structured queries, relations, lifecycle management
- RAG: Semantic search, fuzzy matching, relevance ranking

**Use Cases**:
```typescript
// Graph strength: Exact traversal
search_nodes("Sergio", { includeFields: ["relations"] })
→ Returns: mentored-by [[Doug Hains]]

// RAG strength: Fuzzy semantic
search_nodes("principal engineer career goals")
→ Returns: Sergio (observation: "Aspiring PE developer")

// Combined: Recent + semantic
search_nodes("code review", { 
  sortBy: "modified",
  dateFilter: { after: "2025-01-01" }
})
→ Returns: Recent CR-related entities
```

## Implementation

### Storage Layer

**PostgreSQL Schema**:
```sql
CREATE TABLE vector_chunks (
  id UUID PRIMARY KEY,
  entity_name TEXT,              -- Links to graph
  file_path TEXT,
  content TEXT,
  embedding vector(1024),
  
  -- Metadata for graph integration
  entity_type TEXT,
  outgoing_relations JSONB,
  incoming_relations JSONB,
  
  -- Metadata for sorting
  created_at TIMESTAMP,
  modified_at TIMESTAMP
);
```

**Key Design Points**:
- One row per entity (not per chunk)
- Embeddings on full entity content
- JSONB stores relations for denormalization
- Timestamps enable recency sorting

### File Watching

**Auto-Sync Pipeline**:
```
File changes in Obsidian
    ↓
chokidar detects (debounced 100ms)
    ↓
Parse markdown (frontmatter, observations, relations)
    ↓
Generate embedding via BGE-M3
    ↓
Update PostgreSQL vector_chunks
    ↓
Graph + RAG now in sync
```

**Benefits**:
- Bidirectional sync (Obsidian ↔ RAG)
- LLM writes → file watcher picks up
- Human edits → automatically indexed
- Single flow for all updates

### Search Integration

**Enhanced search_nodes**:
```typescript
async searchNodes(query, options) {
  // 1. Embed query with BGE-M3
  const queryEmbed = await embedder.embed(query);
  
  // 2. Vector similarity search
  const vectorResults = await pgvector.search(queryEmbed, {
    minSimilarity: options.minSimilarity || 0.7,
    limit: options.maxResults * 2  // Over-fetch for filtering
  });
  
  // 3. Apply date filters
  const filtered = dateFilter(vectorResults, options.dateFilter);
  
  // 4. Apply sort strategy
  const sorted = sort(filtered, options.sortBy);
  
  // 5. Enrich with graph data
  const enriched = await enrichWithRelations(sorted);
  
  // 6. Return limited results
  return enriched.slice(0, options.maxResults);
}
```

## Alternatives Considered

### Option A: Separate Graph + RAG Services

**Design**:
```
graph-mcp (entities, relations)
rag-mcp (semantic search)
```

**Pros**:
- Clear separation of concerns
- Can scale independently

**Cons**:
- Two MCPs to configure
- Sync complexity between services
- Harder to maintain consistency

**Rejected**: Too complex for single-user system

### Option B: RAG Only, Relations as Text

**Design**:
```
Store everything as text:
"Sergio mentors Doug Hains"
"Sergio works on iOS Optimization"
```

**Pros**:
- Simpler implementation
- Pure RAG approach

**Cons**:
- Can't traverse graph programmatically
- Harder to enforce constraints
- Loses Obsidian graph view
- Ambiguous parsing: "Sergio mentors" vs "Sergio, mentors"

**Rejected**: Loses key value of graph structure

### Option C: Graph Only, Semantic via LLM

**Design**:
```
Use LLM to translate semantic queries to exact queries:
"PE goals" → LLM rewrites → "PE Developer"
Then exact graph search
```

**Pros**:
- No RAG infrastructure needed

**Cons**:
- Slow (LLM call per query)
- Expensive (API costs)
- Quality depends on LLM, not deterministic
- Still can't do recency sorting effectively

**Rejected**: Too slow and expensive

## Consequences

### Positive

- ✅ Semantic search: "PE goals" finds "Principal Engineer"
- ✅ Fuzzy matching: Typos don't break search
- ✅ Recency sorting: Find recent work easily
- ✅ Graph structure: Still have relations, constraints
- ✅ Obsidian compatible: Graph view still works
- ✅ Auto-sync: Edit anywhere, search anywhere
- ✅ Single API: One `search_nodes` does everything

### Negative

- ❌ More complex: Graph + Vector storage
- ❌ More resources: PostgreSQL + embeddings
- ❌ Dual storage: Need to keep in sync
- ❌ Initial indexing: ~30 min for 1K notes

### Neutral

- Slightly higher memory usage (~1GB more for vectors)
- Need to monitor sync lag (should be <1s)

## Validation

Success criteria:
- [ ] Search quality: 80%+ precision on semantic queries
- [ ] Sync lag: <1s from file change to searchable
- [ ] No data loss: Graph and RAG always consistent
- [ ] Performance: <100ms search latency (p95)

## Migration Path

### Phase 1: Add Vector Storage (Week 1)
- Create PostgreSQL schema
- Implement embedding pipeline
- Keep existing graph queries working

### Phase 2: Add File Watching (Week 1)
- Implement chokidar watcher
- Connect to embedding pipeline
- Verify auto-sync works

### Phase 3: Enhance Search (Week 2)
- Update `search_nodes` to use RAG
- Add sort strategies
- Add date filtering
- Test search quality

## References

- [RAG Paper](https://arxiv.org/abs/2005.11401)
- [Hybrid Search Patterns](https://www.pinecone.io/learn/hybrid-search-intro/)
- [PGVector Best Practices](https://github.com/pgvector/pgvector#best-practices)
- [docling-rag-agent](https://github.com/coleam00/ottomator-agents/tree/main/docling-rag-agent)

## Related Decisions

- [ADR-001: Local-First Embeddings](./01-local-first.md) - Why BGE-M3
- [ADR-002: Tool Minimalism](./02-tool-minimalism.md) - Why 6 tools

## Future Enhancements

Potential improvements (not in v1):

- **Chunk-level embeddings**: Split large entities
- **BM25 hybrid**: Combine semantic + keyword search
- **Multi-modal**: Search images, tables
- **Incremental updates**: Only re-embed changed sections
- **Cross-vault search**: Search personal + work together
