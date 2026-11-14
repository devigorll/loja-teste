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
  const field = "w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2.5 tracking-[0.4em] outline-none focus:ring-2 focus:ring-neutral-900 dark:border-neutral-700 dark:focus:ring-white";

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

  return (
    <form onSubmit={handleSubmit} className="max-w-sm space-y-4">
      {isSet && (
        <div className="space-y-1.5">
          <label htmlFor="cur" className="text-sm font-medium">Código atual</label>
          <input id="cur" type="password" inputMode="numeric" autoComplete="off" required value={current} onChange={digits(setCurrent)} className={field} />
        </div>
      )}
      <div className="space-y-1.5">
        <label htmlFor="new" className="text-sm font-medium">Novo código (4 dígitos)</label>
        <input id="new" type="password" inputMode="numeric" autoComplete="off" required value={next} onChange={digits(setNext)} className={field} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="conf" className="text-sm font-medium">Repita o novo código</label>
        <input id="conf" type="password" inputMode="numeric" autoComplete="off" required value={confirm} onChange={digits(setConfirm)} className={field} />
      </div>
      {msg && <p role="status" className={`rounded-lg p-3 text-sm ${msg.ok ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200" : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"}`}>{msg.text}</p>}
      <button type="submit" disabled={loading || next.length !== 4 || confirm.length !== 4 || (isSet && current.length !== 4)}
        className="rounded-full bg-neutral-950 px-6 py-2.5 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50 dark:bg-white dark:text-neutral-950">
        {loading ? "Salvando..." : isSet ? "Alterar código" : "Definir código"}
      </button>
    </form>
  );
}
