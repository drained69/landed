"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Native modal behavior provides focus containment, Escape, and focus restoration. */
export function Modal({ children, label, onClose, align = "right" }: {
  children: ReactNode; label: string; onClose: () => void; align?: "left" | "right";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={label}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      className={`m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-transparent p-0 text-cream open:flex ${align === "right" ? "justify-end" : "justify-start"} backdrop:bg-black/40 backdrop:backdrop-blur-sm`}
    >
      {children}
    </dialog>
  );
}
