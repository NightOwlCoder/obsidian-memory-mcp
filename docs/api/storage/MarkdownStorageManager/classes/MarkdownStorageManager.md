[**Obsidian Memory MCP - API Reference v1.0.0**](../../../README.md)

***

[Obsidian Memory MCP - API Reference](../../../README.md) / [storage/MarkdownStorageManager](../README.md) / MarkdownStorageManager

# Class: MarkdownStorageManager

Defined in: storage/MarkdownStorageManager.ts:45

Main storage manager for the Obsidian memory system

Manages entity and relation storage as markdown files, integrating
both traditional file-based storage with RAG-powered vector search.
Supports reading from multiple Obsidian vaults while writing to a
configured memory directory.

## Example

```typescript
const storage = new MarkdownStorageManager();

// Create entities
await storage.createEntities([{
  name: "Sergio",
  entityType: "person",
  observations: ["Aspiring PE developer"]
}]);

// Search with semantic similarity
const results = await storage.searchNodes("career goals", {
  maxResults: 10,
  sortBy: "relevance"
});
```

## Constructors

### Constructor

> **new MarkdownStorageManager**(): `MarkdownStorageManager`

Defined in: storage/MarkdownStorageManager.ts:56

Creates a new MarkdownStorageManager instance

Initializes the memory directory from environment variables
(MEMORY_DIR, VAULT_PERSONAL/memory, or VAULT_WORK/memory)
and sets up the vector storage for RAG search.

#### Returns

`MarkdownStorageManager`

## Methods

### addObservations()

> **addObservations**(`observations`): `Promise`\<`object`[]\>

Defined in: storage/MarkdownStorageManager.ts:380

Add new observations (facts) to existing entities

Appends new observations to entity markdown files. Automatically filters
out duplicates to avoid redundant information. Observations are re-indexed
for semantic search.

#### Parameters

##### observations

`object`[]

Array of entities with observations to add

#### Returns

`Promise`\<`object`[]\>

Promise with counts of observations added per entity

#### Example

```typescript
const results = await storage.addObservations([
  {
    entityName: "Sergio",
    contents: [
      "Completed iOS size optimization Q1 goal",
      "Started PE interview prep"
    ]
  }
]);
// results: [{ entityName: "Sergio", added: 2 }]
```

#### Throws

If entity doesn't exist

#### See

createEntities to create new entities first

***

### createEntities()

> **createEntities**(`entities`): `Promise`\<`object`[]\>

Defined in: storage/MarkdownStorageManager.ts:273

Create new entities in the knowledge graph

Creates markdown files for new entities and stores them in the memory directory.
Automatically checks for duplicates and skips entities that already exist.
Each entity is saved as a separate .md file with YAML frontmatter.

#### Parameters

##### entities

[`Entity`](../../../types/interfaces/Entity.md)[]

Array of entities to create

#### Returns

`Promise`\<`object`[]\>

Promise with results array indicating which entities were created

#### Example

```typescript
const results = await storage.createEntities([
  {
    name: "Sergio",
    entityType: "person",
    observations: ["Aspiring PE developer at Amazon"]
  },
  {
    name: "iOS Size Project",
    entityType: "project",
    observations: ["Reduce app binary size by 20MB"]
  }
]);
// results: [
//   { name: "Sergio", created: true },
//   { name: "iOS Size Project", created: true }
// ]
```

#### Throws

If file system operations fail

#### See

addObservations to add more facts to existing entities

***

### createRelations()

> **createRelations**(`relations`): `Promise`\<\{ `alreadyExists`: `number`; `created`: `number`; \}\>

Defined in: storage/MarkdownStorageManager.ts:315

Create typed relations between entities

Establishes connections between entities by updating the source entity's
markdown file. Relations are directional (from → to) and typed (e.g., "mentors").
Automatically checks for duplicates.

#### Parameters

##### relations

[`Relation`](../../../types/interfaces/Relation.md)[]

Array of relations to create

#### Returns

`Promise`\<\{ `alreadyExists`: `number`; `created`: `number`; \}\>

Promise with counts of created vs existing relations

#### Example

```typescript
const result = await storage.createRelations([
  { from: "Doug Hains", to: "Sergio", relationType: "mentors" },
  { from: "Sergio", to: "iOS Size Project", relationType: "works-on" }
]);
// result: { created: 2, alreadyExists: 0 }
```

#### Throws

If source entity doesn't exist

#### See

Entity for relation format

***

### deleteEntities()

> **deleteEntities**(`entityNames`): `Promise`\<`void`\>

Defined in: storage/MarkdownStorageManager.ts:437

Delete entities and clean up relations

Removes entity markdown files and cleans up any relations pointing to
the deleted entities from other entities. This is a destructive operation.

#### Parameters

##### entityNames

`string`[]

Array of entity names to delete

#### Returns

`Promise`\<`void`\>

#### Example

```typescript
await storage.deleteEntities(["Old Project", "Deprecated Tool"]);
```

#### Throws

If file operations fail

***

### deleteObservations()

> **deleteObservations**(`deletions`): `Promise`\<`void`\>

Defined in: storage/MarkdownStorageManager.ts:488

Remove specific observations from entities

Deletes individual facts from entity markdown files. Must match
observation text exactly. Entity remains with other observations intact.

#### Parameters

##### deletions

`object`[]

Array of entities with observations to remove

#### Returns

`Promise`\<`void`\>

#### Example

```typescript
await storage.deleteObservations([
  {
    entityName: "Sergio",
    observations: ["Outdated information from 2023"]
  }
]);
```

#### Throws

If entity doesn't exist or observations don't match

***

### deleteRelations()

> **deleteRelations**(`relations`): `Promise`\<`void`\>

Defined in: storage/MarkdownStorageManager.ts:530

Remove typed relations between entities

Deletes specific connections from entity markdown files. Must match
all three fields (from, to, relationType) exactly.

#### Parameters

##### relations

[`Relation`](../../../types/interfaces/Relation.md)[]

Array of relations to delete

#### Returns

`Promise`\<`void`\>

#### Example

```typescript
await storage.deleteRelations([
  { from: "Sergio", to: "Old Project", relationType: "works-on" }
]);
```

#### Throws

If entity doesn't exist

***

### listEntityNames()

> **listEntityNames**(`entityType?`): `Promise`\<\{\[`entityType`: `string`\]: `object`[]; \}\>

Defined in: storage/MarkdownStorageManager.ts:775

List entity names grouped by type (lightweight operation)

Returns just the names, canonical names, and aliases without loading
full entity data. Used by LLMs to check for existing entities before
creating duplicates and for smart name matching.

#### Parameters

##### entityType?

`string`

Optional filter by entity type (e.g., "person", "project")

#### Returns

`Promise`\<\{\[`entityType`: `string`\]: `object`[]; \}\>

Promise with entities grouped by type

#### Example

```typescript
// List all entities
const all = await storage.listEntityNames();
console.log(all.person); // All person entities

// Filter by type
const people = await storage.listEntityNames("person");
```

#### See

createEntities which should check this first to avoid duplicates

***

### loadGraph()

> **loadGraph**(): `Promise`\<[`KnowledgeGraph`](../../../types/interfaces/KnowledgeGraph.md)\>

Defined in: storage/MarkdownStorageManager.ts:230

Load the entire knowledge graph

#### Returns

`Promise`\<[`KnowledgeGraph`](../../../types/interfaces/KnowledgeGraph.md)\>

***

### openNodes()

> **openNodes**(`names`): `Promise`\<[`KnowledgeGraph`](../../../types/interfaces/KnowledgeGraph.md)\>

Defined in: storage/MarkdownStorageManager.ts:733

Retrieve specific entities by exact name match

Loads full entity data and relations for the specified entity names.
Unlike searchNodes, this does exact name matching without semantic search.
Useful when you know exactly which entities you want.

#### Parameters

##### names

`string`[]

Array of exact entity names to retrieve

#### Returns

`Promise`\<[`KnowledgeGraph`](../../../types/interfaces/KnowledgeGraph.md)\>

Promise with matched entities and their interconnecting relations

#### Example

```typescript
const result = await storage.openNodes(["Sergio", "Doug Hains"]);
console.log(result.entities); // Full data for both entities
console.log(result.relations); // Relations between them
```

#### See

searchNodes for semantic similarity-based search

***

### readGraph()

> **readGraph**(): `Promise`\<[`KnowledgeGraph`](../../../types/interfaces/KnowledgeGraph.md)\>

Defined in: storage/MarkdownStorageManager.ts:565

Load the complete knowledge graph

Reads all entities and relations from both vaults (if configured) and
returns the complete graph structure. Use sparingly on large vaults
as it loads everything into memory.

#### Returns

`Promise`\<[`KnowledgeGraph`](../../../types/interfaces/KnowledgeGraph.md)\>

Promise with all entities and relations

#### Example

```typescript
const graph = await storage.readGraph();
console.log(`Total entities: ${graph.entities.length}`);
console.log(`Total relations: ${graph.relations.length}`);
```

#### See

 - searchNodes for filtered, semantic-based retrieval
 - openNodes for retrieving specific entities by name

***

### searchNodes()

> **searchNodes**(`query`, `options?`): `Promise`\<\{ `entities`: [`Entity`](../../../types/interfaces/Entity.md)[]; `metadata`: \{ `hasMore`: `boolean`; `includedFields`: `string`[]; `maxResults`: `number`; `minSimilarity?`: `number`; `query`: `string`; `returnedCount`: `number`; `searchType`: `string`; `sortedBy?`: `string`; `totalMatches`: `number`; \}; `relations`: [`Relation`](../../../types/interfaces/Relation.md)[]; \}\>

Defined in: storage/MarkdownStorageManager.ts:613

Search nodes using RAG-powered semantic search

Uses Nomic Embed v1 (768-dim) embeddings for semantic similarity matching.
Supports multiple ranking strategies (relevance, recency, hybrid), date filtering,
and field selection for token-efficient responses. This is the primary search
method that powers the AI's memory recall.

#### Parameters

##### query

`string`

Natural language search query

##### options?

Search configuration options

###### dateFilter?

\{ `after?`: `string`; `before?`: `string`; \}

Filter by date range with ISO date strings

###### dateFilter.after?

`string`

###### dateFilter.before?

`string`

###### includeFields?

`string`[]

Fields to include: ["observations", "relations"] (default: both)

###### maxResults?

`number`

Maximum results to return (default: 10, range: 1-100)

###### minSimilarity?

`number`

Similarity threshold 0.0-1.0 (default: 0.3)

###### sortBy?

`"created"` \| `"relevance"` \| `"modified"` \| `"relevance+recency"`

Ranking strategy: "relevance" | "modified" | "created" | "relevance+recency" (default: "relevance")

#### Returns

`Promise`\<\{ `entities`: [`Entity`](../../../types/interfaces/Entity.md)[]; `metadata`: \{ `hasMore`: `boolean`; `includedFields`: `string`[]; `maxResults`: `number`; `minSimilarity?`: `number`; `query`: `string`; `returnedCount`: `number`; `searchType`: `string`; `sortedBy?`: `string`; `totalMatches`: `number`; \}; `relations`: [`Relation`](../../../types/interfaces/Relation.md)[]; \}\>

Promise with matching entities, relations, and search metadata

#### Example

```typescript
// Simple semantic search
const results = await storage.searchNodes("PE developer goals");
console.log(results.entities[0].observations);

// Recent work notes with hybrid ranking
const recent = await storage.searchNodes("code review", {
  sortBy: "relevance+recency",
  dateFilter: { after: "2025-01-01" },
  maxResults: 5
});

// Token-efficient search (relations only)
const minimal = await storage.searchNodes("Doug Hains", {
  maxResults: 1,
  includeFields: ["relations"]
});
```

#### Throws

If embedding service is unavailable

#### Throws

If database connection fails

#### See

 - VectorStorage.search for underlying RAG implementation
 - openNodes for exact name matching without semantic search
