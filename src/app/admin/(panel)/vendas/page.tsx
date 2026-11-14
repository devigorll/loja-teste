import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatBRL } from "@/lib/format";
import { fmtDateTime } from "@/lib/dates";
import { PAGE_SIZE, SALE_STATUS, listSales, parseSalesFilters, type SalesFilters } from "@/lib/admin/sales";
import { PeriodPresets } from "@/components/admin/period-presets";

export const dynamic = "force-dynamic";
type SP = Record<string, string | undefined>;

function extraOf(f: SalesFilters) {
  const e: Record<string, string> = {};
  if (f.metodo) e.metodo = f.metodo;
  if (f.q) e.q = f.q;
  if (f.produto) e.produto = f.produto;
  return e;
}
const qs = (f: SalesFilters, more: Record<string, string> = {}) =>
  new URLSearchParams({ de: f.de, ate: f.ate, ...extraOf(f), ...more }).toString();

export default async function SalesHistoryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const f = parseSalesFilters(sp);
  const page = Math.max(1, Number(sp.pagina) || 1);

  const supabase = await createClient();
  const [{ data: methods }, { data, error }] = await Promise.all([
    supabase.from("payment_methods").select("id, name").order("position"),
    listSales(supabase, f, PAGE_SIZE, (page - 1) * PAGE_SIZE),
  ]);

  const rows = data?.rows ?? [];
  const count = data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const field = "w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:focus:ring-white";
  const pill = "rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium transition active:scale-95 dark:border-neutral-700";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Histórico de vendas</h1>
          <p className="mt-1 text-sm text-neutral-500">Vendas confirmadas. Pedidos ainda não confirmados ficam em Possíveis vendas.</p>
        </div>
        <a href={`/admin/vendas/exportar?${qs(f)}`} className={pill}>Exportar CSV</a>
      </div>

      <PeriodPresets basePath="/admin/vendas" extra={extraOf(f)} current={f} />

      <form method="get" className="grid gap-3 rounded-xl border border-neutral-200 p-4 sm:grid-cols-2 lg:grid-cols-6 dark:border-neutral-800">
        <label className="text-xs text-neutral-500">De<input type="date" name="de" defaultValue={f.de} className={`${field} mt-1`} /></label>
        <label className="text-xs text-neutral-500">Até<input type="date" name="ate" defaultValue={f.ate} className={`${field} mt-1`} /></label>
        <label className="text-xs text-neutral-500">Pagamento
          <select name="metodo" defaultValue={f.metodo} className={`${field} mt-1`}>
            <option value="">Todos</option>
            {(methods ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-neutral-500">Cliente ou pedido<input name="q" defaultValue={f.q} placeholder="Nome ou PED-1001" className={`${field} mt-1`} /></label>
        <label className="text-xs text-neutral-500">Produto<input name="produto" defaultValue={f.produto} placeholder="Nome do produto" className={`${field} mt-1`} /></label>
        <div className="flex items-end gap-2">
          <button className="flex-1 rounded-full bg-neutral-950 px-5 py-2.5 text-sm font-semibold text-white transition active:scale-95 dark:bg-white dark:text-neutral-950">Filtrar</button>
          <Link href="/admin/vendas" className={pill}>Limpar</Link>
        </div>
      </form>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          Erro ao carregar as vendas: {error}. Se a mensagem citar “list_sales”, rode o SQL 0005 no Supabase.
        </p>
      )}

      {!error && (
        <p className="text-sm text-neutral-500" aria-live="polite">
          {count} {count === 1 ? "venda" : "vendas"} no período · Total <strong className="text-neutral-950 dark:text-white">{formatBRL(Number(data?.total ?? 0))}</strong>
        </p>
      )}

      {!error && rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 p-10 text-center text-neutral-500 dark:border-neutral-700">Nenhuma venda encontrada com esses filtros.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-500 dark:bg-neutral-900">
              <tr><th className="px-4 py-3">Pedido</th><th className="px-4 py-3">Data</th><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Produtos</th><th className="px-4 py-3">Pagamento</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {rows.map((s) => {
                const st = SALE_STATUS[s.status] ?? { label: s.status, cls: "bg-neutral-100 text-neutral-800" };
                const units = s.items.reduce((n, i) => n + i.qty, 0);
                return (
                  <tr key={s.id} className="transition hover:bg-neutral-50 dark:hover:bg-neutral-900">
                    <td className="px-4 py-3 font-medium"><Link href={`/admin/vendas/${s.id}`} className="underline underline-offset-4">{s.code}</Link></td>
                    <td className="whitespace-nowrap px-4 py-3">{fmtDateTime(s.sold_at)}</td>
                    <td className="px-4 py-3">{s.customer}</td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                      {s.items.slice(0, 2).map((i) => i.name).join(", ")}{s.items.length > 2 ? ` +${s.items.length - 2}` : ""} <span className="text-xs">({units} un.)</span>
                    </td>
                    <td className="px-4 py-3">{s.method}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatBRL(Number(s.total))}</td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${st.cls}`}>{st.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-between" aria-label="Paginação">
          {page > 1 ? <Link href={`/admin/vendas?${qs(f, { pagina: String(page - 1) })}`} className={pill}>← Anterior</Link> : <span />}
          <span className="text-sm text-neutral-500">Página {page} de {pages}</span>
          {page < pages ? <Link href={`/admin/vendas?${qs(f, { pagina: String(page + 1) })}`} className={pill}>Próxima →</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
