# Requirements

> Dependencies, prerequisites, and setup instructions

## System Requirements

### Hardware

**Minimum**:
- CPU: Apple Silicon (M1/M2/M3/M4) or Intel with AVX2
- RAM: 8GB (4GB available)
- Storage: 10GB free space

**Recommended**:
- CPU: M4 or later
- RAM: 16GB (8GB available)
- Storage: 20GB free space
- SSD: For faster indexing

### Operating System

**Supported**:
- macOS 12+ (Monterey or later)
- Linux (Ubuntu 20.04+, Debian 11+)

**Not tested but should work**:
- Windows 11 with WSL2

## Software Dependencies

### Core Requirements

#### Node.js
- **Version**: 18.x or later
- **Installation**:
  ```bash
  # macOS
  brew install node@18
  
  # Or use nvm
  nvm install 18
  nvm use 18
  ```
- **Verify**:
  ```bash
  node --version  # Should show v18.x.x or higher
  npm --version   # Should show 9.x.x or higher
  ```

#### PostgreSQL
- **Version**: 16.x (15.x also works)
- **Installation**:
  ```bash
  # macOS
  brew install postgresql@16
  brew services start postgresql@16
  
  # Linux (Ubuntu/Debian)
  sudo apt install postgresql-16
  sudo systemctl start postgresql
  ```
- **Verify**:
  ```bash
  psql --version  # Should show 16.x
  ```

#### PGVector Extension
- **Version**: 0.5.0 or later
- **Installation**:
  ```bash
  # macOS (via Homebrew)
  brew install pgvector
  
  # Linux - from source
  cd /tmp
  git clone --branch v0.5.0 https://github.com/pgvector/pgvector.git
  cd pgvector
  make
  sudo make install
  ```
- **Verify**:
  ```bash
  psql -c "CREATE EXTENSION vector;"  # Should succeed
  ```

#### Python
- **Version**: 3.9 or later
- **Installation**:
  ```bash
  # macOS
  brew install python@3.11
  
  # Or use pyenv
  pyenv install 3.11
  pyenv local 3.11
  ```
- **Verify**:
  ```bash
  python3 --version  # Should show 3.9+ or higher
  pip3 --version
  ```

### Python Dependencies

Create `requirements.txt`:
```txt
sentence-transformers==2.2.2
torch==2.1.0
transformers==4.35.0
numpy==1.24.3
```

Install:
```bash
pip3 install -r requirements.txt
```

### Node.js Dependencies

Key packages (from `package.json`):

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.1",
    "gray-matter": "^4.0.3",
    "pg": "^8.11.3",
    "chokidar": "^3.5.3"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/pg": "^8.10.9",
    "typescript": "^5.6.2",
    "tsx": "^4.7.0",
    "vitest": "^1.2.0"
  }
}
```

Install:
```bash
cd ai/memory/obsidian-memory-mcp
npm install
```

## Database Setup

### Step 1: Create Database

```bash
# Create database
createdb obsidian_memory

# Or with authentication
createdb -U postgres obsidian_memory
```

### Step 2: Enable PGVector

```sql
-- Connect to database
psql obsidian_memory

-- Enable extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Verify
SELECT * FROM pg_extension WHERE extname = 'vector';
```

### Step 3: Run Schema

```bash
# From project root
psql obsidian_memory < sql/schema_with_vectors.sql
```

### Step 4: Verify Setup

```sql
-- Check tables exist
\dt

-- Should see:
-- vector_chunks

-- Check vector column
\d vector_chunks

-- Should show:
-- embedding | vector(1024)
```

## Configuration

### Environment Variables

Create `.env` file in project root:

```env
# Database
DATABASE_URL=postgresql://localhost:5432/obsidian_memory

# Or with authentication
# DATABASE_URL=postgresql://username:password@localhost:5432/obsidian_memory

# Vault paths
VAULT_WORK=/Users/sibagy/fileZ/obsidian/vault
VAULT_PERSONAL=/Users/sibagy/fileZ/obsidian/pessoAll

# Embeddings
EMBEDDING_MODEL=BAAI/bge-m3
EMBEDDING_DIMENSION=1024
EMBEDDING_BATCH_SIZE=10

# Optional: Logging
LOG_LEVEL=info
LOG_FILE=logs/obsidian-rag.log

# Optional: Performance tuning
PGVECTOR_LISTS=100
MAX_POOL_SIZE=20
```

### MCP Configuration

Add to Cline MCP settings:

**Path**: `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`

```json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": [
        "/Users/sibagy/fileZ/projZ/SIbagyPersonal/ai/memory/obsidian-memory-mcp/dist/index.js"
      ],
      "env": {
        "DATABASE_URL": "postgresql://localhost:5432/obsidian_memory",
        "VAULT_WORK": "/Users/sibagy/fileZ/obsidian/vault",
        "VAULT_PERSONAL": "/Users/sibagy/fileZ/obsidian/pessoAll",
        "EMBEDDING_MODEL": "BAAI/bge-m3",
        "EMBEDDING_DIMENSION": "1024"
      },
      "autoApprove": [
        "search_nodes"
      ],
      "disabled": false,
      "timeout": 60
    }
  }
}
```

## BGE-M3 Model Setup

### Download Model

The model will be downloaded automatically on first use, but you can pre-download:

```python
from sentence_transformers import SentenceTransformer

# This downloads ~2GB to ~/.cache/torch/sentence_transformers/
model = SentenceTransformer('BAAI/bge-m3')

# Test it works
embedding = model.encode("test")
print(f"Embedding dimension: {len(embedding)}")  # Should be 1024
```

### Model Location

Default cache location:
- macOS/Linux: `~/.cache/torch/sentence_transformers/BAAI_bge-m3/`
- Windows: `%USERPROFILE%\.cache\torch\sentence_transformers\BAAI_bge-m3\`

### Model Requirements

- **Size**: ~2GB
- **RAM**: ~3GB when loaded
- **First run**: ~30 seconds to load
- **Subsequent runs**: ~5 seconds (cached)

## Verification Checklist

### Database Check

```bash
# Connect to database
psql obsidian_memory

# Run verification queries
SELECT COUNT(*) FROM vector_chunks;  -- Should work
SELECT embedding FROM vector_chunks LIMIT 1;  -- Should show vector
```

### Python Check

```bash
# Test embeddings
python3 -c "
from sentence_transformers import SentenceTransformer
model = SentenceTransformer('BAAI/bge-m3')
emb = model.encode('test')
print(f'✓ Embedding works: {len(emb)} dimensions')
"
```

### Node.js Check

```bash
# In project directory
cd ai/memory/obsidian-memory-mcp

# Build project
npm run build

# Should create dist/ folder
ls dist/index.js  # Should exist
```

### Integration Check

```bash
# Test MCP server starts
node dist/index.js

# Should output:
# Obsidian Memory MCP Server running on stdio
# Watching: /Users/sibagy/fileZ/obsidian/vault
# Watching: /Users/sibagy/fileZ/obsidian/pessoAll
```

## Performance Tuning

### PostgreSQL Tuning

Edit `postgresql.conf`:

```ini
# Memory
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 16MB

# PGVector specific
max_parallel_workers_per_gather = 2
ivfflat.probes = 10
```

Restart PostgreSQL:
```bash
brew services restart postgresql@16
```

### Python Tuning

Set environment variables:

```bash
# Use all CPU cores
export OMP_NUM_THREADS=$(sysctl -n hw.ncpu)

# Optimize PyTorch
export PYTORCH_ENABLE_MPS_FALLBACK=1  # For M-series Macs
```

## Troubleshooting

### Issue: PGVector not found

**Symptom**: `ERROR: could not open extension control file`

**Fix**:
```bash
# Reinstall PGVector
brew reinstall pgvector

# Or from source (see Installation section)
```

### Issue: Python dependencies fail

**Symptom**: `ERROR: Failed building wheel for torch`

**Fix**:
```bash
# Use pre-built wheels
pip3 install torch --index-url https://download.pytorch.org/whl/cpu

# Then install others
pip3 install sentence-transformers transformers
```

### Issue: Out of memory during indexing

**Symptom**: Process killed during `npm run index`

**Fix**:
```bash
# Reduce batch size
export EMBEDDING_BATCH_SIZE=5

# Or index one vault at a time
npm run index:work
npm run index:personal
```

### Issue: Database connection refused

**Symptom**: `ECONNREFUSED localhost:5432`

**Fix**:
```bash
# Check PostgreSQL is running
brew services list | grep postgresql

# Start if needed
brew services start postgresql@16

# Check port
lsof -i :5432
```

### Issue: Slow embeddings

**Symptom**: Indexing takes >1 hour for 1K files

**Fix**:
```bash
# Check if using GPU (M-series Mac)
python3 -c "import torch; print(torch.backends.mps.is_available())"

# Should be True for M-series Macs
# If False, check PyTorch installation
```

## Development Tools (Optional)

### Database GUI

**pgAdmin**:
```bash
brew install --cask pgadmin4
```

**Postico**:
```bash
brew install --cask postico
```

### Python IDE

**VS Code with extensions**:
- Python
- Pylance
- Python Debugger

### Monitoring

**PostgreSQL Stats**:
```sql
-- Connection count
SELECT count(*) FROM pg_stat_activity;

-- Database size
SELECT pg_size_pretty(pg_database_size('obsidian_memory'));

-- Table sizes
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename))
FROM pg_tables
WHERE schemaname = 'public';
```

## Minimum Viable Setup

For quick testing without full installation:

```bash
# 1. Just the essentials
brew install node postgresql@16 python@3.11

# 2. Create database
createdb obsidian_memory
psql obsidian_memory -c "CREATE EXTENSION vector;"

# 3. Install Python packages
pip3 install sentence-transformers

# 4. Install Node packages
cd ai/memory/obsidian-memory-mcp
npm install

# 5. Build
npm run build

# 6. Done - ready to test
```

## Next Steps

After completing requirements setup:

1. Follow [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) for development
2. See [API_DESIGN.md](./API_DESIGN.md) for tool specifications
3. Check [TESTING_PLAN.md](./TESTING_PLAN.md) for validation

## Support

For issues:
1. Check [Troubleshooting](#troubleshooting) section above
2. Review [GitHub Issues](https://github.com/YuNaga224/obsidian-memory-mcp/issues) for similar problems
3. Ask in #memory-mcp channel (if applicable)
