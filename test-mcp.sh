#!/bin/bash
# Test MCP server locally via stdio

set -e

echo "🧪 Testing Obsidian Memory MCP Server"
echo ""

# Set environment variables
export MEMORY_DIR="/Users/sibagy/fileZ/obsidian/pessoAll/memory"
export DATABASE_URL="postgresql://localhost:5432/obsidian_memory"

cd "$(dirname "$0")"

echo "1️⃣  Testing search_nodes with semantic query..."
echo ""

# Test search via stdio
node dist/index.js << 'EOF' 2>/dev/null | jq '.result.content[0].text | fromjson | {
  query: .metadata.query,
  total: .metadata.totalMatches,
  returned: .metadata.returnedCount,
  searchType: .metadata.searchType,
  entities: .entities[0:3] | map(.name)
}'
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "search_nodes",
    "arguments": {
      "query": "Sergio PE developer"
    }
  }
}
EOF

echo ""
echo "✅ Test complete!"
echo ""
echo "To test interactively:"
echo "  node dist/index.js"
echo ""
