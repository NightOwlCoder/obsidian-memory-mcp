[**Obsidian Memory MCP - API Reference v1.0.0**](../../../README.md)

***

[Obsidian Memory MCP - API Reference](../../../README.md) / [storage/VectorStorage](../README.md) / SearchResult

# Interface: SearchResult

Defined in: storage/VectorStorage.ts:26

Search result from vector similarity query

Contains both the matched content and metadata about the match,
including similarity score and timestamps.

## Properties

### content

> **content**: `string`

Defined in: storage/VectorStorage.ts:34

Text content of the matched chunk

***

### createdAt

> **createdAt**: `Date`

Defined in: storage/VectorStorage.ts:38

When this chunk was first created

***

### entityName

> **entityName**: `string`

Defined in: storage/VectorStorage.ts:30

Name of the entity this chunk belongs to

***

### entityType

> **entityType**: `string` \| `null`

Defined in: storage/VectorStorage.ts:42

Type of entity (person, project, etc.)

***

### filePath

> **filePath**: `string`

Defined in: storage/VectorStorage.ts:32

File path of the source markdown file

***

### id

> **id**: `string`

Defined in: storage/VectorStorage.ts:28

Unique chunk identifier

***

### modifiedAt

> **modifiedAt**: `Date`

Defined in: storage/VectorStorage.ts:40

When this chunk was last modified

***

### similarity

> **similarity**: `number`

Defined in: storage/VectorStorage.ts:36

Cosine similarity score (0.0-1.0, higher is more similar)

***

### tags

> **tags**: `string`[] \| `null`

Defined in: storage/VectorStorage.ts:44

Associated tags for filtering
