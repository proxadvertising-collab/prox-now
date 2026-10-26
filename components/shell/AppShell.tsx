"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { BottomNav } from "@/components/shell/BottomNav";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const wide = pathname === "/inbox" || pathname.startsWith("/inbox/");
  const shellClass = [
    "mx-auto flex min-h-dvh w-full flex-col pt-[env(safe-area-inset-top)]",
    wide ? "max-w-[960px]" : "max-w-[480px]",
  ].join(" ");

  return (
    <div className={shellClass}>
      <BottomNav />
      <main className="flex flex-1 flex-col px-4 pb-[calc(120px+env(safe-area-inset-bottom))] pt-4 md:pb-8">
        {children}
      </main>
    </div>
  );
}
