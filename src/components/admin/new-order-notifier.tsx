"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BellRing, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type NewOrder = { code: string; customer_name: string; source?: string };

export function NewOrderNotifier() {
  const router = useRouter();
  const [toast, setToast] = useState<NewOrder | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("admin-new-orders")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (payload) => {
        const o = payload.new as NewOrder;
        if (o.source !== "admin") setToast({ code: o.code, customer_name: o.customer_name }); // pedido criado no painel não é "novo pedido de cliente"
        router.refresh(); // atualiza o contador do menu e as listas
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [router]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 10000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <AnimatePresence>
      {toast && (
        <motion.div key="toast" role="status" initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
          className="adm-card fixed inset-x-3 top-3 z-[200] flex items-start gap-3 border-good/40 p-4 sm:left-auto sm:right-4 sm:top-4 sm:w-96">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-good/15 text-good"><BellRing size={20} /></span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-ink">Você recebeu um novo pedido!</p>
            <p className="truncate text-sm text-muted">{toast.code} · {toast.customer_name}</p>
            <Link href="/admin/possiveis-vendas" onClick={() => setToast(null)} className="mt-2 inline-block text-sm font-semibold text-accent underline underline-offset-4">Ver possíveis vendas</Link>
          </div>
          <button type="button" aria-label="Fechar aviso" onClick={() => setToast(null)} className="grid size-9 place-items-center rounded-full text-muted transition hover:bg-surface-2 active:scale-90"><X size={16} /></button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
