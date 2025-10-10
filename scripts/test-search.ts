#!/usr/bin/env tsx
/**
 * Test vector search directly
 */

import { VectorStorage } from '../storage/VectorStorage.js';

async function main() {
  const storage = new VectorStorage();
  
  try {
    console.log('\n🔍 Testing vector search...\n');
    
    // Test 1: PE developer query
    console.log('Query: "Sergio PE developer"');
    const results1 = await storage.search('Sergio PE developer', { maxResults: 5 });
    
    console.log(`\nFound ${results1.length} results:\n`);
    for (const result of results1) {
      console.log(`  ${result.entityName} (${result.entityType})`);
      console.log(`  Similarity: ${result.similarity.toFixed(3)}`);
      console.log(`  Content: ${result.content.substring(0, 80)}...`);
      console.log('');
    }
    
    // Test 2: Principal Engineer query
    console.log('\n---\nQuery: "Principal Engineer"\n');
    const results2 = await storage.search('Principal Engineer', { maxResults: 5 });
    
    console.log(`Found ${results2.length} results:\n`);
    for (const result of results2) {
      console.log(`  ${result.entityName} (${result.entityType})`);
      console.log(`  Similarity: ${result.similarity.toFixed(3)}`);
      console.log(`  Content: ${result.content.substring(0, 80)}...`);
      console.log('');
    }
    
  } finally {
    await storage.close();
  }
}

main().catch(console.error);
