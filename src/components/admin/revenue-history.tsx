"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBRL } from "@/lib/format";
import type { HistoryRow } from "@/lib/admin/dashboard";
import { MetricValue } from "@/components/admin/metric-value";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MONTHS_FULL = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const tick = { fill: "var(--muted)", fontSize: 11 };
const contentStyle: CSSProperties = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, color: "var(--ink)", fontSize: 12 };
const labelStyle: CSSProperties = { color: "var(--ink)", fontWeight: 700 };
const itemStyle: CSSProperties = { color: "var(--ink)" };
const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(".", ",")} mil` : String(Math.round(n)));
const pct = (cur: number, prev: number) => (prev > 0 ? `${cur >= prev ? "▲" : "▼"} ${Math.abs(((cur - prev) / prev) * 100).toFixed(1).replace(".", ",")}%` : "—");

type Datum = { label: string; full: string; revenue: number; sales: number; color: string; future?: boolean };

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="adm-fit-box rounded-xl border border-line bg-surface-2 p-3.5">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted">{label}</p>
      <MetricValue text={value} className="mt-1 text-ink [--fit-max:1.25rem]" />
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

function Chart({ data, label }: { data: Datum[]; label: string }) {
  return (
    <div className="h-64 w-full sm:h-72" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={{ stroke: "var(--line)" }} interval={0} />
          <YAxis tickFormatter={compact} tick={tick} tickLine={false} axisLine={false} width={44} />
          <Tooltip contentStyle={contentStyle} labelStyle={labelStyle} itemStyle={itemStyle} cursor={{ fill: "var(--surface-2)" }}
            labelFormatter={(_, p) => String(p?.[0]?.payload?.full ?? "")}
            formatter={(v, _n, item) => [`${formatBRL(Number(v))} · ${item.payload.sales} ${item.payload.sales === 1 ? "venda" : "vendas"}`, "Faturamento"]} />
          <Bar dataKey="revenue" radius={[5, 5, 0, 0]}>
            {data.map((d, i) => <Cell key={i} fill={d.color} fillOpacity={d.future ? 0.35 : 1} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RevenueHistory({ rows, nowYear, nowMonth }: { rows: HistoryRow[]; nowYear: number; nowMonth: number }) {
  const [view, setView] = useState<"mensal" | "anual">("mensal");
  const [year, setYear] = useState(nowYear);

  const years = useMemo(() => {
    const first = rows.length ? Math.min(...rows.map((r) => r.year)) : nowYear;
    const list: number[] = [];
    for (let y = nowYear; y >= Math.min(first, nowYear); y--) list.push(y);
    return list; // do mais recente para o mais antigo
  }, [rows, nowYear]);

  // ---------- Mensal ----------
  const monthly = useMemo(() => {
    const byMonth = new Map(rows.filter((r) => r.year === year).map((r) => [r.month, r]));
    const items = MONTHS.map((label, i) => {
      const m = i + 1;
      const r = byMonth.get(m);
      const future = year > nowYear || (year === nowYear && m > nowMonth);
      return { m, label, full: `${MONTHS_FULL[i]} de ${year}`, revenue: r?.revenue ?? 0, sales: r?.sales ?? 0, future };
    });
    const withRev = items.filter((i) => !i.future && i.revenue > 0);
    const max = withRev.length ? withRev.reduce((a, b) => (b.revenue > a.revenue ? b : a)) : null;
    const min = withRev.length > 1 ? withRev.reduce((a, b) => (b.revenue < a.revenue ? b : a)) : null;
    const total = items.reduce((s, i) => s + i.revenue, 0);
    const data: Datum[] = items.map((i) => ({
      label: i.label, full: i.full, revenue: i.revenue, sales: i.sales, future: i.future,
      color: max && i.m === max.m ? "var(--c1)" : min && i.m === min.m ? "var(--c4)" : "var(--c3)",
    }));
    return { data, max, min, total, months: withRev.length };
  }, [rows, year, nowYear, nowMonth]);

  // ---------- Anual ----------
  const yearly = useMemo(() => {
    const asc = [...years].reverse();
    const items = asc.map((y) => {
      const list = rows.filter((r) => r.year === y);
      return { year: y, revenue: list.reduce((s, r) => s + r.revenue, 0), sales: list.reduce((s, r) => s + r.sales, 0) };
    });
    const best = items.reduce((a, b) => (b.revenue > a.revenue ? b : a), items[0]);
    const data: Datum[] = items.map((i) => ({
      label: String(i.year), full: `Ano ${i.year}${i.year === nowYear ? " (em andamento)" : ""}`, revenue: i.revenue, sales: i.sales,
      color: i.year === best.year && best.revenue > 0 ? "var(--c1)" : "var(--c3)", future: false,
    }));
    return { items, best, data, total: items.reduce((s, i) => s + i.revenue, 0) };
  }, [rows, years, nowYear]);

  if (rows.length === 0) {
    return <p className="py-10 text-center text-sm text-muted">Ainda não há vendas confirmadas para montar o histórico mensal e anual.</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2" role="group" aria-label="Tipo de visualização">
          {(["mensal", "anual"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} aria-current={view === v ? "true" : undefined} className="adm-chip">
              {v === "mensal" ? "Mensal" : "Anual"}
            </button>
          ))}
        </div>
        {view === "mensal" && (
          <label className="flex items-center gap-2 text-sm font-medium text-muted">
            Ano
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="adm-input w-auto min-w-24">
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        )}
      </div>

      {view === "mensal" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label={`Total de ${year}`} value={formatBRL(monthly.total)} sub={year === nowYear ? "ano em andamento" : undefined} />
            <Stat label="Maior faturamento" value={monthly.max ? formatBRL(monthly.max.revenue) : "—"} sub={monthly.max ? MONTHS_FULL[monthly.max.m - 1] : "sem vendas no ano"} />
            <Stat label="Menor faturamento" value={monthly.min ? formatBRL(monthly.min.revenue) : "—"} sub={monthly.min ? MONTHS_FULL[monthly.min.m - 1] : "precisa de 2 meses com vendas"} />
          </div>
          <Chart data={monthly.data} label={`Faturamento mensal de ${year}`} />
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm" style={{ background: "var(--c1)" }} /> maior mês</span>
            <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm" style={{ background: "var(--c4)" }} /> menor mês (entre os meses com vendas)</span>
            <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm" style={{ background: "var(--c3)" }} /> demais meses</span>
          </p>
        </>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Faturamento acumulado" value={formatBRL(yearly.total)} sub={`${yearly.items.length} ${yearly.items.length === 1 ? "ano" : "anos"}`} />
            <Stat label="Melhor ano" value={yearly.best.revenue > 0 ? String(yearly.best.year) : "—"} sub={yearly.best.revenue > 0 ? formatBRL(yearly.best.revenue) : undefined} />
            <Stat label={`Ano atual (${nowYear})`} value={formatBRL(yearly.items.find((i) => i.year === nowYear)?.revenue ?? 0)} sub="em andamento" />
          </div>
          <Chart data={yearly.data} label="Faturamento anual" />

          {/* Celular: cartões / computador: tabela */}
          <ul className="space-y-2 md:hidden">
            {[...yearly.items].reverse().map((i, n, arr) => {
              const prev = arr[n + 1];
              return (
                <li key={i.year} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 p-3.5">
                  <div><p className="font-bold text-ink">{i.year}</p><p className="text-xs text-muted">{i.sales} {i.sales === 1 ? "venda" : "vendas"}</p></div>
                  <div className="text-right"><p className="font-black text-ink">{formatBRL(i.revenue)}</p><p className="text-xs text-muted">{prev ? pct(i.revenue, prev.revenue) : "—"}</p></div>
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-hidden rounded-xl border border-line md:block">
            <table className="adm-table">
              <thead><tr><th>Ano</th><th>Vendas</th><th className="text-right">Faturamento</th><th className="text-right">Variação</th></tr></thead>
              <tbody>
                {[...yearly.items].reverse().map((i, n, arr) => {
                  const prev = arr[n + 1];
                  return (
                    <tr key={i.year}>
                      <td className="font-semibold">{i.year}{i.year === nowYear ? <span className="ml-2 text-xs font-normal text-muted">em andamento</span> : null}</td>
                      <td>{i.sales}</td>
                      <td className="text-right font-bold">{formatBRL(i.revenue)}</td>
                      <td className="text-right text-muted">{prev ? pct(i.revenue, prev.revenue) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">A variação compara cada ano com o anterior. O ano atual ainda não está completo.</p>
        </>
      )}
    </div>
  );
}
