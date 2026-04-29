# Integration Guide

> How to integrate Obsidian Memory MCP with various clients

## MCP Client Integration

### Claude Desktop

**Configuration**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": ["/Users/sibagy/fileZ/projZ/SIbagyPersonal/projZ/obsidian-memory-mcp/dist/index.js"],
      "env": {
        "DATABASE_URL": "postgresql://localhost:5432/obsidian_memory",
        "VAULT_PERSONAL": "/Users/sibagy/fileZ/obsidian/pessoAll",
        "VAULT_WORK": "/Users/sibagy/fileZ/obsidian/vault"
      }
    }
  }
}
```

**Restart Claude Desktop** after configuration changes.

### VSCode with Cline

**Configuration**: VSCode Settings → Cline → MCP Servers

```json
{
  "memory": {
    "command": "node",
    "args": ["/full/path/to/obsidian-memory-mcp/dist/index.js"],
    "env": {
      "VAULT_PERSONAL": "/path/to/vault"
    }
  }
}
```

### Custom MCP Client

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['/path/to/obsidian-memory-mcp/dist/index.js'],
  env: {
    VAULT_PERSONAL: '/path/to/vault'
  }
});

const client = new Client({
  name: 'my-client',
  version: '1.0.0'
}, {
  capabilities: {}
});

await client.connect(transport);

// Use tools
const result = await client.callTool({
  name: 'search_nodes',
  arguments: { query: 'career goals' }
});
```

---

## Environment Configuration

### Single Vault Setup

Minimal configuration - just personal vault:

```json
{
  "env": {
    "VAULT_PERSONAL": "/Users/you/obsidian/vault"
  }
}
```

### Dual Vault Setup

Separate work and personal vaults:

```json
{
  "env": {
    "VAULT_PERSONAL": "/Users/you/obsidian/personal",
    "VAULT_WORK": "/Users/you/obsidian/work"
  }
}
```

### Custom Memory Location

Store memory entities outside vaults:

```json
{
  "env": {
    "VAULT_PERSONAL": "/Users/you/obsidian/personal",
    "MEMORY_DIR": "/Users/you/fileZ/ai/memory"
  }
}
```

**Why use MEMORY_DIR?**
- Version control memory separately
- Share memory across vault instances
- Backup memory to different location

### Custom Database

```json
{
  "env": {
    "DATABASE_URL": "postgresql://user:pass@localhost:5433/my_memory_db",
    "VAULT_PERSONAL": "/path/to/vault"
  }
}
```

---

## Background Daemon Setup

### macOS (launchd)

```bash
# Install daemon
cd projZ/obsidian-memory-mcp
./scripts/install-daemon.sh

# Verify running
launchctl list | grep obsidian

# Check logs
tail -f ~/Library/Logs/obsidian-indexer.log

# Restart daemon
./scripts/restart-daemon.sh

# Uninstall daemon
./scripts/uninstall-daemon.sh
```

The daemon:
- Watches vault(s) for file changes
- Auto-reindexes modified files
- Runs 24/7 in background
- Low overhead (~20MB RAM)

### Linux (systemd)

Create `/etc/systemd/system/obsidian-indexer.service`:

```ini
[Unit]
Description=Obsidian Memory Indexer
After=network.target postgresql.service

[Service]
Type=simple
User=yourusername
WorkingDirectory=/path/to/obsidian-memory-mcp
ExecStart=/usr/bin/node dist/standalone-watcher.js
Restart=always
Environment="VAULT_PERSONAL=/path/to/vault"
Environment="DATABASE_URL=postgresql://localhost:5432/obsidian_memory"

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable obsidian-indexer
sudo systemctl start obsidian-indexer
sudo systemctl status obsidian-indexer
```

---

## Multiple Vault Strategies

### Strategy 1: Separate Memory Directories

```json
{
  "memory-personal": {
    "command": "node",
    "args": ["..."],
    "env": {
      "VAULT_PERSONAL": "/vault/personal",
      "MEMORY_DIR": "/vault/personal/memory"
    }
  },
  "memory-work": {
    "command": "node",
    "args": ["..."],
    "env": {
      "VAULT_WORK": "/vault/work",
      "MEMORY_DIR": "/vault/work/memory"
    }
  }
}
```

**Pros**: Complete isolation  
**Cons**: Two separate MCP servers

### Strategy 2: Unified Memory

```json
{
  "memory": {
    "env": {
      "VAULT_PERSONAL": "/vault/personal",
      "VAULT_WORK": "/vault/work",
      "MEMORY_DIR": "/shared/memory"
    }
  }
}
```

**Pros**: Single search across both vaults  
**Cons**: Memory entities not vault-specific

---

## Docker Deployment

### Dockerfile

```dockerfile
FROM node:18-alpine

# Install PostgreSQL client
RUN apk add --no-cache postgresql-client python3 py3-pip

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Install Python dependencies in venv
RUN python3 -m venv venv && \
    . venv/bin/activate && \
    pip install -r requirements.txt

# Expose MCP on stdio
ENTRYPOINT ["node", "dist/index.js"]
```

### Docker Compose

```yaml
version: '3.8'

services:
  postgres:
    image: ankane/pgvector:latest
    environment:
      POSTGRES_DB: obsidian_memory
      POSTGRES_USER: memory
      POSTGRES_PASSWORD: secret
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./sql/schema_with_vectors.sql:/docker-entrypoint-initdb.d/init.sql

  memory-mcp:
    build: .
    depends_on:
      - postgres
    environment:
      DATABASE_URL: postgresql://memory:secret@postgres:5432/obsidian_memory
      VAULT_PERSONAL: /vaults/personal
    volumes:
      - ~/obsidian/personal:/vaults/personal:ro
    stdin_open: true
    tty: true

volumes:
  pgdata:
```

---

## Testing Integration

### Verify Tools Available

```bash
# In MCP client (e.g., Claude Desktop)
# Ask Claude: "What memory tools do you have?"

# Expected response lists 9 tools:
# - create_entities
# - create_relations
# - add_observations
# - delete_entities
# - delete_observations
# - delete_relations
# - read_graph
# - search_nodes
# - open_nodes
# - list_entity_names
```

### Test Basic Operations

```typescript
// 1. Test search
await search_nodes("test query");

// 2. Test entity creation
await create_entities({
  entities: [{
    name: "Test Entity",
    entityType: "test",
    observations: ["This is a test"]
  }]
});

// 3. Test retrieval
await open_nodes(["Test Entity"]);

// 4. Cleanup
await delete_entities(["Test Entity"]);
```

---

## Troubleshooting Integration

### "MCP server not responding"

**Check logs**:
```bash
# macOS
tail -f ~/Library/Logs/obsidian-indexer.log

# Linux
journalctl -u obsidian-indexer -f
```

**Common causes**:
- Database not running
- Invalid vault paths
- Missing venv dependencies

### "Tools not available in client"

**Verify**:
1. MCP client restarted after config change
2. Config file valid JSON
3. Paths are absolute (not relative)
4. Server starts manually: `node dist/index.js`

### "Search returns no results"

**Check**:
1. Vault indexed: `npm run stats`
2. Database has data: `psql obsidian_memory -c "SELECT COUNT(*) FROM vector_chunks;"`
3. Embedder service works: `source venv/bin/activate && python embeddings/embedder.py`

---

## Advanced Configuration

### Custom Port for Daemon

Edit `launchd/com.sibagy.obsidian-indexer.plist`:

```xml
<key>EnvironmentVariables</key>
<dict>
  <key>DATABASE_URL</key>
  <string>postgresql://localhost:5433/obsidian_memory</string>
</dict>
```

### Read-Only Vault Access

For security, mount vaults read-only:

```json
{
  "env": {
    "VAULT_PERSONAL": "/mnt/readonly/vault"
  }
}
```

MCP writes only to MEMORY_DIR, so vault can be read-only.

---

## Migration from Original obsidian-memory-mcp

**Backward compatible!** No changes needed.

The RAG-enhanced version:
- Keeps all 9 original tools
- Adds semantic search to `search_nodes`
- Old API still works: `searchNodes(query, maxResults, includeFields)`
- All existing entity files compatible

Just update your MCP config to point to this version.

---

## Next Steps

- [Quick Start](QUICK_START.md) - Installation guide
- [Common Patterns](PATTERNS.md) - Usage examples
- [Troubleshooting](TROUBLESHOOTING.md) - Solve issues
- [Performance](PERFORMANCE.md) - Optimization tips
