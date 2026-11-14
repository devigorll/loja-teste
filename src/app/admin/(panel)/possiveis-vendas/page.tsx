import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatBRL } from "@/lib/format";
import { fmtDateTime } from "@/lib/dates";
import { PageHeader } from "@/components/admin/page-header";

export const dynamic = "force-dynamic";

type Row = {
  id: string; code: string; customer_name: string; customer_phone: string | null;
  total: number; created_at: string; was_edited: boolean; order_items: { quantity: number }[];
};

export default async function PossibleSalesPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("id, code, customer_name, customer_phone, total, created_at, was_edited, order_items(quantity)")
    .eq("status", "awaiting_confirmation")
    .order("created_at", { ascending: false });

  const orders = (data ?? []) as Row[];

  return (
    <div className="space-y-6">
      <PageHeader title="Possíveis vendas" subtitle="Pedidos feitos pelo site que ainda aguardam a sua confirmação." />

      {error && <p role="alert" className="rounded-xl bg-bad/15 p-4 text-sm font-medium text-bad">Erro ao carregar os pedidos: {error.message}</p>}

      {!error && orders.length === 0 && (
        <p className="adm-card border-dashed p-10 text-center text-muted">Nenhuma possível venda no momento.</p>
      )}

      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {orders.map((o) => {
          const units = o.order_items.reduce((s, i) => s + i.quantity, 0);
          return (
            <li key={o.id}>
              <Link href={`/admin/possiveis-vendas/${o.id}`} className="adm-card block h-full p-4 transition hover:border-accent active:scale-[0.99]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-black text-ink">{o.code}</p>
                    <p className="truncate text-sm text-muted">{o.customer_name}</p>
                  </div>
                  <span className="adm-badge bg-warn/15 text-warn">Possível venda</span>
                </div>
                <div className="mt-4 flex items-end justify-between gap-3">
                  <div className="text-xs text-muted">
                    <p>{units} {units === 1 ? "item" : "itens"}{o.was_edited ? " · editado" : ""}</p>
                    <p>{fmtDateTime(o.created_at)}</p>
                  </div>
                  <p className="text-xl font-black text-ink">{formatBRL(o.total)}</p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
