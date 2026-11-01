"use client";

import { useState, type ReactNode } from "react";

export function MoreSheet({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose?: () => void;
  children: ReactNode | ((close: () => void) => ReactNode);
}) {
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
    onClose?.();
  };
  const body = typeof children === "function" ? children(close) : children;
  return (
    <>
      <button
        type="button"
        className="btn-secondary min-h-12 rounded-full px-4"
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={close}>
          <div
            className="flex w-full flex-col gap-3 rounded-t-3xl bg-surface-1 p-5 text-fg shadow-sheet"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-lg font-bold">More</p>
            {body}
            <button type="button" className="btn-primary min-h-12 rounded-full" onClick={close}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
