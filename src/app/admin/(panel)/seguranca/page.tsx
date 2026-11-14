import { requireStaff } from "@/lib/auth/require-staff";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/dates";
import { PageHeader } from "@/components/admin/page-header";
import { PinForm } from "@/components/admin/pin-form";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const profile = await requireStaff();
  const supabase = await createClient();
  const { data } = await supabase.rpc("pin_status");
  const status = data as { is_set?: boolean; updated_at?: string | null } | null;
  const isSet = Boolean(status?.is_set);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader title="Segurança"
        subtitle="O código de 4 dígitos autoriza alterações em pedidos e a confirmação de pedidos editados. Ele é guardado criptografado e conferido pelo banco de dados. Após 5 erros seguidos, fica bloqueado por 15 minutos." />

      <div className="adm-card flex flex-wrap items-center justify-between gap-2 p-4">
        <span className="text-sm font-semibold text-muted">Situação do código</span>
        <span className={`adm-badge ${isSet ? "bg-good/15 text-good" : "bg-warn/15 text-warn"}`}>{isSet ? "Definido" : "Ainda não definido"}</span>
        {status?.updated_at && <p className="w-full text-xs text-muted">Atualizado em {fmtDateTime(status.updated_at)}</p>}
      </div>

      <div className="adm-card p-5">
        {profile.role === "admin"
          ? <PinForm isSet={isSet} />
          : <p className="text-sm text-muted">Apenas administradores podem {isSet ? "alterar" : "definir"} o código.</p>}
      </div>
    </div>
  );
}
