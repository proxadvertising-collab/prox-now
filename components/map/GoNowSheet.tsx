"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { noteMapAsk } from "@/lib/judge/script";

type Card = {
  shopId: string;
  name: string;
  slug: string;
  reason: string;
  walkMinutes: number;
  lat: number;
  lng: number;
};

type Answer = {
  mode: "picks" | "nearby" | "empty";
  picks: Card[];
  nearby: Card[];
};

const CHIPS = ["Food now", "Cheap eats", "Something to do"] as const;

type SpeechResult = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type SpeechRecognitionLike = {
  lang: string;
  onresult: ((event: SpeechResult) => void) | null;
  start: () => void;
};

export type AskOutcome =
  | { ok: true; answer: Answer }
  | { ok: false; note: string };

/** Ask from a known point. A demo session uses the pilot center, so this does not wait for GPS. */
export async function completeAsk(
  lat: number | null,
  lng: number | null,
  q: string,
  fetcher: typeof fetch = fetch,
): Promise<AskOutcome> {
  if (lat === null || lng === null) return { ok: false, note: "Turn on location, then ask again." };
  let response: Response;
  try {
    response = await fetcher("/api/go-now", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q, lat, lng }),
    });
  } catch {
    return { ok: false, note: "The map could not answer just now." };
  }
  const body = (await response.json().catch(() => null)) as (Answer & { error?: string }) | null;
  if (response.status === 429) return { ok: false, note: "Too many asks this hour." };
  if (!body || (body.mode !== "picks" && body.mode !== "nearby" && body.mode !== "empty")) {
    return { ok: false, note: "The map could not answer just now." };
  }
  noteMapAsk();
  return { ok: true, answer: body };
}

function speechCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const host = window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return host.webkitSpeechRecognition ?? null;
}

export function GoNowSheet({
  lat,
  lng,
  onClose,
  onShowMap,
}: {
  lat: number | null;
  lng: number | null;
  onClose: () => void;
  onShowMap: (place: { shopId: string; lat: number; lng: number }) => void;
}) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [speech, setSpeech] = useState(false);

  useEffect(() => {
    setSpeech(speechCtor() !== null);
  }, []);

  async function ask(text: string) {
    const q = text.trim();
    setQuestion(q);
    setBusy(true);
    setNote(null);
    const result = await completeAsk(lat, lng, q);
    if (!result.ok) {
      setAnswer(null);
      setNote(result.note);
    } else {
      setAnswer(result.answer);
    }
    setBusy(false);
  }

  function listen() {
    const Ctor = speechCtor();
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const said = event.results[0]?.[0]?.transcript ?? "";
      if (said) void ask(said);
    };
    recognition.start();
  }

  const cards = answer?.mode === "picks" ? answer.picks : answer?.mode === "nearby" ? answer.nearby : [];

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 max-h-[75%] overflow-y-auto rounded-t-lg bg-bg p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-heading font-bold text-fg">Ask</h2>
        <button type="button" className="min-h-11 px-3 text-label font-semibold text-fg" onClick={onClose}>
          Close
        </button>
      </div>
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void ask(question);
        }}
      >
        <label className="flex gap-2">
          <span className="sr-only">Ask the map</span>
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Hungry? Bored? Ask what's good right now"
            className="min-h-11 flex-1 rounded-md bg-surface-2 px-3 text-body text-fg"
          />
          {speech ? (
            <button type="button" className="min-h-11 rounded-md bg-surface-2 px-3 text-label font-semibold text-fg" onClick={listen}>
              Speak
            </button>
          ) : null}
        </label>
        <div className="flex flex-wrap gap-2">
          {CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              className="min-h-11 rounded-full bg-surface-2 px-3 text-label font-semibold text-fg"
              onClick={() => void ask(chip)}
            >
              {chip}
            </button>
          ))}
        </div>
        <button type="submit" className="min-h-11 rounded-md bg-accent px-4 font-semibold text-accent-ink" disabled={busy}>
          {busy ? "Asking…" : "Ask"}
        </button>
      </form>
      {note ? <p className="mt-3 text-body text-fg">{note}</p> : null}
      {answer?.mode === "empty" ? (
        <p className="mt-3 text-body text-fg">Nothing live around here yet. Open a book after someone snaps a shop.</p>
      ) : null}
      {answer?.mode === "nearby" ? <h3 className="mt-4 text-label font-semibold text-fg">Nearby now</h3> : null}
      {answer?.mode === "nearby" && cards.length === 0 ? (
        <p className="mt-2 text-body text-fg">No open places nearby.</p>
      ) : null}
      <ul className="mt-3 flex flex-col gap-3">
        {cards.map((place) => (
          <li key={place.shopId} className="rounded-lg bg-surface-1 p-3">
            <p className="text-body font-bold text-fg">{place.name}</p>
            {place.reason ? <p className="text-label text-fg">{place.reason}</p> : null}
            <p className="text-label text-fg-muted">{place.walkMinutes} min walk</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link className="inline-flex min-h-11 items-center rounded-md bg-accent px-3 font-semibold text-accent-ink no-underline" href={"/book/" + place.slug}>
                Open book
              </Link>
              <button
                type="button"
                className="inline-flex min-h-11 items-center rounded-md bg-surface-2 px-3 font-semibold text-fg"
                onClick={() => onShowMap({ shopId: place.shopId, lat: place.lat, lng: place.lng })}
              >
                Show on map
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
