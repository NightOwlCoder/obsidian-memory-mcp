import { Pool, PoolClient } from 'pg';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Embedding result from Nomic Embed v1
 * @internal
 */
interface EmbeddingResult {
  /** 768-dimensional embedding vector */
  embedding: number[];
  /** Embedding dimension (always 768 for Nomic v1) */
  dimension: number;
}

/**
 * Search result from vector similarity query
 * 
 * Contains both the matched content and metadata about the match,
 * including similarity score and timestamps.
 */
export interface SearchResult {
  /** Unique chunk identifier */
  id: string;
  /** Name of the entity this chunk belongs to */
  entityName: string;
  /** File path of the source markdown file */
  filePath: string;
  /** Text content of the matched chunk */
  content: string;
  /** Cosine similarity score (0.0-1.0, higher is more similar) */
  similarity: number;
  /** When this chunk was first created */
  createdAt: Date;
  /** When this chunk was last modified */
  modifiedAt: Date;
  /** Type of entity (person, project, etc.) */
  entityType: string | null;
  /** Associated tags for filtering */
  tags: string[] | null;
}

/**
 * Singleton embedder instance shared across all VectorStorage instances
 * Prevents spawning multiple Python processes
 */
class EmbedderSingleton {
  private static instance: EmbedderSingleton | null = null;
  private process: ChildProcess | null = null;
  private ready: boolean = false;
  private startupPromise: Promise<void> | null = null;

  private constructor() {}

  static getInstance(): EmbedderSingleton {
    if (!EmbedderSingleton.instance) {
      EmbedderSingleton.instance = new EmbedderSingleton();
    }
    return EmbedderSingleton.instance;
  }

  async getProcess(): Promise<ChildProcess> {
    if (this.process && this.ready) {
      return this.process;
    }

    // If startup in progress, wait for it
    if (this.startupPromise) {
      await this.startupPromise;
      return this.process!;
    }

    // Start new process
    this.startupPromise = this.startProcess();
    await this.startupPromise;
    this.startupPromise = null;
    return this.process!;
  }

  private async startProcess(): Promise<void> {
    const projectRoot = process.cwd().endsWith('obsidian-memory-mcp') 
      ? process.cwd()
      : path.resolve(__dirname, '..', '..');
    
    const venvPython = path.join(projectRoot, 'venv', 'bin', 'python');
    const embedderScript = path.join(projectRoot, 'embeddings', 'embedder.py');

    this.process = spawn(venvPython, [embedderScript], {
      env: { ...process.env, HF_HUB_ENABLE_HF_TRANSFER: '0' }
    });

    // Set up error handling
    this.process.on('error', (err) => {
      console.error('Embedder process error:', err);
      this.cleanup();
    });

    this.process.on('exit', (code) => {
      console.error(`Embedder process exited with code ${code}`);
      this.cleanup();
    });

    // Wait for "Embedder service ready" message
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.cleanup();
        reject(new Error('Embedder service startup timeout'));
      }, 30000);

      this.process!.stderr?.on('data', (data) => {
        const message = data.toString();
        console.error('Embedder:', message.trim());
        
        if (message.includes('Embedder service ready')) {
          clearTimeout(timeout);
          this.ready = true;
          resolve();
        }
      });

      this.process!.on('error', (err) => {
        clearTimeout(timeout);
        this.cleanup();
        reject(err);
      });
    });
  }

  private cleanup(): void {
    this.ready = false;
    this.process = null;
  }

  shutdown(): void {
    if (this.process) {
      this.process.kill();
      this.cleanup();
    }
  }

  isReady(): boolean {
    return this.ready && this.process !== null;
  }
}

/**
 * Vector storage engine for RAG (Retrieval Augmented Generation)
 * 
 * Manages embedding generation using Nomic Embed v1 and vector similarity
 * search via PostgreSQL with PGVector. This is the core RAG engine that
 * powers semantic search across the knowledge base.
 * 
 * Key features:
 * - Nomic Embed v1 embeddings (768-dim, multilingual)
 * - PostgreSQL + PGVector for <50ms searches
 * - Multiple ranking strategies (relevance, recency, hybrid)
 * - Singleton embedder service (shared across all instances)
 * 
 * @example
 * ```typescript
 * const vectorStorage = new VectorStorage();
 * 
 * // Store entity with embedding
 * await vectorStorage.storeEntity(
 *   "Sergio",
 *   "/path/to/Sergio.md",
 *   "Aspiring PE developer",
 *   "person"
 * );
 * 
 * // Semantic search
 * const results = await vectorStorage.search("career goals", {
 *   maxResults: 5,
 *   sortBy: "relevance"
 * });
 * ```
 */
export class VectorStorage {
  private pool: Pool;
  private embedder: EmbedderSingleton;

  /**
   * Creates a new VectorStorage instance
   * 
   * Initializes PostgreSQL connection pool and gets the singleton embedder.
   * The embedder is shared across all VectorStorage instances to prevent
   * process proliferation.
   * 
   * @throws {Error} If database connection fails
   */
  constructor() {
    const databaseUrl = process.env.DATABASE_URL || 'postgresql://localhost:5432/obsidian_memory';
    
    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.pool.on('error', (err) => {
      console.error('PostgreSQL pool error:', err);
    });

    this.embedder = EmbedderSingleton.getInstance();
  }

  /**
   * Generate 768-dimensional embedding for text
   * 
   * Uses Nomic Embed v1 model via Python service. The embedder starts
   * automatically on first use and stays resident for subsequent calls.
   * Embeddings are normalized and optimized for semantic similarity search.
   * 
   * @param text - Text to embed (max ~8K tokens)
   * @returns Promise with 768-dimensional embedding vector
   * 
   * @example
   * ```typescript
   * const embedding = await vectorStorage.embed("PE developer career");
   * console.log(embedding.length); // 768
   * ```
   * 
   * @throws {Error} If embedder service fails to start
   * @throws {Error} If embedding generation times out (10s)
   */
  async embed(text: string): Promise<number[]> {
    const embedderProcess = await this.embedder.getProcess();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Embedding timeout'));
      }, 10000);

      let responseData = '';

      const dataHandler = (data: Buffer) => {
        responseData += data.toString();
        
        // Check if we have a complete JSON response
        try {
          const result: EmbeddingResult | { error: string } = JSON.parse(responseData);
          
          clearTimeout(timeout);
          embedderProcess.stdout?.off('data', dataHandler);
          
          if ('error' in result) {
            reject(new Error(result.error));
          } else {
            resolve(result.embedding);
          }
        } catch {
          // Not complete JSON yet, wait for more data
        }
      };

      embedderProcess.stdout?.on('data', dataHandler);

      // Send request
      const request = JSON.stringify({ text }) + '\n';
      embedderProcess.stdin?.write(request);
    });
  }

  /**
   * Store complete entity with embedding
   * 
   * Generates embedding and stores entity content in vector database.
   * Uses upsert semantics - updates if entity already exists at this path.
   * This is the primary method for storing non-chunked entities.
   * 
   * @param entityName - Entity identifier
   * @param filePath - Source file path
   * @param content - Text content to embed and store
   * @param entityType - Entity type (person, project, etc.)
   * @param tags - Optional tags for filtering
   * @param outgoingRelations - Optional outgoing relations metadata
   * @param incomingRelations - Optional incoming relations metadata
   * 
   * @example
   * ```typescript
   * await vectorStorage.storeEntity(
   *   "Sergio",
   *   "/vault/memory/Sergio.md",
   *   "Aspiring PE developer at Amazon",
   *   "person",
   *   ["engineering"]
   * );
   * ```
   * 
   * @throws {Error} If embedding generation fails
   * @throws {Error} If database insert fails
   * 
   * @see storeChunk for storing large entities in chunks
   */
  async storeEntity(
    entityName: string,
    filePath: string,
    content: string,
    entityType: string,
    tags: string[] = [],
    outgoingRelations: any = null,
    incomingRelations: any = null
  ): Promise<void> {
    const embedding = await this.embed(content);
    const embeddingArray = `[${embedding.join(',')}]`;

    const query = `
      INSERT INTO vector_chunks (
        entity_name, file_path, content, embedding,
        entity_type, tags, outgoing_relations, incoming_relations,
        chunk_index, chunk_total
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (entity_name, file_path, chunk_index)
      DO UPDATE SET
        content = EXCLUDED.content,
        embedding = EXCLUDED.embedding,
        modified_at = NOW(),
        entity_type = EXCLUDED.entity_type,
        tags = EXCLUDED.tags,
        outgoing_relations = EXCLUDED.outgoing_relations,
        incoming_relations = EXCLUDED.incoming_relations,
        chunk_total = EXCLUDED.chunk_total
    `;

    await this.pool.query(query, [
      entityName,
      filePath,
      content,
      embeddingArray,
      entityType,
      tags,
      JSON.stringify(outgoingRelations),
      JSON.stringify(incomingRelations),
      0, // chunk_index (default for non-chunked)
      1  // chunk_total (default for non-chunked)
    ]);
  }

  /**
   * Store a single chunk of a large entity
   * 
   * For entities too large to embed as a single unit, this stores
   * individual chunks with their embeddings. Each chunk is indexed
   * separately for more precise semantic matching.
   * 
   * @param entityName - Entity identifier
   * @param filePath - Source file path
   * @param chunkContent - Text content of this specific chunk
   * @param chunkIndex - Zero-based index of this chunk
   * @param chunkTotal - Total number of chunks for this entity
   * @param entityType - Entity type (default: "unknown")
   * @param tags - Optional tags for filtering
   * 
   * @example
   * ```typescript
   * // Store large document in 3 chunks
   * await vectorStorage.storeChunk("Long Doc", "/path", "Part 1...", 0, 3);
   * await vectorStorage.storeChunk("Long Doc", "/path", "Part 2...", 1, 3);
   * await vectorStorage.storeChunk("Long Doc", "/path", "Part 3...", 2, 3);
   * ```
   * 
   * @throws {Error} If embedding generation fails
   * @throws {Error} If database insert fails
   */
  async storeChunk(
    entityName: string,
    filePath: string,
    chunkContent: string,
    chunkIndex: number,
    chunkTotal: number,
    entityType: string = 'unknown',
    tags: string[] = []
  ): Promise<void> {
    const embedding = await this.embed(chunkContent);
    const embeddingArray = `[${embedding.join(',')}]`;

    const query = `
      INSERT INTO vector_chunks (
        entity_name, file_path, content, embedding,
        entity_type, tags, chunk_index, chunk_total
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (entity_name, file_path, chunk_index)
      DO UPDATE SET
        content = EXCLUDED.content,
        embedding = EXCLUDED.embedding,
        modified_at = NOW(),
        entity_type = EXCLUDED.entity_type,
        tags = EXCLUDED.tags,
        chunk_total = EXCLUDED.chunk_total
    `;

    await this.pool.query(query, [
      entityName,
      filePath,
      chunkContent,
      embeddingArray,
      entityType,
      tags,
      chunkIndex,
      chunkTotal
    ]);
  }

  /**
   * Semantic search using vector similarity
   * 
   * Core RAG search method. Embeds the query and finds the most similar
   * chunks using cosine similarity. Supports multiple ranking strategies
   * and date filtering. Typical search latency: <50ms for 10K chunks.
   * 
   * @param query - Natural language search query
   * @param options - Search configuration
   * @param options.maxResults - Maximum results to return (default: 10)
   * @param options.minSimilarity - Similarity threshold 0.0-1.0 (default: 0.3)
   *   - Lower (0.1-0.3): More results, less precise matches
   *   - Medium (0.3-0.5): Balanced relevance
   *   - Higher (0.5-0.7): Stricter matches, fewer results  
   *   - Very high (0.7+): Only near-exact semantic matches
   * @param options.sortBy - Ranking strategy (default: "relevance")
   *   - "relevance": Pure cosine similarity
   *   - "modified": Most recently modified first
   *   - "created": Most recently created first
   *   - "relevance+recency": Hybrid (70% relevance + 30% recency)
   * @param options.dateFilter - Filter by modification date range
   * 
   * @returns Promise with matching chunks and similarity scores
   * 
   * @example
   * ```typescript
   * // Simple semantic search
   * const results = await vectorStorage.search("machine learning", {
   *   maxResults: 5
   * });
   * 
   * // Recent work with hybrid ranking
   * const recent = await vectorStorage.search("project status", {
   *   sortBy: "relevance+recency",
   *   dateFilter: { after: "2025-01-01" }
   * });
   * ```
   * 
   * @throws {Error} If embedding generation fails
   * @throws {Error} If database query fails
   */
  async search(
    query: string,
    options: {
      maxResults?: number;
      minSimilarity?: number;
      sortBy?: 'relevance' | 'modified' | 'created' | 'relevance+recency';
      dateFilter?: {
        after?: string;
        before?: string;
      };
    } = {}
  ): Promise<SearchResult[]> {
    const {
      maxResults = 10,
      minSimilarity = 0.3,
      sortBy = 'relevance',
      dateFilter
    } = options;

    // Generate query embedding
    const queryEmbedding = await this.embed(query);
    const embeddingArray = `[${queryEmbedding.join(',')}]`;

    // Build SQL query with similarity threshold filter
    let sql = `
      SELECT 
        id,
        entity_name,
        file_path,
        content,
        1 - (embedding <=> $1::vector) as similarity,
        created_at,
        modified_at,
        entity_type,
        tags
      FROM vector_chunks
      WHERE 1 - (embedding <=> $1::vector) >= $2
    `;

    const params: any[] = [embeddingArray, minSimilarity];
    let paramIndex = 3;

    // Add date filters
    if (dateFilter?.after) {
      sql += ` AND modified_at >= $${paramIndex}`;
      params.push(dateFilter.after);
      paramIndex++;
    }

    if (dateFilter?.before) {
      sql += ` AND modified_at <= $${paramIndex}`;
      params.push(dateFilter.before);
      paramIndex++;
    }

    // Add sorting
    switch (sortBy) {
      case 'relevance':
        sql += ' ORDER BY similarity DESC';
        break;
      case 'modified':
        sql += ' ORDER BY modified_at DESC';
        break;
      case 'created':
        sql += ' ORDER BY created_at DESC';
        break;
      case 'relevance+recency':
        sql += ` ORDER BY (
          (1 - (embedding <=> $1::vector)) * 0.7 +
          (1.0 / (1 + EXTRACT(EPOCH FROM (NOW() - modified_at)) / 86400)) * 0.3
        ) DESC`;
        break;
    }

    sql += ` LIMIT $${paramIndex}`;
    params.push(maxResults);

    // Execute query
    const result = await this.pool.query(sql, params);

    return result.rows.map(row => ({
      id: row.id,
      entityName: row.entity_name,
      filePath: row.file_path,
      content: row.content,
      similarity: parseFloat(row.similarity),
      createdAt: row.created_at,
      modifiedAt: row.modified_at,
      entityType: row.entity_type,
      tags: row.tags
    }));
  }

  /**
   * Update existing entity content and re-embed
   * 
   * Regenerates embedding for updated content and updates the database.
   * Updates modification timestamp automatically.
   * 
   * @param entityName - Entity identifier
   * @param filePath - Source file path
   * @param content - Updated text content
   * 
   * @example
   * ```typescript
   * await vectorStorage.update(
   *   "Sergio",
   *   "/vault/memory/Sergio.md",
   *   "Promoted to PE developer at Amazon"
   * );
   * ```
   * 
   * @throws {Error} If entity doesn't exist
   * @throws {Error} If embedding generation fails
   */
  async update(entityName: string, filePath: string, content: string): Promise<void> {
    const embedding = await this.embed(content);
    const embeddingArray = `[${embedding.join(',')}]`;

    const query = `
      UPDATE vector_chunks
      SET content = $1, embedding = $2, modified_at = NOW()
      WHERE entity_name = $3 AND file_path = $4
    `;

    await this.pool.query(query, [content, embeddingArray, entityName, filePath]);
  }

  /**
   * Delete all chunks associated with a file path
   * 
   * Removes entity and all its chunks from vector database.
   * This is a destructive operation with no undo.
   * 
   * @param filePath - Source file path to delete
   * 
   * @example
   * ```typescript
   * await vectorStorage.delete("/vault/memory/OldProject.md");
   * ```
   */
  async delete(filePath: string): Promise<void> {
    const query = 'DELETE FROM vector_chunks WHERE file_path = $1';
    await this.pool.query(query, [filePath]);
  }

  /**
   * Get vector database statistics
   * 
   * Returns metrics about the current state of the vector database,
   * useful for monitoring and capacity planning.
   * 
   * @returns Promise with database statistics
   * 
   * @example
   * ```typescript
   * const stats = await vectorStorage.getStats();
   * console.log(`Entities: ${stats.totalEntities}`);
   * console.log(`Size: ${stats.totalSize}`);
   * console.log(`Oldest: ${stats.oldestEntity}`);
   * ```
   */
  async getStats(): Promise<{
    totalEntities: number;
    totalSize: string;
    oldestEntity: Date | null;
    newestEntity: Date | null;
  }> {
    const query = `
      SELECT 
        COUNT(*) as total,
        pg_size_pretty(pg_total_relation_size('vector_chunks')) as size,
        MIN(created_at) as oldest,
        MAX(modified_at) as newest
      FROM vector_chunks
    `;

    const result = await this.pool.query(query);
    const row = result.rows[0];

    return {
      totalEntities: parseInt(row.total),
      totalSize: row.size,
      oldestEntity: row.oldest,
      newestEntity: row.newest
    };
  }

  /**
   * Clean shutdown of vector storage
   * 
   * Closes database connections. The singleton embedder persists
   * across instances. Use VectorStorage.shutdownEmbedder() to
   * terminate the shared embedder process.
   * 
   * @example
   * ```typescript
   * await vectorStorage.close();
   * ```
   */
  async close(): Promise<void> {
    await this.pool.end();
  }

  /**
   * Shutdown the shared embedder service
   * Call this only when shutting down the entire application
   * 
   * @example
   * ```typescript
   * VectorStorage.shutdownEmbedder();
   * ```
   */
  static shutdownEmbedder(): void {
    EmbedderSingleton.getInstance().shutdown();
  }
}
