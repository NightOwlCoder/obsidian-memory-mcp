# Quick Start Guide

> Get up and running with Obsidian RAG Memory in 5 minutes

## Prerequisites

Before you begin, ensure you have:
- **Node.js 18+** - `node --version`
- **PostgreSQL with PGVector** - `psql --version`
- **Python 3.9+** - `python3 --version`
- **Obsidian vault** - At least one vault with markdown files

## Installation

### 1. Clone and Install Dependencies

```bash
cd projZ/obsidian-memory-mcp
npm install

# Create Python virtual environment (keeps your system clean)
python3 -m venv venv

# Activate venv and install dependencies
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Set Up Database

```bash
# Create database
createdb obsidian_memory

# Install PGVector extension and create schema
psql obsidian_memory < sql/schema_with_vectors.sql
```

### 3. Configure Vault Paths

Add to your MCP settings (Claude Desktop or other MCP client):

```json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": ["/full/path/to/obsidian-memory-mcp/dist/index.js"],
      "env": {
        "VAULT_PERSONAL": "/Users/you/obsidian/personal",
        "VAULT_WORK": "/Users/you/obsidian/work"
      }
    }
  }
}
```

**Note**: At least one vault path is required. If you only have one vault, just configure that one.

### 4. Initial Indexing

```bash
# Index your vault(s) - this takes ~5 min for 1K notes
npm run index

# Check stats
npm run stats
```

Expected output:
```
Indexing complete!
- Total entities: 1247
- Storage size: 156 MB
- Oldest entity: 2023-01-15
- Newest entity: 2025-01-13
```

## First Search

Once indexed, test semantic search from your MCP client:

```typescript
// Through MCP client (e.g., Claude Desktop)
search_nodes("career goals")
```

Expected response:
```json
{
  "entities": [{
    "name": "Sergio",
    "entityType": "person",
    "observations": ["Aspiring PE developer at Amazon"],
    "similarity": 0.89
  }],
  "metadata": {
    "totalMatches": 5,
    "returnedCount": 1,
    "searchType": "semantic"
  }
}
```

## Creating Your First Entity

```typescript
create_entities({
  entities: [{
    name: "My First Project",
    entityType: "project",
    observations: [
      "Learning RAG for AI memory systems",
      "Built with TypeScript and PostgreSQL"
    ]
  }]
})
```

The entity is saved as: `memory/projects/My_First_Project.md`

## Next Steps

**Explore the API**:
- [API Reference](../api/README.md) - Full documentation
- [Common Patterns](PATTERNS.md) - Cookbook of use cases
- [Integration Guide](INTEGRATION.md) - MCP client setup

**Set Up Background Sync**:
```bash
# Install file watcher daemon (macOS)
./scripts/install-daemon.sh

# Verify it's running
launchctl list | grep obsidian
```

**Optimize Performance**:
- See [Performance Guide](PERFORMANCE.md) for tuning tips
- Adjust `minSimilarity` if getting too many/few results
- Use `includeFields` to reduce token usage

## Common Issues

### "Connection refused" error
**Problem**: PostgreSQL not running  
**Solution**: `brew services start postgresql@14`

### "Embedder service timeout"
**Problem**: Python dependencies not installed  
**Solution**: `pip install sentence-transformers torch`

### "No results found"
**Problem**: Vault not indexed yet  
**Solution**: Run `npm run index` first

### Slow indexing
**Problem**: Large vault (>5K notes)  
**Solution**: 
- Index one vault at a time
- Increase available RAM
- Use `npm run index:personal` or `npm run index:work`

## Troubleshooting

For more help, see:
- [Troubleshooting Guide](TROUBLESHOOTING.md)
- [Architecture Docs](../architecture/ARCHITECTURE.md)
- [Known Issues](../operations/KNOWN_ISSUES.md)

## Configuration Reference

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | No | `postgresql://localhost:5432/obsidian_memory` | PostgreSQL connection string |
| `VAULT_PERSONAL` | Yes* | - | Path to personal Obsidian vault |
| `VAULT_WORK` | Yes* | - | Path to work Obsidian vault |
| `MEMORY_DIR` | No | `VAULT_PERSONAL/memory` | Custom memory entity location |

*At least one vault required

### Memory Location Priority

The system looks for memory entities in this order:
1. `MEMORY_DIR` (if set)
2. `VAULT_PERSONAL/memory`
3. `VAULT_WORK/memory`

## Verifying Installation

Run this checklist to confirm everything works:

```bash
# 1. Dependencies installed
npm list typedoc  # Should show version
source venv/bin/activate && python -c "import sentence_transformers"  # No error

# 2. Database accessible
psql obsidian_memory -c "SELECT COUNT(*) FROM vector_chunks;"

# 3. Vault indexed
npm run stats  # Should show entity count

# 4. MCP server starts
node dist/index.js  # Should output "running on stdio"
```

All good? You're ready to use RAG memory!

## What You've Learned

- ✅ Installed and configured the system
- ✅ Indexed your Obsidian vault(s)
- ✅ Performed your first semantic search
- ✅ Created an entity
- ✅ Verified everything works

**Time spent**: ~5-10 minutes  
**Next**: Explore [Common Patterns](PATTERNS.md) to see what else you can do!
