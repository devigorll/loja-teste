"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatBRL } from "@/lib/format";
import { PinDialog } from "./pin-dialog";

export type EditorLine = {
  key: string; item_id: string | null; variant_id: string | null;
  name: string; size: string; color: string; quantity: number; price: string;
};
export type CatalogVariant = { id: string; label: string; price: number; stock: number };

type Props = {
  orderId: string; wasEdited: boolean; readOnly: boolean;
  initial: EditorLine[]; catalog: CatalogVariant[]; stock: Record<string, number>;
  methods: { id: string; name: string }[];
};

const sig = (ls: EditorLine[]) => JSON.stringify(ls.map((l) => [l.key, l.quantity, l.price]));
type RpcResult = { ok: boolean; error?: string };

async function call(fn: string, args: Record<string, unknown>): Promise<RpcResult> {
  const { data, error } = await createClient().rpc(fn, args);
  if (error) return { ok: false, error: error.message };
  return (data as RpcResult) ?? { ok: false, error: "Resposta inválida." };
}

const lineTotal = (price: string, qty: number) => (Math.round((Number(price.replace(",", ".")) || 0) * 100) * qty) / 100;

export function OrderEditor({ orderId, wasEdited, readOnly, initial, catalog, stock, methods }: Props) {
  const router = useRouter();
  const [lines, setLines] = useState<EditorLine[]>(initial);
  const [pick, setPick] = useState("");
  const [pickQty, setPickQty] = useState(1);
  const [dialog, setDialog] = useState<"save" | "confirm" | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [method, setMethod] = useState(methods[0]?.id ?? "");

  const parsed = lines.map((l) => ({ ...l, unit: Number(l.price.replace(",", ".")) }));
  const valid = parsed.length > 0 && parsed.every((l) => Number.isFinite(l.unit) && l.unit >= 0 && l.quantity >= 1);
  const total = parsed.reduce((s, l) => s + (Number.isFinite(l.unit) ? (Math.round(l.unit * 100) * l.quantity) / 100 : 0), 0);
  const dirty = sig(lines) !== sig(initial);

  const setQty = (key: string, q: number) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, quantity: Math.max(1, Math.min(999, q)) } : l)));
  const setPrice = (key: string, price: string) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, price } : l)));
  const removeLine = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key));

  function addLine() {
    const v = catalog.find((c) => c.id === pick);
    if (!v) return;
    setLines((ls) => {
      const ex = ls.find((l) => l.variant_id === v.id);
      if (ex) return ls.map((l) => (l === ex ? { ...l, quantity: Math.min(999, l.quantity + pickQty) } : l));
      const [name, rest = ""] = v.label.split(" — ");
      const [size = "", color = ""] = rest.split(" / ");
      return [...ls, { key: crypto.randomUUID(), item_id: null, variant_id: v.id, name, size, color, quantity: pickQty, price: v.price.toFixed(2) }];
    });
    setPick(""); setPickQty(1);
  }

  async function save(pin: string) {
    setBusy(true); setDialogError(null);
    const r = await call("update_order_items", {
      p_order_id: orderId, p_pin: pin,
      p_items: parsed.map((l) => ({ item_id: l.item_id, variant_id: l.item_id ? null : l.variant_id, quantity: l.quantity, unit_price: l.unit })),
    });
    setBusy(false);
    if (!r.ok) { setDialogError(r.error ?? "Erro ao salvar."); return; }
    setDialog(null);
    setMessage({ ok: true, text: "Alterações salvas." });
    router.refresh();
  }

  async function doConfirm(pin: string | null) {
    setBusy(true); setDialogError(null);
    const r = await call("confirm_sale", { p_order_id: orderId, p_payment_method_id: method, p_pin: pin });
    setBusy(false);
    if (!r.ok) {
      if (dialog) setDialogError(r.error ?? "Erro ao confirmar.");
      else setMessage({ ok: false, text: r.error ?? "Erro ao confirmar." });
      return;
    }
    router.push("/admin/possiveis-vendas");
    router.refresh();
  }

  function startConfirm() {
    setMessage(null);
    if (!method) return;
    if (wasEdited) { setDialogError(null); setDialog("confirm"); return; }
    if (window.confirm(`Confirmar a venda de ${formatBRL(total)}?`)) void doConfirm(null);
  }

  async function cancelOrder() {
    if (!window.confirm("Cancelar este pedido? Esta ação não pode ser desfeita.")) return;
    setBusy(true);
    const r = await call("cancel_order", { p_order_id: orderId });
    setBusy(false);
    if (!r.ok) { setMessage({ ok: false, text: r.error ?? "Erro ao cancelar." }); return; }
    router.push("/admin/possiveis-vendas");
    router.refresh();
  }

  const stepBtn = "grid size-11 place-items-center text-ink transition hover:bg-surface-2 active:scale-90 disabled:opacity-30";

  return (
    <div className="space-y-5">
      <ul className="space-y-3">
        {lines.map((l) => {
          const st = l.variant_id ? stock[l.variant_id] ?? catalog.find((c) => c.id === l.variant_id)?.stock : undefined;
          const short = !readOnly && st !== undefined && l.quantity > st;
          return (
            <li key={l.key} className="adm-card space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-ink">{l.name}</p>
                  <p className="text-xs text-muted">Tam. {l.size} · {l.color}</p>
                  {!l.variant_id && !readOnly && <p className="mt-1 text-xs font-medium text-bad">Produto removido do catálogo. Remova este item para poder confirmar.</p>}
                  {!readOnly && st !== undefined && <p className={`mt-1 text-xs ${short ? "font-bold text-bad" : "text-muted"}`}>Estoque: {st}{short ? " (insuficiente)" : ""}</p>}
                </div>
                <p className="shrink-0 text-base font-black text-ink">{formatBRL(lineTotal(l.price, l.quantity))}</p>
              </div>

              {readOnly ? (
                <p className="text-sm text-muted">{l.quantity} un. × {formatBRL(Number(l.price))}</p>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center overflow-hidden rounded-full border border-line bg-surface-2">
                    <button type="button" aria-label="Diminuir quantidade" disabled={l.quantity <= 1} onClick={() => setQty(l.key, l.quantity - 1)} className={stepBtn}><Minus size={16} /></button>
                    <span className="w-9 text-center text-sm font-bold text-ink" aria-live="polite">{l.quantity}</span>
                    <button type="button" aria-label="Aumentar quantidade" onClick={() => setQty(l.key, l.quantity + 1)} className={stepBtn}><Plus size={16} /></button>
                  </div>
                  <label className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-40">
                    <span className="text-sm text-muted">R$</span>
                    <input inputMode="decimal" aria-label={`Preço unitário de ${l.name}`} value={l.price} onChange={(e) => setPrice(l.key, e.target.value)} className="adm-input" />
                  </label>
                  <button type="button" aria-label={`Remover ${l.name}`} disabled={lines.length <= 1} onClick={() => removeLine(l.key)}
                    className="adm-btn adm-btn-danger ml-auto size-11 min-h-0 p-0"><Trash2 size={18} /></button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {!readOnly && (
        <div className="adm-card flex flex-col gap-3 border-dashed p-4 sm:flex-row">
          <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Adicionar produto" className="adm-input flex-1">
            <option value="">Adicionar produto...</option>
            {catalog.map((c) => <option key={c.id} value={c.id} disabled={c.stock <= 0}>{c.label} · {formatBRL(c.price)} · estoque {c.stock}</option>)}
          </select>
          <div className="flex gap-3">
            <input type="number" min={1} max={999} value={pickQty} onChange={(e) => setPickQty(Math.max(1, Number(e.target.value) || 1))} aria-label="Quantidade" className="adm-input w-24" />
            <button type="button" onClick={addLine} disabled={!pick} className="adm-btn adm-btn-primary flex-1 sm:flex-none">Adicionar</button>
          </div>
        </div>
      )}

      <div className="adm-card flex items-baseline justify-between p-4 sm:p-5">
        <span className="text-sm font-semibold text-muted">Total do pedido</span>
        <span className="text-3xl font-black tracking-tight text-ink">{formatBRL(total)}</span>
      </div>

      {message && <p role="status" className={`rounded-xl p-3 text-sm font-medium ${message.ok ? "bg-good/15 text-good" : "bg-bad/15 text-bad"}`}>{message.text}</p>}

      {!readOnly && (
        <div className="adm-card space-y-5 p-4 sm:p-5">
          {dirty && (
            <div className="space-y-3 rounded-xl bg-warn/15 p-3">
              <p className="text-sm font-medium text-warn">Você tem alterações não salvas. Salvar exige o código de 4 dígitos.</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button type="button" onClick={() => setLines(initial)} className="adm-btn">Descartar</button>
                <button type="button" disabled={!valid || busy} onClick={() => { setDialogError(null); setDialog("save"); }} className="adm-btn adm-btn-primary">Salvar alterações</button>
              </div>
            </div>
          )}

          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-ink">Forma de pagamento</legend>
            <div className="flex flex-wrap gap-2">
              {methods.map((m) => (
                <label key={m.id} aria-current={method === m.id ? "true" : undefined} className="adm-chip cursor-pointer">
                  <input type="radio" name="method" value={m.id} checked={method === m.id} onChange={() => setMethod(m.id)} className="sr-only" />
                  {m.name}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button type="button" onClick={startConfirm} disabled={busy || dirty || !valid || !method} className="adm-btn adm-btn-good">Confirmar venda</button>
            <button type="button" onClick={cancelOrder} disabled={busy} className="adm-btn adm-btn-danger">Cancelar pedido</button>
            {dirty && <span className="text-xs text-muted">Salve as alterações antes de confirmar.</span>}
            {!dirty && wasEdited && <span className="text-xs text-muted">Pedido editado: a confirmação exige o código.</span>}
          </div>
        </div>
      )}

      {dialog && (
        <PinDialog
          title={dialog === "save" ? "Autorizar alterações" : "Autorizar confirmação"}
          description={dialog === "save" ? "Digite o código de 4 dígitos para salvar as alterações do pedido." : `Pedido editado. Digite o código para confirmar a venda de ${formatBRL(total)}.`}
          error={dialogError} loading={busy}
          onCancel={() => { if (!busy) setDialog(null); }}
          onSubmit={(pin) => (dialog === "save" ? void save(pin) : void doConfirm(pin))}
        />
      )}
    </div>
  );
}
