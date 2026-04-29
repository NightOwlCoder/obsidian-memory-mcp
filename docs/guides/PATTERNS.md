# Common Patterns

> Cookbook of typical use cases and best practices

## Table of Contents

1. [Semantic Search Patterns](#semantic-search-patterns)
2. [Entity Management](#entity-management)
3. [Relation Management](#relation-management)
4. [Batch Operations](#batch-operations)
5. [Token Optimization](#token-optimization)
6. [Error Handling](#error-handling)

---

## Semantic Search Patterns

### Pattern 1: Simple Semantic Search

```typescript
// Find anything related to career goals
const results = await search_nodes("career development");

console.log(results.entities[0].observations);
// ["Aspiring PE developer", "Started interview prep", ...]
```

**Use when**: General exploration, don't know exact entity names

### Pattern 2: Recent Work Notes

```typescript
// Find recent notes about a topic
const recent = await search_nodes("code review", {
  sortBy: "modified",
  dateFilter: { after: "2025-01-01" },
  maxResults: 5
});
```

**Use when**: Finding latest thoughts/work on a topic

### Pattern 3: Hybrid Search (Best Match + Recent)

```typescript
// Balance relevance with recency
const balanced = await search_nodes("system design", {
  sortBy: "relevance+recency",  // 70% relevance + 30% recency
  maxResults: 10
});
```

**Use when**: Want relevant results but prefer recent information

### Pattern 4: High-Precision Search

```typescript
// Only near-exact matches
const precise = await search_nodes("PostgreSQL performance", {
  minSimilarity: 0.7,  // High threshold
  maxResults: 3
});
```

**Use when**: Need very specific, relevant results

### Pattern 5: Broad Exploration

```typescript
// Cast a wide net
const broad = await search_nodes("machine learning", {
  minSimilarity: 0.2,  // Low threshold
  maxResults: 50
});
```

**Use when**: Exploring a topic, gathering context

---

## Entity Management

### Pattern 6: Check Before Creating

```typescript
// ALWAYS check for existing entities first
const existing = await list_entity_names("person");

if (!existing.person?.find(e => e.name === "Doug Hains")) {
  await create_entities({
    entities: [{
      name: "Doug Hains",
      entityType: "person",
      observations: ["Senior PE at Amazon"]
    }]
  });
}
```

**Use when**: Creating entities (prevents duplicates)

### Pattern 7: Incremental Knowledge Building

```typescript
// Day 1: Create entity
await create_entities({
  entities: [{
    name: "iOS Size Project",
    entityType: "project",
    observations: ["Goal: Reduce app size by 20MB"]
  }]
});

// Day 5: Add progress
await add_observations({
  observations: [{
    entityName: "iOS Size Project",
    contents: ["Achieved 14MB reduction so far"]
  }]
});

// Day 10: Add completion
await add_observations({
  observations: [{
    entityName: "iOS Size Project",
    contents: ["Project complete - 22MB total reduction"]
  }]
});
```

**Use when**: Tracking evolving information over time

---

## Relation Management

### Pattern 8: Professional Network

```typescript
// Build out relationships
await create_relations({
  relations: [
    { from: "Doug Hains", to: "Sergio", relationType: "mentors" },
    { from: "Sergio", to: "Stewart Winter", relationType: "collaborates-with" }
  ]
});
```

**Use when**: Mapping organizational structure

---

## Batch Operations

### Pattern 9: Bulk Creation

```typescript
// Create multiple entities at once
const team = [
  { name: "Alice", entityType: "person", observations: ["Backend engineer"] },
  { name: "Bob", entityType: "person", observations: ["Frontend engineer"] }
];

await create_entities({ entities: team });
```

**Use when**: Initial setup, importing data

---

## Token Optimization

### Pattern 10: Relations-Only Search

```typescript
// Just get connection graph (minimal tokens)
const network = await search_nodes("Sergio", {
  maxResults: 1,
  includeFields: ["relations"]
});
```

**Use when**: Mapping relationships, reducing token usage

---

## Error Handling

### Pattern 11: Graceful Failures

```typescript
try {
  await create_entities({ entities: [...] });
} catch (error) {
  if (error.message.includes("already exists")) {
    await add_observations({ observations: [...] });
  }
}
```

**Use when**: Uncertain if entity exists

---

## Best Practices

### Do's ✅

- Always use venv for Python
- Check existing entities before creating
- Use includeFields to minimize tokens
- Start with defaults then adjust
- Use active voice for relations

### Don'ts ❌

- Don't use read_graph on large vaults
- Don't create duplicates
- Don't use minSimilarity > 0.8 
- Don't ignore errors

---

## Next Steps

- [API Reference](../api/README.md) - Full documentation
- [Integration Guide](INTEGRATION.md) - MCP client setup
- [Performance Guide](PERFORMANCE.md) - Optimization tips
