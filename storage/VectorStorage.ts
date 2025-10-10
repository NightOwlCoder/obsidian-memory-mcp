import { Pool, PoolClient } from 'pg';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface EmbeddingResult {
  embedding: number[];
  dimension: number;
}

interface SearchResult {
  id: string;
  entityName: string;
  filePath: string;
  content: string;
  similarity: number;
  createdAt: Date;
  modifiedAt: Date;
  entityType: string | null;
  tags: string[] | null;
}

export class VectorStorage {
  private pool: Pool;
  private embedderProcess: ChildProcess | null = null;
  private embedderReady: boolean = false;

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
  }

  /**
   * Start the Python embedder service
   */
  private async startEmbedder(): Promise<void> {
    if (this.embedderProcess && this.embedderReady) {
      return;
    }

    // Use process.cwd() which is the MCP project root when run as server
    // Or fall back to resolving from compiled dist location
    const projectRoot = process.cwd().endsWith('obsidian-memory-mcp') 
      ? process.cwd()
      : path.resolve(__dirname, '..', '..');
    
    const venvPython = path.join(projectRoot, 'venv', 'bin', 'python');
    const embedderScript = path.join(projectRoot, 'embeddings', 'embedder.py');

    this.embedderProcess = spawn(venvPython, [embedderScript], {
      env: { ...process.env, HF_HUB_ENABLE_HF_TRANSFER: '0' }
    });

    // Wait for "Embedder service ready" message
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Embedder service startup timeout'));
      }, 30000); // 30 second timeout for model loading

      this.embedderProcess!.stderr?.on('data', (data) => {
        const message = data.toString();
        console.error('Embedder:', message.trim());
        
        if (message.includes('Embedder service ready')) {
          clearTimeout(timeout);
          this.embedderReady = true;
          resolve();
        }
      });

      this.embedderProcess!.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  /**
   * Generate embedding for text using BGE-M3
   */
  async embed(text: string): Promise<number[]> {
    if (!this.embedderReady) {
      await this.startEmbedder();
    }

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
          this.embedderProcess!.stdout?.off('data', dataHandler);
          
          if ('error' in result) {
            reject(new Error(result.error));
          } else {
            resolve(result.embedding);
          }
        } catch {
          // Not complete JSON yet, wait for more data
        }
      };

      this.embedderProcess!.stdout?.on('data', dataHandler);

      // Send request
      const request = JSON.stringify({ text }) + '\n';
      this.embedderProcess!.stdin?.write(request);
    });
  }

  /**
   * Store entity with embedding in database
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
   * Store a single chunk of an entity with embedding
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
   * Search for similar entities using vector similarity
   * Returns top N results by similarity - NO threshold filtering
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
      sortBy = 'relevance',
      dateFilter
    } = options;

    // Generate query embedding
    const queryEmbedding = await this.embed(query);
    const embeddingArray = `[${queryEmbedding.join(',')}]`;

    // Build SQL query - NO minSimilarity filter, just return top N
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
      WHERE 1=1
    `;

    const params: any[] = [embeddingArray];
    let paramIndex = 2;

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
   * Update existing entity
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
   * Delete entity by file path
   */
  async delete(filePath: string): Promise<void> {
    const query = 'DELETE FROM vector_chunks WHERE file_path = $1';
    await this.pool.query(query, [filePath]);
  }

  /**
   * Get statistics about stored vectors
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
   * Close database connection and embedder process
   */
  async close(): Promise<void> {
    if (this.embedderProcess) {
      this.embedderProcess.kill();
      this.embedderProcess = null;
      this.embedderReady = false;
    }

    await this.pool.end();
  }
}
