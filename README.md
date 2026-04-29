# Obsidian RAG Memory MCP

> RAG-powered semantic search for Obsidian-based AI memory system

## Overview

Enhanced version of `obsidian-memory-mcp` that adds **Retrieval Augmented Generation (RAG)** capabilities to provide semantic search across your entire Obsidian knowledge base. Built for local-first execution with zero API costs.

### Key Features

- 🔍 **Semantic Search**: Find information by meaning, not just keywords
- 📝 **Obsidian Integration**: Stores memory as human-editable markdown files
- 🎯 **Smart Sorting**: Relevance, recency, or hybrid ranking
- 🔄 **Auto-Sync**: File watcher keeps RAG updated with Obsidian changes
- 💾 **Local-First**: Nomic Embed v1 embeddings, no API calls required
- ⚡ **Complete API**: 9 MCP tools for full memory management

## Architecture

```
Obsidian Vaults (Source of Truth)
    ├── /vault (work)
    └── /pessoAll (personal)
            ↓
    ┌─────────────────────┐
    │   File Watcher      │
    │   (chokidar)        │
    └─────────────────────┘
            ↓
    ┌──────────────────────────────────┐
    │  obsidian-rag-memory-mcp         │
    │  ┌────────────┬────────────────┐ │
    │  │ Graph      │ Vector Store   │ │
    │  │ (entities, │ (Nomic v1      │ │
    │  │  relations)│  embeddings)   │ │
    │  └────────────┴────────────────┘ │
    └──────────────────────────────────┘
            ↓
    PostgreSQL + PGVector
```

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL with PGVector extension
- Python 3.9+ (for BGE-M3 embeddings)
- M1/M4 Mac recommended for performance

### Installation

```bash
# Clone and install
cd ai/memory/obsidian-memory-mcp
npm install

# Install Python dependencies for Nomic Embed v1
pip install sentence-transformers torch

# Set up database
createdb obsidian_memory
psql obsidian_memory < sql/schema_with_vectors.sql
```

### Configuration

The system works with environment variables. You have two options:

**Option 1: Use defaults (recommended for standard setups)**

No configuration needed! The system uses these defaults:
- Database: `postgresql://localhost:5432/obsidian_memory`
- Embeddings: `nomic-ai/nomic-embed-text-v1` (768 dimensions)
- Memory location: `VAULT_PERSONAL/memory` or `VAULT_WORK/memory`

Just configure vault paths in your MCP settings (see Usage section below).

**Option 2: Create `.env` file for custom configuration**

Only needed if your setup differs from defaults:

```env
# Database (optional - only if not using localhost:5432)
# DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Vault paths (at least one required)
VAULT_WORK=/Users/sibagy/fileZ/obsidian/vault
VAULT_PERSONAL=/Users/sibagy/fileZ/obsidian/pessoAll

# Memory entity location (optional)
# If not set, defaults to VAULT_PERSONAL/memory or VAULT_WORK/memory
# MEMORY_DIR=/custom/path/to/memory

# Embeddings (optional - defaults shown)
# EMBEDDING_MODEL=nomic-ai/nomic-embed-text-v1
# EMBEDDING_DIMENSION=768
```

### Memory Entity Location

By default, memory entities are stored in `<vault>/memory/` directories:
- Priority 1: `VAULT_PERSONAL/memory` (default - user's personal memory)
- Priority 2: `VAULT_WORK/memory` (fallback)

**Custom Memory Location:**

To store memory entities outside your vaults:

```bash
# Set MEMORY_DIR to override default location
export MEMORY_DIR=/path/to/custom/memory
```

**When to use:**
- Share memory across multiple vault instances
- Version control memory separately from notes
- Backup memory entities to separate location

**Behavior:**
- If `MEMORY_DIR` is inside a vault: daemon monitors vault only
- If `MEMORY_DIR` is outside vaults: daemon adds separate file watch
- MCP always writes new entities to configured memory root

### Initial Indexing

```bash
# Index both vaults (one-time, ~30 min for 1K notes)
npm run index

# Or index individually
npm run index:work
npm run index:personal
```

### Usage

MCP server runs automatically when configured in your MCP settings:

```json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": ["/full/path/to/obsidian-memory-mcp/dist/index.js"],
      "env": {
        "DATABASE_URL": "postgresql://localhost:5432/obsidian_memory",
        "VAULT_WORK": "/Users/sibagy/fileZ/obsidian/vault",
        "VAULT_PERSONAL": "/Users/sibagy/fileZ/obsidian/pessoAll"
      }
    }
  }
}
```

## MCP Tools (9 Total)

All tools include MCP annotations and structured output schemas for better integration with MCP clients:

**Tool Annotations:**
- **Read-only tools** (`search_nodes`, `read_graph`, `open_nodes`, `list_entity_names`): Marked as safe operations that don't modify data
- **Write tools** (`create_entities`, `create_relations`, `add_observations`): Non-destructive operations
- **Delete tools** (`delete_entities`, `delete_observations`, `delete_relations`): Destructive operations requiring extra confirmation

**Structured Output:**
All tools use `generateOutputSchema: true` to provide type-safe, machine-readable responses that MCP clients can parse programmatically.

### Query Tools

**search_nodes** - Semantic search with RAG
```typescript
search_nodes(query: string, options?: {
  maxResults?: number,           // default: 10
  includeFields?: string[],      // ["observations", "relations"]
  sortBy?: string,               // "relevance" | "modified" | "created" | "relevance+recency"
  dateFilter?: {
    after?: string,              // ISO date
    before?: string
  },
  minSimilarity?: number         // 0.0 - 1.0, default: 0.7
})
```

**open_nodes** - Open specific nodes by name
```typescript
open_nodes(names: string[])
```

**read_graph** - Read entire knowledge graph (use sparingly on large vaults)
```typescript
read_graph()
```

### Write Tools

**create_entities** - Create new entities
```typescript
create_entities({ entities: [...] })
```

**create_relations** - Connect entities with typed relations
```typescript
create_relations({ relations: [...] })
```

**add_observations** - Add facts to existing entities
```typescript
add_observations({ observations: [...] })
```

**delete_entities** - Remove entities and files
```typescript
delete_entities({ entityNames: [...] })
```

**delete_observations** - Remove specific observations
```typescript
delete_observations({ deletions: [...] })
```

**delete_relations** - Remove connections
```typescript
delete_relations({ relations: [...] })
```

## Example Usage

```typescript
// Find recent work notes
search_nodes("code review best practices", {
  sortBy: "modified",
  dateFilter: { after: "2025-01-01" }
})

// Get full context on person
search_nodes("Doug Hains", {
  includeFields: ["observations", "relations"]
})

// Hybrid search (relevance + recency)
search_nodes("PE developer career goals", {
  sortBy: "relevance+recency"
})
```

## Documentation

**📚 Complete Documentation**

**Getting Started**:
- 🚀 [Quick Start Guide](docs/guides/QUICK_START.md) - 5-minute setup
- 📖 [Common Patterns](docs/guides/PATTERNS.md) - Usage cookbook with 21 patterns
- 🔌 [Integration Guide](docs/guides/INTEGRATION.md) - MCP client setup
- 🐛 [Troubleshooting](docs/guides/TROUBLESHOOTING.md) - Fix common issues
- ⚡ [Performance Guide](docs/guides/PERFORMANCE.md) - Optimization tips

**API Reference**:
- 📘 [Full API Documentation](docs/api/README.md) - Auto-generated from code
- [MarkdownStorageManager](docs/api/storage/MarkdownStorageManager/README.md) - Main API (11 methods)
- [VectorStorage](docs/api/storage/VectorStorage/README.md) - RAG engine (7 methods)
- [Type Definitions](docs/api/types/README.md) - Interfaces and types

**Examples**:
- 💡 [Examples Directory](examples/README.md) - Runnable code samples
- [basic-usage.ts](examples/basic-usage.ts) - Core operations
- [semantic-search.ts](examples/semantic-search.ts) - Search patterns
- [entity-management.ts](examples/entity-management.ts) - CRUD operations

**Architecture & Planning**:
- [System Design](docs/architecture/ARCHITECTURE.md) | [API Design](docs/architecture/API_DESIGN.md)
- [Chunking Plan](docs/implementation/CHUNKING_IMPLEMENTATION_PLAN.md) | [Daemon Setup](docs/implementation/DAEMON_IMPLEMENTATION_PLAN.md)
- [Setup Guide](docs/operations/SETUP.md) | [Known Issues](docs/operations/KNOWN_ISSUES.md)
- [Requirements](docs/planning/REQUIREMENTS.md) | [Roadmap](docs/planning/ROADMAP.md)

## Performance

- **Embedding**: ~50-100 docs/sec on M4 Mac
- **Search**: <50ms for 10K chunks
- **Indexing**: ~5 min for 1K notes (one-time)
- **Update**: <1 sec per file change
- **Memory**: ~550MB for Nomic v1 model + 100MB per 1K notes

## Comparison with Original

| Feature | Original | RAG-Enhanced |
|---------|----------|--------------|
| Search | Exact match | Semantic similarity |
| Tools | 9 | 9 (fully compatible) |
| Sort Options | None | 4 strategies |
| Date Filtering | No | Yes |
| API Costs | $0 | $0 |
| Performance | Instant | <50ms |

## Development

```bash
# Watch mode
npm run watch

# Run tests
npm test

# Reindex after code changes
npm run reindex
```

## Troubleshooting

### Slow Indexing
- Check available RAM (need ~4GB)
- Reduce batch size in config
- Index one vault at a time

### Poor Search Results
- Increase `minSimilarity` threshold
- Try different `sortBy` strategies
- Check if files are actually indexed: `npm run stats`

### File Changes Not Detected
- Verify watcher is running: check logs
- Restart MCP server
- Manual reindex: `npm run reindex`

## Roadmap

- [ ] Phase 1: Vector storage + embeddings (Week 1)
- [ ] Phase 2: File watching (Week 1)
- [ ] Phase 3: Enhanced search (Week 2)
- [ ] Phase 4: Testing & optimization (Week 2)
- [ ] Phase 5: Documentation & deployment (Week 2)

## License

MIT

## Credits

Based on:
- [obsidian-memory-mcp](https://github.com/YuNaga224/obsidian-memory-mcp) by YuNaga224
- [Docling](https://github.com/docling-project/docling) by IBM Research
- [docling-rag-agent](https://github.com/coleam00/ottomator-agents) by coleam00

Built by Sergio (sibagy@) for personal knowledge management at scale.
