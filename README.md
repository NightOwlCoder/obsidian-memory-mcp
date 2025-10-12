# Obsidian Memory MCP

MCP server that stores AI memories as Markdown files for visualization in Obsidian's graph view.

<a href="https://glama.ai/mcp/servers/@YuNaga224/obsidian-memory-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@YuNaga224/obsidian-memory-mcp/badge" alt="Obsidian Memory MCP server" />
</a>

## About

This project is a modified version of [Anthropic's memory server](https://github.com/modelcontextprotocol/servers/tree/main/src/memory) that has been adapted for Obsidian integration. The original server stored memories in JSON format, while this version stores them as individual Markdown files with Obsidian-compatible `[[link]]` syntax for graph visualization.

### Key Changes from Original

- **Storage Format**: Changed from JSON to individual Markdown files
- **Obsidian Integration**: Added `[[link]]` syntax for relations
- **YAML Frontmatter**: Metadata stored in frontmatter instead of JSON
- **File Structure**: Each entity becomes a separate `.md` file
- **Removed Features**: Simplified to focus on Markdown-only storage

## Features

- **Markdown Storage**: Individual `.md` files for each entity
- **Obsidian Integration**: Uses `[[link]]` syntax for graph visualization
- **Knowledge Graph**: Store entities, relations, and observations
- **Search Functionality**: Query across all stored memories
- **YAML Frontmatter**: Metadata stored in frontmatter

## Storage Format

Each entity is stored as an individual Markdown file with:

- **YAML frontmatter** for metadata (entityType, created, updated)
- **Obsidian-compatible `[[links]]`** for relations
- **Organized sections** for observations and relations

Example entity file (`John_Doe.md`):
```markdown
---
entityType: person
created: 2025-07-10
updated: 2025-07-10
---

# John Doe

## Observations
- Works at Tech Corp
- Expert in TypeScript
- Lives in Tokyo

## Relations
- [[Manager of::Alice Smith]]
- [[Collaborates with::Bob Johnson]]
- [[Located in::Tokyo Office]]
```


## Installation & Configuration

### Basic Setup

```bash
git clone https://github.com/YuNaga224/obsidian-memory-mcp.git
cd obsidian-memory-mcp
npm install
npm run build
```

### Option 1: MCP Server Only (Manual Indexing)

Configure in Claude Desktop for on-demand memory tools:

```json
{
  "mcpServers": {
    "obsidian-memory": {
      "command": "node",
      "args": ["/full/path/to/obsidian-memory-mcp/dist/index.js"],
      "env": {
        "MEMORY_DIR": "/path/to/your/obsidian/vault"
      }
    }
  }
}
```

Then manually index files:
```bash
npm run index -- --memory-dir /path/to/your/vault
```

### Option 2: Background Daemon (Automatic Indexing) - RECOMMENDED

Install the background daemon for automatic 24/7 indexing:

```bash
# Example 1: Watch only work vault
VAULT_WORK=/path/to/work/vault ./scripts/install-daemon.sh

# Example 2: Watch only personal vault
VAULT_PERSONAL=/path/to/personal/vault ./scripts/install-daemon.sh

# Example 3: Watch both vaults (most common)
VAULT_WORK=/path/to/work VAULT_PERSONAL=/path/to/personal ./scripts/install-daemon.sh
```

**Requirements:**
- macOS with launchd
- PostgreSQL with pgvector extension
- **At least one vault path must be set** (VAULT_WORK or VAULT_PERSONAL or both)

**Important:** The install script **requires** at least one vault to be configured. It will not proceed without VAULT_WORK or VAULT_PERSONAL environment variable.

**The daemon will:**
- Auto-detect your Node.js installation (nvm, brew, or system)
- Watch configured vaults 24/7
- Index changes 60 seconds after typing stops
- Run independently of Cline/Claude Desktop

**Management commands:**
```bash
# Restart daemon
./scripts/restart-daemon.sh

# Uninstall daemon
./scripts/uninstall-daemon.sh

# Check status
launchctl list | grep obsidian-indexer
```

## Usage with Obsidian

1. Configure Claude Desktop with one of the options above
2. Restart Claude Desktop
3. Use the MCP memory tools to create entities and relations
4. Open Obsidian and view the graph

The knowledge graph will be visualized with:
- Entity files as nodes
- `[[links]]` as edges
- Different colors for different entity types (if configured in Obsidian)

## API

The server exposes the following tools:

- `create_entities`: Create new entities
- `create_relations`: Create relations between entities  
- `add_observations`: Add observations to existing entities
- `delete_entities`: Delete entities and related data
- `delete_observations`: Remove specific observations
- `delete_relations`: Remove relations
- `read_graph`: Get the entire knowledge graph
- `search_nodes`: Search entities by query
- `open_nodes`: Get specific entities by name

## Monitoring & Logs

The system maintains separate logs for daemon and MCP server operations:

### Daemon Logs (File Watcher)

The daemon creates daily rotating log files:

```bash
# Monitor daemon activity (file changes, indexing)
tail -f /tmp/obsidian-indexer.log.$(date +%Y-%m-%d)

# Check for daemon errors
tail -f /tmp/obsidian-indexer.error.log

# View all daemon log files
ls -la /tmp/obsidian-indexer*
```

**What to expect in daemon logs:**
- Startup: Daemon configuration and vault paths
- File changes: Timer start/reset on each save (DEBUG level)
- Indexing: After 60s of no changes, indexing begins (INFO level)
- Errors: Failed indexing attempts, OCR issues (ERROR level)

### MCP Server Logs

When Cline/Q is open and using the MCP server:

```bash
# Monitor MCP operations (search_nodes, create_entities, etc.)
tail -f /tmp/obsidian-mcp.log.$(date +%Y-%m-%d)

# Check for MCP errors
tail -f /tmp/obsidian-mcp.error.log
```

### Log Levels

Control verbosity via environment variable (set in plist or shell):
- `debug`: All activity including timer resets
- `info`: Major events only (indexing, errors)
- `warn`: Warnings and errors
- `error`: Errors only

Change in `launchd/com.sibagy.obsidian-indexer.plist`:
```xml
<key>LOG_LEVEL</key>
<string>debug</string>  <!-- or info, warn, error -->
```

Then restart: `./scripts/restart-daemon.sh`

## Performance

### Indexing Benchmarks (M4 Pro, 2025)

**Full Index Run:**
- **1,811 markdown files** indexed in **5h 8m**
- **~6 files/minute** average throughput
- **13,882 chunks** generated (observation-level + Docling)
- **126 MB** vector database size
- **99.8% success rate** (3 failures out of 1,814 files)

**Validation Results:**
- **~75% success rate** on random query sampling
- Validates every 10 files during indexing
- Tests semantic search with randomly selected content words

**System Requirements:**
- Apple Silicon (M1/M2/M3/M4) or Intel Mac
- 4GB+ RAM (BGE-M3/Nomic model: ~2GB)
- PostgreSQL with pgvector extension
- Python 3.9+ with sentence-transformers

**Real-world Performance:**
- Change detection: <1 second
- Re-indexing single file: 5-20 seconds (depends on OCR)
- Search latency: <100ms typical
- Daemon memory footprint: ~100MB

**Search Quality:**
- Semantic similarity typically 60-80% for relevant matches
- Aliases (willpoff@, tiyung@) preserved as proper nouns
- Rare technical terms (idempotent, Byzantine, sesquipedalian) found reliably
- Image OCR text searchable with 70-75% similarity

**Note on Validation:**
The indexer validates search quality by randomly selecting words from indexed content and verifying files can be found. The ~75% success rate is expected because:
- Some queries are intentionally challenging (2-3 random words)
- Short/common words filtered out (2-letter words, verbs like "add", "put", "get")
- Aliases and technical terms preserved for accurate search

## Development

```bash
npm run watch  # Watch for changes and rebuild
```

## Credits

This project is based on [Anthropic's memory server](https://github.com/modelcontextprotocol/servers/tree/main/src/memory) from the Model Context Protocol servers collection. We thank Anthropic for releasing the original implementation under the MIT license.

## License

MIT License - see [LICENSE](LICENSE) file for details.

Original memory server: Copyright (c) 2024 Anthropic, PBC  
Obsidian integration modifications: Copyright (c) 2025 YuNaga224
