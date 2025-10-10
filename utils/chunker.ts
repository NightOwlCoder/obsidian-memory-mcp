/**
 * Simple token-based text chunking for RAG
 * Uses word-based splitting with rough token estimation (1 token ≈ 4 chars)
 */

export interface ChunkOptions {
  maxTokens?: number;
  overlap?: number; // Number of words to overlap between chunks
}

/**
 * Chunk text into smaller pieces suitable for embedding
 * @param text Full text content to chunk
 * @param options Chunking configuration
 * @returns Array of text chunks
 */
export function chunkText(
  text: string,
  options: ChunkOptions = {}
): string[] {
  const { maxTokens = 512, overlap = 50 } = options;
  
  if (!text || text.trim().length === 0) {
    return [];
  }

  // Split into words
  const words = text.split(/\s+/).filter(w => w.length > 0);
  
  if (words.length === 0) {
    return [];
  }

  const chunks: string[] = [];
  let current: string[] = [];
  let tokenCount = 0;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    // Rough estimate: 1 token ≈ 4 characters
    const wordTokens = Math.ceil(word.length / 4);

    // If adding this word exceeds max tokens and we have content, create chunk
    if (tokenCount + wordTokens > maxTokens && current.length > 0) {
      chunks.push(current.join(' '));
      
      // Keep overlap words for context continuity
      if (overlap > 0 && current.length > overlap) {
        current = current.slice(-overlap);
        // Recalculate token count for overlap
        tokenCount = current.reduce((sum, w) => sum + Math.ceil(w.length / 4), 0);
      } else {
        current = [];
        tokenCount = 0;
      }
    }

    current.push(word);
    tokenCount += wordTokens;
  }

  // Add final chunk if there's remaining content
  if (current.length > 0) {
    chunks.push(current.join(' '));
  }

  return chunks;
}

/**
 * Estimate token count for text (rough approximation)
 */
export function estimateTokens(text: string): number {
  // Rough: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4);
}

/**
 * Get chunk statistics for debugging
 */
export function getChunkStats(chunks: string[]): {
  chunkCount: number;
  avgTokens: number;
  minTokens: number;
  maxTokens: number;
  totalTokens: number;
} {
  if (chunks.length === 0) {
    return {
      chunkCount: 0,
      avgTokens: 0,
      minTokens: 0,
      maxTokens: 0,
      totalTokens: 0
    };
  }

  const tokenCounts = chunks.map(estimateTokens);
  const totalTokens = tokenCounts.reduce((sum, count) => sum + count, 0);

  return {
    chunkCount: chunks.length,
    avgTokens: Math.round(totalTokens / chunks.length),
    minTokens: Math.min(...tokenCounts),
    maxTokens: Math.max(...tokenCounts),
    totalTokens
  };
}
