# Troubleshooting Guide

> Solutions to common issues and error messages

## Installation Issues

### Python venv Creation Fails

**Error**: `No module named venv`

**Solution**:
```bash
# macOS
brew install python@3.11

# Ubuntu/Debian
sudo apt-get install python3-venv

# Then retry
python3 -m venv venv
```

### TypeDoc Installation Fails

**Error**: `npm ERR! peer dependency warnings`

**Solution**:
```bash
# Clear npm cache and retry
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### PostgreSQL PGVector Extension Missing

**Error**: `ERROR: extension "vector" does not exist`

**Solution**:
```bash
# macOS with Homebrew
brew install pgvector

# Ubuntu/Debian
sudo apt install postgresql-14-pgvector

# Then reconnect to database
psql obsidian_memory -c "CREATE EXTENSION vector;"
```

---

## Embedding Issues

### "Embedder service timeout"

**Error**: Embedder doesn't start within 30s

**Causes & Solutions**:

1. **Missing dependencies**:
```bash
source venv/bin/activate
pip install -r requirements.txt
```

2. **Model download slow**:
```bash
# Pre-download model (one-time, ~2GB)
python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('nomic-ai/nomic-embed-text-v1')"
```

3. **Insufficient RAM**:
- Need ~4GB free for model loading
- Close other applications
- Increase Docker memory if using containers

### "Embedding timeout" (10s)

**Error**: Individual embedding takes >10s

**Solutions**:
```bash
# Check embedder process
ps aux | grep embedder.py

# Restart embedder
pkill -f embedder.py
# Next search will auto-restart it
```

---

## Search Issues

### No Results Found

**Problem**: `search_nodes` returns empty results

**Diagnostic steps**:

```bash
# 1. Check if vault indexed
npm run stats
# Should show totalEntities > 0

# 2. Check database
psql obsidian_memory -c "SELECT COUNT(*) FROM vector_chunks;"
# Should return count > 0

# 3. Test with exact entity name
# In MCP client:
await open_nodes(["Known Entity Name"])
# Should return data if entity exists
```

**Solutions**:
- If not indexed: `npm run index`
- If indexed but no results: Lower `minSimilarity` threshold
- If database empty: Check indexing logs for errors

### Too Many Irrelevant Results

**Problem**: Getting 50+ results, many not relevant

**Solution**:
```typescript
// Increase similarity threshold
const results = await search_nodes("specific query", {
  minSimilarity: 0.6,  // Raise from default 0.3
  maxResults: 10
});
```

### Missing Expected Results

**Problem**: Know entity exists but not in search results

**Solutions**:

1. **Lower similarity threshold**:
```typescript
const results = await search_nodes("query", {
  minSimilarity: 0.2  // Lower from default 0.3
});
```

2. **Check entity actually indexed**:
```bash
psql obsidian_memory -c "SELECT entity_name FROM vector_chunks WHERE entity_name LIKE '%Partial Name%';"
```

3. **Re-index specific file**:
```bash
# Force reindex
npm run reindex
```

---

## Database Issues

### "Connection refused"

**Error**: `ECONNREFUSED 127.0.0.1:5432`

**Solutions**:
```bash
# Check if PostgreSQL running
ps aux | grep postgres

# Start PostgreSQL
# macOS
brew services start postgresql@14

# Linux
sudo systemctl start postgresql

# Verify
psql -l
```

### "Database does not exist"

**Error**: `FATAL: database "obsidian_memory" does not exist`

**Solution**:
```bash
createdb obsidian_memory
psql obsidian_memory < sql/schema_with_vectors.sql
```

### "Too many clients"

**Error**: `FATAL: sorry, too many clients already`

**Solution**:
```bash
# Check connection count
psql obsidian_memory -c "SELECT count(*) FROM pg_stat_activity;"

# Increase max connections
# Edit postgresql.conf:
# max_connections = 100  # Increase this

# Or reduce pool size in code
# DATABASE_URL=postgresql://localhost/obsidian_memory?max=10
```

---

## Indexing Issues

### Slow Indexing (<50 docs/sec)

**Problem**: Taking >30 min for 1K notes

**Solutions**:

1. **Check available RAM**:
```bash
# macOS
top -l 1 | grep PhysMem

# Linux
free -h
```
Need ~4GB free for embedder

2. **Reduce batch size**:
```typescript
// In scripts/index.ts
const BATCH_SIZE = 10;  // Reduce from 50
```

3. **Index one vault at a time**:
```bash
npm run index:personal  # Then
npm run index:work
```

### Files Not Being Indexed

**Problem**: Some markdown files missing from search

**Diagnostic**:
```bash
# Check file count
find ~/obsidian/vault -name "*.md" | wc -l  # Actual files
npm run stats  # Indexed count

# Should match (or be close)
```

**Causes & Solutions**:

1. **Hidden files/directories**:
- Files in `.obsidian/` are skipped (intentional)
- Files starting with `.` are skipped

2. **Malformed YAML**:
```bash
# Check indexing logs
cat ~/Library/Logs/obsidian-indexer.log | grep "YAML error"
```
Fix frontmatter in reported files

3. **Permission issues**:
```bash
# Check vault permissions
ls -la ~/obsidian/vault
# Should be readable by your user
```

---

## File Watcher Issues

### Changes Not Detected

**Problem**: Edit file in Obsidian but search doesn't update

**Diagnostic**:
```bash
# Check daemon running
launchctl list | grep obsidian  # macOS
systemctl status obsidian-indexer  # Linux

# Check logs
tail -f ~/Library/Logs/obsidian-indexer.log
```

**Solutions**:

1. **Restart daemon**:
```bash
./scripts/restart-daemon.sh
```

2. **Manual reindex**:
```bash
npm run reindex
```

3. **Check file watch limits** (Linux):
```bash
# Current limit
cat /proc/sys/fs/inotify/max_user_watches

# Increase if needed
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

---

## Performance Issues

### High Memory Usage (>2GB)

**Problem**: Process using excessive RAM

**Solutions**:

1. **Check stats**:
```bash
npm run stats
# If >50K chunks, consider splitting vaults
```

2. **Reduce index size**:
```bash
# Delete old entities
psql obsidian_memory -c "DELETE FROM vector_chunks WHERE modified_at < '2024-01-01';"
```

3. **Optimize PostgreSQL**:
```sql
-- In psql
VACUUM ANALYZE vector_chunks;
REINDEX INDEX vector_chunks_embedding_idx;
```

### Slow Searches (>500ms)

**Problem**: Search taking too long

**Diagnostic**:
```sql
-- Check index usage
EXPLAIN ANALYZE 
SELECT * FROM vector_chunks 
WHERE 1 - (embedding <=> '[...]'::vector) >= 0.3 
LIMIT 10;
```

**Solutions**:

1. **Rebuild index**:
```sql
REINDEX INDEX vector_chunks_embedding_idx;
```

2. **Reduce result count**:
```typescript
const results = await search_nodes("query", {
  maxResults: 5  // Reduce from 20+
});
```

3. **Use more specific queries**:
```typescript
// ❌ Slow: broad query
search_nodes("general topic")

// ✅ Fast: specific query
search_nodes("specific subtopic details")
```

---

## Error Messages

### "Entity not found"

**Full error**: `Error: Entity XYZ not found`

**Cause**: Trying to operate on non-existent entity

**Solution**:
```typescript
// Check existence first
const names = await list_entity_names();
const exists = Object.values(names)
  .flat()
  .some(e => e.name === "XYZ");

if (exists) {
  // Proceed with operation
}
```

### "YAML parsing error"

**Full error**: `Skipping file with YAML error: /path/file.md`

**Cause**: Malformed frontmatter

**Solution**:
```markdown
---
entityType: person
tags: [work]
---

# Content here
```

Ensure:
- Valid YAML syntax
- No unescaped special characters
- Proper indentation

### "Failed to create memory directory"

**Error**: `EACCES: permission denied`

**Solution**:
```bash
# Check permissions
ls -la $(dirname $MEMORY_DIR)

# Fix permissions
chmod 755 /path/to/memory/parent
```

---

## Getting Help

### Check Logs

**macOS**:
```bash
# MCP server logs
tail -f ~/Library/Logs/obsidian-indexer.log

# Database logs
tail -f /usr/local/var/log/postgresql@14.log
```

**Linux**:
```bash
# MCP server
journalctl -u obsidian-indexer -f

# Database
sudo journalctl -u postgresql -f
```

### Enable Debug Mode

```json
{
  "env": {
    "DEBUG": "mcp:*",
    "VAULT_PERSONAL": "/path"
  }
}
```

### Common Log Messages

| Message | Meaning | Action |
|---------|---------|--------|
| `Embedder service ready` | Normal startup | None |
| `YAML error` | Bad frontmatter | Fix YAML in file |
| `ECONNREFUSED` | DB not running | Start PostgreSQL |
| `Indexing complete` | Success | None |
| `Socket hang up` | Network issue | Restart daemon |

---

## Still Stuck?

1. **Review**:
   - [Quick Start](QUICK_START.md)
   - [Integration Guide](INTEGRATION.md)
   - [Known Issues](../operations/KNOWN_ISSUES.md)

2. **Check**:
   - All prerequisites installed
   - Environment variables set correctly
   - Database accessible
   - Venv activated when needed

3. **Try**:
   - Fresh install in clean directory
   - Minimal config (single vault)
   - Test with small subset of notes

4. **Report**:
   - Open GitHub issue with logs
   - Include full error message
   - Describe steps to reproduce
