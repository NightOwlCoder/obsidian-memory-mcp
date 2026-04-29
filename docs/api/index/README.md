[**Obsidian Memory MCP - API Reference v1.0.0**](../README.md)

***

[Obsidian Memory MCP - API Reference](../README.md) / index

# index

Obsidian Memory MCP Server

Model Context Protocol server that exposes knowledge graph operations
to LLM agents. Provides 9 tools for creating, reading, updating, and
deleting entities and relations, with RAG-powered semantic search.

The server runs via stdio transport, communicating with MCP clients
(like Claude Desktop) through standard input/output.

## Available Tools

**Write Operations:**
- create_entities - Create new entities in markdown format
- create_relations - Connect entities with typed relations
- add_observations - Add facts to existing entities
- delete_entities - Remove entities and cleanup relations
- delete_observations - Remove specific facts
- delete_relations - Remove specific connections

**Read Operations:**
- read_graph - Load complete knowledge graph
- search_nodes - Semantic search with RAG (primary search method)
- open_nodes - Retrieve specific entities by name
- list_entity_names - List all entity names grouped by type

## Configuration

Environment variables:
- DATABASE_URL: PostgreSQL connection (default: localhost:5432/obsidian_memory)
- VAULT_PERSONAL: Path to personal Obsidian vault
- VAULT_WORK: Path to work Obsidian vault
- MEMORY_DIR: Custom memory entity location (optional)
