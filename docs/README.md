# Documentation Index

> Organized documentation for the Obsidian RAG Memory system

## 📁 Documentation Structure

### 🏗️ Architecture (`architecture/`)
System design, technical decisions, and API specifications.

- **[ARCHITECTURE.md](architecture/ARCHITECTURE.md)** - Complete system architecture with data flow diagrams
- **[API_DESIGN.md](architecture/API_DESIGN.md)** - MCP API design and tool specifications
- **[decisions/](architecture/decisions/)** - Architectural decision records (ADRs)
  - Local-first design philosophy
  - Tool minimalism approach
  - RAG integration strategy

### 🔨 Implementation (`implementation/`)
Feature implementation plans and technical specifications.

- **[CHUNKING_IMPLEMENTATION_PLAN.md](implementation/CHUNKING_IMPLEMENTATION_PLAN.md)** - Dual-strategy chunking (observation-level + Docling)
- **[DAEMON_IMPLEMENTATION_PLAN.md](implementation/DAEMON_IMPLEMENTATION_PLAN.md)** - Background daemon with launchd
- **[IMPLEMENTATION_PLAN.md](implementation/IMPLEMENTATION_PLAN.md)** - Original implementation roadmap
- **[MEMORY_DIR_IMPLEMENTATION.md](implementation/MEMORY_DIR_IMPLEMENTATION.md)** - Flexible memory location (issue #17)
- **[SESSION2_CHUNKING_PLAN.md](implementation/SESSION2_CHUNKING_PLAN.md)** - Phase 2 chunking session notes

### ⚙️ Operations (`operations/`)
Deployment, setup, testing, and operational concerns.

- **[SETUP.md](operations/SETUP.md)** - Installation and configuration guide
- **[DEPLOYMENT_SUMMARY.md](operations/DEPLOYMENT_SUMMARY.md)** - Production deployment checklist
- **[TESTING_PLAN.md](operations/TESTING_PLAN.md)** - Testing strategy and test cases
- **[KNOWN_ISSUES.md](operations/KNOWN_ISSUES.md)** - Known limitations and workarounds

### 📋 Planning (`planning/`)
Requirements, roadmaps, and project planning documents.

- **[REQUIREMENTS.md](planning/REQUIREMENTS.md)** - System requirements and objectives
- **[ROADMAP.md](planning/ROADMAP.md)** - Feature roadmap with 30+ potential enhancements
- **[RESTART_PACKAGE.md](planning/RESTART_PACKAGE.md)** - Context package for resuming work

---

## 🚀 Quick Navigation

**New to the project?** Start here:
1. [README.md](../README.md) - Project overview
2. [REQUIREMENTS.md](planning/REQUIREMENTS.md) - What problem we're solving
3. [ARCHITECTURE.md](architecture/ARCHITECTURE.md) - How it works
4. [SETUP.md](operations/SETUP.md) - Get it running

**Implementing a feature?**
1. Check [ROADMAP.md](planning/ROADMAP.md) for priority
2. Read relevant implementation plan in `implementation/`
3. Review [ARCHITECTURE.md](architecture/ARCHITECTURE.md) for context
4. Follow [TESTING_PLAN.md](operations/TESTING_PLAN.md)

**Troubleshooting?**
1. Check [KNOWN_ISSUES.md](operations/KNOWN_ISSUES.md)
2. Review [DEPLOYMENT_SUMMARY.md](operations/DEPLOYMENT_SUMMARY.md)
3. Consult [ARCHITECTURE.md](architecture/ARCHITECTURE.md) for system behavior

---

## 📊 Project Status

**Phase 1-4: COMPLETE** ✅
- Relation migration (snake_case + categories)
- Observation-level chunking (3.3x improvement)
- Docling integration for vault notes
- Image OCR with inline injection

**Current Focus:**
- Issue #17: MEMORY_DIR configuration (P0)
- See [ROADMAP.md](planning/ROADMAP.md) for full feature list

**System Health:**
- 1,811 files indexed
- 13,882 chunks
- 99.8% success rate
- <100ms search latency

---

## 🔄 Document Maintenance

### When to Update

- **Architecture docs**: On design changes, new components
- **Implementation plans**: When starting/completing features
- **Operations docs**: On deployment changes, new issues found
- **Planning docs**: During sprint planning, priority changes

### Document Templates

**Implementation Plan Template:**
```markdown
# [Feature Name] Implementation Plan

**Status**: Not Started | In Progress | Complete
**Priority**: P0 | P1 | P2 | P3
**Effort**: XS | S | M | L | XL | XXL
**Created**: YYYY-MM-DD

## Problem Statement
## Solution Design
## Implementation Steps
## Testing Strategy
## Success Criteria
```

**ADR Template:**
```markdown
# ADR-XXX: [Decision Title]

**Status**: Proposed | Accepted | Deprecated | Superseded
**Date**: YYYY-MM-DD
**Deciders**: [Names]

## Context
## Decision
## Consequences
## Alternatives Considered
```

---

**Last Updated**: 2025-01-13
