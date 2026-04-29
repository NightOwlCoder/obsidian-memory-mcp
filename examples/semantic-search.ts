/**
 * Example: Semantic Search Patterns
 * 
 * Demonstrates various semantic search strategies including:
 * - Different similarity thresholds
 * - Ranking strategies (relevance, recency, hybrid)
 * - Date filtering
 * - Token optimization with field selection
 * 
 * Run with: tsx examples/semantic-search.ts
 */

import { MarkdownStorageManager } from '../storage/MarkdownStorageManager.js';

async function main() {
  console.log('=== Semantic Search Patterns ===\n');
  
  const storage = new MarkdownStorageManager();
  
  // Pattern 1: Simple semantic search
  console.log('Pattern 1: Simple Semantic Search');
  console.log('Query: "artificial intelligence"');
  const simple = await storage.searchNodes("artificial intelligence", {
    maxResults: 3
  });
  console.log(`Results: ${simple.entities.length} matches`);
  simple.entities.forEach(e => {
    console.log(`  - ${e.name}: ${(e as any).similarity.toFixed(3)}`);
  });
  console.log('');
  
  // Pattern 2: High-precision search
  console.log('Pattern 2: High-Precision Search (minSimilarity: 0.7)');
  console.log('Query: "career development"');
  const precise = await storage.searchNodes("career development", {
    minSimilarity: 0.7,  // Only very similar results
    maxResults: 5
  });
  console.log(`Results: ${precise.entities.length} matches (stricter threshold)`);
  console.log('');
  
  // Pattern 3: Broad exploration
  console.log('Pattern 3: Broad Exploration (minSimilarity: 0.2)');
  console.log('Query: "technology"');
  const broad = await storage.searchNodes("technology", {
    minSimilarity: 0.2,  // Cast wide net
    maxResults: 10
  });
  console.log(`Results: ${broad.entities.length} matches (looser threshold)`);
  console.log('');
  
  // Pattern 4: Recent work notes
  console.log('Pattern 4: Recent Work (sortBy: modified)');
  console.log('Query: "project status"');
  const recent = await storage.searchNodes("project status", {
    sortBy: "modified",
    dateFilter: { after: "2025-01-01" },
    maxResults: 5
  });
  console.log(`Results: ${recent.entities.length} recent matches`);
  if (recent.entities.length > 0) {
    const entity = recent.entities[0];
    console.log(`  Most recent: ${entity.name}`);
  }
  console.log('');
  
  // Pattern 5: Hybrid ranking (relevance + recency)
  console.log('Pattern 5: Hybrid Ranking (70% relevance + 30% recency)');
  console.log('Query: "meetings"');
  const hybrid = await storage.searchNodes("meetings", {
    sortBy: "relevance+recency",
    maxResults: 5
  });
  console.log(`Results: ${hybrid.entities.length} balanced matches`);
  console.log('');
  
  // Pattern 6: Token-efficient search (relations only)
  console.log('Pattern 6: Token-Efficient (relations only)');
  console.log('Query: "Sergio"');
  const minimal = await storage.searchNodes("Sergio", {
    maxResults: 1,
    includeFields: ["relations"]  // Skip observations
  });
  console.log(`Results: ${minimal.entities.length} match`);
  console.log(`Relations: ${minimal.relations.length} found`);
  if (minimal.relations.length > 0) {
    console.log('Sample relations:');
    minimal.relations.slice(0, 3).forEach(r => {
      console.log(`  - ${r.from} ${r.relationType} ${r.to}`);
    });
  }
  console.log('');
  
  // Pattern 7: Date range filtering
  console.log('Pattern 7: Date Range Filter');
  console.log('Query: "updates" (last 30 days)');
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const dateFiltered = await storage.searchNodes("updates", {
    dateFilter: {
      after: thirtyDaysAgo.toISOString().split('T')[0]
    },
    maxResults: 5
  });
  console.log(`Results: ${dateFiltered.entities.length} recent matches`);
  console.log('');
  
  // Pattern 8: Metadata inspection
  console.log('Pattern 8: Search Metadata');
  console.log('Query: "example"');
  const metadata = await storage.searchNodes("example", {
    maxResults: 10
  });
  
  console.log('Search metadata:');
  console.log(`  - Total matches: ${metadata.metadata.totalMatches}`);
  console.log(`  - Returned: ${metadata.metadata.returnedCount}`);
  console.log(`  - Has more: ${metadata.metadata.hasMore}`);
  console.log(`  - Search type: ${metadata.metadata.searchType}`);
  console.log(`  - Sorted by: ${metadata.metadata.sortedBy}`);
  console.log('');
  
  console.log('=== All Patterns Demonstrated ===');
  console.log('\nKey Takeaways:');
  console.log('- Use minSimilarity to control precision vs recall');
  console.log('- sortBy affects both speed and result relevance');
  console.log('- includeFields reduces token usage significantly');
  console.log('- Date filters speed up searches on recent data');
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
