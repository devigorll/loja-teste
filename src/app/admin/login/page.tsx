"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

function translate(message: string) {
  if (/invalid login credentials/i.test(message)) return "E-mail ou senha inválidos.";
  if (/email not confirmed/i.test(message)) return "E-mail não confirmado. No Supabase, confirme o usuário (Auto Confirm).";
  return `Não foi possível entrar: ${message}`;
}

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        setError(translate(error.message));
        setLoading(false);
        return;
      }
      // Navegação completa: garante que o servidor receba o cookie de sessão recém-criado.
      window.location.assign("/admin");
    } catch {
      setError("Falha de conexão. Verifique sua internet e tente novamente.");
      setLoading(false);
    }
  }

  const input = "w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2.5 outline-none transition focus:ring-2 focus:ring-neutral-900 dark:border-neutral-700 dark:focus:ring-white";
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-5 rounded-2xl border border-neutral-200 p-8 dark:border-neutral-800">
        <h1 className="text-2xl font-semibold tracking-tight">Acesso administrativo</h1>
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium">E-mail</label>
          <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm font-medium">Senha</label>
          <input id="password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
        </div>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
        <button type="submit" disabled={loading} className="w-full rounded-full bg-neutral-900 py-3 font-medium text-white transition active:scale-[0.98] disabled:opacity-60 dark:bg-white dark:text-neutral-900">
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}