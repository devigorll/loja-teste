"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton({ variant = "default", className = "" }: { variant?: "default" | "side"; className?: string }) {
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setLoading(true);
    await createClient().auth.signOut();
    window.location.assign("/admin/login");
  }

  const base = variant === "side"
    ? "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-side-ink transition hover:bg-white/5 hover:text-white active:scale-[0.98] disabled:opacity-60"
    : "adm-btn";

  return (
    <button type="button" onClick={handleSignOut} disabled={loading} className={`${base} ${className}`}>
      <LogOut size={18} /> {loading ? "Saindo..." : "Sair"}
    </button>
  );
}
