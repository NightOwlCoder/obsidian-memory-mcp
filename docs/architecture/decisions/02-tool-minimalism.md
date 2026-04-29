# ADR 002: Tool Minimalism - 6 Core MCP Tools

**Date**: 2025-01-07  
**Status**: Accepted  
**Deciders**: Sergio, Kova (AI assistant)

## Context

The original `obsidian-memory-mcp` exposed 9 tools. Need to decide whether to keep all tools or simplify the API for the RAG-enhanced version.

### Original 9 Tools

1. `create_entities` - Create new entities ✅
2. `create_relations` - Create relations ✅
3. `add_observations` - Add observations ✅
4. `delete_entities` - Delete entities ✅
5. `delete_observations` - Delete observations ✅
6. `delete_relations` - Delete relations ✅
7. `read_graph` - Return entire graph ❌
8. `search_nodes` - Search with filters ✅ (enhanced)
9. `open_nodes` - Get specific entities by name ❌

## Decision

**Chosen: Minimize to 6 core tools**

Remove: `read_graph`, `open_nodes`  
Keep: All create/delete tools + enhanced `search_nodes`

### Rationale

#### Why Remove `read_graph`

**Problem**: Useless for large knowledge bases
- Returns entire graph in one response
- For 10K notes: 100K+ tokens (exceeds LLM context)
- For 1K notes: 10K+ tokens (wasteful)
- LLMs can't process that much data effectively

**Better Alternative**: Use `search_nodes` with targeted queries
```typescript
// Instead of: read_graph()
// Do: search_nodes("recent work", { sortBy: "modified", maxResults: 50 })
```

**Edge Case**: "But what if I need everything?"
- Answer: You don't. That's an anti-pattern.
- If truly needed, make multiple targeted searches
- Or export to file and read separately

#### Why Remove `open_nodes`

**Problem**: Redundant with `search_nodes`
- `open_nodes(["Sergio"])` → exact name lookup
- `search_nodes("Sergio")` → semantic search, exact match ranks first (similarity ~0.99)

**No Added Value**:
```typescript
// OLD: Two tools for similar tasks
open_nodes(["Sergio", "Doug"])           // Exact name match
search_nodes("Sergio", { maxResults: 2 }) // Also finds exact matches

// NEW: One tool does both
search_nodes("Sergio Doug")               // Finds both, exact matches first
```

**Why `search_nodes` is Better**:
- Handles typos: "Sergeo" still finds "Sergio"
- Handles partial: "Sergi" finds "Sergio"
- Handles aliases: "sibagy" could find "Sergio"
- Same latency as `open_nodes` for exact matches

#### Why Keep Enhanced `search_nodes`

**Core Use Case**: Everything is a query
- "Who's my manager?" → `search_nodes("Sergio manager")`
- "Recent CRs?" → `search_nodes("code reviews", { sortBy: "modified" })`
- "PE goals?" → `search_nodes("PE developer goals")`
- "Specific person?" → `search_nodes("Doug Hains")`

**Enhanced Capabilities**:
- Semantic search via RAG (fuzzy matching)
- Multiple sort strategies (relevance, recency, hybrid)
- Date filtering (after/before)
- Field selection (minimize tokens)
- Similarity threshold tuning

## Implementation

### Before (9 tools)
```typescript
// Multiple tools for different use cases
read_graph()                          // Get everything
open_nodes(["Sergio"])               // Get specific
search_nodes("Sergio")               // Search
```

### After (6 tools)
```typescript
// One powerful search tool
search_nodes("query", options)       // Does everything
```

### Backward Compatibility

For users of original API:

```typescript
// OLD: open_nodes(["Sergio", "Doug"])
// NEW: search_nodes("Sergio Doug", { maxResults: 2 })

// OLD: read_graph()
// NEW: Not recommended - use targeted searches instead
//      If absolutely needed: multiple search_nodes calls
```

## Consequences

### Positive
- ✅ Simpler API surface (6 vs 9 tools)
- ✅ Less documentation to maintain
- ✅ Less code to test
- ✅ Clearer mental model: "search for everything"
- ✅ Forces good patterns (targeted queries)
- ✅ One tool to learn, not three

### Negative
- ❌ Breaking change for `read_graph` users
- ❌ Slight confusion for exact-name lookup (was explicit, now implicit)
- ❌ Need to explain why tools were removed

### Neutral
- LLMs adapt quickly to new API
- Documentation clearly explains migration path
- No performance impact

## Validation

Success criteria:
- [ ] LLMs can accomplish same tasks with 6 tools as with 9
- [ ] No requests to add back `read_graph` or `open_nodes`
- [ ] Search quality remains high for exact-name queries
- [ ] Documentation clearly covers all use cases

## Alternatives Considered

### Option A: Keep all 9 tools
- Pro: No breaking changes
- Con: Redundant tools confuse LLMs
- Con: More code to maintain
- **Rejected**: Complexity not worth it

### Option B: Add even more specialized tools
- Pro: Very explicit about use cases
- Con: Tool explosion (12+ tools)
- Con: LLMs struggle with too many options
- **Rejected**: Goes against minimalism

### Option C: Remove all search, only create/delete
- Pro: Extreme simplicity (5 tools)
- Con: How would LLMs read memory?
- **Rejected**: Search is core functionality

## Migration Guide

For existing users:

```typescript
// Migration 1: read_graph
// BEFORE
const graph = await mcp.call('read_graph');
// Find Sergio in graph.entities

// AFTER
const result = await mcp.call('search_nodes', {
  query: 'Sergio',
  maxResults: 1
});
// Use result.entities[0]

// Migration 2: open_nodes
// BEFORE
const entities = await mcp.call('open_nodes', {
  names: ['Sergio', 'Doug Hains']
});

// AFTER
const result = await mcp.call('search_nodes', {
  query: 'Sergio Doug Hains',
  maxResults: 2
});
// Use result.entities
```

## References

- [API Design: The Art of Simplicity](https://www.amazon.science/blog/api-design-the-art-of-simplicity)
- [Stripe API Principles](https://stripe.com/blog/payment-api-design)
- Original discussion in planning session (2025-01-07)

## Related Decisions

- [ADR-001: Local-First Embeddings](./01-local-first.md)
- [ADR-003: RAG Integration](./03-rag-integration.md)
