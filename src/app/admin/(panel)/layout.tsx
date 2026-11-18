import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth/require-staff";
import { createClient } from "@/lib/supabase/server";
import { AdminShell } from "@/components/admin/admin-shell";
import { NewOrderNotifier } from "@/components/admin/new-order-notifier";

export const metadata: Metadata = { title: "Painel", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireStaff();
  const supabase = await createClient();
  const { data: settings } = await supabase.from("store_settings").select("name").eq("store_id", profile.store_id).maybeSingle();
  const { count } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("status", "awaiting_confirmation");

  return (
    <>
      <NewOrderNotifier />
      <AdminShell name={profile.full_name} role={profile.role} pending={count ?? 0} storeName={settings?.name ?? "Painel"}>
        {children}
      </AdminShell>
    </>
  );
}