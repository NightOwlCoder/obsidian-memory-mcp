import { promises as fs } from 'fs';
import path from 'path';
import { Entity, Relation, KnowledgeGraph } from '../types.js';
import { 
  getMemoryDir, 
  getEntityPath, 
  getEntityNameFromPath,
  sanitizeFilename 
} from '../utils/pathUtils.js';
import { 
  parseMarkdown, 
  generateMarkdown,
  updateMetadata,
  addRelationToContent,
  removeRelationFromContent
} from '../utils/markdownUtils.js';
import { VectorStorage } from './VectorStorage.js';

/**
 * Main storage manager for the Obsidian memory system
 * 
 * Manages entity and relation storage as markdown files, integrating
 * both traditional file-based storage with RAG-powered vector search.
 * Supports reading from multiple Obsidian vaults while writing to a
 * configured memory directory.
 * 
 * @example
 * ```typescript
 * const storage = new MarkdownStorageManager();
 * 
 * // Create entities
 * await storage.createEntities([{
 *   name: "Sergio",
 *   entityType: "person",
 *   observations: ["Aspiring PE developer"]
 * }]);
 * 
 * // Search with semantic similarity
 * const results = await storage.searchNodes("career goals", {
 *   maxResults: 10,
 *   sortBy: "relevance"
 * });
 * ```
 */
export class MarkdownStorageManager {
  private memoryDir: string;
  private vectorStorage: VectorStorage;

  /**
   * Creates a new MarkdownStorageManager instance
   * 
   * Initializes the memory directory from environment variables
   * (MEMORY_DIR, VAULT_PERSONAL/memory, or VAULT_WORK/memory)
   * and sets up the vector storage for RAG search.
   */
  constructor() {
    this.memoryDir = getMemoryDir();
    this.vectorStorage = new VectorStorage();
  }

  /**
   * Ensure the memory directory exists
   */
  private async ensureMemoryDir(): Promise<void> {
    try {
      await fs.mkdir(this.memoryDir, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create memory directory: ${error}`);
    }
  }

  /**
   * Load a single entity from a markdown file
   */
  private async loadEntity(filePath: string): Promise<Entity | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const entityName = getEntityNameFromPath(filePath);
      if (!entityName) return null;

      const parsed = parseMarkdown(content, entityName);
      return {
        name: entityName,
        entityType: parsed.metadata.entityType || 'unknown',
        observations: parsed.observations
      };
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as any).code === 'ENOENT') {
        return null;
      }
      // Skip files with YAML parsing errors (templates, malformed frontmatter)
      if (error instanceof Error && error.message.includes('YAML')) {
        console.error(`Skipping file with YAML error: ${filePath}`);
        return null;
      }
      throw error;
    }
  }

  /**
   * Recursively get all markdown files from a directory
   */
  private async getAllMarkdownFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    
    async function scan(currentDir: string) {
      try {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);
          
          // Skip hidden and system directories
          if (entry.name.startsWith('.') || 
              entry.name === 'node_modules' || 
              entry.name === 'venv') {
            continue;
          }
          
          if (entry.isDirectory()) {
            await scan(fullPath);
          } else if (entry.isFile() && entry.name.endsWith('.md')) {
            files.push(fullPath);
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    }
    
    await scan(dir);
    return files;
  }

  /**
   * Load all entities from both vaults (for reading)
   */
  private async loadAllEntities(): Promise<Entity[]> {
    await this.ensureMemoryDir();
    
    try {
      const vaultPersonal = process.env.VAULT_PERSONAL || '';
      const vaultWork = process.env.VAULT_WORK || '';
      
      let allFiles: string[] = [];
      
      // Scan both vaults if configured
      if (vaultPersonal) {
        const personalFiles = await this.getAllMarkdownFiles(vaultPersonal);
        allFiles = allFiles.concat(personalFiles);
      }
      
      if (vaultWork) {
        const workFiles = await this.getAllMarkdownFiles(vaultWork);
        allFiles = allFiles.concat(workFiles);
      }
      
      // Fallback to memory dir if no vaults configured
      if (allFiles.length === 0) {
        const files = await fs.readdir(this.memoryDir);
        allFiles = files
          .filter(f => f.endsWith('.md'))
          .map(f => path.join(this.memoryDir, f));
      }
      
      const entities = await Promise.all(
        allFiles.map(file => this.loadEntity(file))
      );
      
      return entities.filter((e): e is Entity => e !== null);
    } catch (error) {
      throw new Error(`Failed to load entities: ${error}`);
    }
  }

  /**
   * Load all relations from all markdown files
   */
  private async loadAllRelations(): Promise<Relation[]> {
    await this.ensureMemoryDir();
    
    try {
      const files = await fs.readdir(this.memoryDir);
      const mdFiles = files.filter(f => f.endsWith('.md'));
      
      const allRelations: Relation[] = [];
      
      for (const file of mdFiles) {
        const filePath = path.join(this.memoryDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const entityName = getEntityNameFromPath(filePath);
        if (!entityName) continue;
        
        const parsed = parseMarkdown(content, entityName);
        
        for (const rel of parsed.relations) {
          allRelations.push({
            from: entityName,
            to: rel.to,
            relationType: rel.relationType
          });
        }
      }
      
      return allRelations;
    } catch (error) {
      throw new Error(`Failed to load relations: ${error}`);
    }
  }

  /**
   * Save an entity to a markdown file
   */
  private async saveEntity(entity: Entity, relations: Relation[]): Promise<void> {
    await this.ensureMemoryDir();
    
    const filePath = getEntityPath(entity.name);
    const content = generateMarkdown(entity, relations);
    
    try {
      await fs.writeFile(filePath, content, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to save entity ${entity.name}: ${error}`);
    }
  }

  /**
   * Load the entire knowledge graph
   */
  async loadGraph(): Promise<KnowledgeGraph> {
    const [entities, relations] = await Promise.all([
      this.loadAllEntities(),
      this.loadAllRelations()
    ]);
    
    return { entities, relations };
  }

  /**
   * Create new entities in the knowledge graph
   * 
   * Creates markdown files for new entities and stores them in the memory directory.
   * Automatically checks for duplicates and skips entities that already exist.
   * Each entity is saved as a separate .md file with YAML frontmatter.
   * 
   * @param entities - Array of entities to create
   * @returns Promise with results array indicating which entities were created
   * 
   * @example
   * ```typescript
   * const results = await storage.createEntities([
   *   {
   *     name: "Sergio",
   *     entityType: "person",
   *     observations: ["Aspiring PE developer at Amazon"]
   *   },
   *   {
   *     name: "iOS Size Project",
   *     entityType: "project",
   *     observations: ["Reduce app binary size by 20MB"]
   *   }
   * ]);
   * // results: [
   * //   { name: "Sergio", created: true },
   * //   { name: "iOS Size Project", created: true }
   * // ]
   * ```
   * 
   * @throws {Error} If file system operations fail
   * 
   * @see addObservations to add more facts to existing entities
   */
  async createEntities(entities: Entity[]): Promise<{ name: string; created: boolean }[]> {
    const graph = await this.loadGraph();
    const results: { name: string; created: boolean }[] = [];
    
    for (const entity of entities) {
      // Check if entity already exists
      if (graph.entities.some(e => e.name === entity.name)) {
        results.push({ name: entity.name, created: false });
        continue;
      }
      
      // Save the entity
      await this.saveEntity(entity, []);
      results.push({ name: entity.name, created: true });
    }
    
    return results;
  }

  /**
   * Create typed relations between entities
   * 
   * Establishes connections between entities by updating the source entity's
   * markdown file. Relations are directional (from → to) and typed (e.g., "mentors").
   * Automatically checks for duplicates.
   * 
   * @param relations - Array of relations to create
   * @returns Promise with counts of created vs existing relations
   * 
   * @example
   * ```typescript
   * const result = await storage.createRelations([
   *   { from: "Doug Hains", to: "Sergio", relationType: "mentors" },
   *   { from: "Sergio", to: "iOS Size Project", relationType: "works-on" }
   * ]);
   * // result: { created: 2, alreadyExists: 0 }
   * ```
   * 
   * @throws {Error} If source entity doesn't exist
   * 
   * @see Entity for relation format
   */
  async createRelations(relations: Relation[]): Promise<{ created: number; alreadyExists: number }> {
    const graph = await this.loadGraph();
    let created = 0;
    let alreadyExists = 0;
    
    for (const relation of relations) {
      // Check if relation already exists
      const exists = graph.relations.some(r => 
        r.from === relation.from && 
        r.to === relation.to && 
        r.relationType === relation.relationType
      );
      
      if (exists) {
        alreadyExists++;
        continue;
      }
      
      // Update the source entity file
      const fromPath = getEntityPath(relation.from);
      try {
        const content = await fs.readFile(fromPath, 'utf-8');
        const updatedContent = addRelationToContent(content, relation);
        await fs.writeFile(fromPath, updatedContent, 'utf-8');
        
        created++;
      } catch (error) {
        if (error instanceof Error && 'code' in error && (error as any).code === 'ENOENT') {
          throw new Error(`Entity ${relation.from} not found`);
        }
        throw error;
      }
    }
    
    return { created, alreadyExists };
  }

  /**
   * Add new observations (facts) to existing entities
   * 
   * Appends new observations to entity markdown files. Automatically filters
   * out duplicates to avoid redundant information. Observations are re-indexed
   * for semantic search.
   * 
   * @param observations - Array of entities with observations to add
   * @returns Promise with counts of observations added per entity
   * 
   * @example
   * ```typescript
   * const results = await storage.addObservations([
   *   {
   *     entityName: "Sergio",
   *     contents: [
   *       "Completed iOS size optimization Q1 goal",
   *       "Started PE interview prep"
   *     ]
   *   }
   * ]);
   * // results: [{ entityName: "Sergio", added: 2 }]
   * ```
   * 
   * @throws {Error} If entity doesn't exist
   * 
   * @see createEntities to create new entities first
   */
  async addObservations(observations: { entityName: string; contents: string[] }[]): Promise<{ entityName: string; added: number }[]> {
    const results: { entityName: string; added: number }[] = [];
    
    for (const obs of observations) {
      const entityPath = getEntityPath(obs.entityName);
      
      try {
        // Load current entity
        const entity = await this.loadEntity(entityPath);
        if (!entity) {
          throw new Error(`Entity ${obs.entityName} not found`);
        }
        
        // Filter out duplicate observations
        const newObservations = obs.contents.filter(
          content => !entity.observations.includes(content)
        );
        
        if (newObservations.length > 0) {
          // Update entity
          entity.observations.push(...newObservations);
          
          // Get current relations for this entity
          const graph = await this.loadGraph();
          const entityRelations = graph.relations.filter(r => r.from === entity.name);
          
          // Save updated entity
          await this.saveEntity(entity, entityRelations);
          
          results.push({
            entityName: obs.entityName,
            added: newObservations.length
          });
        }
      } catch (error) {
        throw new Error(`Failed to add observations to ${obs.entityName}: ${error}`);
      }
    }
    
    return results;
  }

  /**
   * Delete entities and clean up relations
   * 
   * Removes entity markdown files and cleans up any relations pointing to
   * the deleted entities from other entities. This is a destructive operation.
   * 
   * @param entityNames - Array of entity names to delete
   * 
   * @example
   * ```typescript
   * await storage.deleteEntities(["Old Project", "Deprecated Tool"]);
   * ```
   * 
   * @throws {Error} If file operations fail
   */
  async deleteEntities(entityNames: string[]): Promise<void> {
    for (const name of entityNames) {
      const filePath = getEntityPath(name);
      
      try {
        await fs.unlink(filePath);
      } catch (error) {
        if (error instanceof Error && 'code' in error && (error as any).code !== 'ENOENT') {
          throw new Error(`Failed to delete entity ${name}: ${error}`);
        }
      }
    }
    
    // Remove relations pointing to deleted entities
    const remainingRelations = await this.loadAllRelations();
    const relationsToRemove = remainingRelations.filter(
      r => entityNames.includes(r.to)
    );
    
    for (const relation of relationsToRemove) {
      const fromPath = getEntityPath(relation.from);
      try {
        const content = await fs.readFile(fromPath, 'utf-8');
        const updatedContent = removeRelationFromContent(content, relation);
        await fs.writeFile(fromPath, updatedContent, 'utf-8');
      } catch (error) {
        // Entity might have been deleted
      }
    }
  }

  /**
   * Remove specific observations from entities
   * 
   * Deletes individual facts from entity markdown files. Must match
   * observation text exactly. Entity remains with other observations intact.
   * 
   * @param deletions - Array of entities with observations to remove
   * 
   * @example
   * ```typescript
   * await storage.deleteObservations([
   *   {
   *     entityName: "Sergio",
   *     observations: ["Outdated information from 2023"]
   *   }
   * ]);
   * ```
   * 
   * @throws {Error} If entity doesn't exist or observations don't match
   */
  async deleteObservations(deletions: { entityName: string; observations: string[] }[]): Promise<void> {
    for (const del of deletions) {
      const entityPath = getEntityPath(del.entityName);
      
      try {
        const entity = await this.loadEntity(entityPath);
        if (!entity) continue;
        
        // Remove specified observations
        entity.observations = entity.observations.filter(
          obs => !del.observations.includes(obs)
        );
        
        // Get current relations
        const graph = await this.loadGraph();
        const entityRelations = graph.relations.filter(r => r.from === entity.name);
        
        // Save updated entity
        await this.saveEntity(entity, entityRelations);
      } catch (error) {
        throw new Error(`Failed to delete observations from ${del.entityName}: ${error}`);
      }
    }
  }

  /**
   * Remove typed relations between entities
   * 
   * Deletes specific connections from entity markdown files. Must match
   * all three fields (from, to, relationType) exactly.
   * 
   * @param relations - Array of relations to delete
   * 
   * @example
   * ```typescript
   * await storage.deleteRelations([
   *   { from: "Sergio", to: "Old Project", relationType: "works-on" }
   * ]);
   * ```
   * 
   * @throws {Error} If entity doesn't exist
   */
  async deleteRelations(relations: Relation[]): Promise<void> {
    for (const relation of relations) {
      const fromPath = getEntityPath(relation.from);
      
      try {
        const content = await fs.readFile(fromPath, 'utf-8');
        const updatedContent = removeRelationFromContent(content, relation);
        await fs.writeFile(fromPath, updatedContent, 'utf-8');
      } catch (error) {
        if (error instanceof Error && 'code' in error && (error as any).code !== 'ENOENT') {
          throw new Error(`Failed to delete relation from ${relation.from}: ${error}`);
        }
      }
    }
  }

  /**
   * Load the complete knowledge graph
   * 
   * Reads all entities and relations from both vaults (if configured) and
   * returns the complete graph structure. Use sparingly on large vaults
   * as it loads everything into memory.
   * 
   * @returns Promise with all entities and relations
   * 
   * @example
   * ```typescript
   * const graph = await storage.readGraph();
   * console.log(`Total entities: ${graph.entities.length}`);
   * console.log(`Total relations: ${graph.relations.length}`);
   * ```
   * 
   * @see searchNodes for filtered, semantic-based retrieval
   * @see openNodes for retrieving specific entities by name
   */
  async readGraph(): Promise<KnowledgeGraph> {
    return this.loadGraph();
  }

  /**
   * Search nodes using RAG-powered semantic search
   * 
   * Uses Nomic Embed v1 (768-dim) embeddings for semantic similarity matching.
   * Supports multiple ranking strategies (relevance, recency, hybrid), date filtering,
   * and field selection for token-efficient responses. This is the primary search
   * method that powers the AI's memory recall.
   * 
   * @param query - Natural language search query
   * @param options - Search configuration options
   * @param options.maxResults - Maximum results to return (default: 10, range: 1-100)
   * @param options.includeFields - Fields to include: ["observations", "relations"] (default: both)
   * @param options.sortBy - Ranking strategy: "relevance" | "modified" | "created" | "relevance+recency" (default: "relevance")
   * @param options.dateFilter - Filter by date range with ISO date strings
   * @param options.minSimilarity - Similarity threshold 0.0-1.0 (default: 0.3)
   * 
   * @returns Promise with matching entities, relations, and search metadata
   * 
   * @example
   * ```typescript
   * // Simple semantic search
   * const results = await storage.searchNodes("PE developer goals");
   * console.log(results.entities[0].observations);
   * 
   * // Recent work notes with hybrid ranking
   * const recent = await storage.searchNodes("code review", {
   *   sortBy: "relevance+recency",
   *   dateFilter: { after: "2025-01-01" },
   *   maxResults: 5
   * });
   * 
   * // Token-efficient search (relations only)
   * const minimal = await storage.searchNodes("Doug Hains", {
   *   maxResults: 1,
   *   includeFields: ["relations"]
   * });
   * ```
   * 
   * @throws {Error} If embedding service is unavailable
   * @throws {Error} If database connection fails
   * 
   * @see VectorStorage.search for underlying RAG implementation
   * @see openNodes for exact name matching without semantic search
   */
  async searchNodes(query: string, options?: {
    maxResults?: number;
    includeFields?: string[];
    sortBy?: 'relevance' | 'modified' | 'created' | 'relevance+recency';
    dateFilter?: {
      after?: string;
      before?: string;
    };
    minSimilarity?: number;
  }): Promise<{
    entities: Entity[];
    relations: Relation[];
    metadata: {
      totalMatches: number;
      returnedCount: number;
      hasMore: boolean;
      query: string;
      maxResults: number;
      includedFields: string[];
      searchType: string;
      sortedBy?: string;
      minSimilarity?: number;
    };
  }> {
    // Handle old API: searchNodes(query, maxResults, includeFields)
    let maxResults: number;
    let includeFields: string[];
    let sortBy: 'relevance' | 'modified' | 'created' | 'relevance+recency' | undefined;
    let dateFilter: { after?: string; before?: string } | undefined;
    let minSimilarity: number | undefined;

    if (typeof options === 'number') {
      // Old API: searchNodes(query, maxResults, includeFields)
      maxResults = options;
      includeFields = arguments[2] || ["observations", "relations"];
      sortBy = undefined;
      dateFilter = undefined;
      minSimilarity = undefined;
    } else {
      // New API: searchNodes(query, options)
      maxResults = options?.maxResults || 10;
      includeFields = options?.includeFields || ["observations", "relations"];
      sortBy = options?.sortBy;
      dateFilter = options?.dateFilter;
      minSimilarity = options?.minSimilarity;
    }

    // Use VectorStorage for RAG search - returns top N by similarity
    const searchResults = await this.vectorStorage.search(query, {
      maxResults: maxResults,
      sortBy: sortBy || 'relevance',
      dateFilter
    });

    // Use chunk content directly from search results (don't reload files)
    const entities: Entity[] = [];
    
    for (const result of searchResults) {
      // Create entity from chunk content directly
      const entity: Entity = {
        name: result.entityName,
        entityType: result.entityType || 'unknown',
        observations: includeFields.includes("observations") ? [result.content] : []
      };
      
      // Add similarity score
      (entity as any).similarity = result.similarity;
      
      entities.push(entity);
    }
    
    // Get entity names
    const entityNames = new Set(entities.map(e => e.name));
    
    // Load relations only for matched entities (from memory dir only)
    let filteredRelations: Relation[] = [];
    if (includeFields.includes("relations")) {
      // Load relations from memory dir only (structured entities have relations)
      const allRelations = await this.loadAllRelations();
      filteredRelations = allRelations
        .filter(r => entityNames.has(r.from) || entityNames.has(r.to))
        .slice(0, maxResults);
    }

    return {
      entities: entities,
      relations: filteredRelations,
      metadata: {
        totalMatches: searchResults.length,
        returnedCount: entities.length,
        hasMore: searchResults.length > maxResults,
        query,
        maxResults,
        includedFields: includeFields,
        searchType: 'semantic',
        sortedBy: sortBy,
        minSimilarity
      }
    };
  }

  /**
   * Retrieve specific entities by exact name match
   * 
   * Loads full entity data and relations for the specified entity names.
   * Unlike searchNodes, this does exact name matching without semantic search.
   * Useful when you know exactly which entities you want.
   * 
   * @param names - Array of exact entity names to retrieve
   * @returns Promise with matched entities and their interconnecting relations
   * 
   * @example
   * ```typescript
   * const result = await storage.openNodes(["Sergio", "Doug Hains"]);
   * console.log(result.entities); // Full data for both entities
   * console.log(result.relations); // Relations between them
   * ```
   * 
   * @see searchNodes for semantic similarity-based search
   */
  async openNodes(names: string[]): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();
    
    // Filter entities
    const filteredEntities = graph.entities.filter(e => names.includes(e.name));
    
    // Get filtered entity names
    const filteredEntityNames = new Set(filteredEntities.map(e => e.name));
    
    // Filter relations
    const filteredRelations = graph.relations.filter(r => 
      filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to)
    );
    
    return {
      entities: filteredEntities,
      relations: filteredRelations
    };
  }

  /**
   * List entity names grouped by type (lightweight operation)
   * 
   * Returns just the names, canonical names, and aliases without loading
   * full entity data. Used by LLMs to check for existing entities before
   * creating duplicates and for smart name matching.
   * 
   * @param entityType - Optional filter by entity type (e.g., "person", "project")
   * @returns Promise with entities grouped by type
   * 
   * @example
   * ```typescript
   * // List all entities
   * const all = await storage.listEntityNames();
   * console.log(all.person); // All person entities
   * 
   * // Filter by type
   * const people = await storage.listEntityNames("person");
   * ```
   * 
   * @see createEntities which should check this first to avoid duplicates
   */
  async listEntityNames(entityType?: string): Promise<{
    [entityType: string]: Array<{
      name: string;
      canonicalName?: string;
      aliases?: string[];
    }>;
  }> {
    await this.ensureMemoryDir();
    
    try {
      // Get all markdown files from memory directory
      const files = await fs.readdir(this.memoryDir);
      const mdFiles = files.filter(f => f.endsWith('.md'));
      
      const grouped: {
        [entityType: string]: Array<{
          name: string;
          canonicalName?: string;
          aliases?: string[];
        }>;
      } = {};
      
      for (const file of mdFiles) {
        const filePath = path.join(this.memoryDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const entityName = getEntityNameFromPath(filePath);
        if (!entityName) continue;
        
        try {
          const parsed = parseMarkdown(content, entityName);
          const type = parsed.metadata.entityType || 'unknown';
          
          // Skip if filtering by type and doesn't match
          if (entityType && type !== entityType) {
            continue;
          }
          
          if (!grouped[type]) {
            grouped[type] = [];
          }
          
          grouped[type].push({
            name: entityName,
            canonicalName: parsed.metadata.canonicalName,
            aliases: parsed.metadata.aliases
          });
        } catch (error) {
          // Skip files with parse errors
          continue;
        }
      }
      
      return grouped;
    } catch (error) {
      throw new Error(`Failed to list entity names: ${error}`);
    }
  }
}
