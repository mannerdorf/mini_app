import OpenAI from "openai";
import { getPool } from "../api/_db.js";

const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_MAX_CHARS = 1200;
const DEFAULT_OVERLAP_CHARS = 120;

export type RagDocumentInput = {
  sourceType: string;
  sourceId: string;
  title?: string | null;
  content: string;
  metadata?: Record<string, unknown> | null;
};

export type RagSearchResult = {
  content: string;
  sourceType: string;
  sourceId: string;
  title: string | null;
  metadata: Record<string, unknown> | null;
  score: number;
};

function normalizeWhitespace(text: string) {
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

function toVectorLiteral(embedding: number[]) {
  return `[${embedding.join(",")}]`;
}

export function chunkText(
  input: string,
  options?: { maxChars?: number; overlapChars?: number },
) {
  const maxChars = options?.maxChars ?? DEFAULT_MAX_CHARS;
  const overlapChars = options?.overlapChars ?? DEFAULT_OVERLAP_CHARS;
  const text = normalizeWhitespace(input);
  if (!text) return [];

  const chunks: string[] = [];
  let current = "";

  const pushChunk = (value: string) => {
    const trimmed = value.trim();
    if (trimmed) chunks.push(trimmed);
  };

  const carryOverlap = (value: string) => {
    if (!overlapChars) return "";
    return value.slice(Math.max(0, value.length - overlapChars));
  };

  const paragraphs = text.split(/\n{2,}/);
  for (const paragraph of paragraphs) {
    if (!paragraph) continue;
    if (paragraph.length <= maxChars) {
      if ((current + "\n\n" + paragraph).trim().length <= maxChars) {
        current = current ? `${current}\n\n${paragraph}` : paragraph;
        continue;
      }
      if (current) {
        pushChunk(current);
        current = carryOverlap(current);
      }
      current = current ? `${current} ${paragraph}` : paragraph;
      continue;
    }

    if (current) {
      pushChunk(current);
      current = carryOverlap(current);
    }

    const sentences = paragraph.split(/(?<=[.!?])\s+/);
    for (const sentence of sentences) {
      if (!sentence) continue;
      if (sentence.length > maxChars) {
        for (let i = 0; i < sentence.length; i += maxChars) {
          const slice = sentence.slice(i, i + maxChars);
          if (current) {
            pushChunk(current);
            current = carryOverlap(current);
          }
          current = current ? `${current} ${slice}` : slice;
        }
        continue;
      }

      if ((current + " " + sentence).trim().length <= maxChars) {
        current = current ? `${current} ${sentence}` : sentence;
      } else {
        pushChunk(current);
        current = carryOverlap(current);
        current = current ? `${current} ${sentence}` : sentence;
      }
    }
  }

  if (current) pushChunk(current);
  return chunks;
}

export async function embedTexts(texts: string[]) {
  if (texts.length === 0) return [];
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const client = new OpenAI({ apiKey });
  const model = process.env.RAG_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
  const response = await client.embeddings.create({
    model,
    input: texts,
  });

  return response.data.map((item) => item.embedding);
}

export async function upsertDocument(input: RagDocumentInput) {
  const pool = getPool();
  const result = await pool.query<{ id: number }>(
    `insert into rag_documents (source_type, source_id, title, content, metadata, updated_at)
     values ($1, $2, $3, $4, $5, now())
     on conflict (source_type, source_id) do update
       set title = excluded.title,
           content = excluded.content,
           metadata = excluded.metadata,
           updated_at = now()
     returning id`,
    [
      input.sourceType,
      input.sourceId,
      input.title ?? null,
      input.content,
      input.metadata ?? null,
    ],
  );

  const documentId = result.rows[0]?.id;
  if (!documentId) {
    throw new Error("Failed to upsert rag document");
  }

  await pool.query(`delete from rag_chunks where document_id = $1`, [documentId]);

  const chunks = chunkText(input.content);
  if (chunks.length === 0) return { documentId, chunks: 0 };

  const embeddings = await embedTexts(chunks);
  const values: Array<string | number | null> = [];
  const rows = chunks.map((chunk, index) => {
    const offset = index * 5;
    values.push(
      documentId,
      index,
      chunk,
      toVectorLiteral(embeddings[index]),
      estimateTokens(chunk),
    );
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}::vector, $${offset + 5})`;
  });

  await pool.query(
    `insert into rag_chunks (document_id, chunk_index, content, embedding, tokens)
     values ${rows.join(", ")}`,
    values,
  );

  return { documentId, chunks: chunks.length };
}

export async function searchSimilar(
  query: string,
  options?: { topK?: number; minScore?: number; sourceTypes?: string[] },
) {
  const pool = getPool();
  const topK = options?.topK ?? Number(process.env.RAG_TOP_K || 5);
  const minScore = options?.minScore ?? Number(process.env.RAG_MIN_SCORE || 0);

  const [embedding] = await embedTexts([query]);
  const vector = toVectorLiteral(embedding);

  const params: Array<string | number | string[]> = [vector, topK];
  let whereClause = "";

  if (options?.sourceTypes && options.sourceTypes.length > 0) {
    params.push(options.sourceTypes);
    whereClause = `where d.source_type = any($${params.length})`;
  }

  const result = await pool.query<RagSearchResult>(
    `select
       c.content,
       d.source_type as "sourceType",
       d.source_id as "sourceId",
       d.title,
       d.metadata,
       1 - (c.embedding <=> $1::vector) as score
     from rag_chunks c
     join rag_documents d on d.id = c.document_id
     ${whereClause}
     order by c.embedding <=> $1::vector
     limit $2`,
    params,
  );

  const rows = result.rows ?? [];
  return rows.filter((row) => row.score >= minScore);
}
