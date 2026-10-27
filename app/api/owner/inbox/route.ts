import { NextResponse } from "next/server";
import { ownerClient, ownerFailure, unsigned } from "../../../../lib/owner/http";
import { photoPublicUrl } from "../../../../lib/posts/source";
import { daysLeft } from "../../../../lib/owner/window";

export async function GET() {
  const { supabase, user } = await ownerClient();
  if (!supabase || !user) return unsigned();
  const result = await supabase.rpc("owner_inbox");
  if (result.error) return ownerFailure(result.error);
  const payload = (result.data ?? {}) as {
    cards?: Array<Record<string, unknown>>;
    keptToday?: number;
    passedToday?: number;
  };
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const now = Date.now();
  const cards = (payload.cards ?? []).map((card) => {
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
  });
  return NextResponse.json({
    cards,
    keptToday: payload.keptToday ?? 0,
    passedToday: payload.passedToday ?? 0,
  });
}
