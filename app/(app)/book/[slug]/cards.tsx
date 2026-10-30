import type { CSSProperties, ReactNode } from "react";
import { t } from "../../../../lib/copy";
import type { ShopInfo } from "../../../../lib/book/present";

export const MENU_PAGE_SIZE = 6;

export type MenuTileData = {
  name: string;
  nameEn: string | null;
  price: string | null;
  photo: string | null;
  category?: string | null;
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
  | { type: "menu"; index: number; total: number; items: MenuTileData[]; category: string | null }
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

function groupMenu(items: readonly MenuTileData[]): { category: string | null; items: MenuTileData[] }[] {
  const groups: { category: string | null; items: MenuTileData[] }[] = [];
  for (const item of items) {
    const category = item.category ?? null;
    const last = groups[groups.length - 1];
    if (last && last.category === category) last.items.push(item);
    else groups.push({ category, items: [item] });
  }
  return groups;
}

export function buildDeck(input: {
  menuItems: readonly MenuTileData[];
  extras: readonly string[];
  deals?: readonly DealTile[];
}): DeckCard[] {
  const cards: DeckCard[] = [{ type: "cover" }];
  if (input.deals && input.deals.length > 0) cards.push({ type: "deals", deals: [...input.deals] });
  const menus = groupMenu(input.menuItems).flatMap((group) =>
    chunkMenu(group.items).map((items) => ({ items, category: group.category })),
  );
  menus.forEach((group, index) => {
    cards.push({ type: "menu", index, total: menus.length, items: group.items, category: group.category });
  });
  cards.push({ type: "info" });
  for (const id of input.extras) cards.push({ type: "extra", id });
  return cards;
}

export function bookCardCount(menuPages: number, extras: number, deals = 0): number {
  return 2 + (deals > 0 ? 1 : 0) + menuPages + extras;
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
}: {
  name: string;
  nameEn?: string | null;
  logoUrl: string | null;
  heroUrl?: string | null;
  tagline: string | null;
  mood: string;
  style: CSSProperties;
  liveLabel?: string | null;
}) {
  const letter = name.trim().slice(0, 1).toUpperCase() || "?";
  return (
    <article className="book-card book-cover" style={style}>
      {heroUrl ? <img src={heroUrl} alt="" className="book-cover-photo" /> : null}
      <div className="book-cover-scrim" />
      <div className="book-card-body book-cover-body">
        {liveLabel ? (
          <p className="book-live">
            <span className="book-live-dot" />
            {liveLabel}
          </p>
        ) : null}
        {logoUrl ? (
          <img src={logoUrl} alt="" className="book-logo" width="96" height="96" />
        ) : (
          <div className="book-logo book-logo-letter">{letter}</div>
        )}
        <h1 className={"book-shop-name " + mood}>{name}</h1>
        {nameEn ? <p className="book-name-en">{nameEn}</p> : null}
        {tagline ? <p className="book-tags">{tagline}</p> : null}
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
}: {
  hours: string | null;
  info: ShopInfo;
  mapUrl: string | null;
  style: CSSProperties;
}) {
  const rows: ReactNode[] = [];
  if (hours) rows.push(<Row key="hours" icon="clock" label={t("en", "book.hours") + ": " + hours} />);
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
  if (mapUrl) rows.push(<Row key="map" icon="pin" label={info.address?.value ?? t("en", "book.maps")} href={mapUrl} />);
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
  if (info.address && !mapUrl) rows.push(<Row key="address" icon="pin" label={info.address.value} />);

  return (
    <article className="book-card" style={style}>
      <h2 className="book-card-title">{t("en", "book.about")}</h2>
      <div className="book-card-body">
        {rows.length > 0 ? <div className="book-rows">{rows}</div> : <p className="book-row-label">Hours and location coming soon</p>}
      </div>
    </article>
  );
}

export function MenuCard({
  index,
  total,
  items,
  style,
  category = null,
}: {
  index: number;
  total: number;
  items: readonly MenuTileData[];
  style: CSSProperties;
  category?: string | null;
}) {
  const title = category ?? t("en", "book.menuOf", { n: String(index + 1), total: String(total) });
  return (
    <article className="book-card" style={style}>
      <h2 className="book-card-title">{title}</h2>
      <div className="book-card-body">
        <div className="book-tile-grid">
          {items.map((item, itemIndex) => (
            <MenuTile key={item.name + "-" + itemIndex} {...item} />
          ))}
        </div>
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
    <article className="book-card" style={style}>
      <h2 className="book-card-title">{title}</h2>
      <div className="book-card-body book-extra">
        {imageUrl ? <img src={imageUrl} alt="" className="book-extra-photo" width="320" height="240" /> : null}
        {section ? <p className="book-row-label">{section}</p> : null}
        {items.map((item, index) => (
          <p key={item.name + "-" + index} className="book-row">
            <span className="book-row-label">{item.name}</span>
            {item.price ? <span className="book-tile-price">{item.price}</span> : null}
          </p>
        ))}
        {credit ? <p className="book-tile-en">{t("en", "book.credit", { name: credit })}</p> : null}
      </div>
    </article>
  );
}
