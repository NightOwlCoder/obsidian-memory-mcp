import { promises as fs } from 'fs';
import path from 'path';

/**
 * Build filename → filepath map for entire vault (all file types)
 * 
 * This map enables quick lookup of images, PDFs, and other non-markdown files
 * by filename, regardless of their location in the vault hierarchy.
 * 
 * @param rootDir - Root directory to scan recursively
 * @returns Map of filename to absolute path
 */
export async function buildFileMap(rootDir: string): Promise<Map<string, string>> {
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

/**
 * Get all markdown files recursively from a directory
 * 
 * @param dir - Root directory to scan
 * @returns Array of absolute paths to markdown files
 */
export async function getAllMarkdownFiles(dir: string): Promise<string[]> {
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
