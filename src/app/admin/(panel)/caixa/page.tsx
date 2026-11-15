import Link from "next/link";
import { Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatBRL } from "@/lib/format";
import { dayEnd, dayStart, fmtDateTime, fmtDay, isISODate, monthStart, todayISO } from "@/lib/dates";
import { ADJUST_KIND_LABEL } from "@/lib/admin/sales";
import { PageHeader } from "@/components/admin/page-header";
import { PeriodPresets } from "@/components/admin/period-presets";

export const dynamic = "force-dynamic";

type Summary = {
  net: number; income: number; refunds: number; retro_discounts: number; sale_discounts: number; sales_count: number;
  by_method: { method: string; total: number; count: number }[];
  daily: { day: string; total: number; count: number }[];
};
type Tx = { id: string; type: string; amount: number; description: string | null; created_at: string; payment_methods: { name: string } | null; sale_adjustments: { kind: string } | null };

const txLabel = (m: Tx) => (m.type === "income" ? "Entrada" : ADJUST_KIND_LABEL[m.sale_adjustments?.kind ?? ""] ?? "Estorno");

const lbl = "text-xs font-bold uppercase tracking-wide text-muted";

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
      .select("id, type, amount, description, created_at, payment_methods(name), sale_adjustments(kind)")
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

  const ticket = sRange && sRange.sales_count > 0 ? Number(sRange.income) / Number(sRange.sales_count) : 0; // entradas ÷ vendas

  return (
    <div className="space-y-8">
      <PageHeader title="Controle de caixa"
        subtitle="Controle gerencial baseado nas vendas confirmadas e nas formas de pagamento informadas na plataforma. Não é uma conciliação bancária automática." />

      {err && (
        <p role="alert" className="rounded-xl bg-bad/15 p-4 text-sm font-medium text-bad">
          Erro ao carregar o caixa: {err.message}. Se a mensagem citar “cash_summary”, rode o SQL 0005 no Supabase.
        </p>
      )}

      <section aria-label="Resumo" className="grid gap-4 sm:grid-cols-2">
        <div className="adm-hero p-5">
          <p className="flex items-center gap-2 text-sm font-semibold opacity-90"><Wallet size={16} /> Hoje</p>
          <p className="mt-2 text-4xl font-black tracking-tight">{formatBRL(Number(sToday?.net ?? 0))}</p>
          <p className="mt-1 text-sm opacity-90">{sToday?.sales_count ?? 0} vendas</p>
        </div>
        <div className="adm-hero p-5">
          <p className="flex items-center gap-2 text-sm font-semibold opacity-90"><Wallet size={16} /> Este mês</p>
          <p className="mt-2 text-4xl font-black tracking-tight">{formatBRL(Number(sMonth?.net ?? 0))}</p>
          <p className="mt-1 text-sm opacity-90">{sMonth?.sales_count ?? 0} vendas</p>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold text-ink">Período selecionado</h2>
          <p className="text-xs text-muted">De {fmtDay(de)} até {fmtDay(ate)}</p>
        </div>
        <PeriodPresets basePath="/admin/caixa" current={{ de, ate }} />
        <form method="get" className="adm-card grid grid-cols-2 gap-3 p-4 sm:flex sm:items-end">
          <label className="text-xs font-medium text-muted">De<input type="date" name="de" defaultValue={de} className="adm-input mt-1" /></label>
          <label className="text-xs font-medium text-muted">Até<input type="date" name="ate" defaultValue={ate} className="adm-input mt-1" /></label>
          <button className="adm-btn adm-btn-primary col-span-2 sm:col-span-1">Aplicar</button>
        </form>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
          <div className="adm-card p-4"><p className={lbl}>Saldo</p><p className="mt-2 text-2xl font-black text-ink">{formatBRL(Number(sRange?.net ?? 0))}</p></div>
          <div className="adm-card p-4"><p className={lbl}>Entradas</p><p className="mt-2 text-2xl font-black text-ink">{formatBRL(Number(sRange?.income ?? 0))}</p></div>
          <div className="adm-card p-4"><p className={lbl}>Estornos</p><p className="mt-2 text-2xl font-black text-ink">{formatBRL(Number(sRange?.refunds ?? 0))}</p></div>
          <div className="adm-card p-4"><p className={lbl}>Descontos retroativos</p><p className="mt-2 text-2xl font-black text-ink">{formatBRL(Number(sRange?.retro_discounts ?? 0))}</p></div>
          <div className="adm-card p-4"><p className={lbl}>Vendas · ticket</p><p className="mt-2 text-2xl font-black text-ink">{sRange?.sales_count ?? 0}</p><p className="text-xs text-muted">{formatBRL(ticket)} em média</p></div>
        </div>
        <p className="text-xs text-muted">Saldo = entradas − estornos − descontos retroativos. As entradas já têm abatidos os descontos dados na confirmação das vendas ({formatBRL(Number(sRange?.sale_discounts ?? 0))} no período). Os lançamentos entram na data em que foram feitos.</p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold text-ink">Por forma de pagamento</h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          {[...byMethod.entries()].map(([name, v]) => (
            <div key={name} className="adm-card p-4">
              <p className={lbl}>{name}</p>
              <p className="mt-2 text-2xl font-black text-ink">{formatBRL(v.total)}</p>
              <p className="text-xs text-muted">{v.count} {v.count === 1 ? "venda" : "vendas"}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold text-ink">Resumo diário</h2>
        {(sRange?.daily ?? []).length === 0 ? (
          <p className="adm-card border-dashed p-8 text-center text-muted">Sem movimentações no período.</p>
        ) : (
          <div className="adm-card overflow-hidden">
            <table className="adm-table">
              <thead><tr><th>Dia</th><th>Vendas</th><th className="text-right">Total</th></tr></thead>
              <tbody>
                {sRange!.daily.map((d) => (
                  <tr key={d.day}><td className="font-medium">{fmtDay(d.day)}</td><td>{d.count}</td><td className="text-right font-bold">{formatBRL(Number(d.total))}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold text-ink">Movimentações financeiras</h2>
        {tx.length === 0 ? (
          <p className="adm-card border-dashed p-8 text-center text-muted">Nenhuma movimentação no período.</p>
        ) : (
          <>
            {/* Celular: cartões */}
            <ul className="space-y-3 md:hidden">
              {tx.map((m) => (
                <li key={m.id} className="adm-card flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="font-bold text-ink">{m.description ?? txLabel(m)}</p>
                    <p className="text-xs text-muted">{fmtDateTime(m.created_at)} · {m.payment_methods?.name ?? "—"}</p>
                    <span className={`adm-badge mt-2 ${m.type === "income" ? "bg-good/15 text-good" : "bg-warn/15 text-warn"}`}>{txLabel(m)}</span>
                  </div>
                  <p className={`shrink-0 text-lg font-black ${Number(m.amount) < 0 ? "text-bad" : "text-ink"}`}>{formatBRL(Number(m.amount))}</p>
                </li>
              ))}
            </ul>
            {/* Tablet e computador: tabela */}
            <div className="adm-card hidden overflow-x-auto md:block">
              <table className="adm-table">
                <thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Pagamento</th><th className="text-right">Valor</th></tr></thead>
                <tbody>
                  {tx.map((m) => (
                    <tr key={m.id}>
                      <td className="whitespace-nowrap">{fmtDateTime(m.created_at)}</td>
                      <td><span className={`adm-badge ${m.type === "income" ? "bg-good/15 text-good" : "bg-warn/15 text-warn"}`}>{txLabel(m)}</span></td>
                      <td>{m.description ?? "—"}</td>
                      <td>{m.payment_methods?.name ?? "—"}</td>
                      <td className={`text-right font-bold ${Number(m.amount) < 0 ? "text-bad" : ""}`}>{formatBRL(Number(m.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <p className="text-xs text-muted">Até as 100 movimentações mais recentes do período. Para ver todas as vendas, use o <Link href="/admin/vendas" className="font-semibold text-accent underline">Histórico de vendas</Link>.</p>
      </section>
    </div>
  );
}
