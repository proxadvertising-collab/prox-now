import { MetaTruncated } from "../ai/meta";
import { MAX_IMAGES_PER_CALL } from "./limits";

export type ChunkReport = {
  images: number;
  latencyMs: number;
};

export type Chunked<T> = {
  rows: T[];
  calls: number;
  chunks: ChunkReport[];
};

export function chunkItems<T>(items: readonly T[], limit = MAX_IMAGES_PER_CALL): T[][] {
  const size = Math.max(1, Math.floor(limit));
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function orderByIndex<T extends { index: number }>(rows: readonly T[]): T[] {
  const seen = new Set<number>();
  const unique: T[] = [];
  for (const row of rows) {
    if (seen.has(row.index)) continue;
    seen.add(row.index);
    unique.push(row);
  }
  return unique.sort((a, b) => a.index - b.index);
}

/**
 * Runs `read` on chunks of at most `limit` items.
 * A MetaTruncated error halves that chunk and tries again instead of keeping a cut-off JSON body.
 */
export async function readChunked<T, R>(
  items: readonly T[],
  limit: number,
  read: (chunk: readonly T[]) => Promise<{ rows: R[]; latencyMs: number }>,
): Promise<Chunked<R>> {
  const chunks = chunkItems(items, limit);
  const rows: R[] = [];
  const reports: ChunkReport[] = [];
  let calls = 0;

  async function run(chunk: readonly T[]): Promise<R[]> {
    calls += 1;
    try {
      const result = await read(chunk);
      reports.push({ images: chunk.length, latencyMs: result.latencyMs });
      return result.rows;
    } catch (error) {
      if (error instanceof MetaTruncated && chunk.length > 1) {
        const half = Math.floor(chunk.length / 2);
        const left = await run(chunk.slice(0, half));
        const right = await run(chunk.slice(half));
        return [...left, ...right];
      }
      throw error;
    }
  }

  for (const chunk of chunks) {
    rows.push(...(await run(chunk)));
  }
  return { rows, calls, chunks: reports };
}
