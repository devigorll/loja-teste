"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function PinForm({ isSet }: { isSet: boolean }) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const digits = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => setter(e.target.value.replace(/\D/g, "").slice(0, 4));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (next !== confirm) { setMsg({ ok: false, text: "A confirmação não é igual ao novo código." }); return; }
    setLoading(true);
    const { data, error } = await createClient().rpc("set_store_pin", { p_new: next, p_current: isSet ? current : null });
    setLoading(false);
    const r = data as { ok: boolean; error?: string } | null;
    if (error || !r?.ok) { setMsg({ ok: false, text: error?.message ?? r?.error ?? "Não foi possível salvar." }); return; }
    setCurrent(""); setNext(""); setConfirm("");
    setMsg({ ok: true, text: isSet ? "Código alterado com sucesso." : "Código definido com sucesso." });
    router.refresh();
  }

  const field = "adm-input tracking-[0.4em]";
  return (
    <form onSubmit={handleSubmit} className="max-w-sm space-y-4">
      {isSet && (
        <div className="space-y-1.5">
          <label htmlFor="cur" className="text-sm font-medium text-ink">Código atual</label>
          <input id="cur" type="password" inputMode="numeric" autoComplete="off" required value={current} onChange={digits(setCurrent)} className={field} />
        </div>
      )}
      <div className="space-y-1.5">
        <label htmlFor="new" className="text-sm font-medium text-ink">Novo código (4 dígitos)</label>
        <input id="new" type="password" inputMode="numeric" autoComplete="off" required value={next} onChange={digits(setNext)} className={field} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="conf" className="text-sm font-medium text-ink">Repita o novo código</label>
        <input id="conf" type="password" inputMode="numeric" autoComplete="off" required value={confirm} onChange={digits(setConfirm)} className={field} />
      </div>
      {msg && <p role="status" className={`rounded-xl p-3 text-sm font-medium ${msg.ok ? "bg-good/15 text-good" : "bg-bad/15 text-bad"}`}>{msg.text}</p>}
      <button type="submit" disabled={loading || next.length !== 4 || confirm.length !== 4 || (isSet && current.length !== 4)} className="adm-btn adm-btn-primary w-full sm:w-auto">
        {loading ? "Salvando..." : isSet ? "Alterar código" : "Definir código"}
      </button>
    </form>
  );
}
