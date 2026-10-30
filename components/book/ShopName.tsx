"use client";

import { useState, type FormEvent } from "react";
import { shopNameDraft } from "../../lib/book/shopName";
import { t } from "../../lib/copy";

export function ShopName({
  shopId,
  name,
  editing,
  className,
}: {
  shopId: string;
  name: string;
  editing: boolean;
  className: string;
}) {
  const [shown, setShown] = useState(name);
  const [open, setOpen] = useState(editing);
  const [draft, setDraft] = useState(name);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function save(event: FormEvent) {
    event.preventDefault();
    const next = shopNameDraft(draft);
    if (!next) {
      setNote(t("en", "book.nameFailed"));
      return;
    }
    setBusy(true);
    setNote("");
    try {
      const response = await fetch("/api/shops/name", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shopId, name: next }),
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; name?: string } | null;
      if (response.ok && payload?.ok && typeof payload.name === "string") {
        setShown(payload.name);
        setDraft(payload.name);
        setOpen(false);
        return;
      }
      setNote(t("en", "book.nameFailed"));
    } catch {
      setNote(t("en", "book.nameFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (open) {
    return (
      <form className="mt-2 flex flex-col gap-2" onSubmit={(event) => void save(event)}>
        <label htmlFor={"shop-name-" + shopId} className="text-sm font-semibold text-fg">
          {t("en", "book.editName")}
        </label>
        <input
          id={"shop-name-" + shopId}
          name="name"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="field"
        />
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-ink disabled:opacity-60"
        >
          {t("en", "book.saveName")}
        </button>
        {note ? (
          <p role="alert" className="text-sm text-fg">
            {note}
          </p>
        ) : null}
      </form>
    );
  }

  return (
    <>
      <h1 className={className}>{shown}</h1>
      {shown.trim() === "New shop" ? (
        <a className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold underline" href="?edit=name">
          {t("en", "book.editName")}
        </a>
      ) : null}
    </>
  );
}
