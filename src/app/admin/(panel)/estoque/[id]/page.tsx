import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { requireStaff } from "@/lib/auth/require-staff";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/dates";
import { PageHeader } from "@/components/admin/page-header";
import { ProductActions } from "@/components/admin/product-actions";
import { ProductImages } from "@/components/admin/product-images";
import { ProductForm } from "@/components/admin/product-form";
import { MOVEMENT_LABEL, PRODUCT_SELECT, STATUS_LABEL, statusOf, type AdminProduct, type ProductDraft } from "@/lib/admin/products";

export const dynamic = "force-dynamic";

type Movement = {
  id: string; type: string; quantity_before: number; quantity_change: number; quantity_after: number;
  reason: string | null; created_at: string; product_variants: { size: string; color: string } | null;
};

export default async function EditProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const profile = await requireStaff();
  const supabase = await createClient();
  const [{ data }, { data: cats }, { data: moves }] = await Promise.all([
    supabase.from("products").select(`${PRODUCT_SELECT},updated_at`).eq("id", id).maybeSingle(),
    supabase.from("categories").select("id, name").order("position"),
    supabase.from("stock_movements")
      .select("id, type, quantity_before, quantity_change, quantity_after, reason, created_at, product_variants(size, color)")
      .eq("product_id", id).order("created_at", { ascending: false }).limit(30),
  ]);
  const p = data as unknown as (AdminProduct & { updated_at: string }) | null;
  if (!p) notFound();

  const st = statusOf(p);
  const variants = [...p.product_variants].sort((a, b) => a.color.localeCompare(b.color) || a.size.localeCompare(b.size, "pt-BR", { numeric: true }));
  const stockById: Record<string, number> = {};
  variants.forEach((v) => { stockById[v.id] = v.stock; });

  const initial: ProductDraft = {
    name: p.name, description: p.description ?? "", category_id: p.category_id ?? "",
    price: Number(p.price).toFixed(2), promo_price: p.promo_price ? Number(p.promo_price).toFixed(2) : "",
    is_featured: p.is_featured, status: st, badge_override: p.badge_override ?? "",
    variants: variants.map((v) => ({
      key: v.id, id: v.id, size: v.size, color: v.color, color_hex: v.color_hex ?? "", sku: v.sku ?? "",
      price_override: v.price_override !== null ? Number(v.price_override).toFixed(2) : "",
      stock: String(v.stock), low_stock_threshold: String(v.low_stock_threshold), is_active: v.is_active,
    })),
  };

  const movements = (moves ?? []) as unknown as Movement[];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/admin/estoque" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-muted transition hover:text-ink"><ChevronLeft size={18} /> Controle de estoque</Link>

      <PageHeader title={p.name} subtitle={<span className="flex flex-wrap items-center gap-2"><span className={`adm-badge ${st === "active" ? "bg-ink text-surface" : "bg-surface-2 text-muted"}`}>{STATUS_LABEL[st]}</span>{st === "active" && <a href={`/produto/${p.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-ink underline underline-offset-4">Ver no site <ExternalLink size={14} /></a>}</span>} />

      {sp.novo && <p role="status" className="rounded-xl bg-good/15 p-4 text-sm font-semibold text-good">Produto cadastrado! Agora <a href="#fotos" className="underline">adicione as fotos</a>.</p>}
      {sp.salvo && <p role="status" className="rounded-xl bg-good/15 p-4 text-sm font-semibold text-good">Alterações salvas. O site já foi atualizado.</p>}

      <ProductForm key={p.updated_at} mode="edit" productId={p.id} categories={cats ?? []} initial={initial} stockById={stockById} />

      <section id="fotos" className="adm-card scroll-mt-20 space-y-4 p-4 sm:p-5">
        <div>
          <h2 className="text-base font-bold text-ink">Fotos</h2>
          <p className="text-sm text-muted">A primeira foto é a principal (aparece no catálogo). Use “Trocar” para substituir uma foto por outra.</p>
        </div>
        <ProductImages productId={p.id} productName={p.name} images={p.product_images} />
      </section>

      <section className="adm-card space-y-4 p-4 sm:p-5">
        <h2 className="text-base font-bold text-ink">Histórico de movimentações</h2>
        {movements.length === 0 ? <p className="text-sm text-muted">Nenhuma movimentação registrada ainda.</p> : (
          <>
            <ul className="space-y-2 md:hidden">
              {movements.map((m) => (
                <li key={m.id} className="rounded-xl border border-line bg-surface-2 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-ink">{MOVEMENT_LABEL[m.type] ?? m.type} · {m.product_variants ? `${m.product_variants.size} / ${m.product_variants.color}` : "—"}</p>
                    <p className="shrink-0 font-black text-ink">{m.quantity_change > 0 ? "+" : ""}{m.quantity_change}</p>
                  </div>
                  <p className="text-xs text-muted">{m.quantity_before} → {m.quantity_after} · {fmtDateTime(m.created_at)}{m.reason ? ` · ${m.reason}` : ""}</p>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-hidden rounded-xl border border-line md:block">
              <table className="adm-table">
                <thead><tr><th>Data</th><th>Variação</th><th>Tipo</th><th className="text-right">Antes</th><th className="text-right">Mov.</th><th className="text-right">Depois</th><th>Motivo</th></tr></thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id}>
                      <td className="whitespace-nowrap">{fmtDateTime(m.created_at)}</td>
                      <td>{m.product_variants ? `${m.product_variants.size} / ${m.product_variants.color}` : "—"}</td>
                      <td>{MOVEMENT_LABEL[m.type] ?? m.type}</td>
                      <td className="text-right">{m.quantity_before}</td>
                      <td className="text-right font-bold">{m.quantity_change > 0 ? "+" : ""}{m.quantity_change}</td>
                      <td className="text-right">{m.quantity_after}</td>
                      <td className="text-muted">{m.reason ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted">Últimas 30 movimentações.</p>
          </>
        )}
      </section>

      <section className="adm-card space-y-3 p-4 sm:p-5">
        <h2 className="text-base font-bold text-ink">Situação do produto</h2>
        <p className="text-sm text-muted">Indisponibilizar tira do site temporariamente. Arquivar tira de circulação e guarda os dados. Excluir remove para sempre.</p>
        <ProductActions product={{ id: p.id, name: p.name, status: st }} isAdmin={profile.role === "admin"} afterDelete="/admin/estoque" full />
      </section>
    </div>
  );
}
