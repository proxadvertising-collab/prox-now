import { applyMenuFlags, checkMenuOpen } from "../ai/openCheck";
import {
  callSparkImages,
  MetaParseError,
  MetaTruncated,
  outputTokenBudget,
  type SparkImagesResult,
} from "../ai/meta";
import { normalizeBoxes } from "../image/blur";
import { readChunked, type ChunkReport } from "./chunk";
import { MAX_IMAGES_PER_CALL } from "./limits";
import { bookReadPrompt, facePrompt, imageLabel } from "./prompt";
import { parseBookRead, parseFaceRead, type BookRead, type PageRead } from "./schema";
import { buildTagline } from "./tagline";

export type IndexedImage = {
  index: number;
  dataUrl: string;
};

export type PageMeta = {
  model: string | null;
  latencyMs: number;
  imagesInCall: number;
  callId: string | null;
};

export type BookPass = {
  read: BookRead;
  model: string | null;
  latencyMs: number;
  calls: number;
  chunks: ChunkReport[];
  perPage: Map<number, PageMeta>;
  /** True only when Muse Spark Open returned a verdict. A miss leaves this unset. */
  openChecked?: boolean;
};

export class FaceCheckFailed extends Error {
  constructor() {
    super("blur_failed");
    this.name = "FaceCheckFailed";
  }
}

type Call = typeof callSparkImages;

async function readMenu(
  indexes: readonly number[],
  labeled: { label: string; imageDataUrl: string }[],
  count: number,
  call: Call,
): Promise<SparkImagesResult> {
  try {
    return await call({ prompt: bookReadPrompt(indexes), images: labeled, maxOutputTokens: 8000 });
  } catch (error) {
    if (!(error instanceof MetaTruncated) || count > 1) throw error;
    try {
      return await call({ prompt: bookReadPrompt(indexes, true), images: labeled, maxOutputTokens: 4000 });
    } catch (again) {
      if (again instanceof MetaTruncated) throw new Error("max_output_tokens");
      throw again;
    }
  }
}

async function callChunk(prompt: string, chunk: readonly IndexedImage[], call: Call): Promise<SparkImagesResult> {
  return call({
    prompt,
    images: chunk.map((image) => ({ label: imageLabel(image.index), imageDataUrl: image.dataUrl })),
    maxOutputTokens: outputTokenBudget(chunk.length),
  });
}

export type FacePass = {
  faces: Map<number, number[][]>;
  calls: number;
  chunks: ChunkReport[];
};

export async function detectFaces(
  images: readonly IndexedImage[],
  limit = MAX_IMAGES_PER_CALL,
  call: Call = callSparkImages,
): Promise<FacePass> {
  if (images.length === 0) return { faces: new Map(), calls: 0, chunks: [] };
  let pass: { rows: { index: number; faces: number[][] }[]; calls: number; chunks: ChunkReport[] };
  try {
    pass = await readChunked(images, limit, async (chunk) => {
      const result = await callChunk(facePrompt(chunk.map((image) => image.index)), chunk, call);
      const parsed = parseFaceRead(result.raw);
      if (!parsed.ok) throw new MetaParseError(result.model, result.ms);
      return {
        rows: parsed.pages.map((page) => ({ index: page.index, faces: page.faces })),
        latencyMs: result.ms,
      };
    });
  } catch (error) {
    if (error instanceof MetaParseError || error instanceof MetaTruncated) throw new FaceCheckFailed();
    throw error;
  }

  const faces = new Map<number, number[][]>();
  for (const row of pass.rows) {
    if (!faces.has(row.index)) faces.set(row.index, normalizeBoxes(row.faces));
  }
  for (const image of images) {
    const boxes = faces.get(image.index);
    if (!boxes) throw new FaceCheckFailed();
    const reported = pass.rows.find((row) => row.index === image.index);
    if (reported && reported.faces.length > 0 && boxes.length === 0) throw new FaceCheckFailed();
  }
  return { faces, calls: pass.calls, chunks: pass.chunks };
}

export async function readBook(
  images: readonly IndexedImage[],
  limit = MAX_IMAGES_PER_CALL,
  call: Call = callSparkImages,
): Promise<BookPass> {
  const perPage = new Map<number, PageMeta>();
  const languages: (string | null)[] = [];
  const taglines: string[] = [];
  const shopNames: string[] = [];
  const colorSets: string[][] = [];
  const carried: { rich: BookRead | null } = { rich: null };
  const pass = await readChunked(images, limit, async (chunk) => {
    const indexes = chunk.map((image) => image.index);
    const result = await readMenu(
      indexes,
      chunk.map((image) => ({ label: imageLabel(image.index), imageDataUrl: image.dataUrl })),
      chunk.length,
      call,
    );
    const parsed = parseBookRead(result.raw);
    if (!parsed.ok) throw new MetaParseError(result.model, result.ms);
    const meta: PageMeta = {
      model: result.model,
      latencyMs: result.ms,
      imagesInCall: chunk.length,
      callId: result.callId,
    };
    for (const image of chunk) {
      if (!perPage.has(image.index)) perPage.set(image.index, meta);
    }
    languages.push(parsed.read.shopLanguage);
    if (parsed.read.tagline) taglines.push(parsed.read.tagline);
    if (parsed.read.shopName) shopNames.push(parsed.read.shopName);
    if (parsed.read.colors.length > 0 && colorSets.length === 0) colorSets.push(parsed.read.colors);
    if (parsed.read.rich && !carried.rich) carried.rich = parsed.read;
    return { rows: parsed.read.pages, latencyMs: result.ms };
  });

  const byIndex = new Map<number, PageRead>();
  for (const page of pass.rows) {
    if (!byIndex.has(page.index)) byIndex.set(page.index, page);
  }
  const pages = [...byIndex.values()].sort((a, b) => a.index - b.index);
  const shopLanguage =
    languages.find((language): language is string => Boolean(language)) ??
    pages.find((page) => page.language)?.language ??
    null;
  return withOpenCheck(
    {
      read: {
        pages,
        shopLanguage,
        tagline: buildTagline(taglines),
        shopName: shopNames[0] ?? null,
        colors: colorSets[0] ?? [],
        ...(carried.rich
          ? {
              nameEn: carried.rich.nameEn ?? null,
              deals: carried.rich.deals ?? [],
              style: carried.rich.style ?? null,
              logo: carried.rich.logo ?? null,
              hero: carried.rich.hero ?? null,
              category: carried.rich.category ?? null,
              maps: carried.rich.maps ?? null,
              rich: true as const,
            }
          : {}),
      },
      model: modelOf(perPage),
      latencyMs: pass.chunks.reduce((sum, chunk) => sum + chunk.latencyMs, 0),
      calls: pass.calls,
      chunks: pass.chunks,
      perPage,
    },
    images,
  );
}

/** One Muse call for a seed batch, then one shorter retry. Does not split the batch. */
export async function readSeedBatch(
  images: readonly IndexedImage[],
  call: Call = callSparkImages,
): Promise<BookPass> {
  const indexes = images.map((image) => image.index);
  const labeled = images.map((image) => ({ label: imageLabel(image.index), imageDataUrl: image.dataUrl }));
  let result: SparkImagesResult;
  let calls = 1;
  try {
    result = await call({ prompt: bookReadPrompt(indexes), images: labeled, maxOutputTokens: 8000 });
  } catch (error) {
    if (!(error instanceof MetaTruncated)) throw error;
    calls = 2;
    try {
      result = await call({ prompt: bookReadPrompt(indexes, true), images: labeled, maxOutputTokens: 4000 });
    } catch (again) {
      if (again instanceof MetaTruncated) throw new Error("max_output_tokens");
      throw again;
    }
  }
  const parsed = parseBookRead(result.raw);
  if (!parsed.ok) throw new MetaParseError(result.model, result.ms);
  const perPage = new Map<number, PageMeta>();
  const meta: PageMeta = {
    model: result.model,
    latencyMs: result.ms,
    imagesInCall: images.length,
    callId: result.callId,
  };
  for (const image of images) perPage.set(image.index, meta);
  return withOpenCheck(
    {
      read: parsed.read,
      model: result.model,
      latencyMs: result.ms,
      calls,
      chunks: [{ images: images.length, latencyMs: result.ms }],
      perPage,
    },
    images,
  );
}

/** Tests skip the network. A missing key, timeout, or bad reply leaves the Spark items as they are. */
async function withOpenCheck(pass: BookPass, images: readonly IndexedImage[]): Promise<BookPass> {
  if (process.env.VITEST === "true") return pass;
  const names = pass.read.pages.flatMap((page) => page.items);
  if (names.length === 0 || images.length === 0) return pass;
  try {
    const result = await checkMenuOpen({
      images: images.map((image) => ({ dataUrl: image.dataUrl })),
      items: names.map((item) => ({ name: item.name })),
    });
    if (!result.ran) return pass;
    return {
      ...pass,
      openChecked: true,
      read: {
        ...pass.read,
        pages: pass.read.pages.map((page) => ({ ...page, items: applyMenuFlags(page.items, result) })),
      },
    };
  } catch {
    console.warn("muse-spark-open check skipped: error");
    return pass;
  }
}

function modelOf(perPage: Map<number, PageMeta>): string | null {
  for (const meta of perPage.values()) {
    if (meta.model) return meta.model;
  }
  return null;
}
