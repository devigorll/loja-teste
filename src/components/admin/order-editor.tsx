"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatBRL } from "@/lib/format";
import { PinDialog } from "./pin-dialog";
import { OrderLines, summarize, type CatalogVariant, type EditorLine } from "./order-lines";
import { DiscountFields } from "./discount-fields";
import { computeDiscount, type DiscountState } from "@/lib/discount";
import { parseMoney } from "@/lib/admin/products";

export type { CatalogVariant, EditorLine };

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

export function OrderEditor({ orderId, wasEdited, readOnly, initial, catalog, stock, methods }: Props) {
  const router = useRouter();
  const [lines, setLines] = useState<EditorLine[]>(initial);
  const [dialog, setDialog] = useState<"save" | "confirm" | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [method, setMethod] = useState(methods[0]?.id ?? "");
  const [discount, setDiscount] = useState<DiscountState>({ mode: "none", raw: "" });

  const { parsed, valid, total } = summarize(lines);
  const dirty = sig(lines) !== sig(initial);

  // Desconto na confirmação (prévia; o banco valida e recalcula)
  const disc = computeDiscount(discount, total, total);
  const discountActive = discount.mode !== "none";
  const discountOk = !discountActive || (disc.amount > 0 && !disc.error);
  const finalTotal = Math.round((total - disc.amount) * 100) / 100;
  const needsPin = wasEdited || discountActive;

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
    const r = await call("confirm_sale", {
      p_order_id: orderId, p_payment_method_id: method, p_pin: pin,
      p_discount_type: discountActive ? discount.mode : null,
      p_discount_value: discountActive ? parseMoney(discount.raw) : null,
    });
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
    if (!discountOk) return;
    if (needsPin) { setDialogError(null); setDialog("confirm"); return; }
    if (window.confirm(`Confirmar a venda de ${formatBRL(finalTotal)}?`)) void doConfirm(null);
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

  return (
    <div className="space-y-5">
      <OrderLines lines={lines} onChange={setLines} catalog={catalog} stock={stock} readOnly={readOnly} minLines={1} />

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

          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-semibold text-ink">Desconto</legend>
            <DiscountFields value={discount} onChange={setDiscount} base={total} max={total} idPrefix="confirm-disc" />
            <dl className="space-y-1.5 rounded-xl bg-surface-2 p-3.5 text-sm" aria-live="polite">
              <div className="flex justify-between"><dt className="text-muted">Valor original</dt><dd className="font-semibold text-ink">{formatBRL(total)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Desconto{disc.percent !== null ? ` (${String(disc.percent).replace(".", ",")}%)` : ""}</dt><dd className="font-semibold text-ink">{disc.amount > 0 ? `− ${formatBRL(disc.amount)}` : formatBRL(0)}</dd></div>
              <div className="flex justify-between border-t border-line pt-2"><dt className="font-bold text-ink">Valor final</dt><dd className="text-xl font-black text-ink">{formatBRL(finalTotal)}</dd></div>
            </dl>
          </fieldset>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button type="button" onClick={startConfirm} disabled={busy || dirty || !valid || !method || !discountOk} className="adm-btn adm-btn-good">Confirmar venda</button>
            <button type="button" onClick={cancelOrder} disabled={busy} className="adm-btn adm-btn-danger">Cancelar pedido</button>
            {dirty && <span className="text-xs text-muted">Salve as alterações antes de confirmar.</span>}
            {!dirty && needsPin && <span className="text-xs text-muted">{wasEdited ? "Pedido editado" : "Venda com desconto"}: a confirmação exige o código.</span>}
          </div>
        </div>
      )}

      {dialog && (
        <PinDialog
          title={dialog === "save" ? "Autorizar alterações" : "Autorizar confirmação"}
          description={dialog === "save" ? "Digite o código de 4 dígitos para salvar as alterações do pedido." : `${wasEdited ? "Pedido editado" : "Venda com desconto"}. Digite o código para confirmar a venda de ${formatBRL(finalTotal)}${discountActive ? ` (desconto de ${formatBRL(disc.amount)})` : ""}.`}
          error={dialogError} loading={busy}
          onCancel={() => { if (!busy) setDialog(null); }}
          onSubmit={(pin) => (dialog === "save" ? void save(pin) : void doConfirm(pin))}
        />
      )}
    </div>
  );
}
