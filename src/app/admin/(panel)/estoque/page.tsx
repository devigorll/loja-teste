import Link from "next/link";
import Image from "next/image";
import { ImageOff, Plus } from "lucide-react";
import { requireStaff } from "@/lib/auth/require-staff";
import { createClient } from "@/lib/supabase/server";
import { formatBRL } from "@/lib/format";
import { PageHeader } from "@/components/admin/page-header";
import { ProductActions } from "@/components/admin/product-actions";
import { BadgeRulesForm, type BadgeRules } from "@/components/admin/badge-rules-form";
import { CollapsibleSection } from "@/components/admin/collapsible-section";
import { BADGE_LABEL, PRODUCT_SELECT, STATUS_LABEL, statusOf, stockInfo, type AdminProduct } from "@/lib/admin/products";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;
const TABS = [
  { id: "todos", label: "Todos" },
  { id: "disponiveis", label: "Disponíveis" },
  { id: "indisponiveis", label: "Indisponíveis" },
  { id: "arquivados", label: "Arquivados" },
] as const;

export default async function StockPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const profile = await requireStaff();
  const isAdmin = profile.role === "admin";
  const supabase = await createClient();

  const [{ data, error }, { data: cats }, badgesRes, { data: cfg }] = await Promise.all([
    supabase.from("products").select(PRODUCT_SELECT).order("created_at", { ascending: false }),
    supabase.from("categories").select("id, name").order("position"),
    supabase.rpc("get_product_badges", { p_store_id: profile.store_id }),
    supabase.from("store_settings").select("new_badge_days, bestseller_top_n, bestseller_min_units, bestseller_window_days").eq("store_id", profile.store_id).maybeSingle(),
  ]);

  const all = (data ?? []) as unknown as AdminProduct[];
  const badgeMap = new Map<string, string>();
  ((badgesRes.data ?? []) as { product_id: string; badge: string | null }[]).forEach((b) => { if (b.badge) badgeMap.set(b.product_id, b.badge); });

  const aba = TABS.some((t) => t.id === sp.aba) ? (sp.aba as (typeof TABS)[number]["id"]) : "todos";
  const nivel = sp.nivel === "baixo" || sp.nivel === "zerado" ? sp.nivel : "";
  const cat = sp.cat ?? "";
  const q = (sp.q ?? "").trim().toLowerCase();

  const counts = {
    todos: all.filter((p) => !p.is_archived).length,
    disponiveis: all.filter((p) => statusOf(p) === "active").length,
    indisponiveis: all.filter((p) => statusOf(p) === "unavailable").length,
    arquivados: all.filter((p) => p.is_archived).length,
  };
  const active = all.filter((p) => statusOf(p) === "active");
  const lowCount = active.filter((p) => stockInfo(p).low).length;
  const outCount = active.filter((p) => stockInfo(p).out).length;

  const list = all.filter((p) => {
    const st = statusOf(p);
    if (aba === "todos" && st === "archived") return false;
    if (aba === "disponiveis" && st !== "active") return false;
    if (aba === "indisponiveis" && st !== "unavailable") return false;
    if (aba === "arquivados" && st !== "archived") return false;
    if (cat && p.category_id !== cat) return false;
    if (q && !p.name.toLowerCase().includes(q)) return false;
    const info = stockInfo(p);
    if (nivel === "zerado" && !info.out) return false;
    if (nivel === "baixo" && !(info.low || info.out)) return false;
    return true;
  });

  const href = (o: Record<string, string>) => {
    const p = new URLSearchParams();
    const base: Record<string, string> = { aba, nivel, cat, q: sp.q ?? "", ...o };
    Object.entries(base).forEach(([k, v]) => { if (v && !(k === "aba" && v === "todos")) p.set(k, v); });
    const s = p.toString();
    return s ? `/admin/estoque?${s}` : "/admin/estoque";
  };

  const rules: BadgeRules = {
    new_badge_days: cfg?.new_badge_days ?? 14, bestseller_top_n: cfg?.bestseller_top_n ?? 3,
    bestseller_min_units: cfg?.bestseller_min_units ?? 3, bestseller_window_days: cfg?.bestseller_window_days ?? 30,
  };

  const stat = "adm-card p-4";
  const statLbl = "text-xs font-bold uppercase tracking-wide text-muted";

  return (
    <div className="space-y-6">
      <PageHeader title="Controle de estoque" subtitle="Cadastre produtos, ajuste o estoque, troque fotos e controle o que aparece no site."
        actions={<Link href="/admin/estoque/novo" className="adm-btn adm-btn-primary"><Plus size={18} /> Novo produto</Link>} />

      {error && <p role="alert" className="rounded-xl bg-bad/15 p-4 text-sm font-medium text-bad">Erro ao carregar os produtos: {error.message}. Se a mensagem citar “is_archived”, rode o SQL 0008 no Supabase.</p>}

      <section aria-label="Resumo" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link href={href({ aba: "disponiveis", nivel: "" })} className={`${stat} transition active:scale-[0.98]`}><p className={statLbl}>Disponíveis</p><p className="mt-2 text-3xl font-black text-ink">{counts.disponiveis}</p></Link>
        <Link href={href({ aba: "todos", nivel: "baixo" })} className={`${stat} transition active:scale-[0.98]`}><p className={statLbl}>Estoque baixo</p><p className="mt-2 text-3xl font-black text-ink">{lowCount}</p></Link>
        <Link href={href({ aba: "todos", nivel: "zerado" })} className={`${stat} transition active:scale-[0.98]`}><p className={statLbl}>Esgotados</p><p className="mt-2 text-3xl font-black text-ink">{outCount}</p></Link>
        <Link href={href({ aba: "arquivados", nivel: "" })} className={`${stat} transition active:scale-[0.98]`}><p className={statLbl}>Arquivados</p><p className="mt-2 text-3xl font-black text-ink">{counts.arquivados}</p></Link>
      </section>

      <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0" aria-label="Filtrar por situação">
        {TABS.map((t) => (
          <Link key={t.id} href={href({ aba: t.id })} aria-current={aba === t.id ? "true" : undefined} className="adm-chip">{t.label} <span className="ml-1.5 opacity-70">{counts[t.id]}</span></Link>
        ))}
      </nav>

      <form method="get" className="adm-card grid grid-cols-2 gap-3 p-4 lg:grid-cols-5">
        {aba !== "todos" && <input type="hidden" name="aba" value={aba} />}
        <label className="col-span-2 text-xs font-medium text-muted lg:col-span-2">Buscar produto<input name="q" defaultValue={sp.q ?? ""} placeholder="Nome do produto" className="adm-input mt-1" /></label>
        <label className="text-xs font-medium text-muted">Categoria
          <select name="cat" defaultValue={cat} className="adm-input mt-1"><option value="">Todas</option>{(cats ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </label>
        <label className="text-xs font-medium text-muted">Estoque
          <select name="nivel" defaultValue={nivel} className="adm-input mt-1"><option value="">Todos</option><option value="baixo">Baixo ou zerado</option><option value="zerado">Zerado</option></select>
        </label>
        <div className="col-span-2 flex items-end gap-2 lg:col-span-1">
          <button className="adm-btn adm-btn-primary flex-1">Filtrar</button>
          <Link href="/admin/estoque" className="adm-btn">Limpar</Link>
        </div>
      </form>

      <CollapsibleSection variant="list" defaultOpen title={<>Produtos cadastrados <span className="ml-1.5 font-normal text-muted" aria-live="polite">({list.length})</span></>}>
        {!error && list.length === 0 ? (
          <div className="adm-card space-y-4 border-dashed p-10 text-center">
            <p className="text-muted">Nenhum produto neste filtro.</p>
            <Link href="/admin/estoque/novo" className="adm-btn adm-btn-primary">Cadastrar produto</Link>
          </div>
        ) : (
          <ul className="grid gap-4 xl:grid-cols-2">
            {list.map((p) => {
              const st = statusOf(p);
              const info = stockInfo(p);
              const img = [...p.product_images].sort((a, b) => a.position - b.position)[0]?.url;
              const manual = p.badge_override !== null;
              const eff = p.badge_override === "none" ? null : p.badge_override ?? (st === "active" ? badgeMap.get(p.id) ?? null : null);
              return (
                <li key={p.id} className={`adm-card overflow-hidden ${st === "archived" ? "opacity-80" : ""}`}>
                  <div className="flex gap-4 p-4">
                    <Link href={`/admin/estoque/${p.id}`} className="relative h-28 w-24 shrink-0 overflow-hidden rounded-xl bg-surface-2" aria-label={`Editar ${p.name}`}>
                      {img ? <Image src={img} alt={p.name} fill unoptimized sizes="96px" className="object-cover" /> : <span className="grid h-full place-items-center text-muted"><ImageOff size={24} /></span>}
                    </Link>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div>
                        <Link href={`/admin/estoque/${p.id}`} className="block truncate font-bold text-ink hover:underline">{p.name}</Link>
                        <p className="text-xs text-muted">{p.categories?.name ?? "Sem categoria"} · {formatBRL(Number(p.promo_price ?? p.price))}{p.promo_price ? " (promo)" : ""}</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <span className={`adm-badge ${st === "active" ? "bg-ink text-surface" : "bg-surface-2 text-muted"}`}>{STATUS_LABEL[st]}</span>
                        {info.out && st !== "archived" && <span className="adm-badge bg-bad/15 text-bad">Esgotado</span>}
                        {info.low && <span className="adm-badge bg-warn/15 text-warn">Estoque baixo</span>}
                        {p.badge_override === "none" ? <span className="adm-badge bg-surface-2 text-muted">Sem selo (manual)</span>
                          : eff && <span className="adm-badge border border-line text-ink">{BADGE_LABEL[eff as "new" | "bestseller"]} · {manual ? "manual" : "auto"}</span>}
                      </div>
                      <p className="text-sm text-ink">Estoque total: <strong>{info.total}</strong></p>
                      <ul className="flex flex-wrap gap-1.5" aria-label="Estoque por variação">
                        {p.product_variants.slice(0, 8).map((v) => (
                          <li key={v.id} className={`rounded-lg border border-line px-2 py-0.5 text-xs ${v.is_active ? "text-ink" : "text-muted line-through"} ${v.stock === 0 ? "bg-surface-2 text-muted" : ""}`}>
                            {v.size} · {v.color}: <strong>{v.stock}</strong>
                          </li>
                        ))}
                        {p.product_variants.length > 8 && <li className="px-1 text-xs text-muted">+{p.product_variants.length - 8}</li>}
                      </ul>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 border-t border-line bg-surface-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <Link href={`/admin/estoque/${p.id}`} className="adm-btn adm-btn-primary">Editar e ajustar estoque</Link>
                    <ProductActions product={{ id: p.id, name: p.name, status: st }} isAdmin={isAdmin} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Regras dos selos automáticos">
        <p className="mb-4 mt-2 text-sm text-muted">“Novidade” vale por alguns dias após o cadastro. “Mais vendido” vai para os produtos de maior volume de vendas confirmadas. Um selo escolhido manualmente em um produto sempre vence estas regras.</p>
        <BadgeRulesForm initial={rules} canEdit={isAdmin} storeId={profile.store_id} />
      </CollapsibleSection>
    </div>
  );
}