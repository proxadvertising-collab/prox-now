import { NextResponse } from "next/server";
import { ownerClient, ownerFailure, unsigned } from "../../../../lib/owner/http";
import { daysLeft } from "../../../../lib/owner/window";
import { signedPhotoUrl } from "../../../../lib/photos/sign";
import { photoPublicUrl } from "../../../../lib/posts/source";

export async function GET() {
  const { supabase, user } = await ownerClient();
  if (!supabase || !user) return unsigned();
  const result = await supabase.rpc("owner_inbox");
  if (result.error) return ownerFailure(result.error);
  const payload = (result.data ?? {}) as {
    cards?: Array<Record<string, unknown>>;
    liveNow?: Array<Record<string, unknown>>;
    bookThanks?: Array<Record<string, unknown>>;
    keptToday?: number;
    passedToday?: number;
  };
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const now = Date.now();
  const mapCard = (card: Record<string, unknown>) => {
    const expiresAt = typeof card.expiresAt === "string" ? card.expiresAt : "";
    const path = typeof card.photoPath === "string" ? card.photoPath : null;
    return {
      id: card.id,
      shopId: card.shopId,
      shopName: card.shopName,
      shopSlug: card.shopSlug,
      photoUrl: photoPublicUrl(base, path),
      facts: card.facts ?? null,
      authorName: typeof card.authorName === "string" ? card.authorName : "",
      expiresAt,
      daysLeft: expiresAt ? daysLeft(expiresAt, now) : 0,
    };
  };
  const bookThanks = (payload.bookThanks ?? []).map((card) => {
    const path = typeof card.photoPath === "string" ? card.photoPath : null;
    const pages = typeof card.pageCount === "number" ? card.pageCount : Number(card.pageCount);
    return {
      shopId: card.shopId,
      contributorId: card.contributorId,
      shopName: card.shopName,
      authorName: typeof card.authorName === "string" ? card.authorName : "",
      pageCount: Number.isFinite(pages) ? pages : 0,
      photoUrl: signedPhotoUrl(path, "shop-book"),
    };
  });
  return NextResponse.json({
    cards: (payload.cards ?? []).map(mapCard),
    bookThanks,
    liveNow: (payload.liveNow ?? []).map(mapCard),
    keptToday: payload.keptToday ?? 0,
    passedToday: payload.passedToday ?? 0,
  });
}
