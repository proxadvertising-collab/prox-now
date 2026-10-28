"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/copy";
import { BEHIND_KEY } from "@/lib/snap/behind";

export function BehindSwitch() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    try {
      setOn(window.localStorage.getItem(BEHIND_KEY) === "1");
    } catch {
      setOn(false);
    }
  }, []);

  return (
    <label className="flex min-h-11 items-center justify-between gap-3 text-body text-fg">
      <span>{t("en", "you.behind")}</span>
      <input
        type="checkbox"
        className="h-11 w-11 accent-accent"
        checked={on}
        onChange={(event) => {
          const next = event.target.checked;
          setOn(next);
          try {
            window.localStorage.setItem(BEHIND_KEY, next ? "1" : "0");
          } catch {
            setOn(false);
          }
        }}
      />
    </label>
  );
}
