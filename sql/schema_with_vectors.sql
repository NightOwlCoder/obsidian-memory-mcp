-- Obsidian RAG Memory Schema
-- PostgreSQL 17.6 + PGVector 0.8.1

-- Drop existing tables if they exist
DROP TABLE IF EXISTS vector_chunks CASCADE;

-- Main vector storage table
CREATE TABLE vector_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Entity identification
  entity_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  
  -- Content and embedding
  content TEXT NOT NULL,
  embedding vector(768) NOT NULL,
  
  -- Metadata for filtering/sorting
  created_at TIMESTAMP DEFAULT NOW(),
  modified_at TIMESTAMP DEFAULT NOW(),
  entity_type TEXT,
  tags TEXT[],
  
  -- Chunking metadata
  chunk_index INTEGER DEFAULT 0,
  chunk_total INTEGER DEFAULT 1,
  
  -- Graph connections (denormalized for speed)
  outgoing_relations JSONB,
  incoming_relations JSONB,
  
  -- Constraints
  CONSTRAINT unique_entity_file_chunk UNIQUE(entity_name, file_path, chunk_index)
);

-- Indexes for performance

-- Vector similarity search (IVFFlat index)
CREATE INDEX idx_vector_embedding ON vector_chunks 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Timestamp indexes for recency sorting
CREATE INDEX idx_modified_at ON vector_chunks (modified_at DESC);
CREATE INDEX idx_created_at ON vector_chunks (created_at DESC);

-- Entity lookup
CREATE INDEX idx_entity_name ON vector_chunks (entity_name);
CREATE INDEX idx_entity_type ON vector_chunks (entity_type);

-- Tag search (GIN index for array operations)
CREATE INDEX idx_tags ON vector_chunks USING GIN (tags);

-- File path lookup
CREATE INDEX idx_file_path ON vector_chunks (file_path);

-- Comments
COMMENT ON TABLE vector_chunks IS 'Stores entity content with Nomic Embed v1 embeddings for semantic search';
COMMENT ON COLUMN vector_chunks.embedding IS '768-dimensional Nomic Embed v1 embedding vector';
COMMENT ON COLUMN vector_chunks.outgoing_relations IS 'Relations where this entity is the source (from)';
COMMENT ON COLUMN vector_chunks.incoming_relations IS 'Relations where this entity is the target (to)';

-- Grant permissions (adjust if using specific user)
-- GRANT ALL PRIVILEGES ON TABLE vector_chunks TO your_user;

-- Verify installation
DO $$
BEGIN
  RAISE NOTICE 'Schema created successfully!';
  RAISE NOTICE 'PGVector version: %', (SELECT extversion FROM pg_extension WHERE extname = 'vector');
  RAISE NOTICE 'Tables created: %', (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public');
END $$;
