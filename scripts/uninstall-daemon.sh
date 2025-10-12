#!/bin/bash

PLIST="$HOME/Library/LaunchAgents/com.sibagy.obsidian-indexer.plist"

echo "=================================================="
echo "  Obsidian Indexer Daemon - Uninstallation"
echo "=================================================="
echo ""

if [ ! -f "$PLIST" ]; then
    echo "Service not installed (plist not found)"
    exit 0
fi

echo "1. Unloading service..."
launchctl unload "$PLIST" 2>/dev/null || true
echo "   ✓ Service unloaded"
echo ""

echo "2. Removing plist..."
rm -f "$PLIST"
echo "   ✓ Plist removed"
echo ""

echo "=================================================="
echo "  Uninstallation Complete"
echo "=================================================="
echo ""
echo "The daemon has been stopped and removed."
echo "Log files remain at:"
echo "  /tmp/obsidian-indexer.log"
echo "  /tmp/obsidian-indexer.error.log"
echo ""
