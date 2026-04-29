[**Obsidian Memory MCP - API Reference v1.0.0**](../../../README.md)

***

[Obsidian Memory MCP - API Reference](../../../README.md) / [storage/VectorStorage](../README.md) / VectorStorage

# Class: VectorStorage

Defined in: storage/VectorStorage.ts:79

Vector storage engine for RAG (Retrieval Augmented Generation)

Manages embedding generation using Nomic Embed v1 and vector similarity
search via PostgreSQL with PGVector. This is the core RAG engine that
powers semantic search across the knowledge base.

Key features:
- Nomic Embed v1 embeddings (768-dim, multilingual)
- PostgreSQL + PGVector for <50ms searches
- Multiple ranking strategies (relevance, recency, hybrid)
- Automatic embedding service lifecycle management

## Example

```typescript
const vectorStorage = new VectorStorage();

// Store entity with embedding
await vectorStorage.storeEntity(
  "Sergio",
  "/path/to/Sergio.md",
  "Aspiring PE developer",
  "person"
);

// Semantic search
const results = await vectorStorage.search("career goals", {
  maxResults: 5,
  sortBy: "relevance"
});
```

## Constructors

### Constructor

> **new VectorStorage**(): `VectorStorage`

Defined in: storage/VectorStorage.ts:93

Creates a new VectorStorage instance

Initializes PostgreSQL connection pool and prepares to spawn
the Python embedding service when needed. The embedder starts
lazily on first use to avoid unnecessary startup overhead.

#### Returns

`VectorStorage`

#### Throws

If database connection fails

## Methods

### close()

> **close**(): `Promise`\<`void`\>

Defined in: storage/VectorStorage.ts:592

Clean shutdown of vector storage

Terminates the Python embedder process and closes database
connections. Should be called when shutting down the application.

#### Returns

`Promise`\<`void`\>

#### Example

```typescript
await vectorStorage.close();
```

***

### delete()

> **delete**(`filePath`): `Promise`\<`void`\>

Defined in: storage/VectorStorage.ts:534

Delete all chunks associated with a file path

Removes entity and all its chunks from vector database.
This is a destructive operation with no undo.

#### Parameters

##### filePath

`string`

Source file path to delete

#### Returns

`Promise`\<`void`\>

#### Example

```typescript
await vectorStorage.delete("/vault/memory/OldProject.md");
```

***

### embed()

> **embed**(`text`): `Promise`\<`number`[]\>

Defined in: storage/VectorStorage.ts:172

Generate 768-dimensional embedding for text

Uses Nomic Embed v1 model via Python service. The embedder starts
automatically on first use and stays resident for subsequent calls.
Embeddings are normalized and optimized for semantic similarity search.

#### Parameters

##### text

`string`

Text to embed (max ~8K tokens)

#### Returns

`Promise`\<`number`[]\>

Promise with 768-dimensional embedding vector

#### Example

```typescript
const embedding = await vectorStorage.embed("PE developer career");
console.log(embedding.length); // 768
```

#### Throws

If embedder service fails to start

#### Throws

If embedding generation times out (10s)

***

### getStats()

> **getStats**(): `Promise`\<\{ `newestEntity`: `Date` \| `null`; `oldestEntity`: `Date` \| `null`; `totalEntities`: `number`; `totalSize`: `string`; \}\>

Defined in: storage/VectorStorage.ts:555

Get vector database statistics

Returns metrics about the current state of the vector database,
useful for monitoring and capacity planning.

#### Returns

`Promise`\<\{ `newestEntity`: `Date` \| `null`; `oldestEntity`: `Date` \| `null`; `totalEntities`: `number`; `totalSize`: `string`; \}\>

Promise with database statistics

#### Example

```typescript
const stats = await vectorStorage.getStats();
console.log(`Entities: ${stats.totalEntities}`);
console.log(`Size: ${stats.totalSize}`);
console.log(`Oldest: ${stats.oldestEntity}`);
```

***

### search()

> **search**(`query`, `options`): `Promise`\<[`SearchResult`](../interfaces/SearchResult.md)[]\>

Defined in: storage/VectorStorage.ts:393

Semantic search using vector similarity

Core RAG search method. Embeds the query and finds the most similar
chunks using cosine similarity. Supports multiple ranking strategies
and date filtering. Typical search latency: <50ms for 10K chunks.

#### Parameters

##### query

`string`

Natural language search query

##### options

Search configuration

###### dateFilter?

\{ `after?`: `string`; `before?`: `string`; \}

Filter by modification date range

###### dateFilter.after?

`string`

###### dateFilter.before?

`string`

###### maxResults?

`number`

Maximum results to return (default: 10)

###### minSimilarity?

`number`

Similarity threshold 0.0-1.0 (default: 0.3)
  - Lower (0.1-0.3): More results, less precise matches
  - Medium (0.3-0.5): Balanced relevance
  - Higher (0.5-0.7): Stricter matches, fewer results  
  - Very high (0.7+): Only near-exact semantic matches

###### sortBy?

`"created"` \| `"relevance"` \| `"modified"` \| `"relevance+recency"`

Ranking strategy (default: "relevance")
  - "relevance": Pure cosine similarity
  - "modified": Most recently modified first
  - "created": Most recently created first
  - "relevance+recency": Hybrid (70% relevance + 30% recency)

#### Returns

`Promise`\<[`SearchResult`](../interfaces/SearchResult.md)[]\>

Promise with matching chunks and similarity scores

#### Example

```typescript
// Simple semantic search
const results = await vectorStorage.search("machine learning", {
  maxResults: 5
});

// Recent work with hybrid ranking
const recent = await vectorStorage.search("project status", {
  sortBy: "relevance+recency",
  dateFilter: { after: "2025-01-01" }
});
```

#### Throws

If embedding generation fails

#### Throws

If database query fails

***

### storeChunk()

> **storeChunk**(`entityName`, `filePath`, `chunkContent`, `chunkIndex`, `chunkTotal`, `entityType`, `tags`): `Promise`\<`void`\>

Defined in: storage/VectorStorage.ts:313

Store a single chunk of a large entity

For entities too large to embed as a single unit, this stores
individual chunks with their embeddings. Each chunk is indexed
separately for more precise semantic matching.

#### Parameters

##### entityName

`string`

Entity identifier

##### filePath

`string`

Source file path

##### chunkContent

`string`

Text content of this specific chunk

##### chunkIndex

`number`

Zero-based index of this chunk

##### chunkTotal

`number`

Total number of chunks for this entity

##### entityType

`string` = `'unknown'`

Entity type (default: "unknown")

##### tags

`string`[] = `[]`

Optional tags for filtering

#### Returns

`Promise`\<`void`\>

#### Example

```typescript
// Store large document in 3 chunks
await vectorStorage.storeChunk("Long Doc", "/path", "Part 1...", 0, 3);
await vectorStorage.storeChunk("Long Doc", "/path", "Part 2...", 1, 3);
await vectorStorage.storeChunk("Long Doc", "/path", "Part 3...", 2, 3);
```

#### Throws

If embedding generation fails

#### Throws

If database insert fails

***

### storeEntity()

> **storeEntity**(`entityName`, `filePath`, `content`, `entityType`, `tags`, `outgoingRelations`, `incomingRelations`): `Promise`\<`void`\>

Defined in: storage/VectorStorage.ts:243

Store complete entity with embedding

Generates embedding and stores entity content in vector database.
Uses upsert semantics - updates if entity already exists at this path.
This is the primary method for storing non-chunked entities.

#### Parameters

##### entityName

`string`

Entity identifier

##### filePath

`string`

Source file path

##### content

`string`

Text content to embed and store

##### entityType

`string`

Entity type (person, project, etc.)

##### tags

`string`[] = `[]`

Optional tags for filtering

##### outgoingRelations

`any` = `null`

Optional outgoing relations metadata

##### incomingRelations

`any` = `null`

Optional incoming relations metadata

#### Returns

`Promise`\<`void`\>

#### Example

```typescript
await vectorStorage.storeEntity(
  "Sergio",
  "/vault/memory/Sergio.md",
  "Aspiring PE developer at Amazon",
  "person",
  ["engineering"]
);
```

#### Throws

If embedding generation fails

#### Throws

If database insert fails

#### See

storeChunk for storing large entities in chunks

***

### update()

> **update**(`entityName`, `filePath`, `content`): `Promise`\<`void`\>

Defined in: storage/VectorStorage.ts:508

Update existing entity content and re-embed

Regenerates embedding for updated content and updates the database.
Updates modification timestamp automatically.

#### Parameters

##### entityName

`string`

Entity identifier

##### filePath

`string`

Source file path

##### content

`string`

Updated text content

#### Returns

`Promise`\<`void`\>

#### Example

```typescript
await vectorStorage.update(
  "Sergio",
  "/vault/memory/Sergio.md",
  "Promoted to PE developer at Amazon"
);
```

#### Throws

If entity doesn't exist

#### Throws

If embedding generation fails
