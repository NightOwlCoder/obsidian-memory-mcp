import chokidar, { FSWatcher } from 'chokidar';
import { VectorStorage } from '../storage/VectorStorage.js';
import { parseMarkdown } from '../utils/markdownUtils.js';
import { getEntityNameFromPath } from '../utils/pathUtils.js';
import { promises as fs } from 'fs';

interface WatchHandlers {
  onAdd?: (path: string) => void | Promise<void>;
  onChange?: (path: string) => void | Promise<void>;
  onDelete?: (path: string) => void | Promise<void>;
}

export class FileWatcher {
  private watchers: Map<string, FSWatcher> = new Map();
  private vectorStorage: VectorStorage;
  private pendingUpdates: Map<string, NodeJS.Timeout> = new Map();
  private debounceMs: number = 100;

  constructor(vectorStorage: VectorStorage) {
    this.vectorStorage = vectorStorage;
  }

  /**
   * Watch a vault directory for changes
   */
  watch(vaultPath: string): void {
    console.error(`Starting watch on: ${vaultPath}`);

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
        stabilityThreshold: this.debounceMs,
        pollInterval: 50
      }
    });

    watcher
      .on('add', (path) => this.handleAdd(path))
      .on('change', (path) => this.handleChange(path))
      .on('unlink', (path) => this.handleDelete(path))
      .on('ready', () => console.error(`✓ Watching: ${vaultPath}`))
      .on('error', (error) => console.error(`Watcher error: ${error}`));

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

    console.error(`File added: ${filePath}`);
    await this.indexFile(filePath);
  }

  /**
   * Handle file change
   */
  private async handleChange(filePath: string): Promise<void> {
    if (!filePath.endsWith('.md')) return;

    // Debounce rapid changes
    const existing = this.pendingUpdates.get(filePath);
    if (existing) {
      clearTimeout(existing);
    }

    const timeout = setTimeout(async () => {
      console.error(`File changed: ${filePath}`);
      await this.indexFile(filePath);
      this.pendingUpdates.delete(filePath);
    }, this.debounceMs);

    this.pendingUpdates.set(filePath, timeout);
  }

  /**
   * Handle file deletion
   */
  private async handleDelete(filePath: string): Promise<void> {
    if (!filePath.endsWith('.md')) return;

    console.error(`File deleted: ${filePath}`);
    
    try {
      await this.vectorStorage.delete(filePath);
    } catch (error) {
      console.error(`Failed to delete ${filePath}:`, error);
    }
  }

  /**
   * Index a file: read, parse, embed, store
   */
  private async indexFile(filePath: string): Promise<void> {
    try {
      // Read file content
      const content = await fs.readFile(filePath, 'utf-8');
      
      // Get entity name from file path
      const entityName = getEntityNameFromPath(filePath);
      if (!entityName) {
        console.error(`Could not extract entity name from: ${filePath}`);
        return;
      }

      // Parse markdown
      const parsed = parseMarkdown(content, entityName);
      
      // Build full content for embedding (includes observations)
      const fullContent = [
        `# ${entityName}`,
        `Type: ${parsed.metadata.entityType}`,
        '',
        '## Observations',
        ...parsed.observations.map(obs => `- ${obs}`),
        '',
        '## Relations',
        ...parsed.relations.map(rel => `- ${rel.relationType}: ${rel.to}`)
      ].join('\n');

      // Store in vector database
      await this.vectorStorage.storeEntity(
        entityName,
        filePath,
        fullContent,
        parsed.metadata.entityType || 'unknown',
        [], // tags (can extract from frontmatter later)
        parsed.relations, // outgoing relations
        null // incoming relations (will be computed later)
      );

      console.error(`✓ Indexed: ${entityName}`);
    } catch (error) {
      console.error(`Failed to index ${filePath}:`, error);
    }
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
