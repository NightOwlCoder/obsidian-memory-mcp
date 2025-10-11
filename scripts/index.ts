#!/usr/bin/env node
/**
 * Index all markdown files from memory directory into vector database
 * Usage: tsx scripts/index.ts [--memory-dir path] [--force]
 */

import { VectorStorage } from '../storage/VectorStorage.js';
import { parseMarkdown } from '../utils/markdownUtils.js';
import { getEntityNameFromPath } from '../utils/pathUtils.js';
import { chunkText, getChunkStats } from '../utils/chunker.js';
import { chunkWithDocling, chunkImageWithDocling } from '../utils/doclingChunker.js';
import { removeStopwords, eng, por } from 'stopword';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface IndexStats {
  total: number;
  indexed: number;
  skipped: number;
  failed: number;
  errors: Array<{ file: string; error: string }>;
}

// Build filename → filepath map for entire vault (all file types)
async function buildFileMap(rootDir: string): Promise<Map<string, string>> {
  const fileMap = new Map<string, string>();
  
  async function scan(dir: string) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        // Skip hidden and system directories
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'venv') {
          continue;
        }
        
        if (entry.isDirectory()) {
          await scan(fullPath);
        } else if (entry.isFile() && !entry.name.endsWith('.md')) {
          // Map all non-markdown files (images, PDFs, etc.)
          fileMap.set(entry.name, fullPath);
        }
      }
    } catch (error) {
      // Silently skip inaccessible directories
    }
  }
  
  await scan(rootDir);
  return fileMap;
}

async function indexFile(
  vectorStorage: VectorStorage,
  filePath: string,
  indexingRoot: string,
  imageMap: Map<string, string>
): Promise<boolean> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const entityName = getEntityNameFromPath(filePath);
    
    if (!entityName) {
      console.error(`⚠️  Could not extract entity name from: ${filePath}`);
      return false;
    }

    // Parse markdown
    const parsed = parseMarkdown(content, entityName);
    
    // Determine file type
    const isMemoryEntity = filePath.includes('/memory/');
    
    if (isMemoryEntity) {
      // MEMORY ENTITY: Observation-level + Relation-level chunking
      let chunkIndex = 0;
      const totalChunks = parsed.observations.length + parsed.relations.length;
      
      // Skip if no content
      if (totalChunks === 0) {
        console.error(`⚠️  No observations or relations for: ${filePath}`);
        return false;
      }
      
      // Chunk each observation separately
      for (const obs of parsed.observations) {
        const chunkContent = `${entityName} (${parsed.metadata.entityType || 'unknown'}): ${obs}`;
        await vectorStorage.storeChunk(
          entityName,
          filePath,
          chunkContent,
          chunkIndex++,
          totalChunks,
          parsed.metadata.entityType || 'unknown',
          []
        );
      }
      
      // Chunk each relation separately with category
      for (const relation of parsed.relations) {
        // Extract category from markdown format: `type` (category): [[target]]
        const category = relation.category || 'uncategorized';
        const chunkContent = `${entityName} ${relation.relationType} ${relation.to} (${category})`;
        
        await vectorStorage.storeChunk(
          entityName,
          filePath,
          chunkContent,
          chunkIndex++,
          totalChunks,
          'relation',
          [category]
        );
      }
      
    } else {
      // VAULT NOTE: Docling HybridChunker for structure-aware chunking
      try {
        // STEP 1: Pre-process markdown to inject OCR text inline
        let processedContent = content;
        
        // Match both standard markdown ![alt](path) and Obsidian wiki-style ![[path]]
        const standardMatches = [...content.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)];
        const wikiMatches = [...content.matchAll(/!\[\[([^\]]+)\]\]/g)];
        
        // Combine matches with normalized structure
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
        ].sort((a, b) => b.matchIndex - a.matchIndex); // Sort reverse for string replacement
        
        if (allMatches.length > 0) {
          const fileDir = path.dirname(filePath);
          const fileBasename = path.basename(filePath, '.md');
          
          console.error(`\n🖼️  Found ${allMatches.length} images in ${path.basename(filePath)}`);
          
          // Process images (already sorted in reverse order)
          for (const imageMatch of allMatches) {
            const { fullMatch, imagePath, matchIndex } = imageMatch;
            
            // Skip URLs (http://, https://)
            if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
              continue;
            }
            
            // Extract filename and strip Obsidian size specifier
            let imageName = path.basename(imagePath);
            imageName = imageName.split('|')[0]; // image.png|500 → image.png
            
            // Use vault-wide file map lookup (handles any organization structure)
            const absoluteImagePath = imageMap.get(imageName);
            
            if (!absoluteImagePath) {
              console.error(`   ⚠️  Not found: ${imageName}`);
              continue;
            }
            
            console.error(`   ✓ OCR'ing: ${imageName}`);
            
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
              }
            } catch (imageError) {
              console.error(`⚠️  Could not OCR image ${imagePath} in ${filePath}:`, imageError);
            }
          }
        }
        
        // STEP 2: Write processed content to temp file for Docling
        // Use suffix to avoid confusing Docling's format detection
        const tmpFile = filePath.replace(/\.md$/, '_ocr_temp.md');
        await fs.writeFile(tmpFile, processedContent, 'utf-8');
        
        try {
          // STEP 3: Chunk with Docling using processed content
          const doclingChunks = await chunkWithDocling(tmpFile, 512);
          
          if (doclingChunks.length === 0) {
            console.error(`⚠️  No chunks generated for: ${filePath}`);
            return false;
          }

          // Create breadcrumb path for context
          // Find vault root by looking for .obsidian folder
          let currentDir = path.dirname(filePath);
          let vaultRoot: string | null = null;
          
          for (let j = 0; j < 10; j++) {
            try {
              await fs.access(path.join(currentDir, '.obsidian'));
              vaultRoot = currentDir;
              break;
            } catch {}
            const parentDir = path.dirname(currentDir);
            if (parentDir === currentDir) break;
            currentDir = parentDir;
          }
          
          // Build breadcrumb: relative/path/to/file (without .md extension)
          let breadcrumb = '';
          if (vaultRoot) {
            const vaultName = path.basename(vaultRoot);
            const relativePath = path.relative(vaultRoot, filePath);
            const pathWithoutExt = relativePath.replace(/\.md$/, '');
            breadcrumb = `${vaultName}/${pathWithoutExt}: `;
          } else {
            // Fallback: include indexing root folder + relative path
            const rootFolderName = path.basename(indexingRoot);
            const relativePath = path.relative(indexingRoot, filePath);
            const pathWithoutExt = relativePath.replace(/\.md$/, '');
            breadcrumb = `${rootFolderName}/${pathWithoutExt}: `;
          }

          // Store each chunk with breadcrumb context
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
        } finally {
          // Clean up temp file
          try {
            await fs.unlink(tmpFile);
          } catch {}
        }
      } catch (error) {
        // Fallback to simple chunking if Docling fails
        console.error(`⚠️  Docling failed for ${filePath}, using simple chunking:`, error);
        const fullContent = `# ${entityName}\n\n${content}`;
        const chunks = chunkText(fullContent, { maxTokens: 512, overlap: 50 });
        
        for (let i = 0; i < chunks.length; i++) {
          await vectorStorage.storeChunk(
            entityName,
            filePath,
            chunks[i],
            i,
            chunks.length,
            'document',
            []
          );
        }
      }
    }

    return true;
  } catch (error) {
    console.error(`❌ Failed to index ${filePath}:`, error);
    return false;
  }
}

async function validateSearch(
  vectorStorage: VectorStorage,
  indexedFiles: string[]
): Promise<void> {
  const MAX_RETRIES = 5;
  const crypto = await import('crypto');
  
  // Retry loop to find a file with sufficient words
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Pick random file from indexed
      const randomFile = indexedFiles[Math.floor(Math.random() * indexedFiles.length)];
      const content = await fs.readFile(randomFile, 'utf-8');
      const entityName = getEntityNameFromPath(randomFile);
      
      let contentText = content;
      let frontmatterTags: string[] = [];
      
      // Handle frontmatter: ONLY if file starts with ---
      if (content.trimStart().startsWith('---')) {
        const lines = content.split('\n');
        let endIdx = -1;
        
        // Find closing ---
        for (let i = 1; i < lines.length; i++) {
          if (lines[i].trim() === '---') {
            endIdx = i;
            break;
          }
        }
        
        if (endIdx > 0) {
          // Extract tags from frontmatter
          const frontmatterLines = lines.slice(0, endIdx + 1);
          let inTagsSection = false;
          
          for (const line of frontmatterLines) {
            if (line.match(/^tags:/i)) {
              inTagsSection = true;
              // In YAML, tags: is just the key, values are on next lines with "- "
            } else if (inTagsSection && line.trim().startsWith('- ')) {
              // Multi-line tags array
              const tag = line.trim().substring(2).trim();
              if (tag) frontmatterTags.push(tag);
            } else if (inTagsSection && !line.trim().startsWith('-')) {
              inTagsSection = false;
            }
          }
          
          // Use content after frontmatter
          contentText = lines.slice(endIdx + 1).join('\n');
        }
      }
      
      // Combine tags + content for word extraction
      const fullText = [...frontmatterTags, contentText].join(' ');
      
      // Remove HTML tags before word extraction (keep URLs)
      const cleanedText = fullText.replace(/<[^>]+>/g, '');
      
      // Extract words - strip edge punctuation only, min 2 chars
      const words = cleanedText
        .split(/\s+/)
        .map(w => w.replace(/^[^\w]+|[^\w]+$/g, '')) // Strip edge punctuation only
        .filter(w => w.length >= 2); // Minimum 2 chars per word
      
      // Filter stop words (English + Portuguese) for better query specificity
      const meaningfulWords = removeStopwords(words, [...eng, ...por]);
      
      if (meaningfulWords.length < 3) {
        if (attempt < MAX_RETRIES - 1) {
          continue; // Try another file
        }
        console.log(`\n  🔍 Validation: skipped after ${MAX_RETRIES} attempts (insufficient meaningful words)`);
        return;
      }
      
      // Add timestamp and filename entropy to randomization
      const seed = Date.now() + randomFile.length + attempt;
      
      // Randomly select 1-3 consecutive words from meaningful words
      const hash = crypto.createHash('sha256').update(String(seed)).digest();
      const queryLength = 1 + (hash.readUInt8(0) % 3); // 1, 2, or 3 words
      
      if (meaningfulWords.length < queryLength) {
        if (attempt < MAX_RETRIES - 1) {
          continue; // Try another file
        }
        console.log(`\n  🔍 Validation: skipped after ${MAX_RETRIES} attempts (insufficient words for query)`);
        return;
      }
      
      const maxIdx = Math.max(0, meaningfulWords.length - queryLength);
      
      // Use hash of seed for better distribution
      const randomValue = hash.readUInt32BE(0) / 0xFFFFFFFF; // 0 to 1
      const startIdx = maxIdx > 0 ? Math.floor(randomValue * (maxIdx + 1)) : 0;
      
      const selectedWords = meaningfulWords.slice(startIdx, startIdx + queryLength);
      const totalChars = selectedWords.join('').length;
      
      // Validate char count
      // Multi-word: total chars > 4
      if (queryLength > 1 && totalChars <= 4) {
        if (attempt < MAX_RETRIES - 1) {
          continue; // Try another file
        }
        console.log(`\n  🔍 Validation: skipped after ${MAX_RETRIES} attempts (query too short)`);
        return;
      }
      
      // Single-word: prefer 4+ chars, allow 3+ as fallback
      if (queryLength === 1 && selectedWords[0].length < 3) {
        if (attempt < MAX_RETRIES - 1) {
          continue; // Try another file
        }
        console.log(`\n  🔍 Validation: skipped after ${MAX_RETRIES} attempts (single word too short)`);
        return;
      }
      
      const query = selectedWords.join(' ');
      
      // Search vector DB - get ALL results to check if file appears anywhere
      const results = await vectorStorage.search(query, { maxResults: 100 });
      
      // Check if source file appears ANYWHERE in results
      const match = results.find(r => r.filePath === randomFile);
      const topSim = results[0]?.similarity || 0;
      const totalResults = results.length;
      
      if (match) {
        const rank = results.indexOf(match) + 1;
        console.log(`  🔍 Validation: "${query}" → ${entityName} found ✓ (sim: ${match.similarity.toFixed(2)}, rank ${rank}/${totalResults})`);
      } else {
        console.log(`  ⚠️  Validation: "${query}" → ${entityName} NOT FOUND in ${totalResults} results (best sim: ${topSim.toFixed(2)})`);
      }
      
      return; // Success - exit retry loop
      
    } catch (error) {
      if (attempt < MAX_RETRIES - 1) {
        continue; // Try another file
      }
      console.log(`\n  ⚠️  Validation failed after ${MAX_RETRIES} attempts: ${error}`);
      return;
    }
  }
}

async function getAllMarkdownFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  
  async function scan(currentDir: string) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      // Skip hidden files and certain directories
      if (entry.name.startsWith('.') || 
          entry.name === 'node_modules' || 
          entry.name === 'venv' ||
          entry.name === '.git') {
        continue;
      }
      
      if (entry.isDirectory()) {
        await scan(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  }
  
  await scan(dir);
  return files;
}

async function indexDirectory(
  memoryDir: string,
  options: { force?: boolean } = {}
): Promise<IndexStats> {
  console.log(`\n📊 Indexing: ${memoryDir}\n`);
  
  const stats: IndexStats = {
    total: 0,
    indexed: 0,
    skipped: 0,
    failed: 0,
    errors: []
  };

  const vectorStorage = new VectorStorage();

  try {
    // Build file map for entire vault (for image/PDF/etc resolution)
    console.log('Building file map...');
    const fileMap = await buildFileMap(memoryDir);
    console.log(`Mapped ${fileMap.size} non-markdown files`);
    
    // Get all markdown files recursively
    console.log('Scanning for markdown files...');
    const mdFiles = await getAllMarkdownFiles(memoryDir);
    
    stats.total = mdFiles.length;
    const validationInterval = Math.max(1, Math.floor(stats.total / 20));
    console.log(`Found ${stats.total} markdown files (validating every ${validationInterval} files)\n`);

    // Index files with progress and validation
    for (let i = 0; i < mdFiles.length; i++) {
      const filePath = mdFiles[i];
      
      const success = await indexFile(vectorStorage, filePath, memoryDir, fileMap);
      
      if (success) {
        stats.indexed++;
        process.stderr.write(`\r✓ Progress: ${i + 1}/${stats.total} (${stats.indexed} indexed)`);
      } else {
        stats.failed++;
        stats.errors.push({
          file: filePath,
          error: 'Failed to index'
        });
      }
      
      // Inline validation every N files - test files from LAST interval only
      if ((i + 1) % validationInterval === 0 && stats.indexed > 0) {
        const startIdx = Math.max(0, i + 1 - validationInterval);
        const recentFiles = mdFiles.slice(startIdx, i + 1);
        await validateSearch(vectorStorage, recentFiles);
      }
    }

    console.log('\n');
  } catch (error) {
    console.error('Fatal error during indexing:', error);
  } finally {
    await vectorStorage.close();
  }

  return stats;
}

async function main() {
  const args = process.argv.slice(2);
  
  // Parse arguments
  let memoryDir = process.env.MEMORY_DIR || path.join(__dirname, '..', 'memory');
  let force = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--memory-dir' && args[i + 1]) {
      memoryDir = args[i + 1];
      i++;
    } else if (args[i] === '--force') {
      force = true;
    } else if (args[i] === '--help') {
      console.log(`
Usage: tsx scripts/index.ts [options]

Options:
  --memory-dir <path>  Path to memory directory (default: ./memory)
  --force              Force reindex all files
  --help               Show this help

Environment Variables:
  MEMORY_DIR           Default memory directory path
  DATABASE_URL         PostgreSQL connection string

Examples:
  tsx scripts/index.ts
  tsx scripts/index.ts --memory-dir /path/to/vault/memory
  tsx scripts/index.ts --force
      `);
      process.exit(0);
    }
  }

  console.log('🚀 Obsidian Memory Indexer\n');
  console.log(`Memory directory: ${memoryDir}`);
  console.log(`Force reindex: ${force}`);

  // Check if directory exists
  try {
    await fs.access(memoryDir);
  } catch {
    console.error(`\n❌ Directory not found: ${memoryDir}`);
    console.error('Create it first or specify a different path with --memory-dir');
    process.exit(1);
  }

  // Run indexing
  const stats = await indexDirectory(memoryDir, { force });

  // Print summary
  console.log('\n📈 Indexing Summary:');
  console.log(`   Total files: ${stats.total}`);
  console.log(`   ✅ Indexed: ${stats.indexed}`);
  console.log(`   ⏭️  Skipped: ${stats.skipped}`);
  console.log(`   ❌ Failed: ${stats.failed}`);

  if (stats.errors.length > 0) {
    console.log('\n⚠️  Errors:');
    stats.errors.forEach(({ file, error }) => {
      console.log(`   ${file}: ${error}`);
    });
  }

  console.log('\n✅ Indexing complete!\n');
}

main().catch(console.error);
