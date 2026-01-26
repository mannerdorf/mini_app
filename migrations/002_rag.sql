-- RAG tables + pgvector

create extension if not exists vector;

create table if not exists rag_documents (
  id bigserial primary key,
  source_type text not null,
  source_id text not null,
  title text,
  content text not null,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, source_id)
);

create table if not exists rag_chunks (
  id bigserial primary key,
  document_id bigint not null references rag_documents(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding vector(1536) not null,
  tokens int,
  created_at timestamptz not null default now()
);

create index if not exists rag_chunks_document_id_idx
  on rag_chunks(document_id);

create index if not exists rag_chunks_embedding_idx
  on rag_chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);
