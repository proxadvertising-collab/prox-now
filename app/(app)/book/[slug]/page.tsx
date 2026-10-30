import { connection } from "next/server";
import { redirect } from "next/navigation";
import { retryReading } from "@/lib/book/retry";
import { BookAddPhotos } from "@/components/book/BookAddPhotos";
import { ClaimShop } from "@/components/owner/ClaimShop";
import { BookSwiper } from "@/components/book/BookSwiper";
import { SeededActions } from "@/components/book/SeededActions";
import { t } from "@/lib/copy";
import { presentBook } from "@/lib/book/present";
import { bookCardColors } from "@/lib/book/palette";
import { bookSurface } from "@/lib/book/cutouts";
import {
  CoverCard,
  DealsCard,
  ExtraCard,
  InfoCard,
  MenuCard,
  bookFontFamily,
  assembleDeck,
  liveLeftLabel,
} from "./cards";
import { hasShopEnv } from "@/lib/shops/source";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapHref(address: string | null, point: { lat: number; lng: number } | null): string | null {
  if (address) return "https://maps.google.com/maps?q=" + encodeURIComponent(address);
  if (point) return "https://maps.google.com/maps?q=" + point.lat + "," + point.lng;
  return null;
}

function kindLabel(kind: string): string {
  if (kind === "storefront") return "Storefront";
  if (kind === "hours") return "Hours";
  if (kind === "qr") return "QR";
  if (kind === "extra") return "Extras";
  return kind;
}

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
  searchParams: Promise<{ seeded?: string; lat?: string; lng?: string; edit?: string }>;
}) {
  await connection();
  const { slug } = await params;
  const query = await searchParams;
  const key = decodeURIComponent(slug);
  const seeded = query.seeded === "1";
  const lat = Number(query.lat);
  const lng = Number(query.lng);
  const here = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  const actions = (shopId: string, bookSlug: string, photoUrl: string | null = null, claimMode: "hidden" | "own" | "claim" = "claim") =>
    seeded ? (
      <SeededActions
        shopId={shopId}
        slug={bookSlug}
        lat={here?.lat ?? null}
        lng={here?.lng ?? null}
        photoUrl={photoUrl}
        claimMode={claimMode}
      />
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
    if (view?.slug && view.slug !== key) {
      const params = new URLSearchParams();
      if (seeded) params.set("seeded", "1");
      if (query.edit === "name") params.set("edit", "name");
      if (here) {
        params.set("lat", String(here.lat));
        params.set("lng", String(here.lng));
      }
      const extra = params.toString();
      redirect("/book/" + encodeURIComponent(view.slug) + (extra ? "?" + extra : ""));
    }
    const name = view?.name ?? shop?.name ?? key;
    const point = shop?.lat != null && shop.lng != null ? { lat: shop.lat, lng: shop.lng } : null;
    let claimMode: "hidden" | "own" | "claim" = "claim";
    if (shop?.id) {
      try {
        const claimState = await supabase.rpc("claim_state", { p_shop_id: shop.id });
        if (claimState.data === "own") claimMode = "own";
        else if (claimState.data === "taken") claimMode = "hidden";
      } catch {
        claimMode = "claim";
      }
    }
    const claim = shop ? <ClaimShop shopId={shop.id} mode={claimMode} name={name} /> : null;

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

    const menuPages = view.pages.filter((page) => page.kind === "menu");
    const extraPages = view.pages.filter((page) => page.kind === "extra");
    const { accent, ink } = bookCardColors(view.accent ?? "#FF8A2B", view.ink);
    let liveLabel: string | null = null;
    if (shop?.id) {
      try {
        const live = await supabase
          .from("posts")
          .select("expires_at")
          .eq("shop_id", shop.id)
          .gt("expires_at", new Date().toISOString())
          .order("expires_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const expires = live.data && typeof live.data.expires_at === "string" ? live.data.expires_at : null;
        liveLabel = liveLeftLabel(expires, Date.now());
      } catch {
        liveLabel = null;
      }
    }
    const surface = bookSurface(view);
    const mood =
      view.mood === "elegant"
        ? "font-serif tracking-wide"
        : view.mood === "playful"
          ? "italic"
          : view.mood === "street"
            ? "uppercase tracking-widest"
            : "font-black";
    const info = view.info;
    const hours = view.hoursLabel ?? info.hoursText?.value ?? null;
    const mapUrl =
      view.maps && /^https?:\/\//i.test(view.maps) ? view.maps : mapHref(info.address?.value ?? null, point);
    const cardStyle = { background: "var(--book-ink)", color: "var(--book-accent)", fontFamily: "var(--book-font)" };
    const coverStyle = { color: "#fff", fontFamily: "var(--book-font)" };
    const deck = assembleDeck({
      menuItems: surface.menu,
      extras: extraPages.map((page) => ({
        id: page.id,
        section: page.section,
        credit: page.credit,
        items: page.items,
      })),
      deals: view.deals,
      hours,
      info,
      mapUrl,
    });

    return (
      <div className="flex flex-col gap-4">
        {view.reading ? (
          <form action={retryReading} className="flex items-center justify-between gap-3">
            <p className="text-body text-fg">Reading menu…</p>
            <input type="hidden" name="shop" value={shop?.id ?? key} />
            <input type="hidden" name="slug" value={view.slug} />
            <button type="submit" className="min-h-11 rounded-md bg-accent px-4 font-semibold text-accent-ink">
              Retry
            </button>
          </form>
        ) : null}
        <div
          className="book-theme"
          style={{
            ["--book-accent" as string]: accent,
            ["--book-ink" as string]: ink,
            ["--book-font" as string]: bookFontFamily(view.font),
          }}
        >
        <BookSwiper>
          {deck.map((card) => {
            if (card.type === "cover") {
              return (
                <CoverCard
                  key="cover"
                  name={view.name}
                  nameEn={view.nameEn}
                  logoUrl={surface.logoUrl}
                  heroUrl={surface.heroUrl}
                  tagline={view.tagline}
                  mood={mood}
                  style={coverStyle}
                  liveLabel={liveLabel}
                  claim={claim}
                  shopId={shop?.id ?? null}
                  editing={query.edit === "name"}
                />
              );
            }
            if (card.type === "info") {
              return <InfoCard key="info" hours={hours} info={info} mapUrl={mapUrl} style={cardStyle} claim={claim} />;
            }
            if (card.type === "deals") {
              return <DealsCard key="deals" deals={card.deals} style={cardStyle} />;
            }
            if (card.type === "menu") {
              return (
                <MenuCard
                  key={"menu-" + card.index}
                  index={card.index}
                  total={card.total}
                  items={card.items}
                  category={card.category}
                  continued={card.continued}
                  slug={view.slug}
                  style={cardStyle}
                />
              );
            }
            const page = extraPages.find((item) => item.id === card.id);
            if (!page || page.kind !== "extra") return null;
            return (
              <ExtraCard
                key={page.id}
                title={kindLabel(page.kind)}
                imageUrl={null}
                section={page.section}
                items={page.items}
                credit={page.credit}
                style={cardStyle}
              />
            );
          })}
        </BookSwiper>
        </div>
        <BookAddPhotos
          shopId={shop?.id ?? key}
          shop={point}
          className="inline-flex min-h-12 items-center justify-center rounded-md bg-accent px-4 text-base font-semibold text-accent-ink"
        />
        {actions(shop?.id ?? key, view.slug, surface.heroUrl ?? view.pages.find((page) => page.imageUrl)?.imageUrl ?? null, claimMode)}
      </div>
    );
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
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
