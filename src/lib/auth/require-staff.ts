import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type StaffProfile = { id: string; full_name: string; role: "admin" | "manager" | "staff"; store_id: string };

export type StaffStatus =
  | { state: "anonymous" }
  | { state: "no-profile"; user: User }
  | { state: "inactive"; user: User }
  | { state: "store-suspended"; user: User }
  | { state: "error"; user: User; message: string }
  | { state: "ok"; user: User; profile: StaffProfile };

/** Descobre, no servidor, se o usuário logado é da equipe. Nunca confia só no middleware. */
export async function getStaffStatus(): Promise<StaffStatus> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { state: "anonymous" };

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active, store_id, stores(is_active)")
    .eq("id", user.id)
    .maybeSingle();

  if (error) return { state: "error", user, message: `${error.code ?? ""} ${error.message}`.trim() };
  if (!profile) return { state: "no-profile", user };
  if (!profile.is_active) return { state: "inactive", user };
  // A loja do usuário foi suspensa pela plataforma: o painel fica bloqueado (os dados continuam guardados)
  const store = (profile as unknown as { stores: { is_active: boolean } | null }).stores;
  if (store && store.is_active === false) return { state: "store-suspended", user };
  return { state: "ok", user, profile: { id: profile.id, full_name: profile.full_name, role: profile.role, store_id: profile.store_id } as StaffProfile };
}

export async function requireStaff(): Promise<StaffProfile> {
  const status = await getStaffStatus();
  if (status.state === "anonymous") redirect("/admin/login");
  if (status.state !== "ok") redirect("/admin/acesso-negado");
  return status.profile;
}