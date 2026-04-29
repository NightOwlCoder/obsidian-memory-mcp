# Restart Package: Obsidian RAG Memory MCP

## 1. Project Snapshot

**Mission**: Local RAG semantic search for 2 Obsidian vaults using BGE-M3 + PostgreSQL PGVector

**Current Strategy**: Chunk vault files, embed with BGE-M3, vector similarity search

**Environment**:
- Location: `ai/memory/obsidian-memory-mcp/`
- Branch: main
- PostgreSQL: 17.6 on localhost:5432
- Database: `obsidian_memory`
- Python: 3.13 venv

**Constraints**:
- 100% local (no API costs)
- BGE-M3 1024-dim embeddings
- Markdown source
- MCP protocol

---

## 2. Progress

### ✅ Complete

**Chunking**:
- `utils/chunker.ts`: 512-token chunks, 50-word overlap
- `storeChunk()` in VectorStorage
- Database schema: chunk_index, chunk_total columns
- Both vaults indexed: 9,337 chunks (139MB)

**Indexing Logic**:
- Memory files: Parse for observations (structured entities)
- Vault files: Raw content (regular notes)
- Location: `scripts/index.ts:44-56`

**Search**:
- No similarity threshold - returns top N by similarity
- Python path: `process.cwd()` (portable)
- npm start script added
- searchNodes returns chunk content directly

**Validation**:
- taa-robot-session-type-4: 30 chunks, 2,578 chars/chunk
- SQL: TAA content exists with 0.71 similarity
- MCP tool: Connects, returns results

### ❌ Critical Issue

**Poor search quality** (BLOCKING):
- Query: "TAA oncall" 
- Returns: kotlin (0.52), stuFF (0.52), emoji-sheet (0.51)
- Expected: taa-robot-session-type-4 (exists with 0.71 similarity in SQL)
- Root cause: BGE-M3 semantic embeddings don't match acronyms well

**SQL proof TAA exists**:
```sql
-- Returns taa-robot with 0.71 similarity
psql obsidian_memory -c "
SELECT entity_name, ROUND((1-(embedding<=>q.embedding))::numeric,3) as sim
FROM vector_chunks v, (SELECT embedding FROM vector_chunks 
WHERE content ILIKE '%oncall%TAA%' LIMIT 1) q
WHERE content ILIKE '%TAA%'
ORDER BY sim DESC LIMIT 3;"
```

But vector search for "TAA oncall" text returns wrong results.

---

## 3. Essential Artifacts

### Configuration
- `.env`: Vault paths, DATABASE_URL
- `package.json`: npm scripts (build, index, stats, start)

### Scripts
- `reindex-all.sh`: Truncate DB + index both vaults
- `test-taa-search.sh`: Test TAA search with timeout

### CLI Commands
```bash
cd ai/memory/obsidian-memory-mcp

# Check status
npm run stats

# Reindex everything
./reindex-all.sh

# Test search
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"search_nodes","arguments":{"query":"TAA","maxResults":5}},"id":1}' | timeout 10 npm start 2>&1

# SQL validation
psql obsidian_memory -c "SELECT entity_name, LEFT(content,100) FROM vector_chunks WHERE content ILIKE '%TAA%' LIMIT 3;"
```

### Key Code
**Indexing logic** (`scripts/index.ts:44-56`):
```typescript
const isMemoryEntity = filePath.includes('/memory/');
const fullContent = isMemoryEntity
  ? [parsed observations].join('\n')  // Structured
  : `# ${entityName}\n\n${content}`;  // Raw content
```

**searchNodes** (`storage/MarkdownStorageManager.ts:431-444`):
```typescript
// Returns chunk content directly, not file observations
const entity: Entity = {
  name: result.entityName,
  entityType: result.entityType,
  observations: [result.content]  // Chunk content
};
```

---

## 4. Next Steps

### Immediate

**Option A: Hybrid Search (BM25 + Vector)**
- Add keyword pre-filter before semantic search
- Use PostgreSQL full-text search + vector similarity
- Better for acronyms/exact matches

**Option B: Increase maxResults**
- Query with maxResults=50 to see if TAA appears lower
- May find correct results buried in results

**Option C: Different Embedding Model**
- Try all-MiniLM-L6-v2 (lighter, different semantics)
- Or multilingual model

### Blockers

- BGE-M3 semantic search doesn't match "TAA" acronym to document content well
- Need keyword + semantic hybrid approach

---

## 5. Open Questions

1. **Hybrid search**: Add PostgreSQL ts_vector full-text search?
2. **Embedding model**: Try different model or stick with BGE-M3?
3. **Acceptable similarity**: What threshold indicates "relevant"?

---

## Database State

- 9,337 chunks
- 139MB size
- Chunking working (avg 3.79 chunks/file, max 73)
- Content properly indexed (SQL shows TAA content exists)
- Search returns results but wrong ones (semantic mismatch)

---

## Test Validation

**Proves content exists**:
```bash
psql obsidian_memory -c "SELECT COUNT(*) FROM vector_chunks WHERE content ILIKE '%TAA%';"
# Returns: 356 chunks contain "TAA"
```

**But search fails**:
```bash
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"search_nodes","arguments":{"query":"TAA oncall","maxResults":5}},"id":1}' | timeout 10 npm start 2>&1
# Returns: kotlin, stuFF, emoji (all wrong, low similarity 0.31-0.52)
```

Search quality is the blocker, not implementation.

---

**End of restart package.**
