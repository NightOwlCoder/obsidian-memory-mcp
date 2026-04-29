[**Obsidian Memory MCP - API Reference v1.0.0**](../../README.md)

***

[Obsidian Memory MCP - API Reference](../../README.md) / [types](../README.md) / Relation

# Interface: Relation

Defined in: types.ts:70

Represents a directed, typed relationship between two entities

Relations connect entities in the knowledge graph with semantic meaning.
They are always directional (from → to) and typed (e.g., "mentors", "works-on").

## Example

```typescript
const mentorRelation: Relation = {
  from: "Doug Hains",
  to: "Sergio",
  relationType: "mentors"
};
```

## Properties

### category?

> `optional` **category**: `string`

Defined in: types.ts:114

Optional category for grouping similar relation types

Used for organizing and filtering relations. Automatically inferred
from relationType if not provided.

#### Example

```typescript
category: "professional"  // For work-related relations
category: "technical"     // For technical dependencies
```

***

### from

> **from**: `string`

Defined in: types.ts:77

Source entity name

The entity where the relation starts. Must match an existing
entity's name exactly.

***

### relationType

> **relationType**: `string`

Defined in: types.ts:100

Type of relationship in active voice

Describes the nature of the connection from source to target.
Should be in active voice for clarity (e.g., "mentors" not "is-mentored-by").
Common types: "mentors", "works-on", "reports-to", "uses", "created-by"

#### Example

```typescript
relationType: "mentors"  // Doug mentors Sergio
relationType: "works-on" // Sergio works-on Project
```

***

### to

> **to**: `string`

Defined in: types.ts:85

Target entity name

The entity where the relation ends. Must match an existing
entity's name exactly.
