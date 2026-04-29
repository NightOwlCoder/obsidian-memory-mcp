# Session 2: Chunking Implementation Plan

**Status**: Required for functional RAG search  
**Estimated Time**: 2-3 hours  
**Reference**: https://github.com/coleam00/ottomator-agents/blob/main/docling-rag-agent/docling_basics/04_hybrid_chunking.py

---

## Why We Need This

### Current Problem

```
Sergio.md (109KB) → 1 embedding
Search "PE developer goals" → 0 results (buried in huge vector)
```

### With Chunking

```
Sergio.md (109KB) → ~220 chunks of 512 tokens each
Search "PE developer goals" → Finds specific chunk with that content
```

---

## Docling HybridChunker Strategy

From the example, key learnings:

### 1. Token-Aware Chunking
```python
chunker = HybridChunker(
    tokenizer=tokenizer,
    max_tokens=512,  # Fits embedding model limits
    merge_peers=True  # Combine small adjacent chunks
)
```

### 2. Respects Document Structure
- Doesn't split mid-sentence
- Respects paragraphs, sections, tables
- Preserves semantic boundaries

### 3. Context Preservation
```python
# Add headings and document context to each chunk
contextualized_text = chunker.contextualize(chunk=chunk)
```

### 4. Metadata Tracking
- Chunk index (1 of 220)
- Total chunks per document
- Source document reference

---

## Implementation Plan

### Step 1: Install Docling (10 min)

```bash
cd ai/memory/obsidian-memory-mcp
source venv/bin/activate
pip install docling
```

### Step 2: Update Database Schema (5 min)

```sql
-- Add chunking support
ALTER TABLE vector_chunks ADD COLUMN chunk_index INTEGER DEFAULT 0;
ALTER TABLE vector_chunks ADD COLUMN chunk_total INTEGER DEFAULT 1;
ALTER TABLE vector_chunks ADD COLUMN chunk_text TEXT;

-- Update unique constraint
ALTER TABLE vector_chunks DROP CONSTRAINT unique_entity_file;
ALTER TABLE vector_chunks ADD CONSTRAINT unique_entity_file_chunk 
  UNIQUE(entity_name, file_path, chunk_index);
```

### Step 3: Create Chunking Function (30 min)

**File**: `embeddings/chunker.py`

```python
from docling.chunking import HybridChunker
from transformers import AutoTokenizer

def chunk_text(text: str, max_tokens: int = 512):
    """Chunk text using Docling's HybridChunker."""
    # Use same tokenizer as BGE-M3
    tokenizer = AutoTokenizer.from_pretrained("sentence-transformers/all-MiniLM-L6-v2")
    
    chunker = HybridChunker(
        tokenizer=tokenizer,
        max_tokens=max_tokens,
        merge_peers=True
    )
    
    # Convert markdown to simple doc structure
    # (or use full Docling converter for better results)
    chunks = chunker.chunk_text(text)
    
    return [chunk.text for chunk in chunks]
```

### Step 4: Update Indexing Script (45 min)

**Modify `scripts/index.ts`**:

```typescript
async function indexFile(vectorStorage, filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  
  // Chunk the content
  const chunks = await chunkText(content, 512); // Call Python chunker
  
  // Index each chunk
  for (let i = 0; i < chunks.length; i++) {
    await vectorStorage.storeChunk(
      entityName,
      filePath,
      chunks[i],
      i,              // chunk_index
      chunks.length   // chunk_total
    );
  }
}
```

### Step 5: Update VectorStorage (30 min)

Add `storeChunk()` method:
```typescript
async storeChunk(
  entityName: string,
  filePath: string,
  chunkText: string,
  chunkIndex: number,
  chunkTotal: number
) {
  const embedding = await this.embed(chunkText);
  // Store with chunk metadata
}
```

### Step 6: Update Search Results (20 min)

```typescript
// Return best matching chunks
// Group by source file
// Show chunk context with headings
```

### Step 7: Re-index Everything (30 min)

```bash
# Clear database
psql obsidian_memory -c "TRUNCATE vector_chunks;"

# Re-index with chunking
npm run index -- --memory-dir /Users/sibagy/fileZ/obsidian/pessoAll
npm run index -- --memory-dir /Users/sibagy/fileZ/obsidian/vault
```

### Step 8: Test Search Quality (10 min)

```bash
# Should now find results!
search_nodes("Sergio PE developer")
search_nodes("code review best practices")
```

---

## Expected Results

### Before (Current)
- 2,039 files → 2,039 embeddings
- Sergio.md (109KB) → 1 embedding
- Search: 0 results

### After (With Chunking)
- 2,039 files → ~15,000 chunks → 15,000 embeddings
- Sergio.md (109KB) → ~220 chunks
- Search: Relevant chunks returned with context

---

## Alternative: Simpler Token-Based Chunking

If Docling HybridChunker is too complex, start with simple:

```typescript
function simpleChunk(text: string, maxTokens: number = 512): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let current: string[] = [];
  let tokenCount = 0;
  
  for (const word of words) {
    // Rough estimate: 1 token ≈ 4 chars
    const wordTokens = Math.ceil(word.length / 4);
    
    if (tokenCount + wordTokens > maxTokens && current.length > 0) {
      chunks.push(current.join(' '));
      current = [];
      tokenCount = 0;
    }
    
    current.push(word);
    tokenCount += wordTokens;
  }
  
  if (current.length > 0) {
    chunks.push(current.join(' '));
  }
  
  return chunks;
}
```

**Pros**: No Docling dependency, simpler  
**Cons**: Doesn't respect document structure

---

## Decision Point

**Option A**: Use Docling HybridChunker (proper way, 3 hours)  
**Option B**: Simple token chunking (quick fix, 1 hour)

Recommend: Start with B, upgrade to A later.

---

## Next Steps

1. Choose chunking strategy (A or B)
2. Implement in fresh session
3. Re-index with chunking
4. Test search
5. Verify quality improvement

**This is the missing piece to make RAG actually work!**
