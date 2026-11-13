"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton({ className = "" }: { className?: string }) {
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setLoading(true);
    await createClient().auth.signOut();
    window.location.assign("/admin/login");
  }

  return (
    <button type="button" onClick={handleSignOut} disabled={loading}
      className={`rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium transition hover:bg-neutral-100 active:scale-95 disabled:opacity-60 dark:border-neutral-700 dark:hover:bg-neutral-800 ${className}`}>
      {loading ? "Saindo..." : "Sair"}
    </button>
  );
}