#!/usr/bin/env node
/**
 * Display statistics about the vector database
 * Usage: tsx scripts/stats.ts
 */

import { VectorStorage } from '../storage/VectorStorage.js';
import { Pool } from 'pg';

async function displayStats() {
  console.log('\n📊 Obsidian Memory Vector Database Stats\n');
  
  const vectorStorage = new VectorStorage();
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://localhost:5432/obsidian_memory';
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    // Get basic stats from VectorStorage
    const stats = await vectorStorage.getStats();
    
    console.log('📦 Storage:');
    console.log(`   Total entities: ${stats.totalEntities}`);
    console.log(`   Database size: ${stats.totalSize}`);
    console.log(`   Oldest entity: ${stats.oldestEntity ? stats.oldestEntity.toISOString() : 'N/A'}`);
    console.log(`   Newest entity: ${stats.newestEntity ? stats.newestEntity.toISOString() : 'N/A'}`);
    
    // Get entity type breakdown
    const typeQuery = `
      SELECT entity_type, COUNT(*) as count
      FROM vector_chunks
      GROUP BY entity_type
      ORDER BY count DESC
    `;
    const typeResult = await pool.query(typeQuery);
    
    if (typeResult.rows.length > 0) {
      console.log('\n📋 Entity Types:');
      typeResult.rows.forEach(row => {
        console.log(`   ${row.entity_type || 'unknown'}: ${row.count}`);
      });
    }

    // Get recent activity
    const recentQuery = `
      SELECT entity_name, entity_type, modified_at
      FROM vector_chunks
      ORDER BY modified_at DESC
      LIMIT 10
    `;
    const recentResult = await pool.query(recentQuery);
    
    if (recentResult.rows.length > 0) {
      console.log('\n🕒 Recently Modified:');
      recentResult.rows.forEach(row => {
        const modifiedDate = new Date(row.modified_at);
        const ago = Math.floor((Date.now() - modifiedDate.getTime()) / 1000 / 60); // minutes ago
        console.log(`   ${row.entity_name} (${row.entity_type}) - ${ago}m ago`);
      });
    }

    // Database connection info
    console.log('\n🔌 Database:');
    console.log(`   Connection: ${databaseUrl.replace(/:[^:]*@/, ':****@')}`); // Hide password
    console.log(`   Status: ✅ Connected`);

  } catch (error) {
    console.error('\n❌ Error:', error);
  } finally {
    await vectorStorage.close();
    await pool.end();
  }

  console.log('\n');
}

displayStats().catch(console.error);
