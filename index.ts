#!/usr/bin/env node

/**
 * Obsidian Memory MCP Server
 * 
 * Model Context Protocol server that exposes knowledge graph operations
 * to LLM agents. Provides 9 tools for creating, reading, updating, and
 * deleting entities and relations, with RAG-powered semantic search.
 * 
 * The server runs via stdio transport, communicating with MCP clients
 * (like Claude Desktop) through standard input/output.
 * 
 * ## Available Tools
 * 
 * **Write Operations:**
 * - create_entities - Create new entities in markdown format
 * - create_relations - Connect entities with typed relations
 * - add_observations - Add facts to existing entities
 * - delete_entities - Remove entities and cleanup relations
 * - delete_observations - Remove specific facts
 * - delete_relations - Remove specific connections
 * 
 * **Read Operations:**
 * - read_graph - Load complete knowledge graph
 * - search_nodes - Semantic search with RAG (primary search method)
 * - open_nodes - Retrieve specific entities by name
 * - list_entity_names - List all entity names grouped by type
 * 
 * ## Configuration
 * 
 * Environment variables:
 * - DATABASE_URL: PostgreSQL connection (default: localhost:5432/obsidian_memory)
 * - VAULT_PERSONAL: Path to personal Obsidian vault
 * - VAULT_WORK: Path to work Obsidian vault
 * - MEMORY_DIR: Custom memory entity location (optional)
 * 
 * @packageDocumentation
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Entity, Relation } from './types.js';
import { MarkdownStorageManager } from './storage/MarkdownStorageManager.js';

// Create Markdown storage manager
const storageManager = new MarkdownStorageManager();

// The server instance and tools exposed to Claude
const server = new Server({
  name: "obsidian-memory-server",
  version: "0.6.3",
},    {
    capabilities: {
      tools: {},
    },
  },);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "create_entities",
        description: "Create multiple new entities in the knowledge graph",
        generateOutputSchema: true,
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
        inputSchema: {
          type: "object",
          properties: {
            entities: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", description: "The name of the entity" },
                  entityType: { type: "string", description: "The type of the entity" },
                  observations: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "An array of observation contents associated with the entity"
                  },
                },
                required: ["name", "entityType", "observations"],
              },
            },
          },
          required: ["entities"],
        },
      },
      {
        name: "create_relations",
        description: "Create multiple new relations between entities in the knowledge graph. Relations should be in active voice",
        generateOutputSchema: true,
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        inputSchema: {
          type: "object",
          properties: {
            relations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  from: { type: "string", description: "The name of the entity where the relation starts" },
                  to: { type: "string", description: "The name of the entity where the relation ends" },
                  relationType: { type: "string", description: "The type of the relation" },
                },
                required: ["from", "to", "relationType"],
              },
            },
          },
          required: ["relations"],
        },
      },
      {
        name: "add_observations",
        description: "Add new observations to existing entities in the knowledge graph",
        generateOutputSchema: true,
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
        inputSchema: {
          type: "object",
          properties: {
            observations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  entityName: { type: "string", description: "The name of the entity to add the observations to" },
                  contents: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "An array of observation contents to add"
                  },
                },
                required: ["entityName", "contents"],
              },
            },
          },
          required: ["observations"],
        },
      },
      {
        name: "delete_entities",
        description: "Delete multiple entities and their associated relations from the knowledge graph",
        generateOutputSchema: true,
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: true,
          openWorldHint: false,
        },
        inputSchema: {
          type: "object",
          properties: {
            entityNames: { 
              type: "array", 
              items: { type: "string" },
              description: "An array of entity names to delete" 
            },
          },
          required: ["entityNames"],
        },
      },
      {
        name: "delete_observations",
        description: "Delete specific observations from entities in the knowledge graph",
        generateOutputSchema: true,
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: true,
          openWorldHint: false,
        },
        inputSchema: {
          type: "object",
          properties: {
            deletions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  entityName: { type: "string", description: "The name of the entity containing the observations" },
                  observations: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "An array of observations to delete"
                  },
                },
                required: ["entityName", "observations"],
              },
            },
          },
          required: ["deletions"],
        },
      },
      {
        name: "delete_relations",
        description: "Delete multiple relations from the knowledge graph",
        generateOutputSchema: true,
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: true,
          openWorldHint: false,
        },
        inputSchema: {
          type: "object",
          properties: {
            relations: { 
              type: "array", 
              items: {
                type: "object",
                properties: {
                  from: { type: "string", description: "The name of the entity where the relation starts" },
                  to: { type: "string", description: "The name of the entity where the relation ends" },
                  relationType: { type: "string", description: "The type of the relation" },
                },
                required: ["from", "to", "relationType"],
              },
              description: "An array of relations to delete" 
            },
          },
          required: ["relations"],
        },
      },
      {
        name: "read_graph",
        description: "Read the entire knowledge graph",
        generateOutputSchema: true,
        annotations: {
          readOnlyHint: true,
          openWorldHint: false,
        },
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "search_nodes",
        description: "Search for nodes in the knowledge graph based on a query. Returns limited results with metadata about total matches.",
        generateOutputSchema: true,
        annotations: {
          readOnlyHint: true,
          openWorldHint: false,
        },
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "The search query to match against entity names, types, and observation content" },
            maxResults: { type: "number", description: "Maximum number of items to return for all arrays (default: 20)", default: 20 },
            includeFields: { 
              type: "array", 
              items: { type: "string", enum: ["observations", "relations", "relatedEntities", "mentionMatches", "categories"] },
              description: "Fields to include in response. Omit fields to reduce token usage.",
              default: ["observations", "relations"]
            },
          },
          required: ["query"],
        },
      },
      {
        name: "open_nodes",
        description: "Open specific nodes in the knowledge graph by their names",
        generateOutputSchema: true,
        annotations: {
          readOnlyHint: true,
          openWorldHint: false,
        },
        inputSchema: {
          type: "object",
          properties: {
            names: {
              type: "array",
              items: { type: "string" },
              description: "An array of entity names to retrieve",
            },
          },
          required: ["names"],
        },
      },
      {
        name: "list_entity_names",
        description: "Get a lightweight list of all entity names grouped by type. Use this before create_entities to check for existing entities and avoid duplicates. Returns canonical names and aliases for smart matching.",
        generateOutputSchema: true,
        annotations: {
          readOnlyHint: true,
          openWorldHint: false,
        },
        inputSchema: {
          type: "object",
          properties: {
            entityType: {
              type: "string",
              description: "Optional: filter by entity type (e.g., 'person', 'project')"
            },
          },
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!args) {
    throw new Error(`No arguments provided for tool: ${name}`);
  }

  switch (name) {
    case "create_entities":
      return { content: [{ type: "text", text: JSON.stringify(await storageManager.createEntities(args.entities as Entity[]), null, 2) }] };
    case "create_relations":
      return { content: [{ type: "text", text: JSON.stringify(await storageManager.createRelations(args.relations as Relation[]), null, 2) }] };
    case "add_observations":
      return { content: [{ type: "text", text: JSON.stringify(await storageManager.addObservations(args.observations as { entityName: string; contents: string[] }[]), null, 2) }] };
    case "delete_entities":
      await storageManager.deleteEntities(args.entityNames as string[]);
      return { content: [{ type: "text", text: "Entities deleted successfully" }] };
    case "delete_observations":
      await storageManager.deleteObservations(args.deletions as { entityName: string; observations: string[] }[]);
      return { content: [{ type: "text", text: "Observations deleted successfully" }] };
    case "delete_relations":
      await storageManager.deleteRelations(args.relations as Relation[]);
      return { content: [{ type: "text", text: "Relations deleted successfully" }] };
    case "read_graph":
      return { content: [{ type: "text", text: JSON.stringify(await storageManager.readGraph(), null, 2) }] };
    case "search_nodes":
      return { content: [{ type: "text", text: JSON.stringify(await storageManager.searchNodes(args.query as string, {
        maxResults: args.maxResults as number || 20,
        includeFields: args.includeFields as string[] || ["observations", "relations"]
      }), null, 2) }] };
    case "open_nodes":
      return { content: [{ type: "text", text: JSON.stringify(await storageManager.openNodes(args.names as string[]), null, 2) }] };
    case "list_entity_names":
      return { content: [{ type: "text", text: JSON.stringify(await storageManager.listEntityNames(args.entityType as string | undefined), null, 2) }] };
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

/**
 * Initialize and start the MCP server
 * 
 * Sets up stdio transport and connects the server to communicate with
 * MCP clients. Logs startup information to stderr (stdout is reserved
 * for MCP protocol messages).
 * 
 * @throws {Error} If server initialization or connection fails
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Obsidian Memory MCP Server running on stdio (storage: markdown files)");
  console.error(`MCP cwd: ${process.cwd()}`);
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
