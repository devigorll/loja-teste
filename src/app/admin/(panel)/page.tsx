import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Clock, Package, PackageMinus, PackageX, Receipt, ShoppingBag, TrendingUp, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatBRL } from "@/lib/format";
import { fmtDay, monthStart, todayISO } from "@/lib/dates";
import { getDashboard, getRevenueHistory, parseDashboardRange } from "@/lib/admin/dashboard";
import { PageHeader } from "@/components/admin/page-header";
import { PeriodPresets } from "@/components/admin/period-presets";
import { RankedBars } from "@/components/admin/ranked-bars";
import { PaymentsChart, RevenueChart, SalesOrdersChart } from "@/components/admin/dashboard-charts";
import { RevenueHistory } from "@/components/admin/revenue-history";

export const dynamic = "force-dynamic";

const TONES = {
  accent: "bg-accent/15 text-accent",
  good: "bg-good/15 text-good",
  warn: "bg-warn/15 text-warn",
  bad: "bg-bad/15 text-bad",
} as const;

function Delta({ cur, prev }: { cur: number; prev: number }) {
  if (prev === 0 && cur === 0) return <span>—</span>;
  if (prev === 0) return <span className="rounded-full bg-accent/15 px-2 py-0.5 font-semibold text-accent">novo</span>;
  const pct = ((cur - prev) / prev) * 100;
  const up = pct >= 0;
  return (
    <span className={`rounded-full px-2 py-0.5 font-semibold ${up ? "bg-good/15 text-good" : "bg-bad/15 text-bad"}`} title="Variação em relação ao período anterior">
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1).replace(".", ",")}%
    </span>
  );
}

function Kpi({ label, value, sub, icon: Icon, tone = "accent", href, delta }: {
  label: string; value: string; sub?: string; icon: LucideIcon; tone?: keyof typeof TONES; href?: string; delta?: React.ReactNode;
}) {
  const body = (
    <div className="adm-card flex h-full flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-muted">{label}</span>
        <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${TONES[tone]}`}><Icon size={18} /></span>
      </div>
      <p className="text-2xl font-black tracking-tight text-ink sm:text-3xl">{value}</p>
      <div className="mt-auto flex min-h-6 items-center justify-between gap-2 text-xs text-muted">
        <span>{sub}</span>{delta}
      </div>
    </div>
  );
  return href ? <Link href={href} className="block transition active:scale-[0.98]">{body}</Link> : body;
}

function Panel({ title, hint, children, className = "" }: { title: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`adm-card p-4 sm:p-5 ${className}`}>
      <div className="mb-4">
        <h2 className="text-base font-bold text-ink">{title}</h2>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export default async function AdminDashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { de, ate, prevDe, prevAte } = parseDashboardRange(sp);
  const t = todayISO();

  const supabase = await createClient();
  const [cur, prev, today, month, history] = await Promise.all([
    getDashboard(supabase, de, ate),
    getDashboard(supabase, prevDe, prevAte),
    getDashboard(supabase, t, t),
    getDashboard(supabase, monthStart(t), t),
    getRevenueHistory(supabase),
  ]);

  const c = cur.data;
  const p = prev.data;
  const err = cur.error ?? prev.error ?? today.error ?? month.error;
  const ticket = c && c.sales_count > 0 ? c.income / c.sales_count : 0; // entradas ÷ vendas
  const prevTicket = p && p.sales_count > 0 ? p.income / p.sales_count : 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="Visão geral do desempenho da loja, com dados reais do banco." />

      {err && (
        <p role="alert" className="rounded-xl bg-bad/15 p-4 text-sm font-medium text-bad">
          Não foi possível carregar os indicadores: {err}. Se a mensagem citar “dashboard_summary”, rode o SQL 0006 no Supabase.
        </p>
      )}

      {/* Destaques: hoje e mês */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="adm-hero p-5">
          <p className="flex items-center gap-2 text-sm font-semibold opacity-90"><TrendingUp size={16} /> Faturamento de hoje</p>
          <p className="mt-2 text-4xl font-black tracking-tight">{formatBRL(today.data?.revenue ?? 0)}</p>
          <p className="mt-1 text-sm opacity-90">{today.data?.sales_count ?? 0} {(today.data?.sales_count ?? 0) === 1 ? "venda" : "vendas"} confirmadas</p>
        </div>
        <div className="adm-hero p-5">
          <p className="flex items-center gap-2 text-sm font-semibold opacity-90"><Wallet size={16} /> Faturamento do mês</p>
          <p className="mt-2 text-4xl font-black tracking-tight">{formatBRL(month.data?.revenue ?? 0)}</p>
          <p className="mt-1 text-sm opacity-90">{month.data?.sales_count ?? 0} {(month.data?.sales_count ?? 0) === 1 ? "venda" : "vendas"} no mês</p>
        </div>
      </div>

      {/* Filtro de período */}
      <section className="adm-card space-y-4 p-4 sm:p-5" aria-label="Filtro de período">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold text-ink">Período analisado</h2>
          <p className="text-xs text-muted">{fmtDay(de)} a {fmtDay(ate)} · comparado com {fmtDay(prevDe)} a {fmtDay(prevAte)}</p>
        </div>
        <PeriodPresets basePath="/admin" current={{ de, ate }} />
        <form method="get" className="grid grid-cols-2 gap-3 sm:flex sm:items-end">
          <label className="text-xs font-medium text-muted">De<input type="date" name="de" defaultValue={de} className="adm-input mt-1" /></label>
          <label className="text-xs font-medium text-muted">Até<input type="date" name="ate" defaultValue={ate} className="adm-input mt-1" /></label>
          <button className="adm-btn adm-btn-primary col-span-2 sm:col-span-1">Aplicar período</button>
        </form>
      </section>

      {/* Indicadores */}
      <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Kpi label="Faturamento líquido" value={formatBRL(c?.revenue ?? 0)} icon={TrendingUp} tone="good" delta={<Delta cur={c?.revenue ?? 0} prev={p?.revenue ?? 0} />} sub="após descontos e estornos" />
        <Kpi label="Vendas" value={String(c?.sales_count ?? 0)} icon={Receipt} delta={<Delta cur={c?.sales_count ?? 0} prev={p?.sales_count ?? 0} />} sub="confirmadas" />
        <Kpi label="Ticket médio" value={formatBRL(ticket)} icon={Wallet} delta={<Delta cur={ticket} prev={prevTicket} />} sub="por venda" />
        <Kpi label="Pedidos recebidos" value={String(c?.orders_count ?? 0)} icon={ShoppingBag} delta={<Delta cur={c?.orders_count ?? 0} prev={p?.orders_count ?? 0} />} sub="no período" />
        <Kpi label="Pendentes" value={String(c?.pending_orders ?? 0)} icon={Clock} tone="warn" href="/admin/possiveis-vendas" sub="aguardando confirmação" />
        <Kpi label="Produtos ativos" value={String(c?.products_count ?? 0)} icon={Package} href="/admin/estoque?aba=disponiveis" sub="disponíveis no site" />
        <Kpi label="Estoque baixo" value={String(c?.low_stock ?? 0)} icon={PackageMinus} tone="warn" href="/admin/estoque?nivel=baixo" sub="variações" />
        <Kpi label="Esgotados" value={String(c?.out_of_stock ?? 0)} icon={PackageX} tone="bad" href="/admin/estoque?nivel=zerado" sub="produtos" />
      </section>

      {/* Resumo financeiro: de onde vem o faturamento líquido */}
      <Panel title="Resumo financeiro do período" hint="Mesma base do Controle de caixa: os números sempre batem">
        <dl className="space-y-2.5 text-sm">
          <div className="flex items-baseline justify-between gap-3"><dt className="text-muted">Valor original das vendas</dt><dd className="font-semibold text-ink">{formatBRL(c?.original_total ?? 0)}</dd></div>
          <div className="flex items-baseline justify-between gap-3"><dt className="text-muted">Descontos dados na venda</dt><dd className="font-semibold text-ink">− {formatBRL(c?.sale_discounts ?? 0)}</dd></div>
          <div className="flex items-baseline justify-between gap-3 border-t border-line pt-2.5"><dt className="font-bold text-ink">Entradas (valor cobrado)</dt><dd className="font-bold text-ink">{formatBRL(c?.income ?? 0)}</dd></div>
          <div className="flex items-baseline justify-between gap-3"><dt className="text-muted">Estornos</dt><dd className="font-semibold text-ink">− {formatBRL(c?.refunds ?? 0)}</dd></div>
          <div className="flex items-baseline justify-between gap-3"><dt className="text-muted">Descontos retroativos</dt><dd className="font-semibold text-ink">− {formatBRL(c?.retro_discounts ?? 0)}</dd></div>
          <div className="flex items-baseline justify-between gap-3 border-t border-line pt-3"><dt className="text-base font-black text-ink">Faturamento líquido</dt><dd className="text-2xl font-black tracking-tight text-ink">{formatBRL(c?.revenue ?? 0)}</dd></div>
        </dl>
      </Panel>

      {/* Gráficos */}
      <Panel title="Faturamento por dia" hint="Líquido de descontos e estornos, na data de cada lançamento">
        <RevenueChart data={c?.daily ?? []} />
      </Panel>

      <Panel title="Faturamento mensal e anual" hint="Histórico líquido de descontos e estornos: compare meses e anos">
        {history.error ? (
          <p role="alert" className="rounded-xl bg-bad/15 p-4 text-sm font-medium text-bad">
            Não foi possível carregar o histórico: {history.error}. Se a mensagem citar “revenue_history”, rode o SQL 0007 no Supabase.
          </p>
        ) : (
          <RevenueHistory rows={history.data} nowYear={Number(t.slice(0, 4))} nowMonth={Number(t.slice(5, 7))} />
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Pedidos e vendas por dia" hint="Pedidos recebidos × vendas confirmadas">
          <SalesOrdersChart data={c?.daily ?? []} />
        </Panel>
        <Panel title="Formas de pagamento" hint="Distribuição do faturamento">
          <PaymentsChart data={c?.payments ?? []} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Mais vendidos" hint="Por unidades vendidas">
          <RankedBars color="var(--c1)" empty="Sem vendas no período."
            items={(c?.top_products ?? []).map((i) => ({ name: i.name, value: i.qty, label: `${i.qty} un.`, sub: formatBRL(Number(i.revenue)) }))} />
        </Panel>
        <Panel title="Menos vendidos" hint="Produtos ativos com menos saídas">
          <RankedBars color="var(--c3)" empty="Nenhum produto ativo."
            items={(c?.bottom_products ?? []).map((i) => ({ name: i.name, value: i.qty, label: `${i.qty} un.`, sub: i.qty === 0 ? "Sem vendas no período" : formatBRL(Number(i.revenue)) }))} />
        </Panel>
        <Panel title="Desempenho por categoria" hint="Por faturamento">
          <RankedBars color="var(--c2)" empty="Sem vendas no período."
            items={(c?.categories ?? []).map((i) => ({ name: i.name, value: Number(i.revenue), label: formatBRL(Number(i.revenue)), sub: `${i.qty} un.` }))} />
        </Panel>
      </div>
    </div>
  );
}
