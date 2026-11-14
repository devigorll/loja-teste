import Link from "next/link";
import { addDays, monthStart, todayISO } from "@/lib/dates";

type Props = { basePath: string; extra?: Record<string, string>; current: { de: string; ate: string } };

export function PeriodPresets({ basePath, extra = {}, current }: Props) {
  const t = todayISO();
  const presets = [
    { label: "Hoje", de: t, ate: t },
    { label: "Últimos 7 dias", de: addDays(t, -6), ate: t },
    { label: "Últimos 30 dias", de: addDays(t, -29), ate: t },
    { label: "Este mês", de: monthStart(t), ate: t },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {presets.map((p) => {
        const on = p.de === current.de && p.ate === current.ate;
        const qs = new URLSearchParams({ ...extra, de: p.de, ate: p.ate }).toString();
        return (
          <Link key={p.label} href={`${basePath}?${qs}`} aria-current={on ? "true" : undefined}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition active:scale-95 ${on
              ? "border-neutral-950 bg-neutral-950 text-white dark:border-white dark:bg-white dark:text-neutral-950"
              : "border-neutral-300 hover:border-neutral-950 dark:border-neutral-700 dark:hover:border-white"}`}>
            {p.label}
          </Link>
        );
      })}
    </div>
  );
}
