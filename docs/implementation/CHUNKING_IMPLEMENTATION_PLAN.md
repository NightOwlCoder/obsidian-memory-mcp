# Chunking Implementation Plan

**Status**: Ready for Implementation  
**Created**: 2025-01-09  
**Estimated Effort**: 22-30 hours

---

## Problem Statement

Current implementation uses simple word-based chunking that treats all files the same:
- Memory entities (Sergio.md with 1300+ observations) get randomly split at 512-token boundaries
- Vault notes lose document structure and heading context
- Relations lack semantic categorization for better search recall

**Example Issue**: Query "Sergio PE developer" might match chunk 47 (arbitrary mid-document split) instead of specific relevant observations.

---

## Solution Architecture

### Dual-Strategy Chunking

**Memory Entities** (structured data):
- **Observation-level chunking**: Each observation = one semantic chunk
- **Relation-level chunking**: Each relation = one semantic chunk with category
- Result: 1300+ focused fact chunks instead of ~20 random text blocks

**Vault Notes** (documents):
- **Docling HybridChunker**: Structure-aware chunking preserving heading hierarchy
- **Contextualized chunks**: Each chunk includes parent heading context
- Result: Semantically coherent chunks that understand document structure

---

## Key Design Decisions

### 1. Relation Categories

**Problem**: LLM creates arbitrary relation types inconsistently
- `works_at`, `has son`, `collaborates_with`, `married to` (mixed formats)

**Solution**: LLM-driven categorization
- Add `category` parameter to `create_relations` tool
- New `list_relation_categories` tool for discovery
- Categories: family, work, project, collaboration, skill, tool

**Storage Format**:
```markdown
## Relations
- `works_at` (work): [[Amazon]]
- `has_son` (family): [[Thiago]]
```

**Chunk Format**:
```
Sergio works_at Amazon (work)
Sergio has_son Thiago (family)
```

### 2. Relation Type Standardization

**Decision**: Use snake_case for all relation types
- `has_son` not "has son" or "has-son"
- Consistent, machine-friendly, fewer parsing issues
- Normalize on save: lowercase + replace spaces/hyphens with underscores

**Tool Description Update**:
```
Relation type naming rules:
- Use snake_case: "works_at", "has_son", "collaborates_with"
- Use active voice: "mentors" not "mentored_by"
- Check existing relations with list_relation_categories first
```

### 3. Observation Chunking

**Current (wrong)**:
```typescript
// All 1300 observations → one big text block → random chunks
const fullContent = observations.join('\n');
const chunks = chunkText(fullContent, {maxTokens: 512});
```

**New (correct)**:
```typescript
// Each observation = one semantic chunk
for (const obs of parsed.observations) {
  const chunkContent = `${entityName} (${entityType}): ${obs}`;
  await vectorStorage.storeChunk(entityName, filePath, chunkContent, ...);
}
```

---

## Implementation Phases

### Phase 1: Relation System Improvements ✅ COMPLETE (2 hours)

#### Task 1.1: Add Relation Categories

**Files to modify**:
- `types.ts`: Add `category?: string` to Relation interface
- `index.ts`: Update create_relations tool schema
- `storage/MarkdownStorageManager.ts`: Handle category in createRelations
- `utils/markdownUtils.ts`: Update generateMarkdown to include categories

**New tool to add**:
```typescript
server.tool("list_relation_categories", {
  description: "List all existing relation categories with usage counts",
  inputSchema: { type: "object", properties: {} }
}, async () => {
  // Scan all memory files, extract categories, count usage
  return { categories: [...] };
});
```

**Tool description updates**:
```typescript
/**
 * create_relations: Create typed relations between entities
 * 
 * WORKFLOW:
 * 1. Call list_relation_categories() to see existing categories
 * 2. Reuse existing category if appropriate
 * 3. Provide category parameter for each relation
 * 
 * Standard categories:
 * - family: Family relationships (spouse, children, relatives)
 * - work: Employment and workplace (employer, coworker)
 * - project: Projects and initiatives
 * - collaboration: Working relationships (mentors, collaborates_with)
 * - skill: Skills and expertise
 * - tool: Tools and technologies
 */
```

#### Task 1.2: Standardize Relation Types

**Files to modify**:
- `utils/markdownUtils.ts`: Add normalization function

```typescript
export function normalizeRelationType(relationType: string): string {
  return relationType
    .toLowerCase()
    .replace(/[\s-]/g, '_')  // spaces and hyphens → underscore
    .replace(/_+/g, '_');     // collapse multiple underscores
}
```

**Apply in**:
- `storage/MarkdownStorageManager.ts`: `createRelations()` method

#### Task 1.3: Migration Script

**New file**: `scripts/migrate-relations.ts`

```typescript
/**
 * Migrate existing relations:
 * 1. Normalize relation types to snake_case
 * 2. Infer categories for existing relations
 * 3. Update all memory markdown files
 */

const CATEGORY_INFERENCE = {
  family: /son|daughter|spouse|married|parent|sibling/i,
  work: /works_at|employer|coworker|colleague/i,
  project: /works_on|leads|develops|maintains/i,
  collaboration: /collaborates|mentored|guided/i,
  // ... more patterns
};

async function migrateRelations() {
  // Scan all memory files
  // For each relation:
  //   - Normalize relation type
  //   - Infer category (or default to 'other')
  //   - Rewrite markdown file
}
```

**Run**: `tsx scripts/migrate-relations.ts`

---

### Phase 2: Memory Entity Chunking ✅ COMPLETE (4 hours)

#### Task 2.1: Observation-Level Chunking

**Files to modify**:
- `scripts/index.ts`: Replace current chunking logic

**Before** (lines 44-56):
```typescript
const fullContent = isMemoryEntity
  ? [
      `# ${entityName}`,
      `Type: ${parsed.metadata.entityType}`,
      '',
      '## Observations',
      ...parsed.observations.map(obs => `- ${obs}`),
      '',
      '## Relations',
      ...parsed.relations.map(rel => `- ${rel.relationType}: ${rel.to}`)
    ].join('\n')
  : `# ${entityName}\n\n${content}`;

const chunks = chunkText(fullContent, { maxTokens: 512, overlap: 50 });
```

**After**:
```typescript
if (isMemoryEntity) {
  // Observation-level chunking
  let chunkIndex = 0;
  
  // Chunk each observation separately
  for (const obs of parsed.observations) {
    const chunkContent = `${entityName} (${parsed.metadata.entityType}): ${obs}`;
    await vectorStorage.storeChunk(
      entityName,
      filePath,
      chunkContent,
      chunkIndex++,
      parsed.observations.length + parsed.relations.length,  // Total chunks
      parsed.metadata.entityType || 'unknown',
      []
    );
  }
  
  // Chunk each relation separately (see Task 2.2)
  
} else {
  // Vault notes - use Docling (Phase 3)
}
```

#### Task 2.2: Relation-Level Chunking

**Continue in `scripts/index.ts`**:

```typescript
// After observation chunking:
for (const relation of parsed.relations) {
  const category = relation.category || 'uncategorized';
  const chunkContent = `${entityName} ${relation.relationType} ${relation.to} (${category})`;
  
  await vectorStorage.storeChunk(
    entityName,
    filePath,
    chunkContent,
    chunkIndex++,
    totalChunks,
    'relation',
    [category]  // Store category as tag
  );
}
```

#### Task 2.3: Update Search Results

**Files to modify**:
- `storage/MarkdownStorageManager.ts`: `searchNodes()` method (lines 431-444)

**Current issue**: Returns chunk content directly in observations
```typescript
observations: [result.content]  // Chunk content
```

**New approach**: Group chunks by entity, format for readability

```typescript
// Group chunks by entity name
const entitiesByName = new Map<string, Entity>();

for (const result of searchResults) {
  if (!entitiesByName.has(result.entityName)) {
    entitiesByName.set(result.entityName, {
      name: result.entityName,
      entityType: result.entityType || 'unknown',
      observations: [],
      similarity: result.similarity
    });
  }
  
  const entity = entitiesByName.get(result.entityName)!;
  
  // If this is observation chunk, add to observations
  if (result.entityType !== 'relation') {
    entity.observations.push(result.content);
  }
  
  // Keep highest similarity score
  entity.similarity = Math.max(entity.similarity || 0, result.similarity);
}

const entities = Array.from(entitiesByName.values());
```

---

### Phase 3: Vault Notes with Docling (8-10 hours)

#### Task 3.1: Add Docling Dependency

**File**: `requirements.txt`
```txt
sentence-transformers==2.2.2
torch==2.1.0
transformers==4.35.0
numpy==1.24.3
docling==1.0.0  # NEW
```

**Install**:
```bash
cd ai/memory/obsidian-memory-mcp
source venv/bin/activate
pip install -r requirements.txt
```

#### Task 3.2: Implement Docling Chunking

**New file**: `embeddings/docling_chunker.py`

```python
"""
Docling HybridChunker implementation for vault notes.
"""

from docling.document_converter import DocumentConverter
from docling.chunking import HybridChunker
from transformers import AutoTokenizer
import sys
import json

def chunk_markdown(file_path: str, max_tokens: int = 512):
    """
    Chunk markdown file using Docling HybridChunker.
    Returns array of contextualized chunks.
    """
    # Convert markdown to DoclingDocument
    converter = DocumentConverter()
    result = converter.convert(file_path)
    
    # Initialize chunker
    tokenizer = AutoTokenizer.from_pretrained("BAAI/bge-m3")
    chunker = HybridChunker(
        tokenizer=tokenizer,
        max_tokens=max_tokens,
        merge_peers=True
    )
    
    # Chunk document
    chunk_iter = chunker.chunk(dl_doc=result.document)
    chunks = []
    
    for i, chunk in enumerate(chunk_iter):
        # Get contextualized text (includes heading hierarchy)
        contextualized = chunker.contextualize(chunk=chunk)
        chunks.append({
            'index': i,
            'content': contextualized.strip(),
            'token_count': len(tokenizer.encode(contextualized))
        })
    
    return chunks

if __name__ == '__main__':
    # CLI interface for TypeScript to call
    file_path = sys.argv[1]
    max_tokens = int(sys.argv[2]) if len(sys.argv) > 2 else 512
    
    chunks = chunk_markdown(file_path, max_tokens)
    print(json.dumps(chunks))
```

**New file**: `utils/doclingChunker.ts`

```typescript
import { spawn } from 'child_process';
import path from 'path';

export interface DoclingChunk {
  index: number;
  content: string;
  token_count: number;
}

export async function chunkWithDocling(
  filePath: string,
  maxTokens: number = 512
): Promise<DoclingChunk[]> {
  const venvPython = path.join(process.cwd(), 'venv', 'bin', 'python');
  const chunkerScript = path.join(process.cwd(), 'embeddings', 'docling_chunker.py');
  
  return new Promise((resolve, reject) => {
    const python = spawn(venvPython, [chunkerScript, filePath, String(maxTokens)]);
    
    let output = '';
    python.stdout.on('data', (data) => { output += data.toString(); });
    python.stderr.on('data', (data) => { console.error('Docling:', data.toString()); });
    
    python.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Docling chunker failed with code ${code}`));
        return;
      }
      
      try {
        const chunks = JSON.parse(output);
        resolve(chunks);
      } catch (err) {
        reject(new Error(`Failed to parse Docling output: ${err}`));
      }
    });
  });
}
```

#### Task 3.3: Dual-Strategy Routing

**Update `scripts/index.ts`**:

```typescript
async function indexFile(vectorStorage: VectorStorage, filePath: string): Promise<boolean> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const entityName = getEntityNameFromPath(filePath);
    
    if (!entityName) {
      console.error(`⚠️  Could not extract entity name from: ${filePath}`);
      return false;
    }

    // Determine file type
    const isMemoryEntity = filePath.includes('/memory/');
    
    if (isMemoryEntity) {
      // MEMORY ENTITY: Observation + Relation level chunking
      const parsed = parseMarkdown(content, entityName);
      
      let chunkIndex = 0;
      const totalChunks = parsed.observations.length + parsed.relations.length;
      
      // Chunk observations
      for (const obs of parsed.observations) {
        const chunkContent = `${entityName} (${parsed.metadata.entityType}): ${obs}`;
        await vectorStorage.storeChunk(
          entityName, filePath, chunkContent,
          chunkIndex++, totalChunks,
          parsed.metadata.entityType || 'unknown',
          []
        );
      }
      
      // Chunk relations
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
      
    } else {
      // VAULT NOTE: Docling HybridChunker
      const doclingChunks = await chunkWithDocling(filePath, 512);
      
      for (let i = 0; i < doclingChunks.length; i++) {
        await vectorStorage.storeChunk(
          entityName,
          filePath,
          doclingChunks[i].content,
          i,
          doclingChunks.length,
          'document',
          []
        );
      }
    }

    return true;
  } catch (error) {
    console.error(`❌ Failed to index ${filePath}:`, error);
    return false;
  }
}
```

---

### Phase 4: Testing & Validation (4-6 hours)

#### Task 4.1: Test Memory Entity Search

**Test cases**:

1. **Query: "Sergio PE developer"**
   - Expected: Returns observation chunks mentioning PE/Principal Engineer
   - Verify: Top results have high similarity (>0.85)
   - Verify: Chunks are single observations, not random text blocks

2. **Query: "Sergio family"**
   - Expected: Returns relation chunks with family category
   - Verify: "has_son Thiago (family)" appears in results
   - Verify: Category tag improves similarity score

3. **Query: "Sergio"**
   - Expected: Returns top N most relevant chunks (not all 1300+)
   - Verify: Results are ranked by similarity
   - Verify: Search completes in <100ms

**Test script**: `scripts/test-memory-search.ts`

```typescript
async function testMemorySearch() {
  const storage = new MarkdownStorageManager();
  
  console.log('\n=== Test 1: PE developer query ===');
  const result1 = await storage.searchNodes('Sergio PE developer', {
    maxResults: 5
  });
  console.log(`Found ${result1.entities.length} entities`);
  console.log('Top observations:', result1.entities[0]?.observations.slice(0, 3));
  
  console.log('\n=== Test 2: Family query ===');
  const result2 = await storage.searchNodes('Sergio family', {
    maxResults: 5,
    includeFields: ['relations']
  });
  console.log('Relations:', result2.relations);
  
  console.log('\n=== Test 3: General query ===');
  const result3 = await storage.searchNodes('Sergio', {
    maxResults: 10
  });
  console.log(`Found ${result3.entities.length} entities`);
  console.log('Similarity scores:', result3.entities.map(e => (e as any).similarity));
}
```

#### Task 4.2: Test Vault Note Search

**Prerequisites**: Index sample vault notes with varied structure

**Test cases**:

1. **Markdown with nested headings**
   - Verify: Chunks preserve heading context
   - Example: "# Project X > ## Architecture > ### Database" appears in chunk

2. **Code blocks and tables**
   - Verify: Docling handles special markdown elements
   - Verify: Code blocks are chunked coherently

3. **Long documents**
   - Verify: Chunking respects semantic boundaries
   - Verify: No mid-sentence cuts

#### Task 4.3: Performance Testing

**Metrics to measure**:

1. **Indexing time**
   - Sergio.md (1300 observations) → 1300 chunks
   - Expected: ~5-10 seconds for full file

2. **Search latency**
   - Database now has 10K+ chunks (vs 2K before)
   - Expected: <100ms for p95

3. **Embedding efficiency**
   - Observation-level: More embed calls but smaller texts
   - Monitor: BGE-M3 service responsiveness

**Performance test script**: `scripts/benchmark.ts`

```typescript
async function benchmarkIndexing() {
  const start = Date.now();
  await indexFile(vectorStorage, '/path/to/Sergio.md');
  const elapsed = Date.now() - start;
  
  console.log(`Indexed Sergio.md in ${elapsed}ms`);
  console.log(`Throughput: ${1300 / (elapsed / 1000)} observations/sec`);
}

async function benchmarkSearch() {
  const queries = [
    'Sergio PE developer',
    'Sergio family',
    'weblab MCP integration',
    'TimeTrack Flutter app'
  ];
  
  for (const query of queries) {
    const start = Date.now();
    await storage.searchNodes(query, { maxResults: 10 });
    const elapsed = Date.now() - start;
    console.log(`Query "${query}": ${elapsed}ms`);
  }
}
```

---

## Success Criteria

### Phase 1 ✅ COMPLETE
- ✅ Migration script normalizes all relations to snake_case
- ✅ All existing relations have inferred categories (30 relations across 5 files)
- ✅ Duplicates removed (2 from Sergio.md)
- ✅ Synonyms merged (provides_guidance variants)
- ✅ Temporal prefixes removed (is_, -ing forms)
- ⏸️ `list_relation_categories` tool - deferred to Phase 2
- ⏸️ `create_relations` category parameter - deferred to Phase 2

### Phase 2 ✅ COMPLETE
- ✅ Implemented observation-level chunking (each observation = one chunk)
- ✅ Implemented relation-level chunking with categories
- ✅ Switched from BGE-M3 to Nomic Embed v1 (768 dims, 86.2% accuracy)
- ✅ Added dynamic inline validation (totalFiles/20 checks)
- ✅ Reindexed 103/104 files successfully
- ✅ Search quality: 0.811 similarity for "Sergio PE developer" (was 0.245)
- ✅ Validation results: 13/20 found in top 5 (65% success rate during indexing)
- ✅ Semantic search now works correctly with acronyms and proper nouns

### Phase 3
- ✅ Vault notes are indexed with Docling HybridChunker
- ✅ Chunks preserve document structure (headings)
- ✅ Code blocks and tables are handled correctly
- ✅ Both memory entities and vault notes are searchable

### Phase 4
- ✅ "Sergio PE developer" returns relevant observation chunks
- ✅ "Sergio family" returns family relation chunks
- ✅ Search latency stays <100ms at p95
- ✅ All tests pass

---

## Rollback Plan

If major issues arise:

1. **Revert to simple chunking**: Keep `utils/chunker.ts` as fallback
2. **Database truncate**: `psql obsidian_memory -c "TRUNCATE vector_chunks;"`
3. **Reindex with old code**: Checkout previous commit, run `./reindex-all.sh`

---

## Next Steps

1. Review this plan with Sergio
2. Toggle to ACT MODE
3. Implement Phase 1 (Relation improvements)
4. Test Phase 1 thoroughly
5. Proceed to Phase 2 (Memory chunking)
6. Iterate through remaining phases

**Ready to begin implementation!**
