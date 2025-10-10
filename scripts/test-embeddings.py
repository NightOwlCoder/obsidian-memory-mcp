#!/usr/bin/env python3
"""Test embedding consistency"""

from sentence_transformers import SentenceTransformer
import numpy as np

model = SentenceTransformer('BAAI/bge-m3')

# Embed same text twice
text = 'Working toward promotion to Principal Engineer'
emb1 = model.encode(text, normalize_embeddings=True)
emb2 = model.encode(text, normalize_embeddings=True)

print(f'Embedding 1 shape: {emb1.shape}')
print(f'Embedding 2 shape: {emb2.shape}')
print(f'Are identical: {np.array_equal(emb1, emb2)}')
print(f'Self-similarity (should be ~1.0): {np.dot(emb1, emb2):.6f}')

# Test with query
query = 'Sergio PE developer'
query_emb = model.encode(query, normalize_embeddings=True)
similarity = np.dot(emb1, query_emb)
print(f'\nQuery "Sergio PE developer" similarity: {similarity:.6f}')

# Test with exact phrase query
query2 = 'Principal Engineer'
query2_emb = model.encode(query2, normalize_embeddings=True)
similarity2 = np.dot(emb1, query2_emb)
print(f'Query "Principal Engineer" similarity: {similarity2:.6f}')
