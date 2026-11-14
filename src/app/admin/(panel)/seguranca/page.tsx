import { requireStaff } from "@/lib/auth/require-staff";
import { createClient } from "@/lib/supabase/server";
import { PinForm } from "@/components/admin/pin-form";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const profile = await requireStaff();
  const supabase = await createClient();
  const { data } = await supabase.rpc("pin_status");
  const status = data as { is_set?: boolean; updated_at?: string | null } | null;
  const isSet = Boolean(status?.is_set);

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-black tracking-tight">Segurança</h1>
      <p className="mt-1 text-sm text-neutral-500">
        O código de 4 dígitos autoriza alterações em pedidos e a confirmação de pedidos editados. Ele é guardado criptografado e conferido pelo banco de dados.
        Após 5 erros seguidos, fica bloqueado por 15 minutos.
      </p>
      <p className="mt-4 text-sm">
        Situação: <strong>{isSet ? "código definido" : "código ainda não definido"}</strong>
        {status?.updated_at && <span className="text-neutral-500"> · atualizado em {new Date(status.updated_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>}
      </p>
      <div className="mt-6">
        {profile.role === "admin"
          ? <PinForm isSet={isSet} />
          : <p className="rounded-lg bg-neutral-100 p-4 text-sm dark:bg-neutral-900">Apenas administradores podem {isSet ? "alterar" : "definir"} o código.</p>}
      </div>
    </div>
  );
}
