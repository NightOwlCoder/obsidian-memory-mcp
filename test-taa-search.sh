#!/bin/bash
# Test TAA search and save results
cd "$(dirname "$0")"

echo "Testing TAA oncall search..."
echo ""

( echo '{"jsonrpc": "2.0", "method": "tools/call", "params": {"name": "search_nodes", "arguments": {"query": "oncall TAA robot", "maxResults": 3}}, "id": 1}' && sleep 5 ) | timeout 10 npm start 2>&1 > /tmp/taa-test-output.txt

echo "Results saved to /tmp/taa-test-output.txt"
echo ""
echo "Parsing results:"
cat /tmp/taa-test-output.txt | grep '"result"' | python3 -m json.tool | grep -A 30 '"entities"'
