"use client";

import { useState, type ReactNode } from "react";

export function MoreSheet({
  label,
  children,
}: {
  label: string;
  children: ReactNode | ((close: () => void) => ReactNode);
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const body = typeof children === "function" ? children(close) : children;
  return (
    <>
      <button
        type="button"
        className="inline-flex min-h-12 items-center justify-center rounded-full border border-accent bg-transparent px-4 text-sm font-semibold text-accent"
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={() => setOpen(false)}>
          <div
            className="flex w-full flex-col gap-3 rounded-t-3xl bg-[#FFF6EE] p-5 text-[#1A120B]"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-lg font-bold">More</p>
            {body}
            <button type="button" className="min-h-12 rounded-full bg-[#1A120B] font-bold text-white" onClick={close}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
