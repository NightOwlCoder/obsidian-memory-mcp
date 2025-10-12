import { VectorStorage } from '../storage/VectorStorage.js';
import { getEntityNameFromPath } from './pathUtils.js';
import { indexMemoryEntity } from './memoryEntityIndexer.js';
import { indexVaultNote } from './vaultNoteIndexer.js';
import { buildFileMap } from './fileMapBuilder.js';
import { daemonLogger as logger } from './logger.js';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Main indexing pipeline - shared by batch indexer and daemon
 * 
 * Routes files to appropriate indexer based on file type:
 * - Memory entities (in /memory/ dirs): observation-level chunking
 * - Vault notes (regular markdown): Docling + OCR
 * 
 * @param vectorStorage - Vector storage instance
 * @param filePath - Absolute path to markdown file
 * @param indexingRoot - Root directory being indexed (for context)
 * @returns True if indexing succeeded
 */
export async function indexFile(
  vectorStorage: VectorStorage,
  filePath: string,
  indexingRoot: string
): Promise<boolean> {
  const startTime = Date.now();
  
  try {
    logger.debug('Indexing file: ' + path.basename(filePath));
    
    // Delete existing chunks for this file (prevents orphaned chunks)
    await vectorStorage.delete(filePath);
    logger.debug('Cleared old chunks for: ' + path.basename(filePath));
    
    // Read file content
    const content = await fs.readFile(filePath, 'utf-8');
    
    // Get entity name from file path
    const entityName = getEntityNameFromPath(filePath);
    if (!entityName) {
      logger.error('Could not extract entity name from: ' + filePath);
      return false;
    }
    
    // Determine file type and route to appropriate indexer
    const isMemoryEntity = filePath.includes('/memory/');
    
    if (isMemoryEntity) {
      // MEMORY ENTITY: Use observation-level + relation-level chunking
      return await indexMemoryEntity(
        vectorStorage,
        entityName,
        filePath,
        content
      );
      
    } else {
      // VAULT NOTE: Use Docling HybridChunker with image OCR
      // Build file map fresh for each file (includes images, PDFs, etc.)
      logger.debug('Building file map for: ' + path.basename(indexingRoot));
      const imageMap = await buildFileMap(indexingRoot);
      logger.debug('Mapped ' + imageMap.size + ' non-markdown files');
      
      return await indexVaultNote(
        vectorStorage,
        entityName,
        filePath,
        content,
        indexingRoot,
        imageMap
      );
    }
    
  } catch (error) {
    const elapsed = Date.now() - startTime;
    logger.error('Failed to index ' + path.basename(filePath), {
      error: error instanceof Error ? error.message : String(error),
      elapsed: elapsed + 'ms'
    });
    return false;
  }
}
