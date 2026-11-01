import type { CSSProperties, ReactNode } from "react";
import { ShopName } from "../../../../components/book/ShopName";
import { MenuBoard } from "../../../../components/menu/MenuBoard";
import { pagesByCategory } from "../../../../lib/book/categories";
import { bookText, displayName, parseHours } from "../../../../lib/book/display";
import { t } from "../../../../lib/copy";
import type { ShopInfo } from "../../../../lib/book/present";

export const MENU_PAGE_SIZE = 5;

export type MenuTileData = {
  name: string;
  nameEn: string | null;
  price: string | null;
  photo: string | null;
  category?: string | null;
  tags?: string[];
};

export type DealTile = {
  title: string;
  provider: string | null;
  discount: string | null;
  conditions: string | null;
};

export type DeckCard =
  | { type: "cover" }
  | { type: "info" }
  | { type: "deals"; deals: DealTile[] }
  | { type: "menu"; index: number; total: number; items: MenuTileData[]; category: string | null; continued: boolean; part: number }
  | { type: "extra"; id: string };

export function bookFontFamily(font: string | null): string {
  const key = (font ?? "").toLowerCase();
  if (key.includes("hand")) return '"Segoe Script", "Comic Sans MS", cursive';
  if (key.includes("serif")) return 'Georgia, "Times New Roman", serif';
  if (key.includes("rounded") || key.includes("sans")) return 'ui-rounded, "Segoe UI", sans-serif';
  return "inherit";
}

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

export function chunkMenu<T>(items: readonly T[], size = MENU_PAGE_SIZE): T[][] {
  if (size < 1 || items.length === 0) return [];
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += size) pages.push(items.slice(index, index + size));
  return pages;
}

export function buildDeck(input: {
  menuItems: readonly MenuTileData[];
  extras: readonly string[];
  deals?: readonly DealTile[];
}): DeckCard[] {
  const cards: DeckCard[] = [{ type: "cover" }];
  if (input.deals && input.deals.length > 0) cards.push({ type: "deals", deals: [...input.deals] });
  const menus = pagesByCategory(input.menuItems, MENU_PAGE_SIZE);
  menus.forEach((group, index) => {
    cards.push({
      type: "menu",
      index,
      total: menus.length,
      items: group.items,
      category: group.category,
      continued: group.part > 1,
      part: group.part,
    });
  });
  cards.push({ type: "info" });
  for (const id of input.extras) cards.push({ type: "extra", id });
  return cards;
}

export function bookCardCount(menuPages: number, extras: number, deals = 0): number {
  return 2 + (deals > 0 ? 1 : 0) + menuPages + extras;
}

export type ExtraPageInput = {
  id: string;
  section: string | null;
  credit: string | null;
  items: readonly { name: string; price: string | null }[];
};

export function extraContentKey(page: ExtraPageInput): string | null {
  const section = bookText(page.section) ?? "";
  const credit = bookText(page.credit) ?? "";
  const items = page.items
    .map((item) => {
      const name = bookText(item.name);
      if (!name) return "";
      return displayName(name) + "|" + (item.price ?? "");
    })
    .filter(Boolean);
  if (!section && !credit && items.length === 0) return null;
  return section + "\n" + items.join("\n") + "\n" + credit;
}

export function keptExtras(pages: readonly ExtraPageInput[]): ExtraPageInput[] {
  const seen = new Set<string>();
  const kept: ExtraPageInput[] = [];
  for (const page of pages) {
    const key = extraContentKey(page);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    kept.push(page);
  }
  return kept;
}

export function infoHasContent(hours: string | null, info: ShopInfo, mapUrl?: string | null): boolean {
  if (typeof mapUrl === "string" && mapUrl.trim()) return true;
  if (bookText(hours) || bookText(info.hoursText?.value ?? null) || bookText(info.address?.value ?? null)) return true;
  if (info.phones.length > 0 || info.delivery.length > 0 || info.payment.length > 0) return true;
  if (info.lineQrPage != null) return true;
  return Boolean(
    info.lineId || info.whatsapp || info.facebook || info.instagram || info.tiktok || info.website || info.email || info.wifi,
  );
}

function uniqueMenu(items: readonly MenuTileData[]): MenuTileData[] {
  const seen = new Set<string>();
  const kept: MenuTileData[] = [];
  for (const item of items) {
    if (!bookText(item.name)) continue;
    const key = [item.name.trim(), item.nameEn ?? "", item.price ?? "", item.category ?? ""].join("\n");
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(item);
  }
  return kept;
}

/** Cover stays. Empty and duplicate pages are left out, so the progress bar matches what you can swipe. */
export function assembleDeck(input: {
  menuItems: readonly MenuTileData[];
  extras: readonly ExtraPageInput[];
  deals?: readonly DealTile[];
  hours: string | null;
  info: ShopInfo;
  mapUrl?: string | null;
}): DeckCard[] {
  const extras = keptExtras(input.extras);
  const deals = (input.deals ?? []).filter((deal) => bookText(deal.title));
  const cards = buildDeck({
    menuItems: uniqueMenu(input.menuItems),
    extras: extras.map((page) => page.id),
    deals,
  });
  const showInfo = infoHasContent(input.hours, input.info, input.mapUrl);
  const seen = new Set<string>();
  const kept: DeckCard[] = [];
  for (const card of cards) {
    if (card.type === "info" && !showInfo) continue;
    if (card.type === "menu" && card.items.length === 0) continue;
    const key =
      card.type === "extra"
        ? (extraContentKey(extras.find((page) => page.id === card.id) ?? { id: card.id, section: null, credit: null, items: [] }) ?? card.id)
        : card.type === "menu"
          ? "menu:" + card.index
          : card.type;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(card);
  }
  return kept;
}

export function bookFallbackPhoto(
  hero: string | null,
  pages: readonly { kind: string; imageUrl: string | null }[],
): string | null {
  if (hero) return hero;
  const menu = pages.find((page) => page.kind === "menu" && page.imageUrl);
  return menu?.imageUrl ?? null;
}

export function coverPhoto(
  hero: string | null,
  pages: readonly { imageUrl: string | null }[],
): string | null {
  if (hero) return hero;
  return pages.find((page) => page.imageUrl)?.imageUrl ?? null;
}

export function liveLeftLabel(expiresAt: string | null, now: number): string | null {
  if (!expiresAt) return null;
  const end = Date.parse(expiresAt);
  if (!Number.isFinite(end) || end <= now) return null;
  const totalMinutes = Math.max(1, Math.ceil((end - now) / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return "LIVE · " + hours + "h " + minutes + "m left";
}

/** One shared source becomes a single banner. Distinct photos stay tiles. */
export function menuBannerPhoto(items: readonly { photo: string | null }[]): string | null {
  if (items.length < 2) return null;
  const photos = items.map((item) => item.photo).filter((photo): photo is string => Boolean(photo));
  if (photos.length === 0) return null;
  const first = photos[0];
  return photos.every((photo) => photo === first) ? first : null;
}

export function menuUsesTiles(items: readonly { photo: string | null }[]): boolean {
  if (menuBannerPhoto(items)) return false;
  const photos = items.map((item) => item.photo).filter((photo): photo is string => Boolean(photo));
  if (photos.length === 0) return false;
  return new Set(photos).size === photos.length;
}

export function coverUsesPhoto(hero: string | null | undefined, logo: string | null | undefined): boolean {
  if (!hero) return false;
  return hero !== logo;
}

function Glyph({ name }: { name: string }) {
  const common = {
    className: "book-icon",
    viewBox: "0 0 24 24",
    width: 20,
    height: 20,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  if (name === "clock") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v5l3 2" />
      </svg>
    );
  }
  if (name === "phone") {
    return (
      <svg {...common}>
        <path d="M8 4h3l1 4-2 1a12 12 0 0 0 5 5l1-2 4 1v3a2 2 0 0 1-2 2A16 16 0 0 1 6 6a2 2 0 0 1 2-2z" />
      </svg>
    );
  }
  if (name === "pin") {
    return (
      <svg {...common}>
        <path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z" />
        <circle cx="12" cy="10" r="2" />
      </svg>
    );
  }
  if (name === "mail") {
    return (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 7l9 7 9-7" />
      </svg>
    );
  }
  if (name === "link") {
    return (
      <svg {...common}>
        <path d="M10 14a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" />
        <path d="M14 10a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M5 6h14v10H8l-3 3z" />
    </svg>
  );
}

function Row({ icon, label, href }: { icon: string; label: string; href?: string }) {
  const body = (
    <>
      <Glyph name={icon} />
      <span className="book-row-label">{label}</span>
    </>
  );
  if (!href) return <div className="book-row">{body}</div>;
  const external = /^https?:\/\//i.test(href);
  return (
    <a className="book-row" href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>
      {body}
    </a>
  );
}

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

export function MenuTile({ name, price, photo }: MenuTileData) {
  return (
    <div className="book-tile">
      {photo ? <img src={photo} alt="" className="book-tile-photo" /> : null}
      {price ? <span className="book-price-chip">{price}</span> : null}
      <p className="book-tile-name">{name}</p>
    </div>
  );
}

export function CoverCard({
  name,
  nameEn,
  logoUrl,
  heroUrl,
  tagline,
  mood,
  style,
  liveLabel = null,
  claim = null,
  shopId = null,
  editing = false,
}: {
  name: string;
  nameEn?: string | null;
  logoUrl: string | null;
  heroUrl?: string | null;
  tagline: string | null;
  mood: string;
  style: CSSProperties;
  liveLabel?: string | null;
  claim?: ReactNode;
  shopId?: string | null;
  editing?: boolean;
}) {
  const shown = displayName(name);
  const shownEn = nameEn ? displayName(nameEn) : null;
  const shownTag = bookText(tagline);
  const photoHero = coverUsesPhoto(heroUrl, logoUrl);
  return (
    <article className={"book-card book-cover" + (photoHero ? "" : " book-cover-fallback")} style={style}>
      {photoHero && heroUrl ? <img src={heroUrl} alt="" className="book-cover-photo" /> : null}
      {photoHero ? <div className="book-cover-scrim" /> : null}
      <div className="book-card-body book-cover-body">
        {liveLabel ? (
          <p className="book-live">
            <span className="book-live-dot" />
            {liveLabel}
          </p>
        ) : null}
        {logoUrl ? (
          <img src={logoUrl} alt="" className="book-logo h-[72px] w-[72px] max-h-[72px] max-w-[72px]" width={72} height={72} />
        ) : null}
        {shopId && (editing || name.trim() === "New shop") ? (
          <ShopName
            shopId={shopId}
            name={shown}
            editing={editing}
            className={"book-shop-name text-[32px] font-extrabold " + mood}
          />
        ) : (
          <h1 className={"book-shop-name text-[32px] font-extrabold " + mood}>{shown}</h1>
        )}
        {shownEn ? <p className="book-name-en">{shownEn}</p> : null}
        {shownTag ? <p className="book-tags">{shownTag}</p> : null}
        {!shopId && name.trim() === "New shop" ? (
          <a className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold underline" href="?edit=name">
            {t("en", "book.editName")}
          </a>
        ) : null}
        {claim}
      </div>
    </article>
  );
}

export function DealsCard({ deals, style }: { deals: readonly DealTile[]; style: CSSProperties }) {
  return (
    <article className="book-card" style={style}>
      <h2 className="book-card-title">{t("en", "book.deals")}</h2>
      <div className="book-card-body">
        <div className="book-rows">
          {deals.map((deal) => (
            <p key={deal.title} className="book-row">
              <span className="book-row-label">
                {[deal.title, deal.provider, deal.discount, deal.conditions].filter(Boolean).join(" · ")}
              </span>
            </p>
          ))}
        </div>
      </div>
    </article>
  );
}

export function InfoCard({
  hours,
  info,
  mapUrl,
  style,
  claim = null,
}: {
  hours: string | null;
  info: ShopInfo;
  mapUrl: string | null;
  style: CSSProperties;
  claim?: ReactNode;
}) {
  const rows: ReactNode[] = [];
  const safeHours = bookText(hours);
  const hourRows = safeHours ? parseHours(safeHours) : null;
  const place = bookText(info.address?.value ?? null);
  for (const phone of info.phones) {
    rows.push(<Row key={"tel-" + phone.page + phone.value} icon="phone" label={"Call " + phone.value} href={telHref(phone.value)} />);
  }
  if (info.lineId) rows.push(<Row key="line" icon="chat" label={"LINE " + info.lineId.value} href={lineHref(info.lineId.value)} />);
  if (info.whatsapp) rows.push(<Row key="wa" icon="chat" label={"WhatsApp " + info.whatsapp.value} href={waHref(info.whatsapp.value)} />);
  if (info.facebook) {
    rows.push(<Row key="fb" icon="link" label={"Facebook " + info.facebook.value} href={socialHref("facebook.com", info.facebook.value)} />);
  }
  if (info.instagram) {
    rows.push(
      <Row key="ig" icon="link" label={"Instagram " + info.instagram.value} href={socialHref("instagram.com", info.instagram.value)} />,
    );
  }
  if (info.tiktok) rows.push(<Row key="tt" icon="link" label={"TikTok " + info.tiktok.value} href={tiktokHref(info.tiktok.value)} />);
  if (info.website) rows.push(<Row key="web" icon="link" label={info.website.value} href={siteHref(info.website.value)} />);
  if (info.email) rows.push(<Row key="mail" icon="mail" label={info.email.value} href={"mailto:" + info.email.value} />);
  if (mapUrl) rows.push(<Row key="map" icon="pin" label={place ?? t("en", "book.maps")} href={mapUrl} />);
  if (info.lineQrPage != null) rows.push(<Row key="qr" icon="chat" label="LINE QR" />);
  if (info.delivery.length > 0) {
    rows.push(
      <Row key="delivery" icon="link" label={info.delivery.map((item) => DELIVERY_LABEL[item.value] ?? item.value).join(" · ")} />,
    );
  }
  if (info.payment.length > 0) {
    rows.push(
      <Row key="pay" icon="chat" label={info.payment.map((item) => PAYMENT_LABEL[item.value] ?? item.value).join(" · ")} />,
    );
  }
  if (info.wifi) rows.push(<Row key="wifi" icon="link" label={"Wi-Fi " + info.wifi.value} />);
  if (place && !mapUrl) rows.push(<Row key="address" icon="pin" label={place} />);

  return (
    <article className="book-card" style={{ ...style, aspectRatio: "auto", height: "auto", overflow: "visible", color: "var(--color-fg)" }}>
      <h2 className="book-card-title text-fg">{t("en", "book.about")}</h2>
      <div className="book-card-body">
        {safeHours ? (
          hourRows ? (
            <div className="mb-3 flex flex-col gap-1">
              {hourRows.map((row) => (
                <p key={row.days + row.time} className="flex gap-3 text-fg">
                  {row.days ? <span className="text-fg-muted">{row.days}</span> : null}
                  <span>{row.time}</span>
                </p>
              ))}
            </div>
          ) : (
            <p className="mb-3 text-fg">{safeHours}</p>
          )
        ) : null}
        {rows.length > 0 ? <div className="book-rows">{rows}</div> : safeHours ? null : <p className="book-row-label">Hours and location coming soon</p>}
        {claim}
      </div>
    </article>
  );
}

export function menuPageTitle(category: string | null | undefined, continued = false, part = 1): string | null {
  const label = (category ?? "").trim();
  if (!label) return null;
  const n = part > 1 ? part : continued ? 2 : 1;
  return n > 1 ? label + " (" + n + ")" : label;
}

export function MenuCard({
  index,
  total,
  items,
  style,
  category = null,
  continued = false,
  part = 1,
  slug = "shop",
}: {
  index: number;
  total: number;
  items: readonly MenuTileData[];
  style: CSSProperties;
  category?: string | null;
  continued?: boolean;
  part?: number;
  slug?: string;
}) {
  const title = menuPageTitle(category, continued, part);
  return (
    <article
      className="book-card"
      data-menu-page={index + 1}
      data-menu-total={total}
      style={{ ...style, aspectRatio: "auto", height: "calc(min(78dvh, 760px) - var(--order-bar, 0px))", overflow: "hidden", color: "var(--color-fg)" }}
    >
      {title ? <h2 className="book-card-title text-fg">{title}</h2> : null}
      <div className="book-card-body" style={{ overflow: "hidden" }}>
        <MenuBoard slug={slug} items={items} sectionId={"menu-section-" + index} />
      </div>
    </article>
  );
}

export function ExtraCard({
  title,
  imageUrl,
  section,
  items,
  credit,
  style,
}: {
  title: string;
  imageUrl: string | null;
  section: string | null;
  items: readonly { name: string; price: string | null }[];
  credit: string | null;
  style: CSSProperties;
}) {
  return (
    <article className="book-card" style={{ ...style, aspectRatio: "auto", height: "auto", overflow: "visible", color: "var(--color-fg)" }}>
      <h2 className="book-card-title text-fg">{title}</h2>
      <div className="book-card-body book-extra">
        {imageUrl ? <img src={imageUrl} alt="" className="book-extra-photo" width="320" height="240" /> : null}
        {bookText(section) ? <p className="book-row-label text-fg">{bookText(section)}</p> : null}
        {items.map((item, index) => {
          const label = bookText(item.name);
          if (!label) return null;
          return (
            <p key={label + "-" + index} className="book-row">
              <span className="book-row-label text-fg">{displayName(label)}</span>
              {item.price ? <span className="book-tile-price text-fg">{item.price}</span> : null}
            </p>
          );
        })}
        {bookText(credit) ? <p className="book-tile-en text-fg">{t("en", "book.credit", { name: bookText(credit) ?? "" })}</p> : null}
      </div>
    </article>
  );
}
