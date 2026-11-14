"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  title: string;
  description?: string;
  error: string | null;
  loading: boolean;
  onCancel: () => void;
  onSubmit: (pin: string) => void;
};

export function PinDialog({ title, description, error, loading, onCancel, onSubmit }: Props) {
  const [pin, setPin] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => ref.current?.focus(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  useEffect(() => {
    if (error) { setPin(""); ref.current?.focus(); }
  }, [error]);

  return (
    <div className="fixed inset-0 z-[110] grid place-items-center bg-black/60 p-4" onClick={onCancel}>
      <form role="dialog" aria-modal="true" aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); if (pin.length === 4 && !loading) onSubmit(pin); }}
        className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-2xl dark:bg-neutral-900">
        <h2 className="text-lg font-bold">{title}</h2>
        {description && <p className="text-sm text-neutral-500">{description}</p>}
        <input ref={ref} type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} aria-label="Código de 4 dígitos" placeholder="••••"
          className="w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-3 text-center text-2xl tracking-[0.6em] outline-none focus:ring-2 focus:ring-neutral-900 dark:border-neutral-700 dark:focus:ring-white" />
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className="flex-1 rounded-full border border-neutral-300 py-2.5 text-sm font-medium transition active:scale-95 dark:border-neutral-700">Cancelar</button>
          <button type="submit" disabled={pin.length !== 4 || loading}
            className="flex-1 rounded-full bg-neutral-950 py-2.5 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50 dark:bg-white dark:text-neutral-950">
            {loading ? "Verificando..." : "Autorizar"}
          </button>
        </div>
      </form>
    </div>
  );
}
