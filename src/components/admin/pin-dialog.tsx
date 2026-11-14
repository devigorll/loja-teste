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

/** Janela do código de 4 dígitos. No celular abre como "folha" colada na parte de baixo da tela. */
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
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4" onClick={onCancel}>
      <form role="dialog" aria-modal="true" aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); if (pin.length === 4 && !loading) onSubmit(pin); }}
        className="adm-card w-full max-w-sm space-y-4 rounded-b-none p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:rounded-b-2xl">
        <h2 className="text-lg font-bold text-ink">{title}</h2>
        {description && <p className="text-sm text-muted">{description}</p>}
        <input ref={ref} type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} aria-label="Código de 4 dígitos" placeholder="••••"
          className="adm-input h-14 text-center text-2xl tracking-[0.6em]" />
        {error && <p role="alert" className="rounded-xl bg-bad/15 p-3 text-sm font-medium text-bad">{error}</p>}
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className="adm-btn flex-1">Cancelar</button>
          <button type="submit" disabled={pin.length !== 4 || loading} className="adm-btn adm-btn-primary flex-1">
            {loading ? "Verificando..." : "Autorizar"}
          </button>
        </div>
      </form>
    </div>
  );
}
