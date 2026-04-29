/**
 * Example: Entity and Relation Management
 * 
 * Demonstrates CRUD operations on entities and relations.
 * 
 * Run with: tsx examples/entity-management.ts
 */

import { MarkdownStorageManager } from '../storage/MarkdownStorageManager.js';

async function main() {
  console.log('=== Entity Management Example ===\n');
  
  const storage = new MarkdownStorageManager();
  
  // 1. Check for existing entities (avoid duplicates)
  console.log('1. Checking for existing entities...');
  const existing = await storage.listEntityNames("test");
  console.log(`Found ${existing.test?.length || 0} test entities`);
  console.log('');
  
  // 2. Create new entities
  console.log('2. Creating team entities...');
  await storage.createEntities([
    {
      name: "Alice",
      entityType: "test",
      observations: ["Backend engineer", "Expert in PostgreSQL"]
    },
    {
      name: "Bob",
      entityType: "test",
      observations: ["Frontend engineer", "React specialist"]
    },
    {
      name: "Team Project X",
      entityType: "test",
      observations: ["Q1 2025 initiative", "Full-stack web app"]
    }
  ]);
  console.log('Created 3 entities');
  console.log('');
  
  // 3. Create relations
  console.log('3. Creating relations...');
  await storage.createRelations([
    { from: "Alice", to: "Team Project X", relationType: "works-on" },
    { from: "Bob", to: "Team Project X", relationType: "works-on" },
    { from: "Alice", to: "Bob", relationType: "collaborates-with" }
  ]);
  console.log('Created 3 relations');
  console.log('');
  
  // 4. Add progress observations
  console.log('4. Adding progress observations...');
  await storage.addObservations([
    {
      entityName: "Alice",
      contents: ["Completed database schema design"]
    },
    {
      entityName: "Bob",
      contents: ["Built responsive UI components"]
    }
  ]);
  console.log('Added observations');
  console.log('');
  
  // 5. Query the team
  console.log('5. Querying team structure...');
  const team = await storage.openNodes(["Alice", "Bob", "Team Project X"]);
  console.log(`Entities: ${team.entities.length}`);
  console.log(`Relations: ${team.relations.length}`);
  console.log('');
  
  // 6. Cleanup
  console.log('6. Cleanup...');
  await storage.deleteEntities(["Alice", "Bob", "Team Project X"]);
  console.log('Deleted test entities');
  
  console.log('\n=== Example Complete ===');
}

main().catch(console.error);
