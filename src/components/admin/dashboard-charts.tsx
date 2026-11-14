"use client";

import type { CSSProperties } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBRL } from "@/lib/format";

type Daily = { day: string; revenue: number; sales: number; orders: number };
type Pay = { name: string; total: number; count: number };

const COLORS = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)"];
const tick = { fill: "var(--muted)", fontSize: 11 };
const contentStyle: CSSProperties = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, color: "var(--ink)", fontSize: 12 };
const labelStyle: CSSProperties = { color: "var(--ink)", fontWeight: 700 };
const itemStyle: CSSProperties = { color: "var(--ink)" };

const short = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(".", ",")} mil` : String(Math.round(n)));

export function RevenueChart({ data }: { data: Daily[] }) {
  return (
    <div className="h-64 w-full sm:h-72" role="img" aria-label="Gráfico de faturamento por dia">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--c1)" stopOpacity={0.4} />
              <stop offset="95%" stopColor="var(--c1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="day" tickFormatter={short} tick={tick} tickLine={false} axisLine={{ stroke: "var(--line)" }} minTickGap={28} />
          <YAxis tickFormatter={compact} tick={tick} tickLine={false} axisLine={false} width={44} />
          <Tooltip contentStyle={contentStyle} labelStyle={labelStyle} itemStyle={itemStyle}
            labelFormatter={(l) => short(String(l))} formatter={(v) => [formatBRL(Number(v)), "Faturamento"]} />
          <Area type="monotone" dataKey="revenue" stroke="var(--c1)" strokeWidth={2.5} fill="url(#revFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SalesOrdersChart({ data }: { data: Daily[] }) {
  return (
    <div className="h-64 w-full sm:h-72" role="img" aria-label="Gráfico de vendas e pedidos por dia">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="day" tickFormatter={short} tick={tick} tickLine={false} axisLine={{ stroke: "var(--line)" }} minTickGap={28} />
          <YAxis allowDecimals={false} tick={tick} tickLine={false} axisLine={false} width={32} />
          <Tooltip contentStyle={contentStyle} labelStyle={labelStyle} itemStyle={itemStyle} cursor={{ fill: "var(--surface-2)" }} labelFormatter={(l) => short(String(l))} />
          <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted)" }} />
          <Bar dataKey="orders" name="Pedidos recebidos" fill="var(--c3)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="sales" name="Vendas confirmadas" fill="var(--c2)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PaymentsChart({ data }: { data: Pay[] }) {
  const sum = data.reduce((s, p) => s + Number(p.total), 0);
  if (data.length === 0 || sum === 0) return <p className="py-10 text-center text-sm text-muted">Sem vendas no período.</p>;
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="h-48 w-48 shrink-0" role="img" aria-label="Distribuição das vendas por forma de pagamento">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="total" nameKey="name" innerRadius={52} outerRadius={84} paddingAngle={2} stroke="var(--surface)" strokeWidth={2}>
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip contentStyle={contentStyle} labelStyle={labelStyle} itemStyle={itemStyle} formatter={(v) => formatBRL(Number(v))} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-3">
        {data.map((p, i) => (
          <li key={p.name} className="flex items-center gap-3 text-sm">
            <span className="size-3 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="min-w-0 flex-1 truncate font-medium text-ink">{p.name}</span>
            <span className="shrink-0 text-muted">{((Number(p.total) / sum) * 100).toFixed(0)}%</span>
            <span className="shrink-0 font-bold text-ink">{formatBRL(Number(p.total))}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
