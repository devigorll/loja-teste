import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatBRL } from "@/lib/format";
import { fmtDateTime } from "@/lib/dates";
import { SALE_STATUS } from "@/lib/admin/sales";

export const dynamic = "force-dynamic";

type Item = { id: string; product_name: string; size: string; color: string; unit_price: number; quantity: number; subtotal: number };
type Detail = {
  id: string; order_id: string; sold_at: string; total: number; status: string; payment_method_name: string;
  refunded_at: string | null; refund_reason: string | null;
  orders: { code: string; customer_name: string; customer_phone: string | null; notes: string | null; created_at: string; was_edited: boolean; order_items: Item[] } | null;
};

const dt = "text-xs font-semibold uppercase tracking-wide text-muted";
const dd = "mt-0.5 font-semibold text-ink";

export default async function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from("sales")
    .select("id, order_id, sold_at, total, status, payment_method_name, refunded_at, refund_reason, orders(code, customer_name, customer_phone, notes, created_at, was_edited, order_items(*))")
    .eq("id", id)
    .maybeSingle();
  const sale = data as unknown as Detail | null;
  if (!sale || !sale.orders) notFound();

  const o = sale.orders;
  const items = [...o.order_items].sort((a, b) => a.product_name.localeCompare(b.product_name));
  const st = SALE_STATUS[sale.status] ?? { label: sale.status, cls: "bg-surface-2 text-ink" };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href="/admin/vendas" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-muted transition hover:text-ink"><ChevronLeft size={18} /> Histórico de vendas</Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">Venda {o.code}</h1>
        <span className={`adm-badge ${st.cls}`}>{st.label}</span>
        {o.was_edited && <span className="adm-badge bg-surface-2 text-muted">Pedido editado pelo painel</span>}
      </div>

      <dl className="adm-card grid gap-4 p-5 sm:grid-cols-3">
        <div><dt className={dt}>Cliente</dt><dd className={dd}>{o.customer_name}</dd></div>
        <div><dt className={dt}>Telefone</dt><dd className={dd}>{o.customer_phone ?? "Não informado"}</dd></div>
        <div><dt className={dt}>Forma de pagamento</dt><dd className={dd}>{sale.payment_method_name}</dd></div>
        <div><dt className={dt}>Pedido feito em</dt><dd className={dd}>{fmtDateTime(o.created_at)}</dd></div>
        <div><dt className={dt}>Venda confirmada em</dt><dd className={dd}>{fmtDateTime(sale.sold_at)}</dd></div>
        {sale.refunded_at && <div><dt className={dt}>Estornada em</dt><dd className={dd}>{fmtDateTime(sale.refunded_at)}{sale.refund_reason ? ` · ${sale.refund_reason}` : ""}</dd></div>}
        {o.notes && <div className="sm:col-span-3"><dt className={dt}>Observações</dt><dd className="mt-0.5 text-ink">{o.notes}</dd></div>}
      </dl>

      {/* Celular: lista de itens */}
      <ul className="space-y-3 md:hidden">
        {items.map((i) => (
          <li key={i.id} className="adm-card flex items-start justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="font-bold text-ink">{i.product_name}</p>
              <p className="text-xs text-muted">Tam. {i.size} · {i.color}</p>
              <p className="mt-1 text-sm text-muted">{i.quantity} × {formatBRL(Number(i.unit_price))}</p>
            </div>
            <p className="shrink-0 font-black text-ink">{formatBRL(Number(i.subtotal))}</p>
          </li>
        ))}
      </ul>

      {/* Tablet e computador: tabela */}
      <div className="adm-card hidden overflow-x-auto md:block">
        <table className="adm-table">
          <thead><tr><th>Produto</th><th>Valor un.</th><th>Qtd.</th><th className="text-right">Subtotal</th></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td><p className="font-semibold text-ink">{i.product_name}</p><p className="text-xs text-muted">Tam. {i.size} · {i.color}</p></td>
                <td>{formatBRL(Number(i.unit_price))}</td>
                <td>{i.quantity}</td>
                <td className="text-right font-bold">{formatBRL(Number(i.subtotal))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="adm-card flex items-baseline justify-between p-4 sm:p-5">
        <span className="text-sm font-semibold text-muted">Total da venda</span>
        <span className="text-3xl font-black tracking-tight text-ink">{formatBRL(Number(sale.total))}</span>
      </div>
    </div>
  );
}
