import { redirect } from "next/navigation";
import { getStaffStatus } from "@/lib/auth/require-staff";
import { SignOutButton } from "@/components/admin/sign-out-button";

export const dynamic = "force-dynamic";

export default async function AccessDeniedPage() {
  const status = await getStaffStatus();
  if (status.state === "anonymous") redirect("/admin/login");
  if (status.state === "ok") redirect("/admin");

  const reasons = {
    "no-profile": "Seu login existe, mas ele ainda não foi cadastrado como membro da equipe (falta a linha em “profiles”).",
    inactive: "Seu usuário está desativado. Peça a um administrador para reativá-lo.",
    error: "Não foi possível verificar suas permissões por um erro no banco de dados.",
  } as const;

  return (
    <main className="adm-bg flex min-h-dvh items-center justify-center p-4">
      <div className="adm-card w-full max-w-md space-y-4 p-6 sm:p-8">
        <h1 className="text-2xl font-black tracking-tight text-ink">Acesso negado</h1>
        <p className="text-muted">{reasons[status.state]}</p>
        <p className="text-sm text-muted">Conta: <strong className="text-ink">{status.user.email}</strong></p>
        {status.state === "error" && (
          <pre className="overflow-x-auto rounded-xl bg-surface-2 p-3 text-xs text-ink">{status.message}</pre>
        )}
        <SignOutButton className="w-full" />
      </div>
    </main>
  );
}
