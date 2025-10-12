#!/bin/bash
set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLIST_TEMPLATE="$PROJECT_DIR/launchd/com.sibagy.obsidian-indexer.plist"
PLIST_TARGET="$HOME/Library/LaunchAgents/com.sibagy.obsidian-indexer.plist"

echo "=================================================="
echo "  Obsidian Indexer Daemon - Installation"
echo "=================================================="
echo ""

# Build TypeScript
echo "1. Building TypeScript..."
cd "$PROJECT_DIR"
npm run build
echo "   ✓ Build complete"
echo ""

# Auto-detect node path
NODE_PATH=$(which node)
echo "2. Detecting Node.js..."
echo "   Node path: $NODE_PATH"
echo ""

# Get vault paths (require explicit configuration - no defaults)
VAULT_WORK="${VAULT_WORK:-}"
VAULT_PERSONAL="${VAULT_PERSONAL:-}"

# Validate at least one vault is configured
if [ -z "$VAULT_WORK" ] && [ -z "$VAULT_PERSONAL" ]; then
    echo "❌ Error: No vaults configured!"
    echo ""
    echo "Set at least one vault path:"
    echo "  VAULT_WORK=/path/to/work/vault ./scripts/install-daemon.sh"
    echo "  VAULT_PERSONAL=/path/to/personal/vault ./scripts/install-daemon.sh"
    echo ""
    echo "Or both:"
    echo "  VAULT_WORK=/path/to/work VAULT_PERSONAL=/path/to/personal ./scripts/install-daemon.sh"
    exit 1
fi

echo "3. Configuring vault paths..."
if [ -n "$VAULT_WORK" ]; then
    echo "   Work vault: $VAULT_WORK"
fi
if [ -n "$VAULT_PERSONAL" ]; then
    echo "   Personal vault: $VAULT_PERSONAL"
fi
echo ""

# Copy plist and substitute all paths
echo "4. Installing launchd service..."
mkdir -p "$HOME/Library/LaunchAgents"

# Substitute all dynamic values in plist
sed -e "s|/Users/sibagy/.nvm/versions/node/v23.6.1/bin/node|$NODE_PATH|g" \
    -e "s|/Users/sibagy/fileZ/projZ/SIbagyPersonal/ai/memory/obsidian-memory-mcp|$PROJECT_DIR|g" \
    -e "s|/Users/sibagy/fileZ/obsidian/work|$VAULT_WORK|g" \
    -e "s|/Users/sibagy/fileZ/obsidian/personal|$VAULT_PERSONAL|g" \
    "$PLIST_TEMPLATE" > "$PLIST_TARGET"
    
echo "   ✓ Plist installed: $PLIST_TARGET"
echo ""

# Unload existing (if any)
echo "3. Loading service..."
launchctl unload "$PLIST_TARGET" 2>/dev/null || true
launchctl load "$PLIST_TARGET"
echo "   ✓ Service loaded"
echo ""

# Wait a moment for service to start
sleep 2

# Check status
echo "4. Verifying service..."
if launchctl list | grep -q "com.sibagy.obsidian-indexer"; then
    echo "   ✓ Service running"
else
    echo "   ✗ Service not running - check error log"
fi
echo ""

echo "=================================================="
echo "  Installation Complete"
echo "=================================================="
echo ""
echo "Service Name: com.sibagy.obsidian-indexer"
echo ""
echo "Commands:"
echo "  Status:  launchctl list | grep obsidian-indexer"
echo "  Logs:    tail -f /tmp/obsidian-indexer.log"
echo "  Errors:  tail -f /tmp/obsidian-indexer.error.log"
echo "  Restart: $PROJECT_DIR/scripts/restart-daemon.sh"
echo "  Remove:  $PROJECT_DIR/scripts/uninstall-daemon.sh"
echo ""
echo "The daemon is now watching your vaults for changes."
echo "Edits will be indexed 60 seconds after typing stops."
echo ""
