"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BellRing, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type NewOrder = { code: string; customer_name: string };

export function NewOrderNotifier() {
  const router = useRouter();
  const [toast, setToast] = useState<NewOrder | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("admin-new-orders")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (payload) => {
        const o = payload.new as NewOrder;
        setToast({ code: o.code, customer_name: o.customer_name });
        router.refresh(); // atualiza o contador do menu e a lista
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
          className="fixed inset-x-4 top-4 z-[200] flex items-start gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-xl sm:left-auto sm:w-96 dark:border-neutral-700 dark:bg-neutral-900">
          <BellRing className="mt-0.5 shrink-0 text-green-600" size={20} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Você recebeu um novo pedido!</p>
            <p className="truncate text-sm text-neutral-500">{toast.code} · {toast.customer_name}</p>
            <Link href="/admin/possiveis-vendas" onClick={() => setToast(null)} className="mt-2 inline-block text-sm font-medium underline underline-offset-4">Ver possíveis vendas</Link>
          </div>
          <button type="button" aria-label="Fechar aviso" onClick={() => setToast(null)} className="grid size-8 place-items-center rounded-full transition hover:bg-neutral-100 active:scale-90 dark:hover:bg-neutral-800"><X size={16} /></button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}