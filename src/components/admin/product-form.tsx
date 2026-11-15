"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BADGE_OPTIONS, STATUS_HELP, STATUS_LABEL, blankVariant, parseMoney, type ProductDraft, type Status, type VariantDraft } from "@/lib/admin/products";
import { StockAdjustDialog } from "./stock-adjust-dialog";

export type { ProductDraft, VariantDraft };

type Props = {
  mode: "create" | "edit";
  productId?: string;
  categories: { id: string; name: string }[];
  initial: ProductDraft;
  stockById: Record<string, number>; // estoque atual (vem do servidor; só muda por "Ajustar")
};

const GRIDS = [
  { label: "P · M · G · GG", sizes: ["P", "M", "G", "GG"] },
  { label: "38 · 40 · 42 · 44", sizes: ["38", "40", "42", "44"] },
  { label: "Tamanho único", sizes: ["Único"] },
];
const STATUSES: Status[] = ["active", "unavailable", "archived"];
const lbl = "block text-sm font-medium text-ink";
const sub = "text-xs font-medium text-muted";
const toInt = (s: string, fallback: number) => { const n = Number.parseInt(s, 10); return Number.isInteger(n) ? n : fallback; };

export function ProductForm({ mode, productId, categories, initial, stockById }: Props) {
  const router = useRouter();
  const [f, setF] = useState<ProductDraft>(initial);
  const [gridColor, setGridColor] = useState("");
  const [adjust, setAdjust] = useState<{ id: string; label: string; current: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof ProductDraft>(k: K, v: ProductDraft[K]) => setF((s) => ({ ...s, [k]: v }));
  const setVariant = (key: string, patch: Partial<VariantDraft>) =>
    setF((s) => ({ ...s, variants: s.variants.map((v) => (v.key === key ? { ...v, ...patch } : v)) }));
  const removeVariant = (key: string) => setF((s) => ({ ...s, variants: s.variants.filter((v) => v.key !== key) }));

  function addGrid(sizes: string[]) {
    const color = gridColor.trim();
    if (!color) { setError("Digite a cor da grade (ex.: Preto) antes de gerar os tamanhos."); return; }
    setError(null);
    setF((s) => {
      const have = new Set(s.variants.map((v) => `${v.size.trim().toLowerCase()}|${v.color.trim().toLowerCase()}`));
      const add = sizes.filter((z) => !have.has(`${z.toLowerCase()}|${color.toLowerCase()}`)).map((z) => blankVariant(z, color));
      // remove a linha em branco inicial, se existir
      const base = s.variants.filter((v) => v.id || v.size.trim() || v.color.trim());
      return { ...s, variants: [...base, ...add] };
    });
  }

  function validate(): string | null {
    if (f.name.trim().length < 2) return "Informe o nome do produto.";
    const price = parseMoney(f.price);
    if (!Number.isFinite(price) || price < 0) return "Informe um preço válido.";
    if (f.promo_price.trim()) {
      const promo = parseMoney(f.promo_price);
      if (!Number.isFinite(promo) || promo < 0 || promo >= price) return "O preço promocional deve ser menor que o preço normal.";
    }
    if (f.variants.length === 0) return "Cadastre ao menos uma variação (tamanho e cor).";
    const seen = new Set<string>();
    for (const [i, v] of f.variants.entries()) {
      const n = i + 1;
      if (!v.size.trim() || !v.color.trim()) return `Variação ${n}: informe tamanho e cor.`;
      const k = `${v.size.trim().toLowerCase()}|${v.color.trim().toLowerCase()}`;
      if (seen.has(k)) return `Variação ${n}: já existe outra com o mesmo tamanho e cor.`;
      seen.add(k);
      if (!v.id && !(Number.isInteger(Number(v.stock)) && Number(v.stock) >= 0)) return `Variação ${n}: o estoque inicial deve ser um número inteiro (0 ou mais).`;
      if (!Number.isInteger(Number(v.low_stock_threshold)) || Number(v.low_stock_threshold) < 0) return `Variação ${n}: o alerta de estoque baixo deve ser 0 ou mais.`;
      if (v.price_override.trim() && !(parseMoney(v.price_override) >= 0)) return `Variação ${n}: preço próprio inválido.`;
    }
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const problem = validate();
    if (problem) { setError(problem); return; }
    setError(null); setBusy(true);

    const payload = {
      name: f.name.trim(), description: f.description, category_id: f.category_id || null,
      price: parseMoney(f.price), promo_price: f.promo_price.trim() ? parseMoney(f.promo_price) : null,
      is_featured: f.is_featured, status: f.status, badge_override: f.badge_override || null,
      variants: f.variants.map((v) => ({
        id: v.id, size: v.size.trim(), color: v.color.trim(), color_hex: v.color_hex || null, sku: v.sku.trim() || null,
        price_override: v.price_override.trim() ? parseMoney(v.price_override) : null,
        stock: v.id ? undefined : toInt(v.stock, 0), low_stock_threshold: toInt(v.low_stock_threshold, 3), is_active: v.is_active,
      })),
    };

    const { data, error: err } = await createClient().rpc("admin_save_product", { p_id: productId ?? null, p_data: payload });
    setBusy(false);
    if (err) { setError(err.message); return; }
    const r = data as { ok: boolean; id: string } | null;
    if (!r?.ok) { setError("Não foi possível salvar o produto."); return; }
    router.push(`/admin/estoque/${r.id}?${mode === "create" ? "novo=1" : "salvo=1"}`);
    router.refresh();
  }

  return (
    <>
    <form onSubmit={submit} className="space-y-6">
      <section className="adm-card space-y-4 p-4 sm:p-5">
        <h2 className="text-base font-bold text-ink">Informações</h2>
        <label className={lbl}>Nome do produto
          <input value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={120} required className="adm-input mt-1.5" />
        </label>
        <label className={lbl}>Descrição <span className="font-normal text-muted">(opcional)</span>
          <textarea value={f.description} onChange={(e) => set("description", e.target.value)} rows={3} maxLength={3000} className="adm-input mt-1.5 min-h-24 py-2.5" />
        </label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className={lbl}>Categoria
            <select value={f.category_id} onChange={(e) => set("category_id", e.target.value)} className="adm-input mt-1.5">
              <option value="">Sem categoria</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className={lbl}>Preço (R$)
            <input inputMode="decimal" value={f.price} onChange={(e) => set("price", e.target.value)} placeholder="0,00" required className="adm-input mt-1.5" />
          </label>
          <label className={lbl}>Preço promocional <span className="font-normal text-muted">(opcional)</span>
            <input inputMode="decimal" value={f.promo_price} onChange={(e) => set("promo_price", e.target.value)} placeholder="0,00" className="adm-input mt-1.5" />
          </label>
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium text-ink">
          <input type="checkbox" checked={f.is_featured} onChange={(e) => set("is_featured", e.target.checked)} className="size-5 accent-[var(--accent)]" />
          Mostrar em “Em destaque” na página inicial
        </label>
      </section>

      <section className="adm-card space-y-4 p-4 sm:p-5">
        <h2 className="text-base font-bold text-ink">Situação no site</h2>
        <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Situação do produto">
          {STATUSES.map((s) => (
            <label key={s} className={`adm-card cursor-pointer p-3.5 transition ${f.status === s ? "border-accent ring-2 ring-accent/30" : ""}`}>
              <input type="radio" name="status" value={s} checked={f.status === s} onChange={() => set("status", s)} className="sr-only" />
              <span className="block text-sm font-bold text-ink">{STATUS_LABEL[s]}</span>
              <span className="mt-0.5 block text-xs text-muted">{STATUS_HELP[s]}</span>
            </label>
          ))}
        </div>
        <label className={lbl}>Selo
          <select value={f.badge_override} onChange={(e) => set("badge_override", e.target.value)} className="adm-input mt-1.5">
            {BADGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <span className="mt-1 block text-xs font-normal text-muted">Escolher um selo aqui é uma decisão sua: as regras automáticas não mudam esse produto. “Automático” usa as regras de Novidade e Mais vendido.</span>
        </label>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-ink">Variações e estoque</h2>
            <p className="text-sm text-muted">Cada combinação de tamanho e cor tem o seu próprio estoque.</p>
          </div>
          <button type="button" onClick={() => set("variants", [...f.variants, blankVariant()])} className="adm-btn"><Plus size={16} /> Adicionar variação</button>
        </div>

        <div className="adm-card space-y-3 border-dashed p-4">
          <p className="text-sm font-semibold text-ink">Gerar grade de tamanhos</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input value={gridColor} onChange={(e) => setGridColor(e.target.value)} placeholder="Cor da grade (ex.: Preto)" maxLength={30} className="adm-input sm:max-w-56" aria-label="Cor da grade" />
            <div className="flex flex-wrap gap-2">
              {GRIDS.map((g) => <button key={g.label} type="button" onClick={() => addGrid(g.sizes)} className="adm-chip">{g.label}</button>)}
            </div>
          </div>
        </div>

        <ul className="space-y-3">
          {f.variants.map((v, i) => {
            const label = `${f.name.trim() || "Produto"} — ${v.size || "?"} / ${v.color || "?"}`;
            const current = v.id ? stockById[v.id] ?? 0 : null;
            return (
              <li key={v.key} className="adm-card space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-ink">Variação {i + 1}</p>
                  {!v.id && (
                    <button type="button" aria-label={`Remover variação ${i + 1}`} onClick={() => removeVariant(v.key)} className="adm-btn adm-btn-danger size-10 min-h-0 p-0"><Trash2 size={16} /></button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <label className={sub}>Tamanho<input value={v.size} onChange={(e) => setVariant(v.key, { size: e.target.value })} maxLength={20} className="adm-input mt-1" /></label>
                  <label className={sub}>Cor<input value={v.color} onChange={(e) => setVariant(v.key, { color: e.target.value })} maxLength={30} className="adm-input mt-1" /></label>
                  <div className={sub}>Amostra de cor
                    <div className="mt-1 flex items-center gap-2">
                      <input type="color" value={v.color_hex || "#999999"} onChange={(e) => setVariant(v.key, { color_hex: e.target.value })} aria-label="Amostra de cor"
                        className="h-11 w-14 cursor-pointer rounded-lg border border-line bg-surface-2 p-1" />
                      {v.color_hex && <button type="button" onClick={() => setVariant(v.key, { color_hex: "" })} className="text-xs font-semibold text-muted underline">Limpar</button>}
                    </div>
                  </div>
                  <label className={sub}>SKU <span className="font-normal">(opcional)</span><input value={v.sku} onChange={(e) => setVariant(v.key, { sku: e.target.value })} maxLength={40} className="adm-input mt-1" /></label>
                </div>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <label className={sub}>Preço próprio <span className="font-normal">(opcional)</span><input inputMode="decimal" value={v.price_override} onChange={(e) => setVariant(v.key, { price_override: e.target.value })} placeholder="usa o do produto" className="adm-input mt-1" /></label>
                  <label className={sub}>Avisar estoque baixo em<input type="number" inputMode="numeric" min={0} value={v.low_stock_threshold} onChange={(e) => setVariant(v.key, { low_stock_threshold: e.target.value })} className="adm-input mt-1" /></label>
                  {current !== null ? (
                    <div className="col-span-2 flex items-end justify-between gap-3 rounded-xl bg-surface-2 p-3">
                      <div>
                        <p className="text-xs font-medium text-muted">Estoque atual</p>
                        <p className="text-2xl font-black text-ink">{current}</p>
                      </div>
                      <button type="button" onClick={() => setAdjust({ id: v.id!, label, current })} className="adm-btn adm-btn-primary">Ajustar</button>
                    </div>
                  ) : (
                    <label className={`${sub} col-span-2`}>Estoque inicial
                      <input type="number" inputMode="numeric" min={0} value={v.stock} onChange={(e) => setVariant(v.key, { stock: e.target.value })} className="adm-input mt-1" />
                    </label>
                  )}
                </div>
                <label className="flex min-h-10 cursor-pointer items-center gap-3 text-sm font-medium text-ink">
                  <input type="checkbox" checked={v.is_active} onChange={(e) => setVariant(v.key, { is_active: e.target.checked })} className="size-5 accent-[var(--accent)]" />
                  Variação ativa (aparece no site)
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="adm-card sticky bottom-20 z-30 flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between lg:bottom-4">
        {error ? <p role="alert" className="text-sm font-semibold text-bad">{error}</p> : <p className="text-xs text-muted">{mode === "create" ? "As fotos são enviadas logo depois de salvar." : "Alterações de estoque são feitas pelo botão Ajustar."}</p>}
        <button type="submit" disabled={busy} className="adm-btn adm-btn-primary w-full sm:w-auto">{busy ? "Salvando..." : mode === "create" ? "Cadastrar produto" : "Salvar alterações"}</button>
      </div>
    </form>

    {/* Fora do <form>: evita formulário dentro de formulário (o "Salvar" do ajuste não pode salvar o produto) */}
    {adjust && <StockAdjustDialog variantId={adjust.id} label={adjust.label} current={adjust.current} onClose={() => setAdjust(null)} />}
    </>
  );
}
