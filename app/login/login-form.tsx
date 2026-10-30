"use client";

import { useLayoutEffect, useState, type FormEvent } from "react";
import { signUpFailure } from "@/lib/auth/signup";
import { t } from "@/lib/copy";
import {
  KEEP_STORAGE_KEY,
  SESSION_MIRROR_KEY,
  clientSkipsLogin,
  createClient,
  sessionPersistence,
  shouldClearTabSession,
} from "@/lib/supabase/client";

const primary = "btn-primary";
const field = "field";

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function LoginForm({ dest, createDest, failed }: { dest: string; createDest: string; failed: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [keep, setKeep] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(failed ? t("en", "auth.failed") : null);

  useLayoutEffect(() => {
    let persistence = sessionPersistence(true);
    let mirror: string | null = null;
    try {
      persistence = sessionPersistence(window.localStorage.getItem(KEEP_STORAGE_KEY) !== "0");
      mirror = persistence === "session" ? window.sessionStorage.getItem(SESSION_MIRROR_KEY) : null;
    } catch {
      return;
    }
    if (clientSkipsLogin(persistence, mirror)) {
      window.location.replace(dest);
      return;
    }
    if (shouldClearTabSession(persistence, mirror)) createClient();
  }, [dest]);

  async function signIn() {
    const address = email.trim();
    if (!isEmail(address)) {
      setError(t("en", "auth.emailInvalid"));
      return;
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient({ keepSignedIn: keep });
      const { error: signError } = await supabase.auth.signInWithPassword({
        email: address,
        password,
      });
      if (signError) {
        setError(t("en", "auth.failed"));
        return;
      }
      window.location.assign(dest);
    } catch {
      setError(t("en", "auth.failed"));
    } finally {
      setLoading(false);
    }
  }

  async function signUp() {
    const address = email.trim();
    if (!isEmail(address)) {
      setError(t("en", "auth.emailInvalid"));
      return;
    }
    if (password.length < 6) {
      setError(t("en", "auth.weak"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient({ keepSignedIn: keep });
      const { data, error: signError } = await supabase.auth.signUp({
        email: address,
        password,
      });
      if (signError) {
        const problem = signUpFailure(signError.message);
        const key = problem === "taken" ? "auth.taken" : problem === "weak" ? "auth.weak" : problem === "confirm" ? "auth.confirm" : "auth.failed";
        setError(t("en", key));
        return;
      }
      if (!data.session) {
        setError(t("en", "auth.confirm"));
        return;
      }
      window.location.assign(createDest);
    } catch {
      setError(t("en", "auth.failed"));
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const mode = submitter instanceof HTMLButtonElement ? submitter.value : "sign-in";
    if (mode === "sign-up") void signUp();
    else void signIn();
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
      <p
        id="auth-message"
        role={error ? "alert" : "status"}
        className={"min-h-6 text-label " + (error ? "text-danger" : "text-fg-muted")}
      >
        {error ?? ""}
      </p>
      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="text-label font-semibold text-fg">
          {t("en", "auth.emailLabel")}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="email"
          className={field}
          value={email}
          aria-describedby="auth-message"
          aria-invalid={error ? true : undefined}
          onChange={(event) => {
            setEmail(event.target.value);
            setError(null);
          }}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="password" className="text-label font-semibold text-fg">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          className={field}
          value={password}
          aria-describedby="auth-message"
          aria-invalid={error ? true : undefined}
          onChange={(event) => {
            setPassword(event.target.value);
            setError(null);
          }}
        />
      </div>
      <label className="flex min-h-11 items-center gap-3 text-label text-fg">
        <input
          type="checkbox"
          className="field-check"
          name="keep"
          checked={keep}
          onChange={(event) => setKeep(event.target.checked)}
        />
        Keep me signed in
      </label>
      <div className="flex gap-2">
        <button type="submit" name="mode" value="sign-in" className={primary + " flex-1"} disabled={loading}>
          {t("en", "auth.signIn")}
        </button>
        <button type="submit" name="mode" value="sign-up" className="inline-flex min-h-12 flex-1 items-center justify-center rounded-md border border-border px-4 text-base font-semibold text-fg" disabled={loading}>
          {t("en", "auth.create")}
        </button>
      </div>
    </form>
  );
}
