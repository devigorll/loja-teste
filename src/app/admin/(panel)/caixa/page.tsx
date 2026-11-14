import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatBRL } from "@/lib/format";
import { dayEnd, dayStart, fmtDateTime, fmtDay, isISODate, monthStart, todayISO } from "@/lib/dates";
import { PeriodPresets } from "@/components/admin/period-presets";

export const dynamic = "force-dynamic";

type Summary = {
  net: number; income: number; refunds: number; sales_count: number;
  by_method: { method: string; total: number; count: number }[];
  daily: { day: string; total: number; count: number }[];
};
type Tx = { id: string; type: string; amount: number; description: string | null; created_at: string; payment_methods: { name: string } | null };

export default async function CashPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const t = todayISO();
  let de = isISODate(sp.de) ? sp.de : monthStart(t);
  let ate = isISODate(sp.ate) ? sp.ate : t;
  if (de > ate) [de, ate] = [ate, de];

  const supabase = await createClient();
  const [today, month, range, methods, txs] = await Promise.all([
    supabase.rpc("cash_summary", { p_from: t, p_to: t }),
    supabase.rpc("cash_summary", { p_from: monthStart(t), p_to: t }),
    supabase.rpc("cash_summary", { p_from: de, p_to: ate }),
    supabase.from("payment_methods").select("id, name, is_active").order("position"),
    supabase.from("financial_transactions")
      .select("id, type, amount, description, created_at, payment_methods(name)")
      .gte("created_at", dayStart(de)).lte("created_at", dayEnd(ate))
      .order("created_at", { ascending: false }).limit(100),
  ]);

  const err = today.error ?? month.error ?? range.error;
  const sToday = today.data as Summary | null;
  const sMonth = month.data as Summary | null;
  const sRange = range.data as Summary | null;
  const tx = (txs.data ?? []) as unknown as Tx[];

  // Formas de pagamento ativas sempre aparecem (mesmo com R$ 0,00), mais qualquer outra que tenha movimento.
  const byMethod = new Map<string, { total: number; count: number }>();
  (methods.data ?? []).filter((m) => m.is_active).forEach((m) => byMethod.set(m.name, { total: 0, count: 0 }));
  (sRange?.by_method ?? []).forEach((m) => byMethod.set(m.method, { total: Number(m.total), count: Number(m.count) }));

  const ticket = sRange && sRange.sales_count > 0 ? Number(sRange.income) / Number(sRange.sales_count) : 0;
  const field = "rounded-lg border border-neutral-300 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:focus:ring-white";
  const card = "rounded-xl border border-neutral-200 p-5 dark:border-neutral-800";

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Controle de caixa</h1>
        <p className="mt-1 max-w-3xl text-sm text-neutral-500">
          Controle gerencial baseado nas vendas confirmadas e nas formas de pagamento informadas na plataforma.
          Não é uma conciliação bancária automática.
        </p>
      </div>

      {err && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          Erro ao carregar o caixa: {err.message}. Se a mensagem citar “cash_summary”, rode o SQL 0005 no Supabase.
        </p>
      )}

      <section aria-label="Resumo" className="grid gap-4 sm:grid-cols-2">
        <div className={card}><p className="text-sm text-neutral-500">Hoje</p><p className="mt-1 text-3xl font-black">{formatBRL(Number(sToday?.net ?? 0))}</p><p className="text-sm text-neutral-500">{sToday?.sales_count ?? 0} vendas</p></div>
        <div className={card}><p className="text-sm text-neutral-500">Este mês</p><p className="mt-1 text-3xl font-black">{formatBRL(Number(sMonth?.net ?? 0))}</p><p className="text-sm text-neutral-500">{sMonth?.sales_count ?? 0} vendas</p></div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold">Período selecionado</h2>
        <PeriodPresets basePath="/admin/caixa" current={{ de, ate }} />
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-neutral-500">De<input type="date" name="de" defaultValue={de} className={`${field} mt-1 block`} /></label>
          <label className="text-xs text-neutral-500">Até<input type="date" name="ate" defaultValue={ate} className={`${field} mt-1 block`} /></label>
          <button className="rounded-full bg-neutral-950 px-5 py-2.5 text-sm font-semibold text-white transition active:scale-95 dark:bg-white dark:text-neutral-950">Aplicar</button>
        </form>
        <p className="text-sm text-neutral-500">De {fmtDay(de)} até {fmtDay(ate)}</p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className={card}><p className="text-sm text-neutral-500">Saldo do período</p><p className="mt-1 text-2xl font-black">{formatBRL(Number(sRange?.net ?? 0))}</p></div>
          <div className={card}><p className="text-sm text-neutral-500">Entradas</p><p className="mt-1 text-2xl font-black">{formatBRL(Number(sRange?.income ?? 0))}</p></div>
          <div className={card}><p className="text-sm text-neutral-500">Estornos</p><p className="mt-1 text-2xl font-black">{formatBRL(Number(sRange?.refunds ?? 0))}</p></div>
          <div className={card}><p className="text-sm text-neutral-500">Vendas · ticket médio</p><p className="mt-1 text-2xl font-black">{sRange?.sales_count ?? 0}</p><p className="text-sm text-neutral-500">{formatBRL(ticket)}</p></div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold">Por forma de pagamento</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...byMethod.entries()].map(([name, v]) => (
            <div key={name} className={card}>
              <p className="text-sm text-neutral-500">{name}</p>
              <p className="mt-1 text-2xl font-black">{formatBRL(v.total)}</p>
              <p className="text-sm text-neutral-500">{v.count} {v.count === 1 ? "venda" : "vendas"}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold">Resumo diário</h2>
        {(sRange?.daily ?? []).length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-neutral-500 dark:border-neutral-700">Sem movimentações no período.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
            <table className="w-full min-w-[22rem] text-left text-sm">
              <thead className="bg-neutral-50 text-xs text-neutral-500 dark:bg-neutral-900"><tr><th className="px-4 py-3">Dia</th><th className="px-4 py-3">Vendas</th><th className="px-4 py-3 text-right">Total</th></tr></thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {sRange!.daily.map((d) => (
                  <tr key={d.day}><td className="px-4 py-3">{fmtDay(d.day)}</td><td className="px-4 py-3">{d.count}</td><td className="px-4 py-3 text-right font-semibold">{formatBRL(Number(d.total))}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold">Movimentações financeiras</h2>
        {tx.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-neutral-500 dark:border-neutral-700">Nenhuma movimentação no período.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="bg-neutral-50 text-xs text-neutral-500 dark:bg-neutral-900"><tr><th className="px-4 py-3">Data</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Descrição</th><th className="px-4 py-3">Pagamento</th><th className="px-4 py-3 text-right">Valor</th></tr></thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {tx.map((m) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap px-4 py-3">{fmtDateTime(m.created_at)}</td>
                    <td className="px-4 py-3">{m.type === "income" ? "Entrada" : "Estorno"}</td>
                    <td className="px-4 py-3">{m.description ?? "—"}</td>
                    <td className="px-4 py-3">{m.payment_methods?.name ?? "—"}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${Number(m.amount) < 0 ? "text-red-600" : ""}`}>{formatBRL(Number(m.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-neutral-500">Mostrando até as 100 movimentações mais recentes do período. Para ver todas as vendas, use o <Link href="/admin/vendas" className="underline">Histórico de vendas</Link>.</p>
      </section>
    </div>
  );
}
