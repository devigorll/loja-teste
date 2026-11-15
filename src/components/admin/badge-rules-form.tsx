"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type BadgeRules = { new_badge_days: number; bestseller_top_n: number; bestseller_min_units: number; bestseller_window_days: number };

const FIELDS: { key: keyof BadgeRules; label: string; hint: string; max: number }[] = [
  { key: "new_badge_days", label: "Dias com o selo “Novidade”", hint: "Contados a partir do cadastro do produto.", max: 365 },
  { key: "bestseller_top_n", label: "Quantos produtos recebem “Mais vendido”", hint: "Os de maior volume de vendas no período.", max: 50 },
  { key: "bestseller_min_units", label: "Mínimo de unidades vendidas", hint: "Evita selo para quem vendeu muito pouco.", max: 1000 },
  { key: "bestseller_window_days", label: "Período analisado (dias)", hint: "Vendas confirmadas nos últimos N dias.", max: 365 },
];

/** Regras dos selos automáticos. Só administradores salvam. O selo manual de um produto sempre vence a regra. */
export function BadgeRulesForm({ initial, canEdit }: { initial: BadgeRules; canEdit: boolean }) {
  const router = useRouter();
  const [v, setV] = useState<Record<keyof BadgeRules, string>>({
    new_badge_days: String(initial.new_badge_days), bestseller_top_n: String(initial.bestseller_top_n),
    bestseller_min_units: String(initial.bestseller_min_units), bestseller_window_days: String(initial.bestseller_window_days),
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const out: Partial<BadgeRules> = {};
    for (const f of FIELDS) {
      const n = Number.parseInt(v[f.key], 10);
      if (!Number.isInteger(n) || n < 1 || n > f.max) { setMsg({ ok: false, text: `“${f.label}”: informe um número de 1 a ${f.max}.` }); return; }
      out[f.key] = n;
    }
    setBusy(true);
    const { error } = await createClient().from("store_settings").update(out).eq("id", 1);
    setBusy(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setMsg({ ok: true, text: "Regras salvas. Os selos do site já usam os novos valores." });
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="text-sm font-medium text-ink">{f.label}
            <input type="number" inputMode="numeric" min={1} max={f.max} value={v[f.key]} disabled={!canEdit}
              onChange={(e) => setV({ ...v, [f.key]: e.target.value })} className="adm-input mt-1.5" />
            <span className="mt-1 block text-xs font-normal text-muted">{f.hint}</span>
          </label>
        ))}
      </div>
      {msg && <p role="status" className={`rounded-xl p-3 text-sm font-medium ${msg.ok ? "bg-good/15 text-good" : "bg-bad/15 text-bad"}`}>{msg.text}</p>}
      {canEdit
        ? <button type="submit" disabled={busy} className="adm-btn adm-btn-primary w-full sm:w-auto">{busy ? "Salvando..." : "Salvar regras"}</button>
        : <p className="text-xs text-muted">Somente administradores podem alterar as regras.</p>}
    </form>
  );
}
