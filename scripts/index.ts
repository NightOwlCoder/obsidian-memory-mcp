#!/usr/bin/env node
/**
 * Batch indexer for Obsidian vault markdown files
 * 
 * Uses shared indexing pipeline with:
 * - Observation-level chunking for memory entities
 * - Docling HybridChunker for vault notes
 * - Image OCR with inline injection
 * 
 * Usage: tsx scripts/index.ts [--memory-dir path] [--force]
 */

import { VectorStorage } from '../storage/VectorStorage.js';
import { indexFile } from '../utils/indexingPipeline.js';
import { getAllMarkdownFiles, buildFileMap } from '../utils/fileMapBuilder.js';
import { getEntityNameFromPath } from '../utils/pathUtils.js';
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
  warnings: number;
  errors: Array<{ file: string; error: string }>;
  validationAttempts: number;
  validationSuccesses: number;
}

/**
 * Validate search quality by randomly selecting words from indexed files
 * and checking if the source file appears in search results
 */
async function validateSearch(
  vectorStorage: VectorStorage,
  indexedFiles: string[],
  stats: IndexStats
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
            } else if (inTagsSection && line.trim().startsWith('- ')) {
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
      
      // Remove HTML tags before word extraction
      const cleanedText = fullText.replace(/<[^>]+>/g, '');
      
      // Extract words - preserve @ for aliases, strip other edge punctuation
      const words = cleanedText
        .split(/\s+/)
        .map(w => {
          // Preserve @ in middle of word (email/alias), but strip other edge punctuation
          if (w.includes('@')) {
            return w.replace(/^[^\w@]+|[^\w@]+$/g, '');
          }
          return w.replace(/^[^\w]+|[^\w]+$/g, '');
        })
        .filter(w => w.length >= 3);  // Min 3 chars (filter 2-letter words)
      
      // Filter stop words + common verbs
      const commonVerbs = ['add', 'put', 'get', 'set', 'use', 'run', 'try', 'see', 'go'];
      const meaningfulWords = removeStopwords(words, [...eng, ...por, ...commonVerbs]);
      
      if (meaningfulWords.length < 3) {
        if (attempt < MAX_RETRIES - 1) continue;
        console.log(`\n  🔍 Validation: skipped after ${MAX_RETRIES} attempts (insufficient meaningful words)`);
        return;
      }
      
      // Add timestamp and filename entropy to randomization
      const seed = Date.now() + randomFile.length + attempt;
      
      // Randomly select 2-3 consecutive words
      const hash = crypto.createHash('sha256').update(String(seed)).digest();
      const queryLength = 2 + (hash.readUInt8(0) % 2);
      
      if (meaningfulWords.length < queryLength) {
        if (attempt < MAX_RETRIES - 1) continue;
        console.log(`\n  🔍 Validation: skipped after ${MAX_RETRIES} attempts (insufficient words for query)`);
        return;
      }
      
      const maxIdx = Math.max(0, meaningfulWords.length - queryLength);
      const randomValue = hash.readUInt32BE(0) / 0xFFFFFFFF;
      const startIdx = maxIdx > 0 ? Math.floor(randomValue * (maxIdx + 1)) : 0;
      
      const selectedWords = meaningfulWords.slice(startIdx, startIdx + queryLength);
      const totalChars = selectedWords.join('').length;
      
      if (totalChars <= 4) {
        if (attempt < MAX_RETRIES - 1) continue;
        console.log(`\n  🔍 Validation: skipped after ${MAX_RETRIES} attempts (query too short)`);
        return;
      }
      
      const query = selectedWords.join(' ');
      
      // Search vector DB
      const results = await vectorStorage.search(query, { maxResults: 100 });
      
      // Check if source file appears in results
      const match = results.find(r => r.filePath === randomFile);
      const topSim = results[0]?.similarity || 0;
      const totalResults = results.length;
      
      // Track validation stats
      stats.validationAttempts++;
      
      if (match) {
        stats.validationSuccesses++;
        const rank = results.indexOf(match) + 1;
        console.log(`  🔍 Validation: "${query}" → ${entityName} found ✓ (sim: ${match.similarity.toFixed(2)}, rank ${rank}/${totalResults})`);
      } else {
        console.log(`  ⚠️  Validation: "${query}" → ${entityName} NOT FOUND in ${totalResults} results (best sim: ${topSim.toFixed(2)})`);
      }
      
      return;
      
    } catch (error) {
      if (attempt < MAX_RETRIES - 1) continue;
      console.log(`\n  ⚠️  Validation failed after ${MAX_RETRIES} attempts: ${error}`);
      return;
    }
  }
}

/**
 * Index all markdown files in a directory
 */
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
    warnings: 0,
    errors: [],
    validationAttempts: 0,
    validationSuccesses: 0
  };

  const vectorStorage = new VectorStorage();

  try {
    // Get all markdown files recursively
    console.log('Scanning for markdown files...');
    const mdFiles = await getAllMarkdownFiles(memoryDir);
    
    stats.total = mdFiles.length;
    const validationInterval = 10;
    console.log(`Found ${stats.total} markdown files (validating every ${validationInterval} files)\n`);

    // Index files with progress and validation
    for (let i = 0; i < mdFiles.length; i++) {
      const filePath = mdFiles[i];
      
      // Use shared indexing pipeline
      const success = await indexFile(vectorStorage, filePath, memoryDir);
      
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
      
      // Inline validation every N files
      if ((i + 1) % validationInterval === 0 && stats.indexed > 0) {
        const startIdx = Math.max(0, i + 1 - validationInterval);
        const recentFiles = mdFiles.slice(startIdx, i + 1);
        await validateSearch(vectorStorage, recentFiles, stats);
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

/**
 * Main entry point
 */
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
  console.log(`   ⚠️  Warnings: ${stats.warnings}`);
  console.log(`   ❌ Failed: ${stats.failed}`);
  
  if (stats.validationAttempts > 0) {
    const successRate = ((stats.validationSuccesses / stats.validationAttempts) * 100).toFixed(1);
    console.log(`   🔍 Validation: ${stats.validationSuccesses}/${stats.validationAttempts} found (${successRate}%)`);
  }

  if (stats.errors.length > 0) {
    console.log('\n❌ Errors:');
    stats.errors.forEach(({ file, error }) => {
      console.log(`   ${file}: ${error}`);
    });
  }

  console.log('\n✅ Indexing complete!\n');
}

main().catch(console.error);
