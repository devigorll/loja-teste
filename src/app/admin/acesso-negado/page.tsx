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
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-neutral-200 p-8 dark:border-neutral-800">
        <h1 className="text-2xl font-semibold tracking-tight">Acesso negado</h1>
        <p className="text-neutral-600 dark:text-neutral-400">{reasons[status.state]}</p>
        <p className="text-sm text-neutral-500">Conta: <strong>{status.user.email}</strong></p>
        {status.state === "error" && (
          <pre className="overflow-x-auto rounded-lg bg-neutral-100 p-3 text-xs dark:bg-neutral-900">{status.message}</pre>
        )}
        <SignOutButton />
      </div>
    </main>
  );
}