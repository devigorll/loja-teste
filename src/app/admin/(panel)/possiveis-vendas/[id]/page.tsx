import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normalizeWhatsApp } from "@/lib/whatsapp";
import { OrderEditor, type CatalogVariant, type EditorLine } from "@/components/admin/order-editor";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; cls: string }> = {
  awaiting_confirmation: { label: "Possível venda", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  in_progress: { label: "Em atendimento", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  confirmed: { label: "Venda confirmada", cls: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" },
  completed: { label: "Venda confirmada", cls: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" },
  cancelled: { label: "Cancelado", cls: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" },
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
  const st = STATUS[order.status] ?? { label: order.status, cls: "bg-neutral-100 text-neutral-800" };

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/admin/possiveis-vendas" className="text-sm text-neutral-500 underline underline-offset-4">← Voltar</Link>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-black tracking-tight">{order.code}</h1>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${st.cls}`}>{st.label}</span>
        {order.was_edited && <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium dark:bg-neutral-800">Editado pelo painel</span>}
      </div>

      {editable && !pinSet && (
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          O código de autorização ainda não foi definido. <Link href="/admin/seguranca" className="font-medium underline">Defina em Segurança</Link> para poder editar pedidos.
        </p>
      )}

      <dl className="mt-6 grid gap-4 rounded-xl border border-neutral-200 p-5 sm:grid-cols-3 dark:border-neutral-800">
        <div><dt className="text-xs text-neutral-500">Cliente</dt><dd className="font-medium">{order.customer_name}</dd></div>
        <div>
          <dt className="text-xs text-neutral-500">Telefone</dt>
          <dd className="font-medium">
            {order.customer_phone ? (wa ? <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{order.customer_phone}</a> : order.customer_phone) : "Não informado"}
          </dd>
        </div>
        <div><dt className="text-xs text-neutral-500">Data</dt><dd className="font-medium">{new Date(order.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</dd></div>
        {order.notes && <div className="sm:col-span-3"><dt className="text-xs text-neutral-500">Observações</dt><dd>{order.notes}</dd></div>}
      </dl>

      <OrderEditor
        key={order.updated_at}
        orderId={order.id} wasEdited={Boolean(order.was_edited)} readOnly={!editable}
        initial={initial} catalog={catalog} stock={stock} methods={methods}
      />
    </div>
  );
}
