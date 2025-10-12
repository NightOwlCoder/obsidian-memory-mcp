import { VectorStorage } from '../storage/VectorStorage.js';
import { parseMarkdown, ParsedMarkdown } from './markdownUtils.js';
import { daemonLogger as logger } from './logger.js';
import path from 'path';

/**
 * Index a memory entity file using observation-level and relation-level chunking
 * 
 * Memory entities are stored in /memory/ directories and contain:
 * - Observations: facts about the entity
 * - Relations: connections to other entities
 * 
 * Each observation and relation becomes a separate semantic chunk.
 * 
 * @param vectorStorage - Vector storage instance
 * @param entityName - Name of the entity
 * @param filePath - Path to the markdown file
 * @param content - File content
 * @returns True if indexing succeeded
 */
export async function indexMemoryEntity(
  vectorStorage: VectorStorage,
  entityName: string,
  filePath: string,
  content: string
): Promise<boolean> {
  const startTime = Date.now();
  
  try {
    logger.debug('Memory entity detected: ' + entityName);
    
    // Parse markdown
    const parsed = parseMarkdown(content, entityName);
    
    const totalChunks = parsed.observations.length + parsed.relations.length;
    
    if (totalChunks === 0) {
      logger.warn('No observations or relations: ' + path.basename(filePath));
      return false;
    }
    
    logger.info('Memory entity: ' + entityName, {
      observations: parsed.observations.length,
      relations: parsed.relations.length,
      file: path.basename(filePath)
    });
    
    let chunkIndex = 0;
    
    // Chunk each observation separately
    await chunkObservations(
      vectorStorage,
      entityName,
      filePath,
      parsed,
      chunkIndex,
      totalChunks
    );
    chunkIndex += parsed.observations.length;
    
    // Chunk each relation separately with category
    await chunkRelations(
      vectorStorage,
      entityName,
      filePath,
      parsed,
      chunkIndex,
      totalChunks
    );
    
    const elapsed = Date.now() - startTime;
    logger.info('✓ Indexed memory entity: ' + entityName, {
      chunks: totalChunks,
      elapsed: elapsed + 'ms'
    });
    
    return true;
    
  } catch (error) {
    logger.error('Failed to index memory entity: ' + entityName, {
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

/**
 * Chunk observations - each observation becomes one semantic chunk
 */
async function chunkObservations(
  vectorStorage: VectorStorage,
  entityName: string,
  filePath: string,
  parsed: ParsedMarkdown,
  startIndex: number,
  totalChunks: number
): Promise<void> {
  for (let i = 0; i < parsed.observations.length; i++) {
    const obs = parsed.observations[i];
    const chunkContent = `${entityName} (${parsed.metadata.entityType || 'unknown'}): ${obs}`;
    
    await vectorStorage.storeChunk(
      entityName,
      filePath,
      chunkContent,
      startIndex + i,
      totalChunks,
      parsed.metadata.entityType || 'unknown',
      []
    );
  }
  
  if (parsed.observations.length > 0) {
    logger.debug('Chunked ' + parsed.observations.length + ' observations');
  }
}

/**
 * Chunk relations - each relation becomes one semantic chunk with category
 */
async function chunkRelations(
  vectorStorage: VectorStorage,
  entityName: string,
  filePath: string,
  parsed: ParsedMarkdown,
  startIndex: number,
  totalChunks: number
): Promise<void> {
  for (let i = 0; i < parsed.relations.length; i++) {
    const relation = parsed.relations[i];
    const category = relation.category || 'uncategorized';
    const chunkContent = `${entityName} ${relation.relationType} ${relation.to} (${category})`;
    
    await vectorStorage.storeChunk(
      entityName,
      filePath,
      chunkContent,
      startIndex + i,
      totalChunks,
      'relation',
      [category]
    );
  }
  
  if (parsed.relations.length > 0) {
    logger.debug('Chunked ' + parsed.relations.length + ' relations');
  }
}
