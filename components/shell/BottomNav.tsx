"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { t, type CopyKey } from "@/lib/copy";

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
      <span className="text-caption font-semibold leading-none">{t("en", label)}</span>
      <span
        className={
          "h-[3px] w-[3px] rounded-full " + (current ? "bg-accent" : "bg-transparent")
        }
      />
    </Link>
  );
}

export function BottomNav() {
  const pathname = usePathname() ?? "";
  const rowLink =
    "flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 rounded-md px-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

  return (
    <>
      <nav className="hidden min-h-11 items-center gap-2 border-b border-surface-2 bg-transparent px-4 md:flex" aria-label="Primary">
        {SLOTS.map((slot) => {
          const current = isCurrent(pathname, slot.href);
          return (
            <ItemLink
              key={slot.href}
              href={slot.href}
              label={slot.label}
              icon={slot.icon}
              current={current}
              className={rowLink + " " + (current ? "text-accent" : "text-fg-muted")}
            />
          );
        })}
      </nav>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 bg-surface-2 pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Primary"
      >
        <div className="relative mx-auto flex h-16 max-w-[480px] items-center justify-between border-t border-border px-2">
          {SLOTS.map((slot) => {
            const current = isCurrent(pathname, slot.href);
            if (slot.icon === "snap") {
              return <div key={slot.href} className="w-[72px] shrink-0" />;
            }
            return (
              <ItemLink
                key={slot.href}
                href={slot.href}
                label={slot.label}
                icon={slot.icon}
                current={current}
                className={rowLink + " " + (current ? "text-accent" : "text-fg-muted")}
              />
            );
          })}
          <Link
            href="/snap"
            style={{ bottom: "calc(100% - 16px)" }}
            aria-current={isCurrent(pathname, "/snap") ? "page" : undefined}
            className="absolute left-1/2 z-10 flex h-[72px] w-[72px] -translate-x-1/2 flex-col items-center justify-center gap-0.5 rounded-full bg-accent text-accent-ink shadow-glow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
          >
            <Glyph name="snap" />
            <span className="text-caption font-semibold leading-none">{t("en", "nav.snap")}</span>
            {isCurrent(pathname, "/snap") ? (
              <span className="absolute bottom-2 h-[3px] w-[3px] rounded-full bg-accent-ink" />
            ) : null}
          </Link>
        </div>
      </nav>
    </>
  );
}
