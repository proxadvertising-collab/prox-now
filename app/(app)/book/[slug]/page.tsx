import { redirect } from "next/navigation";
import { connection } from "next/server";
import { POST as postBookPages } from "../../../api/book/pages/route";
import { BookAddPhotos } from "@/components/book/BookAddPhotos";
import { BookSwiper } from "@/components/book/BookSwiper";
import { SeededActions } from "@/components/book/SeededActions";
import { t } from "@/lib/copy";
import { presentBook } from "@/lib/book/present";
import { hasShopEnv } from "@/lib/shops/source";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

export async function retryReading(formData: FormData) {
  "use server";
  const shop = String(formData.get("shop") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const form = new FormData();
  form.set("shop", shop);
  form.set("retry", "1");
  await postBookPages(new Request("http://localhost/api/book/pages", { method: "POST", body: form }));
  redirect("/book/" + encodeURIComponent(slug || shop));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DELIVERY_LABEL: Record<string, string> = {
  grab: "Grab",
  foodpanda: "foodpanda",
  lineman: "LINE MAN",
  robinhood: "Robinhood",
  shopeefood: "ShopeeFood",
  ubereats: "Uber Eats",
};

const PAYMENT_LABEL: Record<string, string> = {
  promptpay: "PromptPay",
  card: "Cards",
  cash: "Cash",
};

function telHref(phone: string): string {
  return "tel:" + phone.replace(/[^\d+]/g, "");
}

function lineHref(id: string): string {
  const handle = id.startsWith("@") ? id : "@" + id;
  return "https://line.me/R/ti/p/" + encodeURIComponent(handle);
}

function waHref(phone: string): string {
  return "https://wa.me/" + phone.replace(/\D/g, "");
}

function siteHref(value: string): string {
  return /^https?:\/\//i.test(value) ? value : "https://" + value;
}

function socialHref(host: string, value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  return "https://" + host + "/" + encodeURIComponent(value.replace(/^@/, ""));
}

function tiktokHref(value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  return "https://www.tiktok.com/@" + encodeURIComponent(value.replace(/^@/, ""));
}

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

    const menuPages = view.pages.filter((page) => page.kind === "menu");
    const extraPages = view.pages.filter((page) => page.kind === "extra");
    const restPages = view.pages.filter((page) => page.kind !== "logo" && page.kind !== "menu" && page.kind !== "extra");
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
    const info = view.info;
    const hours = view.hoursLabel ?? info.hoursText?.value ?? null;
    const mapUrl = mapHref(info.address?.value ?? null, point);
    const linkClass = "inline-flex min-h-11 items-center rounded-md px-3 text-body font-semibold";
    const linkStyle = { background: accent, color: ink };
    const cardStyle = { borderColor: accent, background: ink, color: accent };
    const hasContact =
      Boolean(hours) ||
      info.phones.length > 0 ||
      Boolean(info.lineId) ||
      info.lineQrPage != null ||
      Boolean(info.whatsapp) ||
      Boolean(info.facebook) ||
      Boolean(info.instagram) ||
      Boolean(info.tiktok) ||
      Boolean(info.website) ||
      Boolean(info.email) ||
      Boolean(mapUrl) ||
      info.delivery.length > 0 ||
      info.payment.length > 0 ||
      Boolean(info.wifi);

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
        <BookSwiper>
          <article key="cover" className="flex flex-col gap-3 rounded-lg p-4" style={{ background: accent, color: ink }}>
            <div className="flex items-center gap-4">
              {view.logoUrl ? (
                <img src={view.logoUrl} alt="" className="h-20 w-20 rounded-md bg-white object-contain" />
              ) : (
                <div className="h-20 w-20 rounded-md bg-white/40" />
              )}
              <div>
                <h1 className={"text-title " + mood}>{view.name}</h1>
                {view.nameLocal ? <p className="text-label opacity-80">{view.nameLocal}</p> : null}
              </div>
            </div>
            {view.tagline ? <p className={"text-body " + mood}>{view.tagline}</p> : null}
            {view.swatches.length > 0 ? (
              <div className="flex h-3 overflow-hidden rounded-full" aria-hidden="true">
                {view.swatches.map((color) => (
                  <span key={color} className="h-3 flex-1" style={{ background: color }} />
                ))}
              </div>
            ) : null}
          </article>
          <article key="info" className="flex flex-col gap-3 rounded-lg border-4 p-4" style={cardStyle}>
            <h2 className={"text-heading " + mood}>Shop info</h2>
            {hours ? (
              <p className="text-body">
                {t("en", "book.hours")}: {hours}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {info.phones.map((phone) => (
                <a key={"tel-" + phone.page + phone.value} href={telHref(phone.value)} className={linkClass} style={linkStyle}>
                  Call {phone.value}
                </a>
              ))}
              {info.lineId ? (
                <a href={lineHref(info.lineId.value)} className={linkClass} style={linkStyle} target="_blank" rel="noopener noreferrer">
                  LINE
                </a>
              ) : null}
              {info.whatsapp ? (
                <a href={waHref(info.whatsapp.value)} className={linkClass} style={linkStyle} target="_blank" rel="noopener noreferrer">
                  WhatsApp
                </a>
              ) : null}
              {info.facebook ? (
                <a href={socialHref("facebook.com", info.facebook.value)} className={linkClass} style={linkStyle} target="_blank" rel="noopener noreferrer">
                  Facebook
                </a>
              ) : null}
              {info.instagram ? (
                <a href={socialHref("instagram.com", info.instagram.value)} className={linkClass} style={linkStyle} target="_blank" rel="noopener noreferrer">
                  Instagram
                </a>
              ) : null}
              {info.tiktok ? (
                <a href={tiktokHref(info.tiktok.value)} className={linkClass} style={linkStyle} target="_blank" rel="noopener noreferrer">
                  TikTok
                </a>
              ) : null}
              {info.website ? (
                <a href={siteHref(info.website.value)} className={linkClass} style={linkStyle} target="_blank" rel="noopener noreferrer">
                  Website
                </a>
              ) : null}
              {info.email ? (
                <a href={"mailto:" + info.email.value} className={linkClass} style={linkStyle}>
                  Email
                </a>
              ) : null}
              {mapUrl ? (
                <a href={mapUrl} className={linkClass} style={linkStyle} target="_blank" rel="noopener noreferrer">
                  Map
                </a>
              ) : null}
            </div>
            {info.lineQrPage != null ? <p className="text-body">LINE QR</p> : null}
            {info.delivery.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {info.delivery.map((item) => (
                  <span key={item.value} className="rounded-full border px-3 py-1 text-label">
                    {DELIVERY_LABEL[item.value] ?? item.value}
                  </span>
                ))}
              </div>
            ) : null}
            {info.payment.length > 0 ? (
              <p className="text-label">{info.payment.map((item) => PAYMENT_LABEL[item.value] ?? item.value).join(" · ")}</p>
            ) : null}
            {info.wifi ? <p className="text-body">Wi-Fi {info.wifi.value}</p> : null}
            {info.address ? <p className="text-label">{info.address.value}</p> : null}
            {hasContact ? null : <p className="text-body">No contact details in the photos.</p>}
          </article>
          {menuPages.map((page) => (
            <article key={page.id} className="flex gap-3 rounded-lg border-4 p-3" style={cardStyle}>
              {page.imageUrl ? (
                <img src={page.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-md object-cover" />
              ) : (
                <div className="h-16 w-16 shrink-0 rounded-md bg-white/20" />
              )}
              <div className="min-w-0 flex-1">
                {page.section ? <p className="text-label font-semibold">{page.section}</p> : null}
                {page.items.length > 0 ? (
                  <ul className="flex flex-col gap-1">
                    {page.items.map((item, index) => (
                      <li key={page.id + "-" + index} className="flex items-baseline justify-between gap-3 text-body">
                        <span>
                          {item.name}
                          {item.nameEn ? <span className="ml-2 text-label opacity-80">{item.nameEn}</span> : null}
                          {item.note ? <span className="ml-2 text-label opacity-80">{item.note}</span> : null}
                          {item.tags ? <span className="ml-2 text-label opacity-80">{item.tags.join(" ")}</span> : null}
                        </span>
                        {item.price ? <span>{item.price}</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {page.credit ? <p className="text-label">{t("en", "book.credit", { name: page.credit })}</p> : null}
              </div>
            </article>
          ))}
          {restPages.map((page) => (
            <article key={page.id} className="flex gap-3 rounded-lg border-4 p-3" style={cardStyle}>
              {page.imageUrl ? (
                <img src={page.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-md object-cover" />
              ) : (
                <div className="h-16 w-16 shrink-0 rounded-md bg-white/20" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-label font-semibold">{kindLabel(page.kind)}</p>
                {page.section ? <p className="text-label">{page.section}</p> : null}
                {page.credit ? <p className="text-label">{t("en", "book.credit", { name: page.credit })}</p> : null}
              </div>
            </article>
          ))}
          {extraPages.map((page) => (
            <article key={page.id} className="flex gap-3 rounded-lg border-4 p-3" style={cardStyle}>
              {page.imageUrl ? (
                <img src={page.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-md object-cover" />
              ) : (
                <div className="h-16 w-16 shrink-0 rounded-md bg-white/20" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-label font-semibold">{kindLabel(page.kind)}</p>
                {page.section ? <p className="text-label">{page.section}</p> : null}
                {page.items.map((item, index) => (
                  <p key={page.id + "-" + index} className="text-body">
                    {item.name}
                    {item.price ? " " + item.price : ""}
                  </p>
                ))}
                {page.credit ? <p className="text-label">{t("en", "book.credit", { name: page.credit })}</p> : null}
              </div>
            </article>
          ))}
        </BookSwiper>
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
