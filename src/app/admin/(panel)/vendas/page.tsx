import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatBRL } from "@/lib/format";
import { fmtDateTime } from "@/lib/dates";
import { PAGE_SIZE, SALE_STATUS, adjustBadge, listSales, parseSalesFilters, type SalesFilters } from "@/lib/admin/sales";
import { PageHeader } from "@/components/admin/page-header";
import { PeriodPresets } from "@/components/admin/period-presets";

export const dynamic = "force-dynamic";
type SP = Record<string, string | undefined>;

function extraOf(f: SalesFilters) {
  const e: Record<string, string> = {};
  if (f.metodo) e.metodo = f.metodo;
  if (f.q) e.q = f.q;
  if (f.produto) e.produto = f.produto;
  if (f.ajuste) e.ajuste = f.ajuste;
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
  const lbl = "text-xs font-medium text-muted";

  return (
    <div className="space-y-6">
      <PageHeader title="Histórico de vendas" subtitle="Vendas confirmadas. Pedidos ainda não confirmados ficam em Possíveis vendas."
        actions={<a href={`/admin/vendas/exportar?${qs(f)}`} className="adm-btn">Exportar CSV</a>} />

      <PeriodPresets basePath="/admin/vendas" extra={extraOf(f)} current={f} />

      <form method="get" className="adm-card grid grid-cols-2 gap-3 p-4 lg:grid-cols-7">
        <label className={lbl}>De<input type="date" name="de" defaultValue={f.de} className="adm-input mt-1" /></label>
        <label className={lbl}>Até<input type="date" name="ate" defaultValue={f.ate} className="adm-input mt-1" /></label>
        <label className={`${lbl} col-span-2 lg:col-span-1`}>Pagamento
          <select name="metodo" defaultValue={f.metodo} className="adm-input mt-1">
            <option value="">Todos</option>
            {(methods ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <label className={`${lbl} col-span-2 lg:col-span-1`}>Cliente ou pedido<input name="q" defaultValue={f.q} placeholder="Nome ou PED-1001" className="adm-input mt-1" /></label>
        <label className={`${lbl} col-span-2 lg:col-span-1`}>Produto<input name="produto" defaultValue={f.produto} placeholder="Nome do produto" className="adm-input mt-1" /></label>
        <label className={`${lbl} col-span-2 lg:col-span-1`}>Estorno
          <select name="ajuste" defaultValue={f.ajuste} className="adm-input mt-1">
            <option value="">Todos</option>
            <option value="none">Sem estorno</option>
            <option value="partial">Estorno parcial</option>
            <option value="full">Estorno integral</option>
          </select>
        </label>
        <div className="col-span-2 flex items-end gap-2 lg:col-span-1">
          <button className="adm-btn adm-btn-primary flex-1">Filtrar</button>
          <Link href="/admin/vendas" className="adm-btn">Limpar</Link>
        </div>
      </form>

      {error && (
        <p role="alert" className="rounded-xl bg-bad/15 p-4 text-sm font-medium text-bad">
          Erro ao carregar as vendas: {error}. Se a mensagem citar “list_sales”, rode o SQL 0005 no Supabase.
        </p>
      )}

      {!error && (
        <p className="text-sm text-muted" aria-live="polite">
          {count} {count === 1 ? "venda" : "vendas"} no período · Líquido <strong className="text-base text-ink">{formatBRL(Number(data?.total ?? 0))}</strong> <span className="text-xs">(já com descontos e estornos)</span>
        </p>
      )}

      {!error && rows.length === 0 ? (
        <p className="adm-card border-dashed p-10 text-center text-muted">Nenhuma venda encontrada com esses filtros.</p>
      ) : (
        <>
          {/* Celular: cartões */}
          <ul className="space-y-3 md:hidden">
            {rows.map((s) => {
              const st = SALE_STATUS[s.status] ?? { label: s.status, cls: "bg-surface-2 text-ink" };
              const units = s.items.reduce((n, i) => n + i.qty, 0);
              const adj = adjustBadge(s);
              const changed = Number(s.net) !== Number(s.subtotal);
              return (
                <li key={s.id}>
                  <Link href={`/admin/vendas/${s.id}`} className="adm-card block p-4 transition active:scale-[0.99]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-black text-ink">{s.code}</p>
                        <p className="truncate text-sm text-muted">{s.customer}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-lg font-black text-ink">{formatBRL(Number(s.net))}</p>
                        {changed && <p className="text-xs text-muted line-through">{formatBRL(Number(s.subtotal))}</p>}
                      </div>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm text-muted">{s.items.map((i) => i.name).join(", ")} ({units} un.)</p>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                      <span>{fmtDateTime(s.sold_at)} · {s.method}</span>
                      <span className="flex flex-wrap gap-1.5"><span className={`adm-badge ${st.cls}`}>{st.label}</span><span className={`adm-badge ${adj.cls}`}>{adj.label}</span></span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Tablet e computador: tabela */}
          <div className="adm-card hidden overflow-x-auto md:block">
            <table className="adm-table">
              <thead><tr><th>Pedido</th><th>Data</th><th>Cliente</th><th>Produtos</th><th>Pagamento</th><th className="text-right">Original</th><th className="text-right">Líquido</th><th>Status</th><th>Estorno</th></tr></thead>
              <tbody>
                {rows.map((s) => {
                  const st = SALE_STATUS[s.status] ?? { label: s.status, cls: "bg-surface-2 text-ink" };
                  const units = s.items.reduce((n, i) => n + i.qty, 0);
                  const adj = adjustBadge(s);
                  return (
                    <tr key={s.id}>
                      <td className="font-bold"><Link href={`/admin/vendas/${s.id}`} className="text-accent underline underline-offset-4">{s.code}</Link></td>
                      <td className="whitespace-nowrap">{fmtDateTime(s.sold_at)}</td>
                      <td>{s.customer}</td>
                      <td className="text-muted">{s.items.slice(0, 2).map((i) => i.name).join(", ")}{s.items.length > 2 ? ` +${s.items.length - 2}` : ""} <span className="text-xs">({units} un.)</span></td>
                      <td>{s.method}</td>
                      <td className="text-right text-muted">{formatBRL(Number(s.subtotal))}</td>
                      <td className="text-right font-bold">{formatBRL(Number(s.net))}</td>
                      <td><span className={`adm-badge ${st.cls}`}>{st.label}</span></td>
                      <td><span className={`adm-badge ${adj.cls}`}>{adj.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-between gap-2" aria-label="Paginação">
          {page > 1 ? <Link href={`/admin/vendas?${qs(f, { pagina: String(page - 1) })}`} className="adm-btn">← Anterior</Link> : <span />}
          <span className="text-sm text-muted">Página {page} de {pages}</span>
          {page < pages ? <Link href={`/admin/vendas?${qs(f, { pagina: String(page + 1) })}`} className="adm-btn">Próxima →</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
