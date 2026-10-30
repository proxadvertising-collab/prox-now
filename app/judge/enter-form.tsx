"use client";

import { useState, type FormEvent } from "react";
import { FRESH_DEMO_NEXT } from "@/lib/judge/reset";
import { t } from "@/lib/copy";

const primary = "btn-primary";
const field = "field";

function noteFor(status: number, error: string | undefined): string {
  if (status === 503 || error === "demo_not_ready") return t("en", "judge.missing");
  if (status === 429 || error === "rate_limited") return t("en", "judge.rate");
  if (status === 401 || error === "sign_in_failed") return t("en", "judge.failed");
  return t("en", "err.net");
}

export function JudgeEnter() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function post(url: string, body?: { email: string; password: string }) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; ok?: boolean } | null;
      if (response.ok && payload?.ok) {
        if (url === "/api/judge/reset") {
          setMessage(t("en", "judge.fresh"));
          window.setTimeout(() => window.location.assign(FRESH_DEMO_NEXT), 600);
          return;
        }
        window.location.assign("/map");
        return;
      }
      setMessage(noteFor(response.status, payload?.error));
    } catch {
      setMessage(t("en", "err.net"));
    } finally {
      setBusy(false);
    }
  }

  function onPassword(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    void post("/api/judge/enter", { email, password });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body text-fg">{t("en", "judge.freshOffer")}</p>
      <button type="button" className={primary} disabled={busy} onClick={() => void post("/api/judge/reset")}>
        {t("en", "judge.freshStart")}
      </button>
      <button type="button" className={primary} disabled={busy} onClick={() => void post("/api/judge/enter?role=explorer")}>
        {t("en", "judge.shopper")}
      </button>
      <button type="button" className={primary} disabled={busy} onClick={() => void post("/api/judge/enter?role=owner")}>
        {t("en", "judge.owner")}
      </button>
      <p role={message ? "alert" : "status"} className="min-h-6 text-label text-fg">
        {message}
      </p>
      <form className="flex flex-col gap-3" onSubmit={onPassword}>
        <p className="text-label text-fg-muted">{t("en", "auth.or")}</p>
        <label htmlFor="judge-email" className="text-label font-semibold text-fg">
          {t("en", "auth.emailLabel")}
        </label>
        <input
          id="judge-email"
          name="email"
          type="email"
          autoComplete="username"
          className={field}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <label htmlFor="judge-password" className="text-label font-semibold text-fg">
          {t("en", "judge.password")}
        </label>
        <input
          id="judge-password"
          name="password"
          type="password"
          autoComplete="current-password"
          className={field}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button type="submit" className="inline-flex min-h-11 items-center justify-center text-base font-semibold text-accent disabled:opacity-60" disabled={busy}>
          {t("en", "auth.signIn")}
        </button>
      </form>
    </div>
  );
}
