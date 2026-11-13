import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatBRL } from "@/lib/format";

export const dynamic = "force-dynamic";

type Row = {
  id: string; code: string; customer_name: string; customer_phone: string | null;
  total: number; created_at: string; order_items: { quantity: number }[];
};

export default async function PossibleSalesPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("id, code, customer_name, customer_phone, total, created_at, order_items(quantity)")
    .eq("status", "awaiting_confirmation")
    .order("created_at", { ascending: false });

  const orders = (data ?? []) as Row[];

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-black tracking-tight">Possíveis vendas</h1>
      <p className="mt-1 text-sm text-neutral-500">Pedidos feitos pelo site que ainda aguardam sua confirmação.</p>

      {error && <p role="alert" className="mt-6 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">Erro ao carregar os pedidos: {error.message}</p>}

      {!error && orders.length === 0 && (
        <p className="mt-12 rounded-xl border border-dashed border-neutral-300 p-10 text-center text-neutral-500 dark:border-neutral-700">Nenhuma possível venda no momento.</p>
      )}

      <ul className="mt-6 space-y-3">
        {orders.map((o) => {
          const units = o.order_items.reduce((s, i) => s + i.quantity, 0);
          return (
            <li key={o.id}>
              <Link href={`/admin/possiveis-vendas/${o.id}`}
                className="flex items-center justify-between gap-4 rounded-xl border border-neutral-200 p-4 transition hover:border-neutral-950 active:scale-[0.99] dark:border-neutral-800 dark:hover:border-white">
                <div className="min-w-0">
                  <p className="font-semibold">{o.code} <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">Possível venda</span></p>
                  <p className="truncate text-sm text-neutral-500">{o.customer_name} · {units} {units === 1 ? "item" : "itens"}</p>
                  <p className="text-xs text-neutral-500">{new Date(o.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
                </div>
                <p className="shrink-0 text-lg font-bold">{formatBRL(o.total)}</p>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}