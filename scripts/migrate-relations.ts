#!/usr/bin/env tsx
/**
 * Migrate existing relations:
 * 1. Normalize relation types to snake_case
 * 2. Remove temporal prefixes (is_, -ing forms)
 * 3. Infer categories for existing relations
 * 4. Deduplicate identical relations
 * 5. Update all memory markdown files
 */

import { promises as fs } from 'fs';
import path from 'path';

// Category inference rules
const CATEGORY_RULES = {
  family: /^(has_son|has_daughter|married_to|parent_of|sibling_of|child_of)$/i,
  work: /^(works_at|manages|initiative_of|manages_skip_level)$/i,
  project: /^(works_on|leads|develops|created|creates|builds|maintains_project)$/i,
  collaboration: /^(collaborates_with|provides_guidance|provides_apis_for|mentors|guided_by)$/i,
  personal: /^(has_preference|old_friend_of|friend_of|knows)$/i,
  habits: /^(maintains|practices|follows)$/i,
};

interface Relation {
  type: string;
  target: string;
  category?: string;
}

function normalizeRelationType(relationType: string): string {
  let normalized = relationType
    .toLowerCase()
    .trim()
    // Replace spaces and hyphens with underscores first
    .replace(/[\s-]/g, '_')
    // Collapse multiple underscores
    .replace(/_+/g, '_');
  
  // Remove temporal prefixes (is_, was_)
  normalized = normalized.replace(/^is_/, '').replace(/^was_/, '');
  
  // Remove -ing suffix (working → work, collaborating → collaborat)
  normalized = normalized.replace(/ing(_|$)/, '$1');
  
  // Fix specific patterns
  normalized = normalized
    .replace(/^work_on/, 'works_on')
    .replace(/^lead_/, 'leads_')
    .replace(/^maintain_/, 'maintains_')
    .replace(/^create_/, 'creates_')
    .replace(/^develop_/, 'develops_')
    .replace(/^collaborat_with/, 'collaborates_with')
    .replace(/^provide_/, 'provides_');
  
  // Normalize synonym patterns (different phrasings of same concept)
  // All guidance patterns → provides_guidance
  if (normalized.match(/provides.*guidance/)) {
    normalized = 'provides_guidance';
  }
  
  // Remove trailing underscores
  return normalized.replace(/_$/, '');
}

function inferCategory(relationType: string): string {
  const normalized = normalizeRelationType(relationType);
  
  for (const [category, regex] of Object.entries(CATEGORY_RULES)) {
    if (regex.test(normalized)) {
      return category;
    }
  }
  
  return 'other';
}

function parseRelations(content: string): { relations: Relation[], beforeRelations: string, afterRelations: string } {
  // Find Relations section index
  const relationsStartMatch = content.match(/^## Relations\s*$/m);
  
  if (!relationsStartMatch || relationsStartMatch.index === undefined) {
    return { relations: [], beforeRelations: content, afterRelations: '' };
  }
  
  const startIndex = relationsStartMatch.index + relationsStartMatch[0].length;
  
  // Find next ## heading (but not Relations itself)
  const remainingContent = content.substring(startIndex);
  const nextSectionMatch = remainingContent.match(/\n## (?!Relations)/);
  
  let relationsContent: string;
  let afterRelations: string;
  
  if (nextSectionMatch && nextSectionMatch.index !== undefined) {
    // Relations section ends at next heading
    relationsContent = remainingContent.substring(0, nextSectionMatch.index);
    afterRelations = remainingContent.substring(nextSectionMatch.index);
  } else {
    // Relations section goes to end of file
    relationsContent = remainingContent;
    afterRelations = '';
  }
  
  const beforeRelations = content.substring(0, relationsStartMatch.index);
  
  const relations: Relation[] = [];
  
  // Split by lines and find all relation entries (including across blank lines)
  const lines = relationsContent.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('-')) continue;
    
    // Parse: - `relation_type`: [[Target]]
    const match = line.match(/^-\s*`([^`]+)`(?:\s*\([^)]+\))?:\s*\[\[([^\]]+)\]\]/);
    if (match) {
      const [, type, target] = match;
      const normalized = normalizeRelationType(type);
      const category = inferCategory(normalized);
      relations.push({ type: normalized, target: target.trim(), category });
    }
  }
  
  return { relations, beforeRelations, afterRelations };
}

function deduplicateRelations(relations: Relation[]): Relation[] {
  const seen = new Set<string>();
  const deduplicated: Relation[] = [];
  
  for (const rel of relations) {
    const key = `${rel.type}:${rel.target}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(rel);
    }
  }
  
  return deduplicated;
}

function generateRelationsSection(relations: Relation[]): string {
  if (relations.length === 0) {
    return '';
  }
  
  const lines = relations.map(rel => 
    `- \`${rel.type}\` (${rel.category}): [[${rel.target}]]`
  );
  
  return `## Relations\n${lines.join('\n')}\n`;
}

async function migrateFile(filePath: string): Promise<{ updated: boolean, changes: string[] }> {
  const content = await fs.readFile(filePath, 'utf-8');
  const { relations, beforeRelations, afterRelations } = parseRelations(content);
  
  if (relations.length === 0) {
    return { updated: false, changes: [] };
  }
  
  const changes: string[] = [];
  
  // Deduplicate
  const originalCount = relations.length;
  const deduplicated = deduplicateRelations(relations);
  if (deduplicated.length < originalCount) {
    changes.push(`Removed ${originalCount - deduplicated.length} duplicate relations`);
  }
  
  // Track normalization changes
  const beforeNormalization = new Set(relations.map(r => r.type));
  const afterNormalization = new Set(deduplicated.map(r => r.type));
  
  for (const before of beforeNormalization) {
    const after = normalizeRelationType(before);
    if (before !== after) {
      changes.push(`Normalized: "${before}" → "${after}"`);
    }
  }
  
  // Add categories
  changes.push(`Added categories to ${deduplicated.length} relations`);
  
  // Generate new content
  const newRelationsSection = generateRelationsSection(deduplicated);
  const newContent = beforeRelations + newRelationsSection + afterRelations;
  
  // Write back
  await fs.writeFile(filePath, newContent, 'utf-8');
  
  return { updated: true, changes };
}

async function main() {
  const memoryDir = process.env.VAULT_PERSONAL 
    ? path.join(process.env.VAULT_PERSONAL, 'memory')
    : '/Users/sibagy/fileZ/obsidian/pessoAll/memory';
  
  console.log(`\n🔄 Migrating relations in: ${memoryDir}\n`);
  
  // Get all markdown files
  const files = await fs.readdir(memoryDir);
  const mdFiles = files.filter(f => f.endsWith('.md'));
  
  let totalUpdated = 0;
  let totalSkipped = 0;
  
  for (const file of mdFiles) {
    const filePath = path.join(memoryDir, file);
    
    try {
      const { updated, changes } = await migrateFile(filePath);
      
      if (updated) {
        console.log(`✅ ${file}`);
        changes.forEach(change => console.log(`   - ${change}`));
        totalUpdated++;
      } else {
        console.log(`⏭️  ${file} (no relations)`);
        totalSkipped++;
      }
    } catch (error) {
      console.error(`❌ ${file}: ${error}`);
    }
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`   Updated: ${totalUpdated} files`);
  console.log(`   Skipped: ${totalSkipped} files`);
  console.log(`\n✅ Migration complete!\n`);
}

main().catch(console.error);
