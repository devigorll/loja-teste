import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadCatalog } from "@/lib/admin/catalog";
import { PageHeader } from "@/components/admin/page-header";
import { NewOrderForm } from "@/components/admin/new-order-form";

export const dynamic = "force-dynamic";

export default async function NewOrderPage() {
  const supabase = await createClient();
  const [{ catalog, stock }, { data: pin }] = await Promise.all([loadCatalog(supabase), supabase.rpc("pin_status")]);
  const pinSet = Boolean((pin as { is_set?: boolean } | null)?.is_set);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/admin/possiveis-vendas" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-muted transition hover:text-ink"><ChevronLeft size={18} /> Voltar</Link>
      <PageHeader title="Novo pedido" subtitle="Registre um pedido manualmente. Ele entra em Possíveis vendas, como os pedidos feitos pelo site." />
      <NewOrderForm catalog={catalog} stock={stock} pinSet={pinSet} />
    </div>
  );
}
