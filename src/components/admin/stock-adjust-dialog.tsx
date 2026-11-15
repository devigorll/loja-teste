"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Props = { variantId: string; label: string; current: number; onClose: () => void };
type Mode = "add" | "remove" | "set";

const MODES: { value: Mode; label: string }[] = [
  { value: "add", label: "Adicionar" },
  { value: "remove", label: "Remover" },
  { value: "set", label: "Definir total" },
];

/** Ajuste de estoque de uma variação. Tudo fica registrado no histórico de movimentações. */
export function StockAdjustDialog({ variantId, label, current, onClose }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("add");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const n = Number.parseInt(qty, 10);
  const valid = Number.isInteger(n) && n >= (mode === "set" ? 0 : 1) && n <= 1000000;
  const next = !valid ? null : mode === "add" ? current + n : mode === "remove" ? current - n : n;
  const invalid = next !== null && next < 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || invalid || busy) return;
    setBusy(true); setError(null);
    const { error: err } = await createClient().rpc("adjust_stock", { p_variant_id: variantId, p_mode: mode, p_quantity: n, p_reason: reason });
    setBusy(false);
    if (err) { setError(err.message); return; }
    router.refresh();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => { if (!busy) onClose(); }}>
      <form role="dialog" aria-modal="true" aria-label="Ajustar estoque" onClick={(e) => e.stopPropagation()} onSubmit={submit}
        className="adm-card w-full max-w-sm space-y-4 rounded-b-none p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:rounded-b-2xl">
        <div>
          <h2 className="text-lg font-bold text-ink">Ajustar estoque</h2>
          <p className="text-sm text-muted">{label} · atual: <strong className="text-ink">{current}</strong></p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Tipo de ajuste">
          {MODES.map((m) => (
            <button key={m.value} type="button" onClick={() => setMode(m.value)} aria-current={mode === m.value ? "true" : undefined} className="adm-chip">{m.label}</button>
          ))}
        </div>
        <label className="block text-sm font-medium text-ink">{mode === "set" ? "Novo total em estoque" : "Quantidade"}
          <input type="number" inputMode="numeric" min={mode === "set" ? 0 : 1} value={qty} onChange={(e) => setQty(e.target.value)} autoFocus className="adm-input mt-1.5" />
        </label>
        <label className="block text-sm font-medium text-ink">Motivo <span className="font-normal text-muted">(opcional)</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Ex.: reposição do fornecedor, perda, contagem" className="adm-input mt-1.5" />
        </label>
        {next !== null && (
          <p className={`rounded-xl p-3 text-sm font-medium ${invalid ? "bg-bad/15 text-bad" : "bg-surface-2 text-ink"}`}>
            {invalid ? `Não dá para remover ${n}: o estoque atual é ${current}.` : `Estoque ficará em ${next} (${next - current >= 0 ? "+" : ""}${next - current}).`}
          </p>
        )}
        {error && <p role="alert" className="rounded-xl bg-bad/15 p-3 text-sm font-semibold text-bad">{error}</p>}
        <div className="flex gap-3">
          <button type="button" onClick={onClose} disabled={busy} className="adm-btn flex-1">Cancelar</button>
          <button type="submit" disabled={!valid || invalid || busy} className="adm-btn adm-btn-primary flex-1">{busy ? "Salvando..." : "Salvar"}</button>
        </div>
      </form>
    </div>
  );
}
