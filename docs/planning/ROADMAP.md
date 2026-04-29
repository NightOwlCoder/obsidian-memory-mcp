# Obsidian RAG Memory - Feature Roadmap

> Tracking future enhancements and improvements for the RAG memory system

## How to Use This Roadmap

- **Priority**: P0 (critical) → P1 (high) → P2 (medium) → P3 (low)
- **Status**: Not Started | Planning | In Progress | Testing | Completed | Blocked | Cancelled
- **Effort**: XS (<4h) | S (4-8h) | M (1-3d) | L (3-7d) | XL (1-2w) | XXL (>2w)

---

## Roadmap Table

| ID | Feature/Task | Status | Priority | Effort | Dependencies | Target Date | Notes |
|----|-------------|--------|----------|--------|--------------|-------------|-------|
| **1** | **BM25 Hybrid Search** | Not Started | | M | PostgreSQL FTS extension | | Combine semantic (vector) + keyword (BM25) search for better precision |
| **2** | **Query Expansion** | Not Started | | S | None | | Auto-expand queries with synonyms/related terms for better recall |
| **3** | **Incremental Embeddings** | Not Started | | L | Change detection system | | Only re-embed changed sections instead of full file |
| **4** | **Multi-modal Search** | Not Started | | XL | Image embeddings model | | Search across images, tables, diagrams in vault notes |
| **5** | **Cross-vault Linking** | Not Started | | M | Graph traversal logic | | Detect and index links between work/personal vaults |
| **6** | **Real-time Collaboration** | Not Started | | XXL | Conflict resolution | | Support multiple users editing same vault |
| **7** | **Graph Neural Networks** | Not Started | | XXL | GNN model training | | Predict missing relations using graph structure |
| **8** | **Monitoring Dashboard** | Not Started | | M | Web UI framework | | Real-time metrics, search quality, indexing status |
| **9** | **Error Recovery System** | Not Started | | S | Retry logic, dead letter queue | | Auto-retry failed embeddings, better error handling |
| **10** | **Validation Improvements** | Not Started | | S | Better test queries | | Improve ~75% success rate, more diverse validation |
| **11** | **API Documentation** | Completed | P2 | M | Docstring extraction | 2025-01-14 | Full API docs with examples, auto-generated with TypeDoc |
| **12** | **Integration Tests** | Not Started | | L | Test framework setup | | End-to-end tests for indexing + search pipeline |
| **13** | **Performance Profiling** | Not Started | | S | Profiling tools | | Identify bottlenecks in embeddings, search, OCR |
| **14** | **Distributed Indexing** | Not Started | | XXL | Job queue, worker pool | | Scale to >100K docs with parallel workers |
| **15** | **Search Result Ranking** | Not Started | | M | ML ranking model | | Learn-to-rank based on user feedback/clicks |
| **16** | **Semantic Caching** | Not Started | | M | Cache invalidation logic | | Cache frequent queries, hot embeddings |
| **17** | **Memory Backup Path Config** | Completed | P0 | M | None | 2025-01-13 | Add `MEMORY_DIR` env var for flexible memory entity location; handle separately from vault indexing |
| **18** | **Query Rewriting** | Not Started | | M | NLP model | | Rewrite ambiguous queries for better search results |
| **19** | **Relevance Feedback** | Not Started | | L | Feedback UI | | Learn from user clicks to improve ranking |
| **20** | **Bulk Operations** | Not Started | | M | Batch processing | | Bulk delete, update, reindex operations |
| **21** | **Schema Versioning** | Not Started | | S | Migration scripts | | Track schema changes, auto-migrate on updates |
| **22** | **Search Filters UI** | Not Started | | M | MCP tool extensions | | Filter by date, entity type, tags via tool params |
| **23** | **Relation Recommendation** | Not Started | | L | Similarity clustering | | Suggest new relations based on content similarity |
| **24** | **Custom Chunking Strategies** | Not Started | | M | Plugin system | | Allow user-defined chunking logic per file type |
| **25** | **Backup/Restore** | Not Started | | S | Export format | | Export/import vector DB for migration/backup |
| **26** | **Search Analytics** | Not Started | | M | Analytics storage | | Track popular queries, zero-result queries, latency |
| **27** | **Embedding Model Swap** | Not Started | | L | Model abstraction layer | | Easy switch between Nomic/BGE/OpenAI embeddings |
| **28** | **Markdown Table Support** | Not Started | | M | Docling table extraction | | Better chunking for tables, preserve structure |
| **29** | **Version History Search** | Not Started | | XL | Git integration | | Search across historical versions of files |
| **30** | **Federated Search** | Not Started | | XL | Multi-DB coordination | | Search across multiple vault instances |
| **31** | **MCP Sampling Support** | Not Started | P2 | M | MCP client with sampling | | Use client's LLM for smart queries, result synthesis, semantic analysis, and natural language summaries |

---

## Completed Features

| ID | Feature/Task | Completed Date | Notes |
|----|-------------|----------------|-------|
| **C1** | Observation-level Chunking | 2025-01-09 | Each observation = 1 semantic chunk |
| **C2** | Relation Categories | 2025-01-09 | snake_case normalization, category inference |
| **C3** | Docling Integration | 2025-01-09 | Structure-aware chunking for vault notes |
| **C4** | Image OCR | 2025-01-12 | Inline injection with BMP workaround |
| **C5** | Nomic Embed v1 | 2025-01-09 | Switched from BGE-M3, 768 dims, better accuracy |
| **C6** | Background Daemon | 2025-01-08 | 24/7 file watching with launchd |
| **C7** | Validation System | 2025-01-09 | Inline validation every 10 files |

---

## Priority Guidelines

**P0 - Critical (Immediate)**
- Blocking production use
- Data loss/corruption risk
- Major performance issues

**P1 - High (Next Sprint)**
- High user impact
- Performance improvements
- Common use cases

**P2 - Medium (Planned)**
- Nice-to-have features
- Edge cases
- Quality of life

**P3 - Low (Backlog)**
- Future exploration
- Research needed
- Low demand

---

## Effort Estimation Guide

- **XS (<4h)**: Simple config change, small bug fix
- **S (4-8h)**: New tool parameter, minor feature
- **M (1-3d)**: New search feature, UI improvement
- **L (3-7d)**: Major feature with testing
- **XL (1-2w)**: Complex integration, ML model
- **XXL (>2w)**: Architectural change, research project

---

## Notes

- Priorities and dates to be filled in during planning sessions
- Dependencies must be completed before starting dependent tasks
- Effort estimates are rough - refine during implementation
- Add new ideas to table with "Not Started" status
- Mark blocked tasks with blockers in Notes column

**Last Updated**: 2025-01-13
