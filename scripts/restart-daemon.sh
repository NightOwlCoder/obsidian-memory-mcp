#!/bin/bash
set -e

PLIST="$HOME/Library/LaunchAgents/com.sibagy.obsidian-indexer.plist"

echo "=================================================="
echo "  Obsidian Indexer Daemon - Restart"
echo "=================================================="
echo ""

if [ ! -f "$PLIST" ]; then
    echo "✗ Service not installed"
    echo "Run install-daemon.sh first"
    exit 1
fi

echo "1. Unloading service..."
launchctl unload "$PLIST" 2>/dev/null || true
echo "   ✓ Service unloaded"
echo ""

echo "2. Loading service..."
launchctl load "$PLIST"
echo "   ✓ Service loaded"
echo ""

# Wait a moment for service to start
sleep 2

# Check status
echo "3. Verifying service..."
if launchctl list | grep -q "com.sibagy.obsidian-indexer"; then
    echo "   ✓ Service running"
else
    echo "   ✗ Service not running - check error log"
fi
echo ""

echo "=================================================="
echo "  Restart Complete"
echo "=================================================="
echo ""
echo "View logs:"
echo "  tail -f /tmp/obsidian-indexer.log"
echo ""
