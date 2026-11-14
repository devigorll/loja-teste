import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { normalizeWhatsApp } from "@/lib/whatsapp";
import { fmtDateTime } from "@/lib/dates";
import { OrderEditor, type CatalogVariant, type EditorLine } from "@/components/admin/order-editor";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; cls: string }> = {
  awaiting_confirmation: { label: "Possível venda", cls: "bg-warn/15 text-warn" },
  in_progress: { label: "Em atendimento", cls: "bg-warn/15 text-warn" },
  confirmed: { label: "Venda confirmada", cls: "bg-good/15 text-good" },
  completed: { label: "Venda confirmada", cls: "bg-good/15 text-good" },
  cancelled: { label: "Cancelado", cls: "bg-bad/15 text-bad" },
};

type Item = { id: string; variant_id: string | null; product_name: string; size: string; color: string; unit_price: number; quantity: number };
type VarRow = {
  id: string; size: string; color: string; stock: number; price_override: number | null; is_active: boolean;
  products: { name: string; price: number; promo_price: number | null; is_active: boolean } | null;
};

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: order } = await supabase.from("orders").select("*, order_items(*)").eq("id", id).maybeSingle();
  if (!order) notFound();

  const editable = order.status === "awaiting_confirmation" || order.status === "in_progress";
  const items = [...(order.order_items as Item[])].sort((a, b) => a.product_name.localeCompare(b.product_name));
  const initial: EditorLine[] = items.map((i) => ({
    key: i.id, item_id: i.id, variant_id: i.variant_id, name: i.product_name, size: i.size, color: i.color,
    quantity: i.quantity, price: Number(i.unit_price).toFixed(2),
  }));

  let catalog: CatalogVariant[] = [];
  const stock: Record<string, number> = {};
  let methods: { id: string; name: string }[] = [];
  let pinSet = true;

  if (editable) {
    const [{ data: vars }, { data: pms }, { data: pin }] = await Promise.all([
      supabase.from("product_variants").select("id, size, color, stock, price_override, is_active, products(name, price, promo_price, is_active)"),
      supabase.from("payment_methods").select("id, name").eq("is_active", true).order("position"),
      supabase.rpc("pin_status"),
    ]);
    const rows = (vars ?? []) as unknown as VarRow[];
    rows.forEach((r) => { stock[r.id] = r.stock; });
    catalog = rows
      .filter((r) => r.is_active && r.products?.is_active)
      .map((r) => ({
        id: r.id,
        label: `${r.products!.name} — ${r.size} / ${r.color}`,
        price: r.price_override ?? r.products!.promo_price ?? r.products!.price,
        stock: r.stock,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    methods = pms ?? [];
    pinSet = Boolean((pin as { is_set?: boolean } | null)?.is_set);
  }

  const wa = normalizeWhatsApp(order.customer_phone);
  const st = STATUS[order.status] ?? { label: order.status, cls: "bg-surface-2 text-ink" };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href="/admin/possiveis-vendas" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-muted transition hover:text-ink"><ChevronLeft size={18} /> Voltar</Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">{order.code}</h1>
        <span className={`adm-badge ${st.cls}`}>{st.label}</span>
        {order.was_edited && <span className="adm-badge bg-surface-2 text-muted">Editado pelo painel</span>}
      </div>

      {editable && !pinSet && (
        <p className="rounded-xl bg-warn/15 p-3 text-sm font-medium text-warn">
          O código de autorização ainda não foi definido. <Link href="/admin/seguranca" className="underline">Defina em Segurança</Link> para poder editar pedidos.
        </p>
      )}

      <dl className="adm-card grid gap-4 p-5 sm:grid-cols-3">
        <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted">Cliente</dt><dd className="mt-0.5 font-semibold text-ink">{order.customer_name}</dd></div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Telefone</dt>
          <dd className="mt-0.5 font-semibold text-ink">
            {order.customer_phone ? (wa ? <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-4">{order.customer_phone}</a> : order.customer_phone) : "Não informado"}
          </dd>
        </div>
        <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted">Data</dt><dd className="mt-0.5 font-semibold text-ink">{fmtDateTime(order.created_at)}</dd></div>
        {order.notes && <div className="sm:col-span-3"><dt className="text-xs font-semibold uppercase tracking-wide text-muted">Observações</dt><dd className="mt-0.5 text-ink">{order.notes}</dd></div>}
      </dl>

      <OrderEditor
        key={order.updated_at}
        orderId={order.id} wasEdited={Boolean(order.was_edited)} readOnly={!editable}
        initial={initial} catalog={catalog} stock={stock} methods={methods}
      />
    </div>
  );
}
