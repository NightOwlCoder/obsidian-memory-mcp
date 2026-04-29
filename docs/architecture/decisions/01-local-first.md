# ADR 001: Local-First Embeddings

**Date**: 2025-01-07  
**Status**: Accepted  
**Deciders**: Sergio, Kova (AI assistant)

## Context

Need to choose between local embeddings vs cloud API for RAG system with ~10K Obsidian notes across two vaults.

### Options Considered

1. **OpenAI Embeddings API**
   - Pros: High quality, easy to use, well-documented
   - Cons: $0.02/1M tokens (~$3-5 for 10K notes), requires internet, privacy concerns
   - Performance: ~100ms per request (network latency)

2. **Local BGE-M3 Model**
   - Pros: Zero cost, complete privacy, works offline
   - Cons: Requires 2GB disk, 3GB RAM, initial setup
   - Performance: ~10ms per embedding on M4 Mac

3. **Local MiniLM Model**
   - Pros: Smaller (80MB), faster loading
   - Cons: Lower quality (384 dimensions), less multilingual support
   - Performance: ~5ms per embedding

## Decision

**Chosen: Local BGE-M3 Model**

### Rationale

1. **Privacy**: All personal/work notes stay local - critical for Amazon internal info
2. **Cost**: $0 forever vs $3-5 initial + ongoing costs for updates
3. **Performance**: M4 Mac easily handles BGE-M3 (50-100 docs/sec)
4. **Quality**: 1024 dimensions, multilingual, state-of-art for retrieval
5. **Offline**: Works without internet, no API dependencies

### Trade-offs Accepted

- **Initial setup complexity**: Need Python + PyTorch + Sentence Transformers
- **Disk space**: 2GB for model (acceptable on modern Macs)
- **RAM usage**: 3GB when loaded (fine with 16GB+ RAM)
- **First-run slowness**: 30s model load (cached after that)

## Implementation Details

```python
from sentence_transformers import SentenceTransformer

# Load BGE-M3 (downloads once to ~/.cache)
model = SentenceTransformer('BAAI/bge-m3')

# Generate embeddings
embedding = model.encode(text, normalize_embeddings=True)
# Returns: numpy array of 1024 floats
```

**Node.js Integration**:
- Call Python embedder via `child_process`
- Implement LRU cache to avoid redundant embeddings
- Batch processing for bulk indexing

## Consequences

### Positive
- ✅ Zero ongoing costs
- ✅ Complete data privacy
- ✅ Works offline
- ✅ Fast enough for real-time use
- ✅ Scales to 100K+ notes without cost increase

### Negative
- ❌ Requires Python setup
- ❌ 2GB disk space for model
- ❌ Initial 30s load time
- ❌ Can't easily switch models (need re-indexing)

### Neutral
- Model updates require manual intervention
- Need to manage model cache location

## Validation

Will be validated through:
- [ ] Performance benchmarks (target: 50+ docs/sec)
- [ ] Search quality tests (target: 80%+ precision)
- [ ] Memory usage monitoring (target: <4GB total)
- [ ] Real-world usage over 1 month

## Alternatives Revisited

We can reconsider if:
- Search quality is poor (<70% precision)
- Performance is too slow (<20 docs/sec)
- Setup complexity blocks adoption

Would then try:
1. Hybrid: Local for frequent queries, API for rare ones
2. Switch to OpenAI if quality gap is significant

## References

- [BGE-M3 Paper](https://arxiv.org/abs/2402.03216)
- [Sentence Transformers Docs](https://www.sbert.net/)
- [docling-rag-agent example](https://github.com/coleam00/ottomator-agents/tree/main/docling-rag-agent)

## Related Decisions

- [ADR-002: Tool Minimalism](./02-tool-minimalism.md)
- [ADR-003: RAG Integration](./03-rag-integration.md)
