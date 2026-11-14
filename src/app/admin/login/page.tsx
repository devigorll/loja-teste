"use client";

import { useState } from "react";
import { Store } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AdminThemeToggle } from "@/components/admin/admin-theme-toggle";

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

  return (
    <main className="adm-bg flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4">
        <form onSubmit={handleSubmit} className="adm-card space-y-5 p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-accent text-accent-ink"><Store size={22} /></span>
            <div>
              <h1 className="text-xl font-black tracking-tight text-ink">Acesso administrativo</h1>
              <p className="text-sm text-muted">Entre para gerenciar a loja</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium text-ink">E-mail</label>
            <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="adm-input" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium text-ink">Senha</label>
            <input id="password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="adm-input" />
          </div>
          {error && <p role="alert" className="rounded-xl bg-bad/15 p-3 text-sm font-medium text-bad">{error}</p>}
          <button type="submit" disabled={loading} className="adm-btn adm-btn-primary w-full">{loading ? "Entrando..." : "Entrar"}</button>
        </form>
        <div className="mx-auto w-fit rounded-full bg-side"><AdminThemeToggle variant="icon" /></div>
      </div>
    </main>
  );
}
