#!/usr/bin/env node
/**
 * Standalone daemon that watches Obsidian vaults for changes
 * and keeps the vector database synchronized.
 * 
 * Runs independently of MCP server.
 * Installed as macOS launchd service.
 * 
 * Features:
 * - 24/7 vault monitoring
 * - Smart 60-second debouncing (typing settled detection)
 * - Uses shared indexing pipeline (observation-level chunking + Docling + OCR)
 * - Comprehensive logging with rotation
 * - Graceful shutdown
 */

import { FileWatcher } from './watcher/FileWatcher.js';
import { VectorStorage } from './storage/VectorStorage.js';
import { daemonLogger as logger } from './utils/logger.js';

async function main() {
  logger.info('='.repeat(60));
  logger.info('Obsidian Indexer Daemon Starting');
  logger.info('='.repeat(60));
  
  const vectorStorage = new VectorStorage();
  const watcher = new FileWatcher(vectorStorage);
  
  // Get vault paths from environment (can be empty/undefined)
  const vaultWork = process.env.VAULT_WORK;
  const vaultPersonal = process.env.VAULT_PERSONAL;
  const debounceMs = parseInt(process.env.FILE_WATCH_DEBOUNCE_MS || '60000');
  
  logger.info('Configuration:');
  logger.info('  Vault (Work): ' + (vaultWork || '(not configured)'));
  logger.info('  Vault (Personal): ' + (vaultPersonal || '(not configured)'));
  logger.info('  Debounce: ' + (debounceMs / 1000) + ' seconds');
  logger.info('  Database: ' + (process.env.DATABASE_URL || 'default'));
  logger.info('  Log Level: ' + (process.env.LOG_LEVEL || 'info'));
  
  // Validate at least one vault is configured
  if (!vaultWork && !vaultPersonal) {
    logger.error('No vaults configured! Set VAULT_WORK or VAULT_PERSONAL environment variable.');
    process.exit(1);
  }
  
  try {
    // Start watching configured vaults
    logger.info('Starting watchers...');
    if (vaultWork) {
      watcher.watch(vaultWork);
    }
    if (vaultPersonal) {
      watcher.watch(vaultPersonal);
    }
    
    logger.info('='.repeat(60));
    logger.info('✓ Daemon Ready - Watching for changes');
    logger.info('='.repeat(60));
    
  } catch (error) {
    logger.error('Failed to start daemon', {
      error: error instanceof Error ? error.message : String(error)
    });
    process.exit(1);
  }
  
  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutdown signal received');
    logger.info('Closing watchers...');
    await watcher.close();
    logger.info('Closing database connection...');
    await vectorStorage.close();
    logger.info('✓ Daemon stopped');
    process.exit(0);
  };
  
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  
  // Keep process alive and log uncaught errors
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', {
      error: error.message,
      stack: error.stack
    });
  });
  
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', {
      reason: String(reason)
    });
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
