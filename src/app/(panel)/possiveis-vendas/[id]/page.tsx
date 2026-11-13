import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatBRL } from "@/lib/format";
import { normalizeWhatsApp } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = {
  awaiting_confirmation: "Possível venda", in_progress: "Em atendimento",
  confirmed: "Confirmado", completed: "Concluído", cancelled: "Cancelado",
};

type Item = { id: string; product_name: string; size: string; color: string; unit_price: number; quantity: number; subtotal: number };

export default async function PossibleSaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: order } = await supabase.from("orders").select("*, order_items(*)").eq("id", id).maybeSingle();
  if (!order) notFound();

  const items = [...(order.order_items as Item[])].sort((a, b) => a.product_name.localeCompare(b.product_name));
  const wa = normalizeWhatsApp(order.customer_phone);

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/admin/possiveis-vendas" className="text-sm text-neutral-500 underline underline-offset-4">← Voltar</Link>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-black tracking-tight">{order.code}</h1>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">{STATUS[order.status] ?? order.status}</span>
      </div>

      <dl className="mt-6 grid gap-4 rounded-xl border border-neutral-200 p-5 sm:grid-cols-3 dark:border-neutral-800">
        <div><dt className="text-xs text-neutral-500">Cliente</dt><dd className="font-medium">{order.customer_name}</dd></div>
        <div>
          <dt className="text-xs text-neutral-500">Telefone</dt>
          <dd className="font-medium">
            {order.customer_phone ? (wa ? <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{order.customer_phone}</a> : order.customer_phone) : "Não informado"}
          </dd>
        </div>
        <div><dt className="text-xs text-neutral-500">Data</dt><dd className="font-medium">{new Date(order.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</dd></div>
        {order.notes && <div className="sm:col-span-3"><dt className="text-xs text-neutral-500">Observações</dt><dd>{order.notes}</dd></div>}
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
                <td className="px-4 py-3">{formatBRL(i.unit_price)}</td>
                <td className="px-4 py-3">{i.quantity}</td>
                <td className="px-4 py-3 text-right font-medium">{formatBRL(i.subtotal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-neutral-200 dark:border-neutral-800"><td colSpan={3} className="px-4 py-4 text-right font-semibold">Total</td><td className="px-4 py-4 text-right text-lg font-black">{formatBRL(order.total)}</td></tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}