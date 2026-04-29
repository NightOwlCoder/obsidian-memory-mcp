# Known Issues & Required Fixes

**Status**: ⚠️ System 80% complete, needs chunking implementation  
**Date**: 2025-01-07

---

## Critical Issue: No Chunking Implementation

### The Problem

Currently embedding ENTIRE files as single vectors:
- Sergio.md: 109KB → 1 embedding
- This is wrong for RAG!

### Why It's Broken

1. **Poor search quality**: One huge embedding doesn't capture specific concepts
2. **Context loss**: "PE developer goals" buried in 109KB of text
3. **Not following RAG best practices**: Should chunk before embedding

### The Docling Way (Correct)

From docling-rag-agent example:
```python
# 1. Parse document with Docling
doc = converter.convert(file)

# 2. Chunk semantically
chunks = chunk_document(doc, 
    chunk_size=1000,  # chars
    overlap=100        # char overlap
)

# 3. Embed each chunk
for chunk in chunks:
    embedding = embed(chunk)
    store_chunk(embedding)
```

### What We Need

**Update scripts/index.ts**:
```typescript
// Current (wrong):
content = readFile()           // 109KB
embedding = embed(content)     // 1 huge vector

// Should be:
content = readFile()           // 109KB
chunks = chunkText(content, {  // Split into chunks
  size: 1000,
  overlap: 100
})
for (chunk of chunks) {        // Multiple vectors
  embedding = embed(chunk)
  store_chunk(embedding)
}
```

**Update schema**: 
```sql
-- Add chunk_index and chunk_total
ALTER TABLE vector_chunks ADD COLUMN chunk_index INTEGER;
ALTER TABLE vector_chunks ADD COLUMN chunk_total INTEGER;
```

**Update search**:
- Returns best matching chunks
- Groups chunks from same file
- Shows chunk context

---

## Other Issues

### 1. Sergio.md Not Searchable

**Symptom**: Search for "Sergio" returns 0 results  
**Cause**: 109KB file embedded as one vector, similarity likely <0.7  
**Fix**: Chunking will solve this

### 2. loadAllRelations() Still Reads All Memory Files

**Location**: Line ~150 in MarkdownStorageManager.ts  
**Impact**: Relations loading not optimized  
**Fix**: Also apply lazy loading for relations

### 3. YAML Parsing Errors

**Files**: 2 template files in work vault  
**Impact**: Minor, safely skipped  
**Fix**: Already handled with try/catch

---

## Priority Fixes

**P0 - Critical (Blocks usage)**:
1. ✅ Performance: Load only matched files (FIXED)
2. ❌ Chunking: Implement text chunking (NEEDS FIX)

**P1 - High (Degrades quality)**:
3. ❌ Similarity threshold: May need tuning after chunking
4. ❌ Relations optimization

**P2 - Medium (Future enhancements)**:
5. Docling multi-format support (PDF, images, audio)
6. File watching integration
7. Incremental updates

---

## Recommended Next Session

### Session 2: Chunking Implementation (2 hours)

**Tasks**:
1. Add chunking function (from Docling example)
2. Update database schema for chunks
3. Modify indexing script
4. Re-index with chunking
5. Test search quality

**Reference**:
- https://github.com/coleam00/ottomator-agents/tree/main/docling-rag-agent
- See `ingestion/chunker.py` for implementation

---

## Current Status

**What Works**:
- ✅ Infrastructure (PostgreSQL, BGE-M3)
- ✅ 2,039 files indexed
- ✅ Fast search (only loads matched files)
- ✅ Embeddings generation
- ✅ MCP server

**What Doesn't Work**:
- ❌ Search quality (no chunking)
- ❌ Large files (>10KB) not searchable effectively

**Estimated to Fix**: 2-3 hours in next session

---

## Learning

**Mistake**: Rushed to indexing without implementing proper RAG fundamentals  
**Lesson**: Always chunk documents before embedding  
**Reference**: Read Docling RAG agent code more carefully

Good news: Infrastructure is solid, just need chunking!
