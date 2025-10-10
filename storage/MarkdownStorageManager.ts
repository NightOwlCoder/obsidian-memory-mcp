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

export class MarkdownStorageManager {
  private memoryDir: string;
  private vectorStorage: VectorStorage;

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
   * Create new entities
   */
  async createEntities(entities: Entity[]): Promise<Entity[]> {
    const graph = await this.loadGraph();
    const newEntities: Entity[] = [];
    
    for (const entity of entities) {
      // Check if entity already exists
      if (graph.entities.some(e => e.name === entity.name)) {
        continue;
      }
      
      // Save the entity
      await this.saveEntity(entity, []);
      newEntities.push(entity);
    }
    
    return newEntities;
  }

  /**
   * Create new relations and update both source and target files
   */
  async createRelations(relations: Relation[]): Promise<Relation[]> {
    const graph = await this.loadGraph();
    const newRelations: Relation[] = [];
    
    for (const relation of relations) {
      // Check if relation already exists
      const exists = graph.relations.some(r => 
        r.from === relation.from && 
        r.to === relation.to && 
        r.relationType === relation.relationType
      );
      
      if (exists) continue;
      
      // Update the source entity file
      const fromPath = getEntityPath(relation.from);
      try {
        const content = await fs.readFile(fromPath, 'utf-8');
        const updatedContent = addRelationToContent(content, relation);
        await fs.writeFile(fromPath, updatedContent, 'utf-8');
        
        newRelations.push(relation);
      } catch (error) {
        if (error instanceof Error && 'code' in error && (error as any).code === 'ENOENT') {
          throw new Error(`Entity ${relation.from} not found`);
        }
        throw error;
      }
    }
    
    return newRelations;
  }

  /**
   * Add observations to existing entities
   */
  async addObservations(observations: { entityName: string; contents: string[] }[]): Promise<{ entityName: string; addedObservations: string[] }[]> {
    const results: { entityName: string; addedObservations: string[] }[] = [];
    
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
            addedObservations: newObservations
          });
        }
      } catch (error) {
        throw new Error(`Failed to add observations to ${obs.entityName}: ${error}`);
      }
    }
    
    return results;
  }

  /**
   * Delete entities and their files
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
   * Delete specific observations from entities
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
   * Delete relations
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
   * Read the entire graph
   */
  async readGraph(): Promise<KnowledgeGraph> {
    return this.loadGraph();
  }

  /**
   * Search nodes using RAG-powered semantic search
   * Supports: semantic similarity, multiple sort strategies, date filtering
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
   * Open specific nodes by name
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
}
