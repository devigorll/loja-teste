"use client";

import { computeDiscount, type DiscountMode, type DiscountState } from "@/lib/discount";
import { formatBRL } from "@/lib/format";

type Props = {
  value: DiscountState;
  onChange: (v: DiscountState) => void;
  base: number;          // valor de referência do percentual
  max: number;           // desconto máximo permitido (R$)
  allowNone?: boolean;   // mostra a opção "Sem desconto"
  idPrefix?: string;
};

const OPTIONS: { value: DiscountMode; label: string }[] = [
  { value: "none", label: "Sem desconto" },
  { value: "percent", label: "Percentual (%)" },
  { value: "fixed", label: "Valor fixo (R$)" },
];

/** Escolha entre desconto percentual ou em valor fixo, com prévia do valor calculado. */
export function DiscountFields({ value, onChange, base, max, allowNone = true, idPrefix = "disc" }: Props) {
  const r = computeDiscount(value, base, max);
  const options = allowNone ? OPTIONS : OPTIONS.filter((o) => o.value !== "none");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Tipo de desconto">
        {options.map((o) => (
          <button key={o.value} type="button" aria-current={value.mode === o.value ? "true" : undefined} className="adm-chip"
            onClick={() => onChange({ mode: o.value, raw: o.value === value.mode ? value.raw : "" })}>
            {o.label}
          </button>
        ))}
      </div>

      {value.mode !== "none" && (
        <div className="space-y-2">
          <label htmlFor={`${idPrefix}-val`} className="block text-sm font-medium text-ink">
            {value.mode === "percent" ? "Percentual de desconto" : "Valor do desconto (R$)"}
          </label>
          <div className="flex items-center gap-2">
            <input id={`${idPrefix}-val`} inputMode="decimal" value={value.raw} onChange={(e) => onChange({ ...value, raw: e.target.value })}
              placeholder={value.mode === "percent" ? "Ex.: 10" : "Ex.: 25,00"} className="adm-input sm:max-w-48" aria-invalid={r.error ? true : undefined} />
            <span className="text-sm font-semibold text-muted">{value.mode === "percent" ? "%" : "R$"}</span>
          </div>
          {r.error
            ? <p role="alert" className="text-sm font-semibold text-bad">{r.error}</p>
            : r.amount > 0 && <p className="text-sm text-muted">Desconto de <strong className="text-ink">{formatBRL(r.amount)}</strong>{r.percent !== null ? ` (${String(r.percent).replace(".", ",")}%)` : ""}</p>}
        </div>
      )}
    </div>
  );
}
