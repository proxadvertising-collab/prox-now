"use client";

import { useEffect, useRef, useState } from "react";
import { SnapFlow } from "@/components/snap/SnapFlow";
import { RadarButton } from "@/components/ui/RadarButton";
import {
  addSeedShot,
  bookKind,
  bubbleCount,
  captureFix,
  emptyTray,
  menuButton,
  parkMenu,
  seedTitle,
  showSeedDone,
  shotsFor,
  slotOpen,
  stampLine,
  type CaptureFix,
  type SeedSlot,
  type SeedTray,
} from "@/lib/camera/seed";
import { uploadBookSession, type BookShot } from "@/lib/book/builder";
import { DEMO_ZONE_FALLBACK } from "@/lib/demo/zone";
import { stageSnapFile } from "@/lib/snap/handoff";
import { createClient } from "@/lib/supabase/client";

const SLOTS: { slot: SeedSlot; label: string }[] = [
  { slot: "logo", label: "Logo" },
  { slot: "menu", label: "Menu/Product" },
  { slot: "hours", label: "Hours" },
  { slot: "extras", label: "Extras" },
];

type Match = { id: string; slug: string; name: string; hasBook: boolean };

async function lookupDemoPoint(): Promise<{ lat: number; lng: number } | null> {
  try {
    const supabase = createClient();
    const account = await supabase.from("demo_accounts").select("role").limit(1);
    if (account.error || (account.data?.length ?? 0) === 0) return null;
    const zone = await supabase.rpc("demo_zone");
    const row = Array.isArray(zone.data) ? zone.data[0] : null;
    if (row && typeof row.lat === "number" && typeof row.lng === "number") return { lat: row.lat, lng: row.lng };
    return { lat: DEMO_ZONE_FALLBACK.lat, lng: DEMO_ZONE_FALLBACK.lng };
  } catch {
    return null;
  }
}

async function shopHasBook(shopId: string): Promise<boolean> {
  try {
    const supabase = createClient();
    const pages = await supabase.from("shop_book_pages").select("id").eq("shop_id", shopId).limit(1);
    if (pages.error) return false;
    return (pages.data?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

function readMatch(body: {
  result?: { shopId?: string | null; placeName?: string | null; signText?: { original?: string; translated?: string }[] };
  candidates?: { id: string; slug?: string; name: string }[];
  place?: { name?: string | null } | null;
}): { id: string; slug: string; name: string } | { name: string } | null {
  const id = body.result?.shopId ?? null;
  const known = id ? body.candidates?.find((shop) => shop.id === id) : null;
  if (known) return { id: known.id, slug: known.slug ?? known.id, name: known.name };
  const sign = body.result?.signText?.[0];
  const name =
    body.place?.name?.trim() ||
    body.result?.placeName?.trim() ||
    sign?.translated?.trim() ||
    sign?.original?.trim() ||
    "";
  return name ? { name } : null;
}

export function LiveCamera({
  preselected = null,
  startSeeding = false,
}: {
  preselected?: { id: string; name: string } | null;
  startSeeding?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [tray, setTray] = useState<SeedTray>(emptyTray());
  const [fan, setFan] = useState(startSeeding);
  const [hasBook, setHasBook] = useState(false);
  const [match, setMatch] = useState<Match | null>(
    preselected ? { id: preselected.id, slug: preselected.id, name: preselected.name, hasBook: false } : null,
  );
  const [draftName, setDraftName] = useState(preselected?.name ?? "");
  const [liveFile, setLiveFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [flying, setFlying] = useState<{ url: string; go: boolean } | null>(null);
  const [badge, setBadge] = useState(0);
  const [busy, setBusy] = useState(false);
  const [savedSlug, setSavedSlug] = useState<string | null>(null);
  const [files, setFiles] = useState<Record<string, File>>({});

  useEffect(() => {
    let stopped = false;
    const video = videoRef.current;
    void navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then((stream) => {
        if (stopped) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        streamRef.current = stream;
        if (video) {
          video.srcObject = stream;
          void video.play();
        }
      })
      .catch(() => setNote("The camera did not open."));
    return () => {
      stopped = true;
      for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    };
  }, []);

  async function grab(fix: CaptureFix): Promise<File> {
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    const width = video?.videoWidth || 1280;
    const height = video?.videoHeight || 720;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context || !video) throw new Error("frame");
    context.drawImage(video, 0, 0, width, height);
    const line = stampLine(fix);
    context.fillStyle = "rgba(0,0,0,0.55)";
    context.fillRect(0, height - 40, width, 40);
    context.fillStyle = "#fff";
    context.font = "16px sans-serif";
    context.fillText(line, 12, height - 14);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) throw new Error("jpeg");
    return new File([blob], `shot-${fix.at}.jpg`, { type: "image/jpeg" });
  }

  async function shoot() {
    if (busy) return;
    setNote("");
    const fix = await captureFix({
      lookupDemo: lookupDemoPoint,
      locate: () =>
        new Promise((resolve) => {
          if (typeof navigator === "undefined" || !navigator.geolocation) {
            resolve(null);
            return;
          }
          navigator.geolocation.getCurrentPosition(
            (position) =>
              resolve({
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
              }),
            () => resolve(null),
            { enableHighAccuracy: true, maximumAge: 10_000, timeout: 8_000 },
          );
        }),
    });
    if (!fix) {
      setNote("Location is required for a shot.");
      return;
    }
    let file: File;
    try {
      file = await grab(fix);
    } catch {
      setNote("That frame did not save.");
      return;
    }
    const armed = tray.armed;
    if (!armed) {
      stageSnapFile(file);
      setLiveFile(file);
      return;
    }
    const id = crypto.randomUUID();
    const next = addSeedShot(tray, { id, slot: armed, fix }, hasBook);
    if (next === tray) {
      setNote(armed === "extras" ? "Extras needs a book." : "That set is full.");
      return;
    }
    setFiles((current) => ({ ...current, [id]: file }));
    setTray(next);
    if (armed !== "menu") launch(file);
    if (armed === "logo" || !match) void matchShop(file, fix);
  }

  function launch(file: File) {
    const url = URL.createObjectURL(file);
    setFlying({ url, go: false });
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setFlying((current) => (current && current.url === url ? { url, go: true } : current)));
    });
  }

  async function matchShop(file: File, fix: CaptureFix) {
    try {
      const form = new FormData();
      form.set("image", file, "logo.jpg");
      form.set("lat", String(fix.lat));
      form.set("lng", String(fix.lng));
      const response = await fetch("/api/analyze", { method: "POST", body: form });
      const body = (await response.json().catch(() => null)) as Parameters<typeof readMatch>[0] | null;
      if (!body) return;
      const found = readMatch(body);
      if (!found) return;
      if ("id" in found) {
        const book = await shopHasBook(found.id);
        setHasBook(book);
        setMatch({ ...found, hasBook: book });
        setDraftName(found.name);
        return;
      }
      setDraftName(found.name);
    } catch {
      setNote("The shop match did not finish.");
    }
  }

  async function finish() {
    if (busy || tray.shots.length === 0) return;
    setBusy(true);
    setNote("");
    try {
      let shop = match;
      if (!shop) {
        const name = draftName.trim();
        if (name.length < 2) {
          setNote("Name the shop before Done.");
          return;
        }
        const here = tray.shots[0]?.fix;
        if (!here) return;
        const response = await fetch("/api/shops", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            nameLocal: "",
            category: "other",
            lat: here.lat,
            lng: here.lng,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        });
        const body = (await response.json().catch(() => null)) as { id?: string; slug?: string; shop?: { id?: string; slug?: string } } | null;
        const id = body?.shop?.id ?? body?.id;
        if (!response.ok || !id) {
          setNote("The shop was not created.");
          return;
        }
        shop = { id, slug: body?.shop?.slug ?? body?.slug ?? id, name, hasBook: false };
        setMatch(shop);
      }
      const bookShots: BookShot[] = tray.shots.flatMap((shot) => {
        const file = files[shot.id];
        if (!file) return [];
        const kind = shot.slot === "extras" ? "extra" : bookKind(shot.slot);
        return [{ id: shot.id, kind, file }];
      });
      const result = await uploadBookSession(shop.id, bookShots, fetch, shop.hasBook ? "improve" : undefined);
      if (result.status >= 400 && result.error !== "upstream") {
        setNote("The book did not save.");
        return;
      }
      const summary =
        result.body && typeof result.body === "object" && "summary" in result.body && typeof result.body.summary === "string"
          ? result.body.summary
          : "";
      setSavedSlug(shop.slug);
      if (summary) setNote(summary);
    } catch {
      setNote("The book did not save.");
    } finally {
      setBusy(false);
    }
  }

  const menu = menuButton(tray);
  const parked = bubbleCount(tray);
  if (!flying && badge !== parked) {
    queueMicrotask(() => setBadge(parked));
  }

  if (liveFile) {
    return (
      <div className="fixed inset-0 z-40 overflow-y-auto bg-bg p-4">
        <button type="button" className="mb-3 min-h-11 text-label font-semibold text-fg" onClick={() => setLiveFile(null)}>
          ← Camera
        </button>
        <SnapFlow preselected={preselected} onRetake={() => setLiveFile(null)} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 bg-black text-white">
      <video ref={videoRef} className="h-full w-full object-cover" autoPlay muted playsInline />
      <a className="absolute left-4 top-4 inline-flex min-h-11 min-w-11 items-center text-2xl" href="/map" aria-label="Back">
        ←
      </a>
      <div className="absolute right-4 top-4 flex flex-col items-end gap-2">
        <button
          type="button"
          className="relative inline-flex min-h-11 items-center rounded-full bg-white/90 px-4 font-semibold text-black"
          onClick={() => setFan((open) => !open)}
        >
          {seedTitle(hasBook)}
          {badge > 0 ? (
            <span
              key={badge}
              className="absolute -right-2 -top-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-accent px-1 text-caption font-bold text-accent-ink"
              style={{ animation: "seed-bump 200ms ease-out" }}
            >
              {badge}
            </span>
          ) : null}
        </button>
        {showSeedDone(tray) ? (
          <button type="button" className="min-h-11 rounded-full bg-accent px-4 font-semibold text-accent-ink" disabled={busy} onClick={() => void finish()}>
            {busy ? "Saving" : "Done"}
          </button>
        ) : null}
        {fan ? (
          <div className="flex flex-col items-end gap-2">
            {SLOTS.map(({ slot, label }) => {
              const enabled = slotOpen(slot, hasBook);
              const text = slot === "menu" ? (menu.label === "Done" ? `Done (${menu.count})` : label) : label;
              return (
                <button
                  key={slot}
                  type="button"
                  disabled={!enabled}
                  className="min-h-11 rounded-full bg-white/90 px-3 font-semibold text-black disabled:opacity-40"
                  onClick={() => {
                    if (slot === "menu" && menu.label === "Done") {
                      const last = shotsFor(tray, "menu").at(-1);
                      const file = last ? files[last.id] : null;
                      if (file) launch(file);
                      setTray((current) => parkMenu(current));
                      return;
                    }
                    setTray((current) => ({ ...current, armed: slot }));
                    setFan(false);
                  }}
                >
                  {text}
                  {slot !== "menu" && shotsFor(tray, slot).length > 0 ? ` ${shotsFor(tray, slot).length}` : ""}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
      <style>{"@keyframes seed-bump { from { transform: scale(0.6); } to { transform: scale(1); } }"}</style>
      {flying ? (
        <img
          src={flying.url}
          alt=""
          className="pointer-events-none absolute left-1/2 top-1/2 z-20 h-16 w-16 rounded-md object-cover"
          style={{
            transition: "transform 400ms ease-in",
            transform: flying.go
              ? "translate(calc(50vw - 5rem), calc(-50vh + 1.5rem)) scale(0.15)"
              : "translate(-50%, -50%) scale(1)",
          }}
          onTransitionEnd={() => {
            URL.revokeObjectURL(flying.url);
            setFlying(null);
          }}
        />
      ) : null}
      {!match && draftName ? (
        <label className="absolute inset-x-4 bottom-28 text-black">
          <span className="text-label text-white">Shop name</span>
          <input className="mt-1 min-h-11 w-full rounded-md px-3 text-black" value={draftName} onChange={(event) => setDraftName(event.target.value)} />
        </label>
      ) : null}
      <RadarButton
        label="Take a photo"
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
        onClick={() => void shoot()}
      />
      {note ? <p className="absolute inset-x-4 bottom-32 text-center text-body">{note}</p> : null}
      {savedSlug ? (
        <a className="absolute bottom-32 left-1/2 -translate-x-1/2 rounded-full bg-accent px-4 py-3 font-semibold text-accent-ink" href={"/book/" + encodeURIComponent(savedSlug)}>
          View book
        </a>
      ) : null}
    </div>
  );
}
