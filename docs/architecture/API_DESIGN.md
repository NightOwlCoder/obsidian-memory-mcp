# API Design

> Detailed specification of all MCP tools

## Tool Overview

The RAG-enhanced memory MCP exposes **9 tools** to LLM agents:

| Tool | Category | Purpose |
|------|----------|---------|
| `search_nodes` | Query | Semantic search with RAG |
| `open_nodes` | Query | Open specific nodes by name |
| `read_graph` | Query | Read entire knowledge graph |
| `create_entities` | Write | Create new knowledge graph entities |
| `create_relations` | Write | Connect entities with typed relations |
| `add_observations` | Write | Add facts to existing entities |
| `delete_entities` | Write | Remove entities and files |
| `delete_observations` | Write | Remove specific facts |
| `delete_relations` | Write | Remove connections |

---

## 1. search_nodes

**Purpose**: Semantic search across knowledge graph using RAG

**Category**: Query (read-only)

### Input Schema

```typescript
{
  query: string;                    // REQUIRED: Search query
  maxResults?: number;              // Optional: Max results (default: 10)
  includeFields?: string[];         // Optional: Fields to include
  sortBy?: string;                  // Optional: Sort strategy
  dateFilter?: {                    // Optional: Date range filter
    after?: string;                 // ISO date string
    before?: string;                // ISO date string
  };
  minSimilarity?: number;           // Optional: Similarity threshold (0-1)
}
```

### Parameters

**query** (required)
- Type: `string`
- Description: The search query to find relevant information
- Examples:
  - `"Sergio PE developer goals"`
  - `"code review best practices"`
  - `"Doug Hains mentorship"`

**maxResults** (optional)
- Type: `number`
- Default: `10`
- Range: `1-100`
- Description: Maximum number of results to return

**includeFields** (optional)
- Type: `string[]`
- Default: `["observations", "relations"]`
- Options:
  - `"observations"` - Include entity observations
  - `"relations"` - Include outgoing/incoming relations
  - `"categories"` - Include observation categories
  - `"metadata"` - Include file metadata
- Description: Control response size by selecting fields

**sortBy** (optional)
- Type: `string`
- Default: `"relevance"`
- Options:
  - `"relevance"` - Sort by semantic similarity score
  - `"modified"` - Sort by last modified date
  - `"created"` - Sort by creation date
  - `"relevance+recency"` - Hybrid: 70% relevance + 30% recency
- Description: How to rank search results

**dateFilter** (optional)
- Type: `{ after?: string, before?: string }`
- Format: ISO 8601 date strings
- Examples:
  - `{ after: "2025-01-01" }` - Only results after Jan 1
  - `{ before: "2025-01-31" }` - Only results before Jan 31
  - `{ after: "2025-01-01", before: "2025-01-31" }` - January only
- Description: Filter results by date range

**minSimilarity** (optional)
- Type: `number`
- Default: `0.7`
- Range: `0.0-1.0`
- Description: Minimum cosine similarity score to include

### Output Schema

```typescript
{
  entities: Entity[];
  relations: Relation[];
  metadata: {
    query: string;
    totalMatches: number;
    returnedCount: number;
    hasMore: boolean;
    searchType: "semantic";
    sortedBy: string;
    minSimilarity: number;
  };
}

interface Entity {
  name: string;
  entityType: string;
  observations: string[];
  metadata?: {
    created: string;
    modified: string;
    filePath: string;
    tags?: string[];
  };
  similarity?: number;  // 0.0-1.0, only for semantic search
}

interface Relation {
  from: string;
  to: string;
  relationType: string;
}
```

### Examples

#### Example 1: Simple search with Nomic Embed v1
```typescript
search_nodes("Sergio PE goals")

// Response
{
  entities: [{
    name: "Sergio",
    entityType: "person",
    observations: [
      "Aspiring PE developer at Amazon",
      "Working on iOS size optimization",
      "Mentored by Doug Hains"
    ],
    metadata: {
      created: "2024-01-15",
      modified: "2025-01-07",
      filePath: "memory/people/Sergio.md"
    },
    similarity: 0.92
  }],
  relations: [{
    from: "Sergio",
    to: "PE Developer",
    relationType: "aspires-to"
  }],
  metadata: {
    query: "Sergio PE goals",
    totalMatches: 1,
    returnedCount: 1,
    hasMore: false,
    searchType: "semantic",
    sortedBy: "relevance",
    minSimilarity: 0.7
  }
}
```

#### Example 2: Recent work notes
```typescript
search_nodes("code review best practices", {
  sortBy: "modified",
  dateFilter: { after: "2025-01-01" },
  maxResults: 5
})

// Returns 5 most recently modified notes about code reviews
```

#### Example 3: Minimal response (token-efficient)
```typescript
search_nodes("Doug Hains", {
  maxResults: 1,
  includeFields: ["relations"]
})

// Returns just relations, no observations (saves tokens)
```

#### Example 4: Hybrid search (relevance + recency)
```typescript
search_nodes("PE developer career", {
  sortBy: "relevance+recency",
  maxResults: 10
})

// Balances matching relevance with recent updates
```

---

## 2. create_entities

**Purpose**: Create new entities in the knowledge graph

**Category**: Write

### Input Schema

```typescript
{
  entities: Array<{
    name: string;           // REQUIRED: Entity name
    entityType: string;     // REQUIRED: Entity type
    observations: string[]; // REQUIRED: Initial observations
  }>;
}
```

### Parameters

**entities** (required)
- Type: `Array<Entity>`
- Description: Array of entities to create
- Constraints:
  - Each entity must have unique name
  - Entity names become filenames (sanitized)
  - Observations array must not be empty

### Output Schema

```typescript
Entity[]  // Array of created entities
```

### Example

```typescript
create_entities({
  entities: [{
    name: "Doug Hains",
    entityType: "person",
    observations: [
      "Senior PE at Amazon",
      "Mentors Sergio",
      "Expert in systems design"
    ]
  }, {
    name: "iOS Size Optimization",
    entityType: "project",
    observations: [
      "Reducing app binary size",
      "WeblabIOSClient refactoring",
      "Target: 20MB reduction"
    ]
  }]
})

// Creates:
// - memory/people/Doug_Hains.md
// - memory/projects/iOS_Size_Optimization.md
// - Both files automatically indexed in RAG
```

---

## 3. create_relations

**Purpose**: Create typed relations between entities

**Category**: Write

### Input Schema

```typescript
{
  relations: Array<{
    from: string;        // REQUIRED: Source entity name
    to: string;          // REQUIRED: Target entity name
    relationType: string; // REQUIRED: Relation type (active voice)
  }>;
}
```

### Parameters

**relations** (required)
- Type: `Array<Relation>`
- Description: Array of relations to create
- Constraints:
  - Both entities must exist
  - Relation types should be in active voice
  - Examples: "mentors", "works-on", "reports-to"

### Output Schema

```typescript
Relation[]  // Array of created relations
```

### Example

```typescript
create_relations({
  relations: [{
    from: "Doug Hains",
    to: "Sergio",
    relationType: "mentors"
  }, {
    from: "Sergio",
    to: "iOS Size Optimization",
    relationType: "works-on"
  }]
})

// Updates markdown files:
// Doug_Hains.md gets: - `mentors`: [[Sergio]]
// Sergio.md gets: - `works-on`: [[iOS Size Optimization]]
```

---

## 4. add_observations

**Purpose**: Add new observations to existing entities

**Category**: Write

### Input Schema

```typescript
{
  observations: Array<{
    entityName: string;  // REQUIRED: Target entity
    contents: string[];  // REQUIRED: New observations
  }>;
}
```

### Parameters

**observations** (required)
- Type: `Array<{ entityName: string, contents: string[] }>`
- Description: Observations to add
- Constraints:
  - Entity must exist
  - Duplicates are filtered out
  - Empty contents array is no-op

### Output Schema

```typescript
Array<{
  entityName: string;
  addedObservations: string[];
}>
```

### Example

```typescript
add_observations({
  observations: [{
    entityName: "Sergio",
    contents: [
      "Completed iOS size optimization Q1 goal",
      "Started PE interview prep"
    ]
  }]
})

// Appends to Sergio.md:
// ## Observations
// - Aspiring PE developer at Amazon  (existing)
// - Completed iOS size optimization Q1 goal  (new)
// - Started PE interview prep  (new)
```

---

## 5. delete_entities

**Purpose**: Delete entities and their associated data

**Category**: Write (destructive)

### Input Schema

```typescript
{
  entityNames: string[];  // REQUIRED: Entity names to delete
}
```

### Parameters

**entityNames** (required)
- Type: `string[]`
- Description: Names of entities to delete
- Side effects:
  - Deletes markdown file
  - Removes from vector database
  - Cleans up relations pointing to entity

### Output Schema

```typescript
{
  message: string;  // "Entities deleted successfully"
}
```

### Example

```typescript
delete_entities({
  entityNames: ["Old Project", "Deprecated Tool"]
})

// Deletes:
// - memory/projects/Old_Project.md
// - memory/tools/Deprecated_Tool.md
// - All vector embeddings
// - All incoming relations
```

---

## 6. delete_observations

**Purpose**: Remove specific observations from entities

**Category**: Write (destructive)

### Input Schema

```typescript
{
  deletions: Array<{
    entityName: string;     // REQUIRED: Target entity
    observations: string[]; // REQUIRED: Observations to remove
  }>;
}
```

### Parameters

**deletions** (required)
- Type: `Array<{ entityName: string, observations: string[] }>`
- Description: Observations to remove
- Constraints:
  - Must match observation text exactly
  - Entity must exist
  - Non-matching observations are ignored

### Output Schema

```typescript
{
  message: string;  // "Observations deleted successfully"
}
```

### Example

```typescript
delete_observations({
  deletions: [{
    entityName: "Sergio",
    observations: [
      "Outdated observation from 2023"
    ]
  }]
})

// Removes line from Sergio.md
// Re-embeds file without that observation
```

---

## 7. delete_relations

**Purpose**: Remove typed relations between entities

**Category**: Write (destructive)

### Input Schema

```typescript
{
  relations: Array<{
    from: string;         // REQUIRED: Source entity
    to: string;           // REQUIRED: Target entity
    relationType: string; // REQUIRED: Exact relation type
  }>;
}
```

### Parameters

**relations** (required)
- Type: `Array<Relation>`
- Description: Relations to remove
- Constraints:
  - Must match all three fields exactly
  - Entity must exist
  - Relation must exist

### Output Schema

```typescript
{
  message: string;  // "Relations deleted successfully"
}
```

### Example

```typescript
delete_relations({
  relations: [{
    from: "Sergio",
    to: "Old Project",
    relationType: "works-on"
  }]
})

// Removes from Sergio.md:
// - `works-on`: [[Old Project]]
```

---

## Error Handling

All tools return errors in this format:

```typescript
{
  error: {
    code: string;
    message: string;
    details?: any;
  }
}
```

### Error Codes

| Code | Description | Recovery |
|------|-------------|----------|
| `ENTITY_NOT_FOUND` | Entity doesn't exist | Check spelling, create entity first |
| `DUPLICATE_ENTITY` | Entity already exists | Use add_observations instead |
| `INVALID_PARAMETER` | Bad input format | Check parameter types |
| `EMBEDDING_FAILED` | BGE-M3 error | Retry, check service status |
| `DATABASE_ERROR` | PostgreSQL issue | Check connection, retry |
| `FILE_ERROR` | Can't read/write markdown | Check permissions, disk space |

### Example Error

```typescript
search_nodes("nonexistent entity")

// Response (if minSimilarity too high):
{
  entities: [],
  relations: [],
  metadata: {
    query: "nonexistent entity",
    totalMatches: 0,
    returnedCount: 0,
    hasMore: false,
    searchType: "semantic",
    sortedBy: "relevance"
  }
}
// Note: Not an error, just empty results
```

---

## Performance Guidelines

### Token Optimization

**Use includeFields to minimize tokens:**
```typescript
// ❌ Bad: Returns everything (could be 10K+ tokens)
search_nodes("broad query", { maxResults: 50 })

// ✅ Good: Returns only what's needed (~1K tokens)
search_nodes("specific query", {
  maxResults: 10,
  includeFields: ["relations"]
})
```

### Latency Expectations

| Operation | Typical | P95 | Notes |
|-----------|---------|-----|-------|
| search_nodes | 50ms | 100ms | With 10K indexed files |
| create_entities | 500ms | 1s | Includes embedding |
| add_observations | 500ms | 1s | Includes re-embedding |
| create_relations | 50ms | 100ms | Just markdown update |
| delete_* | 50ms | 100ms | Fast, no re-embedding |

### Best Practices

1. **Prefer specific queries over broad ones**
   - ❌ `search_nodes("everything")`
   - ✅ `search_nodes("PE developer career goals Q1 2025")`

2. **Use sortBy appropriately**
   - Recent work: `sortBy: "modified"`
   - Best match: `sortBy: "relevance"` (default)
   - Balance: `sortBy: "relevance+recency"`

3. **Limit maxResults**
   - Most queries: `maxResults: 10` (default)
   - Quick check: `maxResults: 1`
   - Comprehensive: `maxResults: 50` (max recommended)

4. **Batch writes when possible**
   ```typescript
   // ✅ Good: Single call
   create_entities({ entities: [e1, e2, e3] })
   
   // ❌ Bad: Multiple calls
   create_entities({ entities: [e1] })
   create_entities({ entities: [e2] })
   create_entities({ entities: [e3] })
   ```

---

## Backward Compatibility

This API maintains full compatibility with the original `obsidian-memory-mcp` API:

### All Original Tools Preserved
- ✅ `read_graph` - Still available for reading entire graph
- ✅ `open_nodes` - Still available for opening specific nodes by name
- ✅ `search_nodes` - Enhanced with RAG semantic search

### API Enhancements
- `search_nodes` now supports semantic similarity search with Nomic Embed v1 (768-dim)
- Multiple sort strategies: relevance, modified, created, relevance+recency
- Date filtering and similarity thresholds
- Backward compatible with old API: `searchNodes(query, maxResults, includeFields)`

### Migration Notes

```typescript
// Both old and new API work:
// OLD API: search_nodes("Sergio", 5, ["observations"])
// NEW API: search_nodes("Sergio", {
//            maxResults: 5,
//            includeFields: ["observations"]
//          })

// open_nodes still works for exact name matching
open_nodes(["Sergio", "Doug Hains"])

// read_graph still works (use sparingly on large KBs)
read_graph()
```

---

## Testing Tools

Use these patterns to validate tool behavior:

```typescript
// Test 1: Semantic search quality
search_nodes("code quality best practices")
// Should return relevant notes even without exact phrase match

// Test 2: Exact match still works
search_nodes("Sergio")
// Should return Sergio entity as top result (similarity ~0.99)

// Test 3: Date filtering
search_nodes("meetings", {
  dateFilter: { after: "2025-01-01" },
  sortBy: "modified"
})
// Should only return recent meeting notes

// Test 4: Token efficiency
search_nodes("test", {
  maxResults: 1,
  includeFields: []
})
// Should return minimal response (name + type only)

// Test 5: Relation-only search
search_nodes("Sergio", {
  includeFields: ["relations"]
})
// Should return entity with just relations, no observations
```

---

## Future Enhancements

Potential additions (not yet implemented):

- `batch_update` - Bulk updates in single transaction
- `search_similar` - Find entities similar to given entity
- `get_context` - Get entity with N-hop neighborhood
- `analyze_relations` - Graph analytics (centrality, clusters)

For now, the 6 core tools cover all essential operations.
