# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records for the Obsidian RAG Memory MCP project.

## What are ADRs?

Architecture Decision Records document significant architectural decisions made during the project, including:
- The context and requirements that led to the decision
- The options considered
- The decision made and why
- The consequences of the decision

## Format

Each ADR follows this structure:

1. **Title**: Brief description of the decision
2. **Date**: When the decision was made
3. **Status**: Accepted, Proposed, Deprecated, etc.
4. **Context**: The problem or opportunity
5. **Decision**: What was decided
6. **Rationale**: Why this decision was made
7. **Consequences**: Positive, negative, and neutral outcomes
8. **Alternatives**: Other options considered and why they were rejected

## Current ADRs

### [ADR-001: Local-First Embeddings](./01-local-first.md)
**Decision**: Use local BGE-M3 embeddings instead of cloud APIs

**Key Points**:
- Zero cost forever
- Complete privacy for work/personal notes
- M4 Mac performance sufficient (50-100 docs/sec)
- 1024-dimension embeddings for quality

**Status**: ✅ Accepted

---

### [ADR-002: Tool Minimalism](./02-tool-minimalism.md)
**Decision**: Reduce from 9 tools to 6 core tools

**Key Points**:
- Remove `read_graph` (useless for large KBs)
- Remove `open_nodes` (redundant with semantic search)
- Keep enhanced `search_nodes` as primary interface
- Simpler API, clearer mental model

**Status**: ✅ Accepted

---

### [ADR-003: RAG Integration](./03-rag-integration.md)
**Decision**: Hybrid dual-layer architecture (Graph + Vector)

**Key Points**:
- Combine graph structure with RAG search
- Obsidian markdown remains source of truth
- Auto-sync via file watcher
- PostgreSQL + PGVector for storage

**Status**: ✅ Accepted

---

## Why ADRs Matter

ADRs help:
- **Remember why**: Future you (or others) understand the reasoning
- **Avoid rehashing**: Don't debate the same decisions repeatedly
- **Learn from mistakes**: Document what didn't work
- **Onboard quickly**: New contributors understand the architecture

## When to Create an ADR

Create an ADR when making decisions about:
- Technology choices (databases, libraries, frameworks)
- Architectural patterns (MCP design, storage approach)
- API design (tool interfaces, parameters)
- Performance trade-offs (speed vs quality)
- Security/privacy considerations

## When NOT to Create an ADR

Don't create ADRs for:
- Implementation details (variable names, file organization)
- Temporary workarounds
- Obvious choices with no alternatives
- Decisions that can be easily reversed

## ADR Lifecycle

1. **Proposed** - Decision under consideration
2. **Accepted** - Decision approved and implemented
3. **Deprecated** - Decision superseded by newer decision
4. **Superseded** - Replaced by ADR-XXX

## References

- [Michael Nygard's ADR format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
- [ADR GitHub Organization](https://adr.github.io/)
- [Spotify's ADR practices](https://engineering.atspotify.com/2020/04/14/when-should-i-write-an-architecture-decision-record/)
