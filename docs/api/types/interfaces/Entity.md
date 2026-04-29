[**Obsidian Memory MCP - API Reference v1.0.0**](../../README.md)

***

[Obsidian Memory MCP - API Reference](../../README.md) / [types](../README.md) / Entity

# Interface: Entity

Defined in: types.ts:20

Represents an entity in the knowledge graph

Entities are the fundamental building blocks of the knowledge graph,
representing people, projects, concepts, or any other named item
with associated observations (facts/notes about the entity).

## Example

```typescript
const person: Entity = {
  name: "Sergio",
  entityType: "person",
  observations: [
    "Aspiring PE developer at Amazon",
    "Working on iOS size optimization"
  ]
};
```

## Properties

### entityType

> **entityType**: `string`

Defined in: types.ts:35

Category or type of entity

Common types: "person", "project", "concept", "tool", "organization"
Used for grouping and filtering entities

***

### name

> **name**: `string`

Defined in: types.ts:27

Unique identifier for the entity

Used as the primary key and becomes the filename when stored
as markdown (sanitized). Example: "Sergio", "iOS Size Project"

***

### observations

> **observations**: `string`[]

Defined in: types.ts:52

Array of facts or notes about the entity

Each observation is a discrete piece of information stored as
a single string. Observations are indexed for semantic search.

#### Example

```typescript
observations: [
  "Senior PE at Amazon",
  "Expert in systems design",
  "Mentors junior developers"
]
```
