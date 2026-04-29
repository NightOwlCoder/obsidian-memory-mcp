# Performance Guide

> Optimization tips and tuning strategies

## Performance Characteristics

### Typical Performance (M4 Mac, 10K notes)

| Operation | Time | Notes |
|-----------|------|-------|
| Single search | <50ms | 10 results, semantic |
| Batch search (10) | <200ms | Parallel queries |
| Entity creation | ~500ms | Includes embedding |
| Add observation | ~500ms | Re-embeds entity |
| Read graph | 2-5s | Loads everything |
| Initial index (1K notes) | ~5 min | One-time |
| Reindex changed file | <1s | Incremental |

### Memory Usage

| Component | Memory | Notes |
|-----------|--------|-------|
| Nomic v1 model | ~550MB | Loaded once |
| Vector index | ~1KB/chunk | 10K = 10MB |
| File watcher | ~20MB | Per vault |
| Node.js | ~100MB | Base |
| **Total (10K notes)** | **~700MB** | Typical |

---

## Search Optimization

### 1. Adjust Similarity Threshold

```typescript
// Default (balanced)
search_nodes("query", { minSimilarity: 0.3 });

// High precision (fewer, better results)
search_nodes("query", { minSimilarity: 0.6 });

// High recall (more results, some irrelevant)
search_nodes("query", { minSimilarity: 0.2 });
```

**Guidelines**:
- Start with default (0.3)
- Increase if too many irrelevant results
- Decrease if missing expected matches

### 2. Limit Result Count

```typescript
// ❌ Expensive: loads 50 results
const bad = await search_nodes("query", { maxResults: 50 });

// ✅ Efficient: just what you need
const good = await search_nodes("query", { maxResults: 5 });
```

**Rule of thumb**: Use 5-10 results for most queries

### 3. Field Selection

```typescript
// ❌ Heavy: includes everything
const heavy = await search_nodes("query", {
  includeFields: ["observations", "relations", "categories"]
});

// ✅ Light: just what you need
const light = await search_nodes("query", {
  includeFields: ["observations"]  // Skip relations
});
```

**Token savings**: ~50% reduction by excluding relations

### 4. Query Specificity

```typescript
// ❌ Slow: broad, matches everything
search_nodes("work");

// ✅ Fast: specific, precise matches
search_nodes("iOS size optimization Q1 2025 goals");
```

**Why**: Specific queries hit fewer chunks, faster retrieval

---

## Indexing Optimization

### 1. Batch Size Tuning

Edit `scripts/index.ts`:

```typescript
// Default (balanced)
const BATCH_SIZE = 50;

// High RAM (>8GB): increase throughput
const BATCH_SIZE = 100;

// Low RAM (<4GB): reduce memory usage
const BATCH_SIZE = 20;
```

### 2. Parallel Indexing

```bash
# Index vaults in parallel (if separate MEMORY_DIR)
npm run index:personal & npm run index:work &
wait
```

**Caution**: Requires sufficient RAM for two embedder instances

### 3. Incremental Updates

```bash
# Full reindex (slow)
npm run reindex

# Daemon mode (fast, incremental)
./scripts/install-daemon.sh
# Only reindexes changed files
```

**Speedup**: 100x faster for small changes (1s vs 5 min)

---

## Database Optimization

### 1. Vacuum and Analyze

```sql
-- Run monthly or after large deletions
VACUUM ANALYZE vector_chunks;
```

**Impact**: Reclaims space, updates statistics, improves query plans

### 2. Index Maintenance

```sql
-- Rebuild index if searches slow
REINDEX INDEX vector_chunks_embedding_idx;
```

**When**: After indexing 10K+ new documents

### 3. Connection Pool Tuning

```typescript
// In VectorStorage.ts constructor
const pool = new Pool({
  max: 10,  // Reduce if hitting "too many clients"
  max: 50,  // Increase for high concurrent load
});
```

**Guidelines**:
- Default 20 works for most cases
- Increase for high concurrency
- Decrease if database complains

---

## Memory Optimization

### 1. Reduce Token Usage

```typescript
// Use list_entity_names for quick checks (lightweight)
const names = await list_entity_names("person");

// Instead of read_graph (heavy)
const graph = await read_graph();  // Loads everything!
```

**Savings**: 1000x reduction in data transfer

### 2. Targeted Searches

```typescript
// ❌ Heavy: broad search across everything
const all = await search_nodes("development");

// ✅ Light: date-filtered, targeted
const targeted = await search_nodes("development", {
  dateFilter: { after: "2025-01-01" },
  maxResults: 3
});
```

### 3. Chunk Size Optimization

For very large notes (>50KB), consider chunking:

```typescript
// Current: whole file embedded
// Future: chunk-level embeddings (roadmap item)
```

**Status**: Chunking implemented but not fully utilized yet

---

## Query Performance

### Ranking Strategy Impact

| Strategy | Latency | Use Case |
|----------|---------|----------|
| `relevance` | ~40ms | Best semantic match |
| `modified` | ~30ms | Recent changes |
| `created` | ~30ms | Chronological |
| `relevance+recency` | ~50ms | Balanced |

**Recommendation**: Use "relevance" for best quality, "modified" for speed

### Date Filter Impact

```typescript
// Without filter: ~40ms (scans all chunks)
search_nodes("query");

// With filter: ~20ms (scans fewer chunks)
search_nodes("query", {
  dateFilter: { after: "2025-01-01" }
});
```

**Speedup**: ~2x faster with date filters

---

## Scaling Strategies

### Up to 10K Notes

**Current setup works great**:
- Single embedder process
- Default batch size (50)
- Standard indexing (~20 min)

### 10K - 50K Notes

**Optimizations needed**:

1. **Increase batch size**:
```typescript
const BATCH_SIZE = 100;
```

2. **Add more RAM**:
- 8GB+ recommended
- Allows larger batches

3. **Optimize queries**:
- Always use date filters
- Reduce maxResults to 5-10
- Use field selection

### 50K - 100K Notes

**Consider**:

1. **Sharded indexes**:
```sql
-- Partition by entity_type
CREATE TABLE vector_chunks_person 
  PARTITION OF vector_chunks FOR VALUES IN ('person');
```

2. **Multiple embedder workers**:
```typescript
// Spawn 2-4 embedder processes
// Round-robin embedding requests
```

3. **Caching layer**:
```typescript
// Cache frequent queries
const cache = new Map();
if (cache.has(query)) return cache.get(query);
```

### 100K+ Notes

**See roadmap**:
- Distributed indexing (ID #14)
- Incremental embeddings (ID #3)
- Semantic caching (ID #16)

---

## Benchmarking

### Run Performance Tests

```bash
# Time a full reindex
time npm run reindex

# Measure search latency
npm run test:search
```

### Custom Benchmarks

```typescript
// Benchmark search latency
console.time('search');
const results = await search_nodes("test query", {
  maxResults: 10
});
console.timeEnd('search');
// search: 43ms
```

### Database Query Analysis

```sql
-- Show slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
WHERE query LIKE '%vector_chunks%'
ORDER BY mean_exec_time DESC
LIMIT 10;
```

---

## Best Practices

### Do's ✅

1. **Use daemon for auto-reindexing**
   - Install once, forget about it
   - Always up-to-date

2. **Start with defaults**
   - Tune only if needed
   - Measure before optimizing

3. **Use field selection**
   - Reduce token usage
   - Faster responses

4. **Keep queries specific**
   - Better matches
   - Lower latency

5. **Monitor database size**
   - Run VACUUM periodically
   - Clean old data if needed

### Don'ts ❌

1. **Don't use read_graph on large vaults**
   - Loads everything into memory
   - Use search_nodes instead

2. **Don't set minSimilarity too high**
   - > 0.7 often returns nothing
   - Start lower, increase if needed

3. **Don't skip venv**
   - Pollutes system Python
   - Causes version conflicts

4. **Don't index unnecessary files**
   - Skip templates, archives
   - Configure .gitignore patterns

---

## Monitoring

### Key Metrics to Track

```bash
# Database size
psql obsidian_memory -c "SELECT pg_size_pretty(pg_database_size('obsidian_memory'));"

# Chunk count
psql obsidian_memory -c "SELECT COUNT(*), entity_type FROM vector_chunks GROUP BY entity_type;"

# Latest updates
psql obsidian_memory -c "SELECT entity_name, modified_at FROM vector_chunks ORDER BY modified_at DESC LIMIT 10;"
```

### Set Up Monitoring

```bash
# Create monitoring script
cat > monitor.sh << 'EOF'
#!/bin/bash
echo "=== Obsidian Memory Stats ==="
echo "Date: $(date)"
npm run stats
psql obsidian_memory -c "SELECT pg_size_pretty(pg_database_size('obsidian_memory')) as size;"
echo ""
EOF

chmod +x monitor.sh

# Run daily with cron
crontab -e
# Add: 0 9 * * * /path/to/monitor.sh >> ~/obsidian-stats.log
```

---

## Optimization Checklist

Before optimizing, measure current performance:

```bash
# Run this test
time npm run reindex  # Indexing speed
npm run test:search   # Search latency
npm run stats         # Current state
```

Then apply optimizations:

- [ ] Adjust minSimilarity for your use case
- [ ] Reduce maxResults if getting too many
- [ ] Use includeFields to reduce tokens
- [ ] Install daemon for auto-updates
- [ ] Tune batch size for your RAM
- [ ] Add date filters to frequent queries
- [ ] Run VACUUM monthly
- [ ] Monitor database size
- [ ] Use specific queries over broad ones

---

## Performance Comparison

### vs Original obsidian-memory-mcp

| Metric | Original | RAG-Enhanced | Change |
|--------|----------|--------------|--------|
| Search latency | 10ms | 50ms | +40ms (worth it!) |
| Search quality | Exact match only | Semantic | ✅ Better |
| Memory usage | ~100MB | ~700MB | +600MB |
| Setup complexity | Low | Medium | Added DB + Python |
| Features | 9 tools | 9 tools + RAG | ✅ Enhanced |

**Worth it?** YES - semantic search is game-changing for AI memory

### vs Cloud Solutions (OpenAI embeddings)

| Metric | Cloud | Local (Nomic v1) | Winner |
|--------|-------|------------------|--------|
| Cost | $0.0001/1K tokens | $0 | Local |
| Latency | 100-500ms | 40-100ms | Local |
| Privacy | Data sent to API | Stays local | Local |
| Quality | Excellent | Very Good | Cloud (slight edge) |
| Setup | Easy | Medium | Cloud |

**Recommendation**: Use local for privacy + cost, cloud for absolute best quality

---

## Next Steps

- [API Reference](../api/README.md) - Complete API documentation
- [Common Patterns](PATTERNS.md) - Usage cookbook
- [Troubleshooting](TROUBLESHOOTING.md) - Fix issues
- [Architecture](../architecture/ARCHITECTURE.md) - System design
