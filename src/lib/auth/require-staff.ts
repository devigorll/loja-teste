import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type StaffProfile = { id: string; full_name: string; role: "admin" | "manager" | "staff" };

/** Garante NO SERVIDOR que o usuário existe em `profiles` e está ativo. */
export async function requireStaff(): Promise<StaffProfile> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const { data: profile } = await supabase
    .from("profiles").select("id, full_name, role, is_active").eq("id", user.id).single();

  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    redirect("/admin/login?error=unauthorized");
  }
  return profile as StaffProfile;
}
