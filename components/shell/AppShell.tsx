"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { BottomNav } from "@/components/shell/BottomNav";
import { t } from "@/lib/copy";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const wide = pathname === "/inbox" || pathname.startsWith("/inbox/");
  const isMap = pathname === "/map";
  const [ownsShop, setOwnsShop] = useState(false);

  useEffect(() => {
    let stopped = false;
    void fetch("/api/owner/home")
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as { shops?: unknown[] };
      })
      .then((body) => {
        if (!stopped) setOwnsShop(Array.isArray(body?.shops) && body.shops.length > 0);
      })
      .catch(() => {
        if (!stopped) setOwnsShop(false);
      });
    return () => {
      stopped = true;
    };
  }, [pathname]);
  const shellClass = [
    "mx-auto flex min-h-dvh w-full flex-col pt-[env(safe-area-inset-top)]",
    wide ? "max-w-[960px]" : "max-w-[480px]",
  ].join(" ");
  const mainClass = isMap
    ? "flex min-h-0 flex-1 flex-col"
    : "flex flex-1 flex-col px-4 pb-[calc(120px+env(safe-area-inset-bottom))] pt-4 md:pb-8";

  return (
    <div className={shellClass}>
      <BottomNav />
      {ownsShop ? (
        <a className="inline-flex min-h-11 items-center px-4 text-label font-semibold text-fg" href="/owner">
          {t("en", "loop.owner")}
        </a>
      ) : null}
      <main className={mainClass}>{children}</main>
    </div>
  );
}
