"use client";

import { useState } from "react";
import { t, type CopyKey } from "@/lib/copy";
import { needsExternalBrowser, type LocateResult } from "@/lib/geo/locate";

const actionClass =
  "inline-flex min-h-11 w-full items-center justify-center rounded-md bg-surface-2 px-3 text-base font-semibold text-fg touch-manipulation";

function messageKey(status: LocateResult["status"] | null): CopyKey {
  if (status === "denied") return "loc.denied";
  if (status === "timeout") return "loc.timeout";
  if (status === "insecure") return "loc.insecure";
  if (status === "no_api") return "loc.noApi";
  if (status === "unavailable") return "loc.unavailable";
  return "loc.need";
}

export function LocationHelp({
  status,
  onTryAgain,
  force = false,
}: {
  status: LocateResult["status"] | null;
  onTryAgain: () => void;
  force?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [link, setLink] = useState("");
  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const external = needsExternalBrowser(userAgent, status);

  async function copyLink() {
    const href = window.location.href;
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      setLink("");
    } catch {
      setCopied(false);
      setLink(href);
    }
  }

  if (external) {
    return (
      <div className="flex w-full flex-col gap-2 rounded-lg bg-surface-1 p-3 shadow-card" role="status">
        <p className="text-body text-fg">{t("en", "loc.openOut")}</p>
        <button type="button" className={actionClass} onClick={() => void copyLink()}>
          {copied ? t("en", "loc.copied") : t("en", "loc.copy")}
        </button>
        {link ? (
          <input readOnly className="min-h-11 w-full rounded-md bg-surface-2 px-2 text-caption text-fg" value={link} />
        ) : null}
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div className="flex w-full flex-col gap-2 rounded-lg bg-surface-1 p-3 shadow-card" role="alert">
        <p className="text-body text-fg">{t("en", "loc.iphone")}</p>
        <p className="text-body text-fg">{t("en", "loc.android")}</p>
        <button type="button" className={actionClass} onClick={onTryAgain}>
          {t("en", "err.retry")}
        </button>
      </div>
    );
  }

  if (!force) return null;

  return (
    <div className="flex w-full flex-col gap-2 rounded-lg bg-surface-1 p-3 shadow-card" role="status">
      <p className="text-body text-fg">{t("en", messageKey(status))}</p>
      <button type="button" className={actionClass} onClick={onTryAgain}>
        {t("en", "err.retry")}
      </button>
    </div>
  );
}
