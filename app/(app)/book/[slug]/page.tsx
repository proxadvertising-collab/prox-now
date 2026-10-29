import { connection } from "next/server";
import { BookAddPhotos } from "@/components/book/BookAddPhotos";
import { SeededActions } from "@/components/book/SeededActions";
import { t } from "@/lib/copy";
import { presentBook } from "@/lib/book/present";
import { hasShopEnv } from "@/lib/shops/source";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function coord(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

async function shopByKey(key: string): Promise<{ id: string; slug: string; name: string; lat: number | null; lng: number | null } | null> {
  const supabase = await createClient();
  const query = supabase.from("shops").select("id, slug, name, lat, lng");
  const result = UUID.test(key) ? await query.eq("id", key).maybeSingle() : await query.eq("slug", key).maybeSingle();
  const row = result.data;
  if (!row || typeof row.id !== "string" || typeof row.slug !== "string" || typeof row.name !== "string") return null;
  return { id: row.id, slug: row.slug, name: row.name, lat: coord(row.lat), lng: coord(row.lng) };
}

export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ seeded?: string; lat?: string; lng?: string }>;
}) {
  await connection();
  const { slug } = await params;
  const query = await searchParams;
  const key = decodeURIComponent(slug);
  const seeded = query.seeded === "1";
  const lat = Number(query.lat);
  const lng = Number(query.lng);
  const here = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  const actions = (shopId: string, bookSlug: string) =>
    seeded ? (
      <SeededActions shopId={shopId} slug={bookSlug} lat={here?.lat ?? null} lng={here?.lng ?? null} />
    ) : null;
  if (!hasShopEnv()) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-title font-bold text-fg">{t("en", "sheet.openBook")}</h1>
        <p className="text-body text-fg">{t("en", "book.empty")}</p>
        <BookAddPhotos
          shopId={key}
          shop={null}
          className="inline-flex min-h-12 items-center justify-center rounded-md bg-accent px-4 text-base font-semibold text-accent-ink"
        />
        {actions(key, key)}
      </div>
    );
  }

  try {
    const supabase = await createClient();
    const shop = await shopByKey(key);
    const lookup = shop?.slug ?? (UUID.test(key) ? null : key);
    const result = lookup ? await supabase.rpc("book_public", { p_slug: lookup }) : { data: null };
    const view = presentBook(result.data, process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    const name = view?.name ?? shop?.name ?? key;
    const point = shop?.lat != null && shop.lng != null ? { lat: shop.lat, lng: shop.lng } : null;

    if (!view || view.pages.length === 0) {
      return (
        <div className="flex flex-col gap-3">
          <h1 className="text-title font-bold text-fg">{name}</h1>
          <p className="text-body text-fg">{t("en", "book.empty")}</p>
          <BookAddPhotos
            shopId={shop?.id ?? key}
            shop={point}
            className="inline-flex min-h-12 items-center justify-center rounded-md bg-accent px-4 text-base font-semibold text-accent-ink"
          />
          {actions(shop?.id ?? key, view?.slug ?? shop?.slug ?? key)}
        </div>
      );
    }

    const shown = view.pages.filter((page) => page.kind === "menu" || page.kind === "hours" || page.kind === "storefront");
    const pages = shown.length > 0 ? shown : view.pages.filter((page) => page.kind !== "logo");
    const accent = view.accent ?? "#FF8A3D";
    const ink = view.ink ?? "#1C0E05";
    const mood =
      view.mood === "elegant"
        ? "font-serif tracking-wide"
        : view.mood === "playful"
          ? "italic"
          : view.mood === "street"
            ? "uppercase tracking-widest"
            : "font-black";

    return (
      <div className="flex flex-col gap-4">
        <header className="flex items-center gap-4 rounded-lg p-4" style={{ background: accent, color: ink }}>
          {view.logoUrl ? (
            <img src={view.logoUrl} alt="" className="h-20 w-20 rounded-md bg-white object-contain" />
          ) : (
            <div className="h-20 w-20 rounded-md bg-white/40" />
          )}
          <div>
            <h1 className={"text-title " + mood}>{view.name}</h1>
            {view.nameLocal ? <p className="text-label opacity-80">{view.nameLocal}</p> : null}
          </div>
        </header>
        {view.swatches.length > 0 ? (
          <div className="flex h-3 overflow-hidden rounded-full" aria-hidden="true">
            {view.swatches.map((color) => (
              <span key={color} className="h-3 flex-1" style={{ background: color }} />
            ))}
          </div>
        ) : null}
        {view.tagline ? <p className={"text-body " + mood} style={{ color: accent }}>{view.tagline}</p> : null}
        {view.hoursLabel ? (
          <p className="text-body text-fg">
            {t("en", "book.hours")}: {view.hoursLabel}
          </p>
        ) : null}
        <ul className="flex flex-col gap-3">
          {pages.map((page) => (
            <li key={page.id} className="overflow-hidden rounded-lg border-4" style={{ borderColor: accent, background: ink, color: accent }}>
              {page.imageUrl ? (
                <img src={page.imageUrl} alt={view.name} className="aspect-[4/3] w-full object-cover" />
              ) : (
                <div className="aspect-[4/3] w-full bg-surface-2" />
              )}
              {page.credit ? <p className="px-3 py-2 text-label">{t("en", "book.credit", { name: page.credit })}</p> : null}
            </li>
          ))}
        </ul>
        <BookAddPhotos
          shopId={shop?.id ?? key}
          shop={point}
          className="inline-flex min-h-12 items-center justify-center rounded-md bg-accent px-4 text-base font-semibold text-accent-ink"
        />
        {actions(shop?.id ?? key, view.slug)}
      </div>
    );
  } catch {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-body text-fg">{t("en", "book.empty")}</p>
        <BookAddPhotos
          shopId={key}
          shop={null}
          className="inline-flex min-h-12 items-center justify-center rounded-md bg-accent px-4 text-base font-semibold text-accent-ink"
        />
        {actions(key, key)}
      </div>
    );
  }
}
