import chokidar, { FSWatcher } from 'chokidar';
import { VectorStorage } from '../storage/VectorStorage.js';
import { indexFile } from '../utils/indexingPipeline.js';
import { daemonLogger as logger } from '../utils/logger.js';
import path from 'path';

export class FileWatcher {
  private watchers: Map<string, FSWatcher> = new Map();
  private vectorStorage: VectorStorage;
  private pendingUpdates: Map<string, NodeJS.Timeout> = new Map();
  private debounceMs: number;

  constructor(vectorStorage: VectorStorage) {
    this.vectorStorage = vectorStorage;
    // Smart debounce: 60 seconds (typing settled detection)
    this.debounceMs = parseInt(process.env.FILE_WATCH_DEBOUNCE_MS || '60000');
  }

  /**
   * Watch a vault directory for changes
   */
  watch(vaultPath: string): void {
    logger.info('Starting watch: ' + vaultPath);

    const watcher = chokidar.watch(vaultPath, {
      ignored: [
        /(^|[\/\\])\../, // Ignore dotfiles
        /node_modules/,
        /venv/,
        /\.git/
      ],
      persistent: true,
      ignoreInitial: true, // Don't trigger for existing files
      awaitWriteFinish: {
        stabilityThreshold: 500,  // Wait 500ms for write to complete
        pollInterval: 50
      }
    });

    watcher
      .on('add', (path) => this.handleAdd(path))
      .on('change', (path) => this.handleChange(path))
      .on('unlink', (path) => this.handleDelete(path))
      .on('ready', () => logger.info('✓ Ready: ' + vaultPath))
      .on('error', (error) => logger.error('Watcher error: ' + vaultPath, { error: String(error) }));

    this.watchers.set(vaultPath, watcher);
  }

  /**
   * Watch multiple vault directories
   */
  watchMultiple(vaultPaths: string[]): void {
    for (const vaultPath of vaultPaths) {
      this.watch(vaultPath);
    }
  }

  /**
   * Handle file addition
   */
  private async handleAdd(filePath: string): Promise<void> {
    if (!filePath.endsWith('.md')) return;

    logger.info('File added: ' + path.basename(filePath));
    await this.handleFileChange(filePath);
  }

  /**
   * Handle file change
   */
  private async handleChange(filePath: string): Promise<void> {
    if (!filePath.endsWith('.md')) return;

    // Smart debounce: timer resets on each save (typing settled detection)
    const existing = this.pendingUpdates.get(filePath);
    if (existing) {
      clearTimeout(existing);
      logger.debug('Timer reset: ' + path.basename(filePath) + ' (' + (this.debounceMs / 1000) + 's)');
    } else {
      logger.debug('Timer started: ' + path.basename(filePath) + ' (' + (this.debounceMs / 1000) + 's)');
    }

    const timeout = setTimeout(async () => {
      logger.info('Typing settled: ' + path.basename(filePath));
      await this.handleFileChange(filePath);
      this.pendingUpdates.delete(filePath);
    }, this.debounceMs);

    this.pendingUpdates.set(filePath, timeout);
  }

  /**
   * Handle file deletion
   */
  private async handleDelete(filePath: string): Promise<void> {
    if (!filePath.endsWith('.md')) return;

    logger.warn('File deleted: ' + path.basename(filePath));
    
    try {
      await this.vectorStorage.delete(filePath);
      logger.info('✓ Removed from vector DB: ' + path.basename(filePath));
    } catch (error) {
      logger.error('Failed to delete ' + path.basename(filePath), {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Index or re-index a file using shared pipeline
   */
  private async handleFileChange(filePath: string): Promise<void> {
    const vaultRoot = this.getVaultRoot(filePath);
    const success = await indexFile(this.vectorStorage, filePath, vaultRoot);
    
    if (success) {
      logger.info('✓ Re-indexed: ' + path.basename(filePath));
    } else {
      logger.error('✗ Failed to re-index: ' + path.basename(filePath));
    }
  }

  /**
   * Get vault root for a file path
   */
  private getVaultRoot(filePath: string): string {
    // Find vault root by checking which watched path contains this file
    for (const [vaultPath] of this.watchers) {
      if (filePath.startsWith(vaultPath)) {
        return vaultPath;
      }
    }
    // Fallback: use file's parent directory
    return path.dirname(filePath);
  }

  /**
   * Stop watching a vault
   */
  async unwatch(vaultPath: string): Promise<void> {
    const watcher = this.watchers.get(vaultPath);
    if (watcher) {
      await watcher.close();
      this.watchers.delete(vaultPath);
      console.error(`Stopped watching: ${vaultPath}`);
    }
  }

  /**
   * Stop watching all vaults
   */
  async close(): Promise<void> {
    for (const [path, watcher] of this.watchers.entries()) {
      await watcher.close();
      console.error(`Stopped watching: ${path}`);
    }
    this.watchers.clear();
    
    // Clear pending updates
    for (const timeout of this.pendingUpdates.values()) {
      clearTimeout(timeout);
    }
    this.pendingUpdates.clear();
  }

  /**
   * Get active watch paths
   */
  getWatchedPaths(): string[] {
    return Array.from(this.watchers.keys());
  }
}
