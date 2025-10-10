import { spawn } from 'child_process';
import path from 'path';

export interface DoclingChunk {
  index: number;
  content: string;
  token_count: number;
}

/**
 * Chunk markdown file using Docling HybridChunker
 * @param filePath Path to markdown file
 * @param maxTokens Maximum tokens per chunk (default: 512)
 * @returns Array of contextualized chunks
 */
export async function chunkWithDocling(
  filePath: string,
  maxTokens: number = 512
): Promise<DoclingChunk[]> {
  const projectRoot = process.cwd().endsWith('obsidian-memory-mcp') 
    ? process.cwd()
    : path.resolve(__dirname, '..', '..');
  
  const venvPython = path.join(projectRoot, 'venv', 'bin', 'python');
  const chunkerScript = path.join(projectRoot, 'embeddings', 'docling_chunker.py');
  
  return new Promise((resolve, reject) => {
    const python = spawn(venvPython, [chunkerScript, 'chunk-markdown', filePath, String(maxTokens)]);
    
    let output = '';
    let errorOutput = '';
    
    python.stdout.on('data', (data) => { 
      output += data.toString(); 
    });
    
    python.stderr.on('data', (data) => { 
      errorOutput += data.toString();
    });
    
    python.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Docling chunker failed: ${errorOutput}`));
        return;
      }
      
      try {
        const result = JSON.parse(output);
        
        if (result.error) {
          reject(new Error(`Docling error: ${result.error}`));
          return;
        }
        
        resolve(result as DoclingChunk[]);
      } catch (err) {
        reject(new Error(`Failed to parse Docling output: ${err}`));
      }
    });
    
    python.on('error', (err) => {
      reject(new Error(`Failed to spawn Docling process: ${err}`));
    });
  });
}

/**
 * OCR and chunk an image file using Docling
 * @param filePath Path to image file (.jpg, .png, etc.)
 * @param maxTokens Maximum tokens per chunk (default: 512)
 * @returns Array of contextualized chunks from OCR text
 */
export async function chunkImageWithDocling(
  filePath: string,
  maxTokens: number = 512
): Promise<DoclingChunk[]> {
  const projectRoot = process.cwd().endsWith('obsidian-memory-mcp') 
    ? process.cwd()
    : path.resolve(__dirname, '..', '..');
  
  const venvPython = path.join(projectRoot, 'venv', 'bin', 'python');
  const chunkerScript = path.join(projectRoot, 'embeddings', 'docling_chunker.py');
  
  return new Promise((resolve, reject) => {
    const python = spawn(venvPython, [chunkerScript, 'chunk-image', filePath, String(maxTokens)]);
    
    let output = '';
    let errorOutput = '';
    
    python.stdout.on('data', (data) => { 
      output += data.toString(); 
    });
    
    python.stderr.on('data', (data) => { 
      errorOutput += data.toString();
    });
    
    python.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Docling image OCR failed: ${errorOutput}`));
        return;
      }
      
      try {
        const result = JSON.parse(output);
        
        if (result.error) {
          reject(new Error(`Docling error: ${result.error}`));
          return;
        }
        
        resolve(result as DoclingChunk[]);
      } catch (err) {
        reject(new Error(`Failed to parse Docling output: ${err}`));
      }
    });
    
    python.on('error', (err) => {
      reject(new Error(`Failed to spawn Docling process: ${err}`));
    });
  });
}
