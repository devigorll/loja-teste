"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatBRL } from "@/lib/format";
import { parseMoney } from "@/lib/admin/products";
import { computeDiscount, type DiscountState } from "@/lib/discount";
import { DiscountFields } from "./discount-fields";
import { PinDialog } from "./pin-dialog";

type Mode = "full" | "partial" | "discount";
const MODES: { v: Mode; label: string; help: string }[] = [
  { v: "full", label: "Estorno integral (100%)", help: "Devolve todo o saldo líquido da venda." },
  { v: "partial", label: "Estorno parcial", help: "Devolve somente o valor que você informar." },
  { v: "discount", label: "Desconto retroativo", help: "Registra um desconto que ficou de fora na confirmação." },
];

const cents = (n: number) => Math.round(n * 100);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** "Inserir estorno": estorno integral, parcial ou desconto retroativo. A venda original não é alterada. */
export function SaleAdjustmentPanel({ saleId, code, remaining }: { saleId: string; code: string; remaining: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("full");
  const [raw, setRaw] = useState("");
  const [disc, setDisc] = useState<DiscountState>({ mode: "percent", raw: "" });
  const [reason, setReason] = useState("");
  const [dialog, setDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const canAdjust = cents(remaining) > 0;

  // Valor do lançamento e erro de validação (prévia; o banco valida de novo)
  let amount = 0;
  let error: string | null = null;
  if (mode === "full") {
    amount = round2(remaining);
  } else if (mode === "partial") {
    if (raw.trim() !== "") {
      const n = parseMoney(raw);
      if (!Number.isFinite(n) || n <= 0) error = "Informe um valor maior que zero.";
      else if (cents(n) > cents(remaining)) error = `O valor não pode passar do saldo líquido (${formatBRL(remaining)}).`;
      else amount = round2(n);
    }
  } else {
    const d = computeDiscount(disc, remaining, round2(remaining - 0.01));
    amount = d.amount; error = d.error;
  }
  const canSubmit = canAdjust && amount > 0 && !error;
  const newNet = round2(remaining - amount);

  function openDialog() {
    setFormError(null); setDone(null);
    if (!canSubmit) { setFormError(error ?? "Informe o valor do lançamento."); return; }
    setDialogError(null); setDialog(true);
  }

  async function submit(pin: string) {
    setBusy(true); setDialogError(null);
    const { data, error: err } = await createClient().rpc("register_sale_adjustment", {
      p_sale_id: saleId, p_mode: mode, p_amount: mode === "full" ? null : amount, p_reason: reason, p_pin: pin,
    });
    setBusy(false);
    if (err) { setDialog(false); setFormError(err.message); return; } // regra de negócio (ex.: valor acima do saldo)
    const r = data as { ok: boolean; error?: string } | null;
    if (!r?.ok) { setDialogError(r?.error ?? "Não foi possível registrar o lançamento."); return; }

    setDialog(false); setOpen(false); setRaw(""); setReason(""); setDisc({ mode: "percent", raw: "" });
    setDone(`Lançamento registrado em ${code}. Os valores já foram atualizados.`);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {done && <p role="status" className="rounded-xl bg-good/15 p-3 text-sm font-semibold text-good">{done}</p>}

      {!open ? (
        <button type="button" disabled={!canAdjust} onClick={() => { setOpen(true); setDone(null); }} className="adm-btn adm-btn-primary w-full sm:w-auto">
          <RotateCcw size={16} /> {canAdjust ? "Inserir estorno" : "Venda totalmente estornada"}
        </button>
      ) : (
        <section className="adm-card space-y-5 p-4 sm:p-5" aria-label="Inserir estorno">
          <div>
            <h2 className="text-base font-bold text-ink">Inserir estorno</h2>
            <p className="text-sm text-muted">Saldo líquido atual desta venda: <strong className="text-ink">{formatBRL(remaining)}</strong>. O registro original da venda permanece intacto.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Tipo de lançamento">
            {MODES.map((m) => (
              <label key={m.v} className={`adm-card cursor-pointer p-3.5 transition ${mode === m.v ? "border-accent ring-2 ring-accent/30" : ""}`}>
                <input type="radio" name="adj-mode" value={m.v} checked={mode === m.v} onChange={() => { setMode(m.v); setFormError(null); }} className="sr-only" />
                <span className="block text-sm font-bold text-ink">{m.label}</span>
                <span className="mt-0.5 block text-xs text-muted">{m.help}</span>
              </label>
            ))}
          </div>

          {mode === "partial" && (
            <label className="block text-sm font-medium text-ink">Valor a estornar (R$)
              <input inputMode="decimal" value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="Ex.: 30,00" className="adm-input mt-1.5 sm:max-w-48" aria-invalid={error ? true : undefined} />
            </label>
          )}
          {mode === "discount" && <DiscountFields value={disc} onChange={setDisc} base={remaining} max={round2(remaining - 0.01)} allowNone={false} idPrefix="retro" />}
          {error && mode !== "discount" && <p role="alert" className="text-sm font-semibold text-bad">{error}</p>}

          <label className="block text-sm font-medium text-ink">Motivo <span className="font-normal text-muted">(opcional)</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Ex.: produto devolvido, desconto combinado depois" className="adm-input mt-1.5" />
          </label>

          <dl className="space-y-1.5 rounded-xl bg-surface-2 p-3.5 text-sm" aria-live="polite">
            <div className="flex justify-between"><dt className="text-muted">Saldo líquido atual</dt><dd className="font-semibold text-ink">{formatBRL(remaining)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">{mode === "discount" ? "Desconto retroativo" : "Valor estornado"}</dt><dd className="font-semibold text-ink">{amount > 0 ? `− ${formatBRL(amount)}` : formatBRL(0)}</dd></div>
            <div className="flex justify-between border-t border-line pt-2"><dt className="font-bold text-ink">Novo valor líquido</dt><dd className="text-xl font-black text-ink">{formatBRL(newNet)}</dd></div>
          </dl>

          {formError && <p role="alert" className="rounded-xl bg-bad/15 p-3 text-sm font-semibold text-bad">{formError}</p>}

          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={() => { setOpen(false); setFormError(null); }} className="adm-btn">Cancelar</button>
            <button type="button" onClick={openDialog} disabled={!canSubmit} className="adm-btn adm-btn-primary">Registrar lançamento</button>
          </div>
        </section>
      )}

      {dialog && (
        <PinDialog title="Autorizar lançamento" loading={busy} error={dialogError} onCancel={() => { if (!busy) setDialog(false); }} onSubmit={(pin) => void submit(pin)}
          description={`${MODES.find((m) => m.v === mode)?.label}: ${formatBRL(amount)} em ${code}. Digite o código de 4 dígitos para confirmar.`} />
      )}
    </div>
  );
}
