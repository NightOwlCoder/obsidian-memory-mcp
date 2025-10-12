import { VectorStorage } from '../storage/VectorStorage.js';
import { chunkWithDocling, chunkImageWithDocling } from './doclingChunker.js';
import { daemonLogger as logger } from './logger.js';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

/**
 * Index a vault note file using Docling HybridChunker with image OCR
 * 
 * Vault notes are regular markdown documents (not memory entities).
 * They are chunked using Docling's structure-aware chunker which:
 * - Preserves heading hierarchy
 * - Keeps semantic units together
 * - Adds contextualized breadcrumbs
 * 
 * Images are processed with OCR and injected inline before chunking.
 * 
 * @param vectorStorage - Vector storage instance
 * @param entityName - Name extracted from file path
 * @param filePath - Path to the markdown file
 * @param content - File content
 * @param indexingRoot - Root directory for breadcrumb generation
 * @param imageMap - Map of filename to absolute path for image resolution
 * @returns True if indexing succeeded
 */
export async function indexVaultNote(
  vectorStorage: VectorStorage,
  entityName: string,
  filePath: string,
  content: string,
  indexingRoot: string,
  imageMap: Map<string, string>
): Promise<boolean> {
  const startTime = Date.now();
  
  try {
    logger.info('Vault note detected: ' + entityName, {
      file: path.basename(filePath)
    });
    
    // STEP 1: Process images with OCR
    const processedContent = await processImagesWithOCR(
      content,
      filePath,
      imageMap
    );
    
    // STEP 2: Write processed content to temp file for Docling
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'docling-'));
    const tmpFile = path.join(tmpDir, path.basename(filePath));
    await fs.writeFile(tmpFile, processedContent, 'utf-8');
    
    try {
      // STEP 3: Chunk with Docling using processed content
      logger.debug('Chunking with Docling: ' + path.basename(filePath));
      const doclingChunks = await chunkWithDocling(tmpFile, 512);
      
      if (doclingChunks.length === 0) {
        logger.warn('No chunks generated: ' + path.basename(filePath));
        return false;
      }
      
      logger.debug('Created ' + doclingChunks.length + ' chunks');
      
      // STEP 4: Build breadcrumb for context
      const breadcrumb = await buildBreadcrumb(filePath, indexingRoot);
      
      // STEP 5: Store chunks with breadcrumb context
      for (let i = 0; i < doclingChunks.length; i++) {
        const contentWithContext = `${breadcrumb}${doclingChunks[i].content}`;
        
        await vectorStorage.storeChunk(
          entityName,
          filePath,
          contentWithContext,
          i,
          doclingChunks.length,
          'document',
          []
        );
      }
      
      const elapsed = Date.now() - startTime;
      logger.info('✓ Indexed vault note: ' + entityName, {
        chunks: doclingChunks.length,
        elapsed: elapsed + 'ms'
      });
      
      return true;
      
    } finally {
      // Clean up temp directory and file
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
    
  } catch (error) {
    logger.error('Failed to index vault note: ' + entityName, {
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

/**
 * Process images with OCR and inject text inline
 * 
 * Finds all image references (both ![](path) and ![[path]] formats),
 * runs OCR on them, and replaces references with inline OCR text.
 * 
 * @param content - Original markdown content
 * @param filePath - Path to the markdown file (for logging)
 * @param imageMap - Map of filename to absolute path
 * @returns Content with OCR text injected
 */
async function processImagesWithOCR(
  content: string,
  filePath: string,
  imageMap: Map<string, string>
): Promise<string> {
  // Match both standard markdown ![alt](path) and Obsidian wiki-style ![[path]]
  const standardMatches = [...content.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)];
  const wikiMatches = [...content.matchAll(/!\[\[([^\]]+)\]\]/g)];
  
  interface ImageMatch {
    fullMatch: string;
    imagePath: string;
    matchIndex: number;
  }
  
  const allMatches: ImageMatch[] = [
    ...standardMatches.map(m => ({
      fullMatch: m[0],
      imagePath: m[2], // path is 2nd capture group
      matchIndex: m.index!
    })),
    ...wikiMatches.map(m => ({
      fullMatch: m[0],
      imagePath: m[1], // path is 1st capture group
      matchIndex: m.index!
    }))
  ]
  // Filter out code patterns (regex backreferences, variables, etc.)
  .filter(match => {
    const p = match.imagePath.trim();
    if (!p || p.length === 0) return false;
    if (/^\$\d+$/.test(p)) return false; // $1, $2, etc.
    if (/^\$\{.*\}$/.test(p)) return false; // ${var}
    if (p.includes('%20') || p.includes('%3') || p.includes('%2')) return false;
    if (p.startsWith('data:')) return false;
    if (p.length > 30 && !/\.(png|jpg|jpeg|gif|webp|svg|pdf)$/i.test(p)) return false;
    return true;
  })
  .sort((a, b) => b.matchIndex - a.matchIndex); // Sort reverse for string replacement
  
  if (allMatches.length === 0) {
    return content;
  }
  
  logger.info('Found ' + allMatches.length + ' images in ' + path.basename(filePath));
  
  let processedContent = content;
  
  // Process images (already sorted in reverse order)
  for (const imageMatch of allMatches) {
    const { fullMatch, imagePath, matchIndex } = imageMatch;
    
    // Skip URLs
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      continue;
    }
    
    // Extract filename and strip Obsidian size specifier
    let imageName = path.basename(imagePath);
    imageName = imageName.split('|')[0]; // image.png|500 → image.png
    
    // Use vault-wide file map lookup
    const absoluteImagePath = imageMap.get(imageName);
    
    if (!absoluteImagePath) {
      logger.warn('Image not found: ' + imageName);
      continue;
    }
    
    logger.debug('OCR image: ' + imageName);
    
    try {
      // OCR the image
      const imageChunks = await chunkImageWithDocling(absoluteImagePath, 512);
      
      if (imageChunks.length > 0) {
        // Extract OCR text and inject inline
        const ocrText = imageChunks.map(chunk => chunk.content).join(' ');
        const replacement = `\n[Image OCR: ${ocrText}]\n`;
        
        // Replace image reference with OCR text
        processedContent = 
          processedContent.slice(0, matchIndex) + 
          replacement + 
          processedContent.slice(matchIndex + fullMatch.length);
        
        logger.debug('✓ OCR complete: ' + imageName);
      }
    } catch (imageError) {
      logger.warn('OCR failed for ' + imageName, {
        error: imageError instanceof Error ? imageError.message : String(imageError)
      });
    }
  }
  
  return processedContent;
}

/**
 * Build breadcrumb context for vault note
 * 
 * Creates a path-based context string like:
 * "vault/relative/path/to/file: "
 * 
 * @param filePath - Absolute path to file
 * @param indexingRoot - Root directory for relative path
 * @returns Breadcrumb string
 */
async function buildBreadcrumb(
  filePath: string,
  indexingRoot: string
): Promise<string> {
  // Find vault root by looking for .obsidian folder
  let currentDir = path.dirname(filePath);
  let vaultRoot: string | null = null;
  
  for (let i = 0; i < 10; i++) {
    try {
      await fs.access(path.join(currentDir, '.obsidian'));
      vaultRoot = currentDir;
      break;
    } catch {}
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }
  
  // Build breadcrumb: vault/relative/path (without .md extension)
  if (vaultRoot) {
    const vaultName = path.basename(vaultRoot);
    const relativePath = path.relative(vaultRoot, filePath);
    const pathWithoutExt = relativePath.replace(/\.md$/, '');
    return `${vaultName}/${pathWithoutExt}: `;
  } else {
    // Fallback: include indexing root folder + relative path
    const rootFolderName = path.basename(indexingRoot);
    const relativePath = path.relative(indexingRoot, filePath);
    const pathWithoutExt = relativePath.replace(/\.md$/, '');
    return `${rootFolderName}/${pathWithoutExt}: `;
  }
}
