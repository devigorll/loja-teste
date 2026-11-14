import Link from "next/link";
import { addDays, monthStart, todayISO } from "@/lib/dates";

type Props = { basePath: string; extra?: Record<string, string>; current: { de: string; ate: string } };

/** Atalhos de período. Em telas pequenas rolam na horizontal (sem quebrar o layout). */
export function PeriodPresets({ basePath, extra = {}, current }: Props) {
  const t = todayISO();
  const presets = [
    { label: "Hoje", de: t, ate: t },
    { label: "7 dias", de: addDays(t, -6), ate: t },
    { label: "30 dias", de: addDays(t, -29), ate: t },
    { label: "Este mês", de: monthStart(t), ate: t },
  ];
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
      {presets.map((p) => {
        const on = p.de === current.de && p.ate === current.ate;
        const qs = new URLSearchParams({ ...extra, de: p.de, ate: p.ate }).toString();
        return (
          <Link key={p.label} href={`${basePath}?${qs}`} aria-current={on ? "true" : undefined} className="adm-chip">
            {p.label}
          </Link>
        );
      })}
    </div>
  );
}
