"use client";

import { useState } from "react";
import { t, type CopyKey } from "@/lib/copy";
import {
  bookBuildHref,
  bookErrorKey,
  bookTileInput,
  bookUploadState,
  pickedBookFiles,
  prepareBookPick,
  summarizeBookUpload,
  type BookTile,
  type UploadSummary,
} from "@/lib/book/builder";
import { resizeToJpeg } from "@/lib/image/resize";

const TILES: { kind: BookTile; label: CopyKey }[] = [
  { kind: "menu", label: "book.menu" },
  { kind: "storefront", label: "book.storefront" },
  { kind: "hours", label: "book.hoursTile" },
];

const primary =
  "inline-flex min-h-12 w-full items-center justify-center rounded-md bg-accent px-4 text-base font-semibold text-accent-ink no-underline";
const tileClass =
  "inline-flex min-h-16 w-full cursor-pointer items-center justify-center rounded-md bg-surface-2 px-4 text-base font-semibold text-fg";

export function BookBuilder({ slug, name }: { slug: string; name: string }) {
  const input = bookTileInput();
  const [busy, setBusy] = useState<BookTile | null>(null);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [summary, setSummary] = useState<UploadSummary | null>(null);

  function replaceThumbs(next: string[]) {
    setThumbs((current) => {
      for (const url of current) URL.revokeObjectURL(url);
      return next;
    });
  }

  async function onPick(kind: BookTile, list: FileList | null) {
    const picked = pickedBookFiles(list, input.cap);
    const plan = prepareBookPick(kind, picked.length);
    if ("error" in plan) {
      setNote(t("en", plan.error === "one" ? "book.one" : "book.failed"));
      return;
    }
    const files = picked.slice(0, plan.send);
    replaceThumbs(files.map((file) => URL.createObjectURL(file)));
    setBusy(kind);
    setSummary(null);
    setNote(
      (plan.capped ? t("en", "book.cap") + " " : "") + t("en", "book.uploading", { n: String(files.length) }),
    );
    try {
      const form = new FormData();
      form.set("shop", slug);
      form.set("kind", kind);
      for (const file of files) {
        const jpeg = await resizeToJpeg(file);
        form.append("files", new File([jpeg], "page.jpg", { type: "image/jpeg" }));
      }
      const response = await fetch("/api/book/pages", { method: "POST", body: form });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      const state = bookUploadState(response.status, body?.error);
      if (state === "signin") {
        window.location.assign("/login?next=" + encodeURIComponent(bookBuildHref(slug)));
        return;
      }
      const read = summarizeBookUpload(body);
      if (state === "ok" || state === "resting" || state === "saved") {
        setSummary(read);
        setNote(state === "ok" ? "" : t("en", bookErrorKey(body?.error) as CopyKey));
        return;
      }
      setNote(t("en", bookErrorKey(body?.error) as CopyKey));
    } catch {
      setNote(t("en", "book.failed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-title font-bold text-fg">{name}</h1>
      <p className="text-heading font-bold text-fg">{t("en", "book.build")}</p>
      <p className="text-label text-fg-muted">{t("en", "book.stay")}</p>
      <ul className="flex flex-col gap-2">
        {TILES.map((tile) => (
          <li key={tile.kind}>
            <label className={tileClass}>
              <input
                type={input.type}
                accept={input.accept}
                multiple={input.multiple}
                className="sr-only"
                disabled={busy !== null}
                onChange={(event) => {
                  const files = event.target.files;
                  event.target.value = "";
                  void onPick(tile.kind, files);
                }}
              />
              {busy === tile.kind ? t("en", "book.uploading", { n: String(thumbs.length || 1) }) : t("en", tile.label)}
            </label>
          </li>
        ))}
      </ul>
      {thumbs.length > 0 ? (
        <ul className="flex gap-2 overflow-x-auto">
          {thumbs.map((url) => (
            <li key={url}>
              <img src={url} alt="" className="h-20 w-20 rounded-md object-cover" />
            </li>
          ))}
        </ul>
      ) : null}
      {note ? (
        <p role="status" className="text-body text-fg">
          {note}
        </p>
      ) : null}
      {summary ? (
        <div className="flex flex-col gap-2 rounded-lg bg-surface-1 p-4">
          {summary.swatches.length > 0 ? (
            <div className="flex h-3 overflow-hidden rounded-full" aria-hidden="true">
              {summary.swatches.map((color) => (
                <span key={color} className="h-3 flex-1" style={{ background: color }} />
              ))}
            </div>
          ) : null}
          <p className="text-body text-fg">{t("en", "book.found", { n: String(summary.items.length) })}</p>
          {summary.items.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {summary.items.map((item) => (
                <li key={item.name} className="flex justify-between text-body text-fg">
                  <span>{item.name}</span>
                  {item.price ? <span className="tabular-nums">{item.price}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {summary.hours ? (
            <p className="text-body text-fg">
              {t("en", "book.hours")}: {summary.hours}
            </p>
          ) : null}
          <a className={primary} href={"/book/" + encodeURIComponent(slug)}>
            {t("en", "book.see")}
          </a>
        </div>
      ) : null}
    </div>
  );
}
