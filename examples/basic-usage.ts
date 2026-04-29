/**
 * Example: Basic Usage
 * 
 * Demonstrates the core operations: creating entities, adding observations,
 * and performing semantic search.
 * 
 * Run with: tsx examples/basic-usage.ts
 */

import { MarkdownStorageManager } from '../storage/MarkdownStorageManager.js';

async function main() {
  console.log('=== Obsidian Memory MCP - Basic Usage Example ===\n');
  
  const storage = new MarkdownStorageManager();
  
  // Step 1: Create entities
  console.log('1. Creating entities...');
  const createResult = await storage.createEntities([
    {
      name: "Example Person",
      entityType: "person",
      observations: [
        "Software engineer at ExampleCorp",
        "Expert in TypeScript and Node.js",
        "Passionate about RAG systems"
      ]
    },
    {
      name: "Example Project",
      entityType: "project",
      observations: [
        "Building a knowledge management system",
        "Uses PostgreSQL and PGVector",
        "Target completion: Q2 2025"
      ]
    }
  ]);
  
  console.log('Created:', createResult);
  console.log('');
  
  // Step 2: Create relation
  console.log('2. Creating relation...');
  const relationResult = await storage.createRelations([
    {
      from: "Example Person",
      to: "Example Project",
      relationType: "works-on"
    }
  ]);
  
  console.log('Relation created:', relationResult);
  console.log('');
  
  // Step 3: Add more observations
  console.log('3. Adding observations...');
  const observationResult = await storage.addObservations([
    {
      entityName: "Example Person",
      contents: [
        "Recently completed RAG implementation",
        "Mentoring junior developers"
      ]
    }
  ]);
  
  console.log('Added observations:', observationResult);
  console.log('');
  
  // Step 4: Semantic search
  console.log('4. Performing semantic search...');
  const searchResult = await storage.searchNodes("software engineering", {
    maxResults: 5,
    sortBy: "relevance"
  });
  
  console.log(`Found ${searchResult.entities.length} matches:`);
  for (const entity of searchResult.entities) {
    console.log(`- ${entity.name} (${entity.entityType})`);
    console.log(`  Similarity: ${(entity as any).similarity?.toFixed(2)}`);
    console.log(`  Observations: ${entity.observations.length}`);
  }
  console.log('');
  
  // Step 5: Open specific node
  console.log('5. Opening specific node...');
  const nodeResult = await storage.openNodes(["Example Person"]);
  
  console.log('Entity details:');
  console.log(JSON.stringify(nodeResult.entities[0], null, 2));
  console.log('');
  
  // Step 6: List all entities by type
  console.log('6. Listing entities by type...');
  const allNames = await storage.listEntityNames();
  
  for (const [type, entities] of Object.entries(allNames)) {
    console.log(`${type}: ${entities.length} entities`);
  }
  console.log('');
  
  // Cleanup
  console.log('7. Cleanup (optional)...');
  await storage.deleteEntities(["Example Person", "Example Project"]);
  console.log('Cleanup complete!');
  
  console.log('\n=== Example Complete ===');
  console.log('Next: Try examples/semantic-search.ts');
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
