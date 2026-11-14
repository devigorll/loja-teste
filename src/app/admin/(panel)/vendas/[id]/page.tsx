import Link from "next/link";
import { notFound } from "next/navigation";
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
  const st = SALE_STATUS[sale.status] ?? { label: sale.status, cls: "bg-neutral-100 text-neutral-800" };

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/admin/vendas" className="text-sm text-neutral-500 underline underline-offset-4">← Histórico de vendas</Link>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-black tracking-tight">Venda {o.code}</h1>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${st.cls}`}>{st.label}</span>
        {o.was_edited && <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium dark:bg-neutral-800">Pedido editado pelo painel</span>}
      </div>

      <dl className="mt-6 grid gap-4 rounded-xl border border-neutral-200 p-5 sm:grid-cols-3 dark:border-neutral-800">
        <div><dt className="text-xs text-neutral-500">Cliente</dt><dd className="font-medium">{o.customer_name}</dd></div>
        <div><dt className="text-xs text-neutral-500">Telefone</dt><dd className="font-medium">{o.customer_phone ?? "Não informado"}</dd></div>
        <div><dt className="text-xs text-neutral-500">Forma de pagamento</dt><dd className="font-medium">{sale.payment_method_name}</dd></div>
        <div><dt className="text-xs text-neutral-500">Pedido feito em</dt><dd className="font-medium">{fmtDateTime(o.created_at)}</dd></div>
        <div><dt className="text-xs text-neutral-500">Venda confirmada em</dt><dd className="font-medium">{fmtDateTime(sale.sold_at)}</dd></div>
        {sale.refunded_at && <div><dt className="text-xs text-neutral-500">Estornada em</dt><dd className="font-medium">{fmtDateTime(sale.refunded_at)}{sale.refund_reason ? ` · ${sale.refund_reason}` : ""}</dd></div>}
        {o.notes && <div className="sm:col-span-3"><dt className="text-xs text-neutral-500">Observações</dt><dd>{o.notes}</dd></div>}
      </dl>

      <div className="mt-6 overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-500 dark:bg-neutral-900">
            <tr><th className="px-4 py-3">Produto</th><th className="px-4 py-3">Valor un.</th><th className="px-4 py-3">Qtd.</th><th className="px-4 py-3 text-right">Subtotal</th></tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {items.map((i) => (
              <tr key={i.id}>
                <td className="px-4 py-3"><p className="font-medium">{i.product_name}</p><p className="text-xs text-neutral-500">Tam. {i.size} · {i.color}</p></td>
                <td className="px-4 py-3">{formatBRL(Number(i.unit_price))}</td>
                <td className="px-4 py-3">{i.quantity}</td>
                <td className="px-4 py-3 text-right font-medium">{formatBRL(Number(i.subtotal))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-neutral-200 dark:border-neutral-800"><td colSpan={3} className="px-4 py-4 text-right font-semibold">Total</td><td className="px-4 py-4 text-right text-lg font-black">{formatBRL(Number(sale.total))}</td></tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
