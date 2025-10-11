#!/bin/bash
# Full reindex script for both vaults
# Run at night: ./reindex-all.sh

set -e

cd "$(dirname "$0")"

echo "🌙 Starting nightly reindex..."
echo "Time: $(date)"
echo ""

# 1. Clear database
echo "🗑️  Clearing vector database..."
psql obsidian_memory -c "TRUNCATE vector_chunks;"
echo "✅ Database cleared"
echo ""

# 2. Index personal vault
echo "📚 Indexing personal vault..."
npm run index -- --memory-dir /Users/sibagy/fileZ/obsidian/personal
echo ""

# 3. Index work vault
echo "💼 Indexing work vault..."
npm run index -- --memory-dir /Users/sibagy/fileZ/obsidian/work
echo ""

# 4. Show stats
echo "📊 Final statistics:"
npm run stats

echo ""
echo "✅ Reindex complete!"
echo "Time: $(date)"
