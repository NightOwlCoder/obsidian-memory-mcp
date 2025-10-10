#!/usr/bin/env python3
"""
BGE-M3 Embedding Service for Obsidian RAG Memory

This service runs as a subprocess called by the TypeScript MCP server.
It reads text from stdin and outputs 1024-dimensional embeddings to stdout.
"""

import sys
import json
import os
from sentence_transformers import SentenceTransformer

# Disable hf_transfer to avoid dependency issues
os.environ['HF_HUB_ENABLE_HF_TRANSFER'] = '0'

# Load Nomic Embed v1 model (cached after first run)
print("Loading Nomic Embed v1 model...", file=sys.stderr)
model = SentenceTransformer('nomic-ai/nomic-embed-text-v1', trust_remote_code=True)
print("✓ Model loaded (768 dimensions)", file=sys.stderr)

def embed_text(text: str, prefix: str = 'search_document:') -> list[float]:
    """
    Generate 768-dimensional embedding for input text using Nomic Embed v1.
    
    Args:
        text: Input text to embed
        prefix: Task prefix ('search_document:' for indexing, 'search_query:' for searching)
        
    Returns:
        List of 768 floats representing the embedding
    """
    if not text or not text.strip():
        raise ValueError("Cannot embed empty text")
    
    # Add Nomic-required prefix
    prefixed_text = f"{prefix} {text}"
    
    # Normalize embeddings for cosine similarity
    embedding = model.encode(prefixed_text, normalize_embeddings=True)
    
    return embedding.tolist()

def main():
    """
    Main loop: read JSON from stdin, output embeddings to stdout.
    
    Input format:
        {"text": "content to embed"}
        
    Output format:
        {"embedding": [1024 floats], "dimension": 1024}
    """
    print("Embedder service ready", file=sys.stderr)
    
    for line in sys.stdin:
        try:
            # Parse input
            data = json.loads(line.strip())
            text = data.get('text', '')
            
            if not text:
                print(json.dumps({"error": "Empty text"}), flush=True)
                continue
            
            # Generate embedding
            embedding = embed_text(text)
            
            # Output result
            result = {
                "embedding": embedding,
                "dimension": len(embedding)
            }
            print(json.dumps(result), flush=True)
            
        except json.JSONDecodeError as e:
            error = {"error": f"Invalid JSON: {str(e)}"}
            print(json.dumps(error), flush=True)
            
        except Exception as e:
            error = {"error": f"Embedding failed: {str(e)}"}
            print(json.dumps(error), flush=True)

if __name__ == '__main__':
    main()
