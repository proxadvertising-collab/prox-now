"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { RadarButton } from "@/components/ui/RadarButton";
import { t, type CopyKey } from "@/lib/copy";
import { navRadar } from "@/lib/snap/navShutter";
import { OrderBar, useOrderSnap } from "../order/OrderUi";

type SlotIcon = "map" | "wallet" | "snap" | "shop" | "you";

const SLOTS: Array<{ href: string; label: CopyKey; icon: SlotIcon }> = [
  { href: "/map", label: "nav.map", icon: "map" },
  { href: "/wallet", label: "nav.wallet", icon: "wallet" },
  { href: "/snap", label: "nav.snap", icon: "snap" },
  { href: "/inbox", label: "nav.shop", icon: "shop" },
  { href: "/me", label: "nav.you", icon: "you" },
];

function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

function Glyph({ name }: { name: SlotIcon }) {
  const common = {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  if (name === "map") {
    return (
      <svg {...common}>
        <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" />
        <circle cx="12" cy="10" r="2.25" />
      </svg>
    );
  }
  if (name === "wallet") {
    return (
      <svg {...common}>
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M3 10h18" />
        <circle cx="16.5" cy="14.5" r="0.8" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (name === "snap") {
    return (
      <svg {...common}>
        <path d="M4 8h3l1.6-2h6.8L17 8h3v11H4V8z" />
        <circle cx="12" cy="13" r="3.2" />
      </svg>
    );
  }
  if (name === "shop") {
    return (
      <svg {...common}>
        <path d="M4 10h16l-1.2 9H5.2L4 10z" />
        <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="8" r="3" />
      <path d="M5.5 19.5c1.4-3 3.6-4.5 6.5-4.5s5.1 1.5 6.5 4.5" />
    </svg>
  );
}

function ItemLink({
  href,
  label,
  icon,
  current,
  className,
}: {
  href: string;
  label: CopyKey;
  icon: SlotIcon;
  current: boolean;
  className: string;
}) {
  return (
    <Link
      href={href}
      className={className}
      aria-current={current ? "page" : undefined}
    >
      <Glyph name={icon} />
      <span className="nav-label">{t("en", label)}</span>
    </Link>
  );
}

export function BottomNav() {
  const pathname = usePathname() ?? "";
  const onBook = pathname.startsWith("/book");
  const order = useOrderSnap(pathname);
  const radar = navRadar(pathname, onBook, order?.count ?? 0);
  const rowLink =
    "flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 rounded-md px-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

  return (
    <>
      <nav className="relative hidden min-h-11 items-center gap-2 border-b border-surface-2 bg-transparent px-4 md:flex" aria-label="Primary">
        {SLOTS.map((slot) => {
          const current = isCurrent(pathname, slot.href);
          if (slot.icon === "snap") {
            if (!radar) return null;
            return (
              <RadarButton key={slot.href} href="/snap" size={40} className="nav-radar" label="Take a photo" current={current} />
            );
          }
          return (
            <ItemLink
              key={slot.href}
              href={slot.href}
              label={slot.label}
              icon={slot.icon}
              current={current}
                            className={rowLink + " nav-item"}
            />
          );
        })}
      </nav>
      <nav
        className="nav-shell fixed inset-x-0 bottom-0 z-30 pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Primary"
      >
        <div className="relative mx-auto flex h-[84px] max-w-[480px] items-center justify-between px-2">
          {SLOTS.map((slot) => {
            const current = isCurrent(pathname, slot.href);
            if (slot.icon === "snap") {
              return <div key={slot.href} className="nav-slot" />;
            }
            return (
              <ItemLink
                key={slot.href}
                href={slot.href}
                label={slot.label}
                icon={slot.icon}
                current={current}
                              className={rowLink + " nav-item"}
              />
            );
          })}
          {radar ? (
            <RadarButton href="/snap" size={64} className="nav-radar" label="Take a photo" current={isCurrent(pathname, "/snap")} />
          ) : null}
        </div>
      </nav>
      {order && order.count > 0 ? (
        <OrderBar count={order.count} href={"/book/" + encodeURIComponent(order.slug) + "/order"} label={order.label} caption={order.caption} />
      ) : null}
    </>
  );
}
