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

    const menu = view.pages.filter((page) => page.kind === "menu" || page.kind === "storefront" || page.kind === "hours");
    const shown = menu.length > 0 ? menu : view.pages;

    return (
      <div className="flex flex-col gap-4" style={view.swatches[0] ? { borderTop: "4px solid " + view.swatches[0] } : undefined}>
        {view.swatches.length > 0 ? (
          <div className="flex h-3 overflow-hidden rounded-full" aria-hidden="true">
            {view.swatches.map((color) => (
              <span key={color} className="h-3 flex-1" style={{ background: color }} />
            ))}
          </div>
        ) : null}
        <h1 className="text-title font-bold text-fg">{view.name}</h1>
        {view.nameLocal ? <p className="text-label text-fg-muted">{view.nameLocal}</p> : null}
        {view.tagline ? <p className="text-body text-fg">{view.tagline}</p> : null}
        {view.hoursLabel ? (
          <p className="text-body text-fg">
            {t("en", "book.hours")}: {view.hoursLabel}
          </p>
        ) : null}
        <ul className="flex flex-col gap-3">
          {shown.map((page) => (
            <li key={page.id}>
              {page.imageUrl ? (
                <img src={page.imageUrl} alt={view.name} className="aspect-[4/3] w-full rounded-lg object-cover" />
              ) : (
                <div className="aspect-[4/3] w-full rounded-lg bg-surface-2" />
              )}
              {page.credit ? <p className="mt-1 text-label text-fg-muted">{t("en", "book.credit", { name: page.credit })}</p> : null}
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
