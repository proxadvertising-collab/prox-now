"use client";

import { useEffect, useState } from "react";
import { t } from "../../lib/copy";
import { DEVICE_LANGS, DEVICE_LANG_KEY, deviceLang } from "../../lib/i18n/device";

export function LanguageSwitch() {
  const [lang, setLang] = useState("en");

  useEffect(() => {
    const saved = window.localStorage.getItem(DEVICE_LANG_KEY);
    setLang(deviceLang(saved, navigator.language));
  }, []);

  return (
    <label className="flex flex-col gap-1 text-sm font-semibold text-fg">
      {t(lang === "th" ? "th" : "en", "lang.label")}
      <select
        className="min-h-12 rounded-md border border-border bg-surface-1 px-3 text-base text-fg"
        value={lang}
        aria-label={t(lang === "th" ? "th" : "en", "lang.label")}
        onChange={(event) => {
          const next = event.target.value;
          window.localStorage.setItem(DEVICE_LANG_KEY, next);
          setLang(next);
          window.dispatchEvent(new Event("prox-lang"));
        }}
      >
        {DEVICE_LANGS.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}
