# Testing Plan

> Test scenarios, validation strategy, and quality assurance

## Testing Strategy

### Testing Pyramid

```
           ┌─────────────┐
           │   Manual    │  10% - E2E with real LLM
           │   Testing   │
           ├─────────────┤
           │ Integration │  30% - Component interaction
           │   Tests     │
           ├─────────────┤
           │    Unit     │  60% - Individual functions
           │   Tests     │
           └─────────────┘
```

### Test Categories

1. **Unit Tests** - Individual functions, pure logic
2. **Integration Tests** - Database, embeddings, file watching
3. **Performance Tests** - Latency, throughput, resource usage
4. **Search Quality Tests** - Precision, recall, relevance
5. **Manual Tests** - Real-world scenarios with LLM

---

## Phase 1: Unit Tests

### Embedder Tests

**File**: `tests/embedder.test.ts`

```typescript
describe('Embedder', () => {
  test('embeds text correctly', async () => {
    const embedder = new Embedder();
    const result = await embedder.embed('test text');
    
    expect(result).toHaveLength(1024); // BGE-M3 dimension
    expect(result.every(n => typeof n === 'number')).toBe(true);
  });
  
  test('caches repeated queries', async () => {
    const embedder = new Embedder();
    const text = 'repeated query';
    
    const start1 = Date.now();
    await embedder.embed(text);
    const time1 = Date.now() - start1;
    
    const start2 = Date.now();
    await embedder.embed(text);
    const time2 = Date.now() - start2;
    
    expect(time2).toBeLessThan(time1 / 10); // Cache should be 10x faster
  });
  
  test('handles empty text', async () => {
    const embedder = new Embedder();
    await expect(embedder.embed('')).rejects.toThrow();
  });
});
```

### Markdown Parser Tests

**File**: `tests/markdownUtils.test.ts`

```typescript
describe('Markdown Utils', () => {
  test('parses frontmatter correctly', () => {
    const content = `---
entityType: person
created: 2025-01-15
---

# Sergio

## Observations
- Works at Amazon`;

    const parsed = parseMarkdown(content, 'Sergio');
    
    expect(parsed.metadata.entityType).toBe('person');
    expect(parsed.observations).toHaveLength(1);
  });
  
  test('extracts relations with new format', () => {
    const content = `## Relations
- \`mentors\`: [[Doug Hains]]
- \`works-on\`: [[iOS Optimization]]`;

    const parsed = parseMarkdown(content, 'Sergio');
    
    expect(parsed.relations).toHaveLength(2);
    expect(parsed.relations[0]).toEqual({
      relationType: 'mentors',
      to: 'Doug Hains'
    });
  });
});
```

### Path Utilities Tests

**File**: `tests/pathUtils.test.ts`

```typescript
describe('Path Utils', () => {
  test('sanitizes filenames correctly', () => {
    expect(sanitizeFilename('Doug Hains')).toBe('Doug Hains');
    expect(sanitizeFilename('test/file')).toBe('test_file');
    expect(sanitizeFilename('con')).toBe('_con'); // Reserved name
  });
  
  test('validates paths are in vault', () => {
    const validPath = '/Users/sibagy/fileZ/obsidian/vault/note.md';
    const invalidPath = '/tmp/evil.md';
    
    expect(isInMemoryDir(validPath)).toBe(true);
    expect(isInMemoryDir(invalidPath)).toBe(false);
  });
});
```

---

## Phase 2: Integration Tests

### Vector Storage Tests

**File**: `tests/vectorStorage.test.ts`

```typescript
describe('Vector Storage', () => {
  let storage: VectorStorage;
  
  beforeEach(async () => {
    storage = new VectorStorage();
    await storage.clearAll(); // Clean slate
  });
  
  test('stores and retrieves embeddings', async () => {
    const filePath = '/vault/test.md';
    const content = 'Test content for embedding';
    
    await storage.embed(filePath, content);
    
    const results = await storage.search('test content', {
      maxResults: 1
    });
    
    expect(results).toHaveLength(1);
    expect(results[0].filePath).toBe(filePath);
    expect(results[0].similarity).toBeGreaterThan(0.9);
  });
  
  test('updates existing embeddings', async () => {
    const filePath = '/vault/test.md';
    
    await storage.embed(filePath, 'original content');
    await storage.update(filePath, 'updated content');
    
    const results = await storage.search('updated', { maxResults: 1 });
    
    expect(results[0].similarity).toBeGreaterThan(0.8);
  });
  
  test('deletes embeddings', async () => {
    const filePath = '/vault/test.md';
    
    await storage.embed(filePath, 'content');
    await storage.delete(filePath);
    
    const results = await storage.search('content', { maxResults: 10 });
    
    expect(results).toHaveLength(0);
  });
});
```

### File Watcher Tests

**File**: `tests/fileWatcher.test.ts`

```typescript
describe('File Watcher', () => {
  let watcher: FileWatcher;
  let events: string[];
  
  beforeEach(() => {
    events = [];
    watcher = new FileWatcher();
  });
  
  afterEach(async () => {
    await watcher.close();
  });
  
  test('detects file changes', async () => {
    const testFile = '/tmp/test.md';
    
    watcher.watch('/tmp', {
      onChange: (path) => events.push(`change:${path}`)
    });
    
    fs.writeFileSync(testFile, 'original');
    await sleep(200); // Wait for debounce
    
    fs.writeFileSync(testFile, 'modified');
    await sleep(200);
    
    expect(events).toContain(`change:${testFile}`);
  });
  
  test('debounces rapid changes', async () => {
    const testFile = '/tmp/test.md';
    
    watcher.watch('/tmp', {
      onChange: (path) => events.push(`change:${path}`)
    });
    
    // Rapid writes
    fs.writeFileSync(testFile, 'v1');
    fs.writeFileSync(testFile, 'v2');
    fs.writeFileSync(testFile, 'v3');
    
    await sleep(200);
    
    // Should only trigger once due to debouncing
    expect(events.length).toBe(1);
  });
});
```

### Search Integration Tests

**File**: `tests/search.test.ts`

```typescript
describe('Search Integration', () => {
  let storage: MarkdownStorageManager;
  
  beforeAll(async () => {
    storage = new MarkdownStorageManager();
    
    // Seed test data
    await storage.createEntities([
      {
        name: 'Sergio',
        entityType: 'person',
        observations: ['PE developer', 'iOS expert']
      },
      {
        name: 'Doug Hains',
        entityType: 'person',
        observations: ['Senior PE', 'Mentor']
      }
    ]);
  });
  
  test('semantic search finds relevant results', async () => {
    const results = await storage.searchNodes('principal engineer');
    
    expect(results.entities.length).toBeGreaterThan(0);
    expect(results.entities[0].name).toContain('PE');
  });
  
  test('exact name match ranks first', async () => {
    const results = await storage.searchNodes('Sergio');
    
    expect(results.entities[0].name).toBe('Sergio');
    expect(results.entities[0].similarity).toBeGreaterThan(0.95);
  });
  
  test('date filtering works', async () => {
    const results = await storage.searchNodes('developer', {
      dateFilter: {
        after: '2025-01-01',
        before: '2025-01-31'
      }
    });
    
    results.entities.forEach(e => {
      const modified = new Date(e.metadata.modified);
      expect(modified.getTime()).toBeGreaterThan(
        new Date('2025-01-01').getTime()
      );
    });
  });
  
  test('sort by modified returns recent first', async () => {
    const results = await storage.searchNodes('developer', {
      sortBy: 'modified'
    });
    
    // Check descending order
    for (let i = 1; i < results.entities.length; i++) {
      const prev = new Date(results.entities[i-1].metadata.modified);
      const curr = new Date(results.entities[i].metadata.modified);
      expect(prev.getTime()).toBeGreaterThanOrEqual(curr.getTime());
    }
  });
});
```

---

## Phase 3: Performance Tests

### Embedding Performance

**File**: `tests/performance.test.ts`

```typescript
describe('Performance Tests', () => {
  test('embeddings are fast enough', async () => {
    const embedder = new Embedder();
    const text = 'Sample text for performance testing';
    
    const iterations = 10;
    const start = Date.now();
    
    for (let i = 0; i < iterations; i++) {
      await embedder.embed(text);
    }
    
    const elapsed = Date.now() - start;
    const avgTime = elapsed / iterations;
    
    expect(avgTime).toBeLessThan(100); // <100ms per embedding (with cache)
  });
  
  test('search is fast', async () => {
    const storage = new MarkdownStorageManager();
    
    const start = Date.now();
    await storage.searchNodes('test query');
    const elapsed = Date.now() - start;
    
    expect(elapsed).toBeLessThan(100); // <100ms for search
  });
  
  test('batch indexing throughput', async () => {
    const storage = new VectorStorage();
    const files = Array.from({ length: 100 }, (_, i) => ({
      path: `/vault/file${i}.md`,
      content: `Content ${i} for testing throughput`
    }));
    
    const start = Date.now();
    
    for (const file of files) {
      await storage.embed(file.path, file.content);
    }
    
    const elapsed = Date.now() - start;
    const throughput = (files.length / elapsed) * 1000; // files/sec
    
    expect(throughput).toBeGreaterThan(50); // >50 files/sec
  });
});
```

### Memory Tests

```typescript
describe('Memory Usage', () => {
  test('no memory leaks in search', async () => {
    const storage = new MarkdownStorageManager();
    const initialMem = process.memoryUsage().heapUsed;
    
    // Run 1000 searches
    for (let i = 0; i < 1000; i++) {
      await storage.searchNodes(`query ${i}`);
    }
    
    global.gc(); // Force garbage collection
    const finalMem = process.memoryUsage().heapUsed;
    const growth = finalMem - initialMem;
    
    expect(growth).toBeLessThan(50 * 1024 * 1024); // <50MB growth
  });
});
```

---

## Phase 4: Search Quality Tests

### Test Dataset

Create `tests/fixtures/search-quality.json`:

```json
{
  "queries": [
    {
      "query": "PE developer goals",
      "expectedResults": ["Sergio", "PE Developer"],
      "minRelevance": 0.8
    },
    {
      "query": "mentorship",
      "expectedResults": ["Doug Hains", "Sergio"],
      "minRelevance": 0.7
    },
    {
      "query": "iOS optimization",
      "expectedResults": ["iOS Size Optimization", "WeblabIOSClient"],
      "minRelevance": 0.8
    }
  ]
}
```

### Quality Tests

**File**: `tests/searchQuality.test.ts`

```typescript
describe('Search Quality', () => {
  const testCases = require('./fixtures/search-quality.json');
  
  test.each(testCases.queries)('query: $query', async ({ query, expectedResults, minRelevance }) => {
    const storage = new MarkdownStorageManager();
    const results = await storage.searchNodes(query, {
      maxResults: 10
    });
    
    // Check that expected results are found
    const foundNames = results.entities.map(e => e.name);
    
    for (const expected of expectedResults) {
      expect(foundNames).toContain(expected);
    }
    
    // Check relevance scores
    const relevantResults = results.entities.filter(e =>
      expectedResults.includes(e.name)
    );
    
    relevantResults.forEach(result => {
      expect(result.similarity).toBeGreaterThan(minRelevance);
    });
  });
  
  test('precision and recall metrics', async () => {
    const storage = new MarkdownStorageManager();
    
    let totalPrecision = 0;
    let totalRecall = 0;
    
    for (const testCase of testCases.queries) {
      const results = await storage.searchNodes(testCase.query, {
        maxResults: 10
      });
      
      const retrieved = results.entities.map(e => e.name);
      const relevant = testCase.expectedResults;
      
      const truePositives = retrieved.filter(r => relevant.includes(r)).length;
      const precision = truePositives / retrieved.length;
      const recall = truePositives / relevant.length;
      
      totalPrecision += precision;
      totalRecall += recall;
    }
    
    const avgPrecision = totalPrecision / testCases.queries.length;
    const avgRecall = totalRecall / testCases.queries.length;
    
    expect(avgPrecision).toBeGreaterThan(0.8); // >80% precision
    expect(avgRecall).toBeGreaterThan(0.7); // >70% recall
  });
});
```

---

## Phase 5: Manual Test Scenarios

### Scenario 1: Create Entity and Search

```typescript
// 1. Create entity
await mcp.call('create_entities', {
  entities: [{
    name: 'Test Project',
    entityType: 'project',
    observations: ['A test project for validation']
  }]
});

// 2. Wait for file watcher (1s)
await sleep(1000);

// 3. Search for it
const results = await mcp.call('search_nodes', {
  query: 'test project'
});

// 4. Verify found
expect(results.entities[0].name).toBe('Test Project');
```

### Scenario 2: Edit in Obsidian and Search

```typescript
// 1. Manually edit file in Obsidian
// 2. Wait for sync (1s)
await sleep(1000);

// 3. Search with new content
const results = await mcp.call('search_nodes', {
  query: 'new content added in obsidian'
});

// 4. Verify updated content appears
expect(results.entities.length).toBeGreaterThan(0);
```

### Scenario 3: Real LLM Integration

**Test with actual LLM:**

```
User: "What am I working on?"
LLM: <uses search_nodes("Sergio current projects work")>
Expected: Returns relevant project entities

User: "Who's my mentor?"
LLM: <uses search_nodes("Sergio mentor")>
Expected: Returns Doug Hains with "mentors" relation

User: "Recent PE goals?"
LLM: <uses search_nodes("PE goals", { sortBy: "modified" })>
Expected: Returns recent goal-related entities
```

---

## Phase 6: Stress Testing

### Load Tests

**File**: `tests/load.test.ts`

```typescript
describe('Load Tests', () => {
  test('handles concurrent searches', async () => {
    const storage = new MarkdownStorageManager();
    const queries = Array.from({ length: 100 }, (_, i) => `query ${i}`);
    
    const start = Date.now();
    
    await Promise.all(
      queries.map(q => storage.searchNodes(q))
    );
    
    const elapsed = Date.now() - start;
    
    expect(elapsed).toBeLessThan(10000); // <10s for 100 concurrent
  });
  
  test('indexes large vault', async () => {
    // Test with 10K files
    const storage = new VectorStorage();
    const files = Array.from({ length: 10000 }, (_, i) => ({
      path: `/vault/file${i}.md`,
      content: `Content for file ${i}`
    }));
    
    const start = Date.now();
    
    for (const file of files) {
      await storage.embed(file.path, file.content);
    }
    
    const elapsed = Date.now() - start;
    const minutes = elapsed / 1000 / 60;
    
    expect(minutes).toBeLessThan(200); // <3.5 hours for 10K files
  }, 300000); // 5 min timeout
});
```

---

## Test Execution

### Running Tests

```bash
# All tests
npm test

# Specific category
npm test -- tests/unit
npm test -- tests/integration
npm test -- tests/performance

# With coverage
npm test -- --coverage

# Watch mode
npm test -- --watch
```

### CI/CD Integration

**File**: `.github/workflows/test.yml`

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_PASSWORD: postgres
        ports:
          - 5432:5432
    
    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      
      - uses: actions/setup-python@v4
        with:
          python-version: 3.11
      
      - name: Install dependencies
        run: |
          npm install
          pip install -r requirements.txt
      
      - name: Run tests
        run: npm test -- --coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

---

## Success Criteria

### Minimum Requirements

- [ ] Unit test coverage >80%
- [ ] All integration tests pass
- [ ] Search latency p95 <100ms
- [ ] Search precision >80%
- [ ] Search recall >70%
- [ ] No memory leaks
- [ ] Handles 10K files

### Nice to Have

- [ ] Unit test coverage >90%
- [ ] Search latency p95 <50ms
- [ ] Search precision >85%
- [ ] Search recall >80%
- [ ] Handles 100K files

---

## Test Maintenance

### Adding New Tests

When adding features:

1. Write unit tests first (TDD)
2. Add integration tests
3. Update search quality tests if affecting search
4. Run full test suite before commit

### Test Data Management

```bash
# Generate test data
npm run generate-test-data

# Clean test data
npm run clean-test-data

# Reset test database
npm run reset-test-db
```

### Debugging Failed Tests

```bash
# Run single test with debug output
npm test -- --test-name-pattern="specific test" --verbose

# Run with debugger
node --inspect-brk node_modules/.bin/vitest run
```

---

## Continuous Improvement

### Monitoring in Production

Track these metrics:

```typescript
interface ProductionMetrics {
  searchLatency: {
    p50: number;
    p95: number;
    p99: number;
  };
  searchQuality: {
    userSatisfaction: number; // % of searches followed by action
    emptyResults: number;     // % of searches with no results
  };
  systemHealth: {
    embeddingFailures: number;
    databaseErrors: number;
    fileWatcherUptime: number;
  };
}
```

### A/B Testing

Test search improvements:

```typescript
// Test different similarity thresholds
const results_v1 = await search(query, { minSimilarity: 0.7 });
const results_v2 = await search(query, { minSimilarity: 0.75 });

// Compare user engagement
trackMetric('search_satisfaction', { version: 'v1', ... });
```

---

## Summary

Complete testing strategy covering:

- ✅ Unit tests for all components
- ✅ Integration tests for system interactions
- ✅ Performance tests for latency/throughput
- ✅ Search quality tests for precision/recall
- ✅ Manual scenarios for real-world validation
- ✅ Load tests for scalability

Target: **90%+ coverage, 80%+ precision, <100ms latency**

Next: Implement tests during each development phase.
