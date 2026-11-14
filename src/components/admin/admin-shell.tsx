"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ClipboardList, ExternalLink, LayoutDashboard, Menu, ShieldCheck, X } from "lucide-react";
import { SignOutButton } from "./sign-out-button";

const NAV = [
  { href: "/admin", label: "Início", icon: LayoutDashboard, exact: true },
  { href: "/admin/possiveis-vendas", label: "Possíveis vendas", icon: ClipboardList, exact: false },
  { href: "/admin/seguranca", label: "Segurança", icon: ShieldCheck, exact: false },
];

const item = "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition active:scale-[0.98]";
const idle = "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-900";

function Badge({ n }: { n: number }) {
  if (n <= 0) return null;
  return <span className="grid min-w-5 place-items-center rounded-full bg-red-600 px-1.5 text-xs font-bold text-white">{n}</span>;
}

function NavList({ pending }: { pending: number }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={`${item} ${active ? "bg-neutral-950 text-white dark:bg-white dark:text-neutral-950" : idle}`}>
            <Icon size={18} />
            <span className="flex-1">{label}</span>
            {href === "/admin/possiveis-vendas" && <Badge n={pending} />}
          </Link>
        );
      })}
      {/* Nova aba: a sessão do painel continua ativa */}
      <a href="/" target="_blank" rel="noopener noreferrer" className={`${item} ${idle}`}>
        <ExternalLink size={18} />
        <span className="flex-1">Visitar o site</span>
      </a>
    </nav>
  );
}

const ROLES = { admin: "Administrador", manager: "Gerente", staff: "Equipe" } as const;

export function AdminShell({ name, role, pending, children }: {
  name: string; role: keyof typeof ROLES; pending: number; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open]);

  const user = (
    <div className="space-y-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
      <div>
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="text-xs text-neutral-500">{ROLES[role]}</p>
      </div>
      <SignOutButton className="w-full" />
    </div>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col justify-between border-r border-neutral-200 bg-white p-4 lg:flex dark:border-neutral-800 dark:bg-neutral-950">
        <div className="space-y-6">
          <p className="px-3 text-lg font-black tracking-tight">Painel</p>
          <NavList pending={pending} />
        </div>
        {user}
      </aside>

      <div className="min-w-0">
        <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-neutral-200 bg-white px-4 py-3 lg:hidden dark:border-neutral-800 dark:bg-neutral-950">
          <button type="button" aria-label="Abrir menu" aria-expanded={open} onClick={() => setOpen(true)}
            className="grid size-10 place-items-center rounded-full transition active:scale-90 hover:bg-neutral-100 dark:hover:bg-neutral-800"><Menu size={22} /></button>
          <span className="flex-1 font-black tracking-tight">Painel</span>
          <Badge n={pending} />
        </div>
        <main className="p-4 sm:p-6">{children}</main>
      </div>

      <AnimatePresence>
        {open && [
          <motion.div key="overlay" className="fixed inset-0 z-[90] bg-black/60 lg:hidden" aria-hidden="true"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onClick={() => setOpen(false)} />,
          <motion.aside key="drawer" role="dialog" aria-modal="true" aria-label="Menu do painel"
            className="fixed inset-y-0 left-0 z-[100] flex w-[85%] max-w-xs flex-col justify-between overflow-y-auto bg-white p-4 shadow-2xl lg:hidden dark:bg-neutral-950"
            initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "tween", duration: 0.28, ease: "easeOut" }}>
            <div className="space-y-6">
              <div className="flex items-center justify-between px-3">
                <p className="text-lg font-black tracking-tight">Painel</p>
                <button type="button" aria-label="Fechar menu" onClick={() => setOpen(false)}
                  className="grid size-10 place-items-center rounded-full transition active:scale-90 hover:bg-neutral-100 dark:hover:bg-neutral-800"><X size={22} /></button>
              </div>
              <NavList pending={pending} />
            </div>
            {user}
          </motion.aside>,
        ]}
      </AnimatePresence>
    </div>
  );
}