/**
 * Represents an entity in the knowledge graph
 * 
 * Entities are the fundamental building blocks of the knowledge graph,
 * representing people, projects, concepts, or any other named item
 * with associated observations (facts/notes about the entity).
 * 
 * @example
 * ```typescript
 * const person: Entity = {
 *   name: "Sergio",
 *   entityType: "person",
 *   observations: [
 *     "Aspiring PE developer at Amazon",
 *     "Working on iOS size optimization"
 *   ]
 * };
 * ```
 */
export interface Entity {
  /** 
   * Unique identifier for the entity
   * 
   * Used as the primary key and becomes the filename when stored
   * as markdown (sanitized). Example: "Sergio", "iOS Size Project"
   */
  name: string;
  
  /** 
   * Category or type of entity
   * 
   * Common types: "person", "project", "concept", "tool", "organization"
   * Used for grouping and filtering entities
   */
  entityType: string;
  
  /** 
   * Array of facts or notes about the entity
   * 
   * Each observation is a discrete piece of information stored as
   * a single string. Observations are indexed for semantic search.
   * 
   * @example
   * ```typescript
   * observations: [
   *   "Senior PE at Amazon",
   *   "Expert in systems design",
   *   "Mentors junior developers"
   * ]
   * ```
   */
  observations: string[];
}

/**
 * Represents a directed, typed relationship between two entities
 * 
 * Relations connect entities in the knowledge graph with semantic meaning.
 * They are always directional (from → to) and typed (e.g., "mentors", "works-on").
 * 
 * @example
 * ```typescript
 * const mentorRelation: Relation = {
 *   from: "Doug Hains",
 *   to: "Sergio",
 *   relationType: "mentors"
 * };
 * ```
 */
export interface Relation {
  /** 
   * Source entity name
   * 
   * The entity where the relation starts. Must match an existing
   * entity's name exactly.
   */
  from: string;
  
  /** 
   * Target entity name
   * 
   * The entity where the relation ends. Must match an existing
   * entity's name exactly.
   */
  to: string;
  
  /** 
   * Type of relationship in active voice
   * 
   * Describes the nature of the connection from source to target.
   * Should be in active voice for clarity (e.g., "mentors" not "is-mentored-by").
   * Common types: "mentors", "works-on", "reports-to", "uses", "created-by"
   * 
   * @example
   * ```typescript
   * relationType: "mentors"  // Doug mentors Sergio
   * relationType: "works-on" // Sergio works-on Project
   * ```
   */
  relationType: string;
  
  /** 
   * Optional category for grouping similar relation types
   * 
   * Used for organizing and filtering relations. Automatically inferred
   * from relationType if not provided.
   * 
   * @example
   * ```typescript
   * category: "professional"  // For work-related relations
   * category: "technical"     // For technical dependencies
   * ```
   */
  category?: string;
}

/**
 * Complete knowledge graph containing all entities and their relations
 * 
 * Represents the full state of the knowledge base at a point in time.
 * Used for loading, saving, and querying the entire graph structure.
 * 
 * @example
 * ```typescript
 * const graph: KnowledgeGraph = {
 *   entities: [
 *     { name: "Sergio", entityType: "person", observations: [...] },
 *     { name: "PE Developer", entityType: "role", observations: [...] }
 *   ],
 *   relations: [
 *     { from: "Sergio", to: "PE Developer", relationType: "aspires-to" }
 *   ]
 * };
 * ```
 */
export interface KnowledgeGraph {
  /** 
   * All entities in the knowledge graph
   * 
   * Complete list of entities with their observations. May be filtered
   * based on search criteria or query parameters.
   */
  entities: Entity[];
  
  /** 
   * All relations between entities
   * 
   * Complete list of typed connections between entities. Filtered to
   * only include relations where both source and target entities exist
   * in the entities array.
   */
  relations: Relation[];
}
