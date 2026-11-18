import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/admin/page-header";
import { ProductForm } from "@/components/admin/product-form";
import { blankVariant, type ProductDraft } from "@/lib/admin/products";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const supabase = await createClient();
  const { data: cats } = await supabase.from("categories").select("id, name").order("position");

  const initial: ProductDraft = {
    name: "", description: "", category_id: "", price: "", promo_price: "", is_featured: false,
    status: "active", badge_override: "", variants: [blankVariant()],
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href="/admin/estoque" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-muted transition hover:text-ink"><ChevronLeft size={18} /> Controle de estoque</Link>
      <PageHeader title="Novo produto" subtitle="Preencha os dados e as variações. As fotos são enviadas logo depois de salvar. O produto recebe o selo “Novidade” automaticamente." />
      <ProductForm mode="create" categories={cats ?? []} initial={initial} stockById={{}} />
    </div>
  );
}
