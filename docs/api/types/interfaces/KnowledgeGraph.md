[**Obsidian Memory MCP - API Reference v1.0.0**](../../README.md)

***

[Obsidian Memory MCP - API Reference](../../README.md) / [types](../README.md) / KnowledgeGraph

# Interface: KnowledgeGraph

Defined in: types.ts:136

Complete knowledge graph containing all entities and their relations

Represents the full state of the knowledge base at a point in time.
Used for loading, saving, and querying the entire graph structure.

## Example

```typescript
const graph: KnowledgeGraph = {
  entities: [
    { name: "Sergio", entityType: "person", observations: [...] },
    { name: "PE Developer", entityType: "role", observations: [...] }
  ],
  relations: [
    { from: "Sergio", to: "PE Developer", relationType: "aspires-to" }
  ]
};
```

## Properties

### entities

> **entities**: [`Entity`](Entity.md)[]

Defined in: types.ts:143

All entities in the knowledge graph

Complete list of entities with their observations. May be filtered
based on search criteria or query parameters.

***

### relations

> **relations**: [`Relation`](Relation.md)[]

Defined in: types.ts:152

All relations between entities

Complete list of typed connections between entities. Filtered to
only include relations where both source and target entities exist
in the entities array.
