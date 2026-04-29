# Examples

> Runnable code examples demonstrating Obsidian Memory MCP usage

## Running Examples

All examples are TypeScript files that can be run directly:

```bash
# Make sure you've built the project first
npm run build

# Run any example
tsx examples/basic-usage.ts
tsx examples/semantic-search.ts
tsx examples/entity-management.ts
```

## Prerequisites

- Project built: `npm run build`
- Database set up and indexed: `npm run index`
- Python venv activated: `source venv/bin/activate`

---

## Available Examples

### 1. basic-usage.ts

**What it demonstrates**:
- Creating entities
- Creating relations
- Adding observations
- Semantic search
- Opening specific nodes
- Listing entities by type

**Run time**: ~2-3 seconds

**Use this to**: Get familiar with core operations

```bash
tsx examples/basic-usage.ts
```

### 2. semantic-search.ts

**What it demonstrates**:
- Different similarity thresholds (0.2, 0.3, 0.7)
- All ranking strategies (relevance, modified, hybrid)
- Date range filtering
- Field selection for token optimization
- Search metadata inspection

**Run time**: ~1-2 seconds

**Use this to**: Understand search options and tuning

```bash
tsx examples/semantic-search.ts
```

### 3. entity-management.ts

**What it demonstrates**:
- Checking for existing entities (avoid duplicates)
- Batch entity creation
- Creating relations
- Incremental knowledge building
- Cleanup operations

**Run time**: ~2 seconds

**Use this to**: Learn entity lifecycle management

```bash
tsx examples/entity-management.ts
```

---

## Example Output

### basic-usage.ts

```
=== Obsidian Memory MCP - Basic Usage Example ===

1. Creating entities...
Created: [
  { name: 'Example Person', created: true },
  { name: 'Example Project', created: true }
]

2. Creating relation...
Relation created: { created: 1, alreadyExists: 0 }

...
```

### semantic-search.ts

```
=== Semantic Search Patterns ===

Pattern 1: Simple Semantic Search
Query: "artificial intelligence"
Results: 3 matches
  - AI Research: 0.887
  - Machine Learning Project: 0.782
  - Neural Networks: 0.756

...
```

---

## Creating Your Own Examples

Use this template:

```typescript
/**
 * Example: [Your Example Name]
 * 
 * Demonstrates: [what it shows]
 * 
 * Run with: tsx examples/your-example.ts
 */

import { MarkdownStorageManager } from '../storage/MarkdownStorageManager.js';

async function main() {
  const storage = new MarkdownStorageManager();
  
  // Your code here
  
  console.log('Example complete!');
}

main().catch(console.error);
```

---

## Testing Examples

```bash
# Test all examples at once
for f in examples/*.ts; do
  echo "Running $f..."
  tsx "$f"
  echo ""
done
```

---

## Common Issues

### "Cannot find module '../storage/MarkdownStorageManager.js'"

**Solution**: Build the project first
```bash
npm run build
```

### "Database connection failed"

**Solution**: Ensure PostgreSQL is running
```bash
brew services start postgresql@14
```

### "Entity not found"

**Solution**: Index your vault first
```bash
npm run index
```

---

## Next Steps

- Review [API Documentation](../docs/api/README.md)
- Read [Common Patterns Guide](../docs/guides/PATTERNS.md)
- Check [Performance Guide](../docs/guides/PERFORMANCE.md)
