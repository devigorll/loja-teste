"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatBRL } from "@/lib/format";
import { PinDialog } from "./pin-dialog";
import { OrderLines, summarize, type CatalogVariant, type EditorLine } from "./order-lines";

type Props = { catalog: CatalogVariant[]; stock: Record<string, number>; pinSet: boolean };
type Result = { ok: boolean; error?: string; order?: { id: string } };

/** Novo pedido criado pelo painel. Usa as mesmas tabelas e regras do pedido do site e exige o código de 4 dígitos. */
export function NewOrderForm({ catalog, stock, pinSet }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<EditorLine[]>([]);
  const [idemKey] = useState(() => crypto.randomUUID()); // evita criar o pedido duas vezes
  const [dialog, setDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const { parsed, valid, total } = summarize(lines);
  const nameOk = name.trim().length >= 2;

  function openDialog() {
    setFormError(null);
    if (!nameOk) { setFormError("Informe o nome do cliente."); return; }
    if (!valid) { setFormError("Adicione ao menos um produto e confira quantidades e preços."); return; }
    setDialogError(null);
    setDialog(true);
  }

  async function submit(pin: string) {
    setBusy(true); setDialogError(null);
    const { data, error } = await createClient().rpc("admin_create_order", {
      p_customer_name: name, p_customer_phone: phone, p_notes: notes, p_pin: pin, p_idempotency_key: idemKey,
      p_items: parsed.map((l) => ({ variant_id: l.variant_id, quantity: l.quantity, unit_price: l.unit })),
    });
    setBusy(false);

    if (error) { // regra de negócio (ex.: estoque insuficiente): fecha a janela e mostra no formulário
      setDialog(false);
      setFormError(error.message);
      return;
    }
    const r = data as Result | null;
    if (!r?.ok || !r.order) { setDialogError(r?.error ?? "Não foi possível registrar o pedido."); return; }

    router.push(`/admin/possiveis-vendas/${r.order.id}`);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {!pinSet && (
        <p className="rounded-xl bg-warn/15 p-3 text-sm font-medium text-warn">
          O código de autorização ainda não foi definido. Defina em <a href="/admin/seguranca" className="underline">Segurança</a> para poder registrar pedidos.
        </p>
      )}

      <section className="adm-card space-y-4 p-4 sm:p-5">
        <h2 className="text-base font-bold text-ink">Dados do cliente</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-ink">Nome do cliente
            <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} autoComplete="off" className="adm-input mt-1.5" />
          </label>
          <label className="text-sm font-medium text-ink">Telefone <span className="font-normal text-muted">(opcional)</span>
            <input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} autoComplete="off" className="adm-input mt-1.5" />
          </label>
        </div>
        <label className="block text-sm font-medium text-ink">Observações <span className="font-normal text-muted">(opcional)</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={500} className="adm-input mt-1.5 min-h-20 py-2.5" />
        </label>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-ink">Produtos</h2>
        <OrderLines lines={lines} onChange={setLines} catalog={catalog} stock={stock} minLines={0} />
      </section>

      {formError && <p role="alert" className="rounded-xl bg-bad/15 p-3 text-sm font-semibold text-bad">{formError}</p>}

      <div className="adm-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <p className="text-sm text-muted">Total <strong className="ml-1 text-xl text-ink">{formatBRL(total)}</strong></p>
        <button type="button" onClick={openDialog} disabled={!pinSet || busy} className="adm-btn adm-btn-primary w-full sm:w-auto">Registrar pedido</button>
      </div>

      {dialog && (
        <PinDialog title="Autorizar novo pedido" description={`Digite o código de 4 dígitos para registrar este pedido de ${formatBRL(total)}.`}
          error={dialogError} loading={busy} onCancel={() => { if (!busy) setDialog(false); }} onSubmit={(pin) => void submit(pin)} />
      )}
    </div>
  );
}
