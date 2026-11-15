"use client";

import { useEffect } from "react";

type Props = {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  loading?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Confirmação de ações importantes. No celular abre como "folha" colada na parte de baixo. */
export function ConfirmDialog({ title, description, confirmLabel, danger = false, loading = false, error, onConfirm, onCancel }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !loading) onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, loading]);

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => { if (!loading) onCancel(); }}>
      <div role="alertdialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        className="adm-card w-full max-w-sm space-y-4 rounded-b-none p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:rounded-b-2xl">
        <h2 className="text-lg font-bold text-ink">{title}</h2>
        <p className="text-sm text-muted">{description}</p>
        {error && <p role="alert" className="rounded-xl bg-bad/15 p-3 text-sm font-semibold text-bad">{error}</p>}
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} disabled={loading} className="adm-btn flex-1">Cancelar</button>
          <button type="button" onClick={onConfirm} disabled={loading} className={`adm-btn flex-1 ${danger ? "adm-btn-good" : "adm-btn-primary"}`}>
            {loading ? "Aguarde..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
