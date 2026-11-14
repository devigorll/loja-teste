"use client";

import { useState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { formatBRL } from "@/lib/format";
import type { CatalogVariant } from "@/lib/admin/catalog";

export type { CatalogVariant };
export type EditorLine = {
  key: string; item_id: string | null; variant_id: string | null;
  name: string; size: string; color: string; quantity: number; price: string;
};

export const lineTotal = (price: string, qty: number) => (Math.round((Number(price.replace(",", ".")) || 0) * 100) * qty) / 100;

/** Total e validade das linhas (usado também pelos formulários que contêm a lista). */
export function summarize(lines: EditorLine[]) {
  const parsed = lines.map((l) => ({ ...l, unit: Number(l.price.replace(",", ".")) }));
  const valid = parsed.length > 0 && parsed.every((l) => Number.isFinite(l.unit) && l.unit >= 0 && l.quantity >= 1);
  const total = parsed.reduce((s, l) => s + (Number.isFinite(l.unit) ? (Math.round(l.unit * 100) * l.quantity) / 100 : 0), 0);
  return { parsed, valid, total };
}

type Props = {
  lines: EditorLine[];
  onChange: (lines: EditorLine[]) => void;
  catalog: CatalogVariant[];
  stock: Record<string, number>;
  readOnly?: boolean;
  minLines?: number; // mínimo de linhas que não pode ser removido (1 em pedidos existentes, 0 em novo pedido)
};

const stepBtn = "grid size-11 place-items-center text-ink transition hover:bg-surface-2 active:scale-90 disabled:opacity-30";

export function OrderLines({ lines, onChange, catalog, stock, readOnly = false, minLines = 1 }: Props) {
  const [pick, setPick] = useState("");
  const [pickQty, setPickQty] = useState(1);
  const { total } = summarize(lines);

  const setQty = (key: string, q: number) => onChange(lines.map((l) => (l.key === key ? { ...l, quantity: Math.max(1, Math.min(999, q)) } : l)));
  const setPrice = (key: string, price: string) => onChange(lines.map((l) => (l.key === key ? { ...l, price } : l)));
  const removeLine = (key: string) => onChange(lines.filter((l) => l.key !== key));

  function addLine() {
    const v = catalog.find((c) => c.id === pick);
    if (!v) return;
    const ex = lines.find((l) => l.variant_id === v.id);
    if (ex) {
      onChange(lines.map((l) => (l === ex ? { ...l, quantity: Math.min(999, l.quantity + pickQty) } : l)));
    } else {
      const [name, rest = ""] = v.label.split(" — ");
      const [size = "", color = ""] = rest.split(" / ");
      onChange([...lines, { key: crypto.randomUUID(), item_id: null, variant_id: v.id, name, size, color, quantity: pickQty, price: v.price.toFixed(2) }]);
    }
    setPick(""); setPickQty(1);
  }

  return (
    <div className="space-y-5">
      {lines.length === 0 && !readOnly && (
        <p className="adm-card border-dashed p-6 text-center text-sm text-muted">Nenhum produto adicionado ainda. Escolha um produto abaixo.</p>
      )}

      <ul className="space-y-3">
        {lines.map((l) => {
          const st = l.variant_id ? stock[l.variant_id] ?? catalog.find((c) => c.id === l.variant_id)?.stock : undefined;
          const short = !readOnly && st !== undefined && l.quantity > st;
          return (
            <li key={l.key} className="adm-card space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-ink">{l.name}</p>
                  <p className="text-xs text-muted">Tam. {l.size} · {l.color}</p>
                  {!l.variant_id && !readOnly && <p className="mt-1 text-xs font-bold text-bad">Produto removido do catálogo. Remova este item para poder confirmar.</p>}
                  {!readOnly && st !== undefined && <p className={`mt-1 text-xs ${short ? "font-bold text-bad" : "text-muted"}`}>Estoque: {st}{short ? " (insuficiente)" : ""}</p>}
                </div>
                <p className="shrink-0 text-base font-black text-ink">{formatBRL(lineTotal(l.price, l.quantity))}</p>
              </div>

              {readOnly ? (
                <p className="text-sm text-muted">{l.quantity} un. × {formatBRL(Number(l.price))}</p>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center overflow-hidden rounded-full border border-line bg-surface-2">
                    <button type="button" aria-label="Diminuir quantidade" disabled={l.quantity <= 1} onClick={() => setQty(l.key, l.quantity - 1)} className={stepBtn}><Minus size={16} /></button>
                    <span className="w-9 text-center text-sm font-bold text-ink" aria-live="polite">{l.quantity}</span>
                    <button type="button" aria-label="Aumentar quantidade" onClick={() => setQty(l.key, l.quantity + 1)} className={stepBtn}><Plus size={16} /></button>
                  </div>
                  <label className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-40">
                    <span className="text-sm text-muted">R$</span>
                    <input inputMode="decimal" aria-label={`Preço unitário de ${l.name}`} value={l.price} onChange={(e) => setPrice(l.key, e.target.value)} className="adm-input" />
                  </label>
                  <button type="button" aria-label={`Remover ${l.name}`} disabled={lines.length <= minLines} onClick={() => removeLine(l.key)}
                    className="adm-btn adm-btn-danger ml-auto size-11 min-h-0 p-0"><Trash2 size={18} /></button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {!readOnly && (
        <div className="adm-card flex flex-col gap-3 border-dashed p-4 sm:flex-row">
          <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Adicionar produto" className="adm-input flex-1">
            <option value="">Adicionar produto...</option>
            {catalog.map((c) => <option key={c.id} value={c.id} disabled={c.stock <= 0}>{c.label} · {formatBRL(c.price)} · estoque {c.stock}</option>)}
          </select>
          <div className="flex gap-3">
            <input type="number" min={1} max={999} value={pickQty} onChange={(e) => setPickQty(Math.max(1, Number(e.target.value) || 1))} aria-label="Quantidade" className="adm-input w-24" />
            <button type="button" onClick={addLine} disabled={!pick} className="adm-btn adm-btn-primary flex-1 sm:flex-none">Adicionar</button>
          </div>
        </div>
      )}

      <div className="adm-card flex items-baseline justify-between p-4 sm:p-5">
        <span className="text-sm font-semibold text-muted">Total do pedido</span>
        <span className="text-3xl font-black tracking-tight text-ink">{formatBRL(total)}</span>
      </div>
    </div>
  );
}
