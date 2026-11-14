"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ClipboardList, ExternalLink, LayoutDashboard, Menu, Receipt, ShieldCheck, Store, Wallet, X } from "lucide-react";
import { SignOutButton } from "./sign-out-button";
import { AdminThemeToggle } from "./admin-theme-toggle";

const NAV = [
  { href: "/admin", label: "Dashboard", short: "Início", icon: LayoutDashboard, exact: true, tab: true },
  { href: "/admin/possiveis-vendas", label: "Possíveis vendas", short: "Pedidos", icon: ClipboardList, exact: false, tab: true },
  { href: "/admin/vendas", label: "Histórico de vendas", short: "Vendas", icon: Receipt, exact: false, tab: true },
  { href: "/admin/caixa", label: "Controle de caixa", short: "Caixa", icon: Wallet, exact: false, tab: true },
  { href: "/admin/seguranca", label: "Segurança", short: "Segurança", icon: ShieldCheck, exact: false, tab: false },
];
const TABS = NAV.filter((n) => n.tab);
const ROLES = { admin: "Administrador", manager: "Gerente", staff: "Equipe" } as const;

const isActive = (path: string, n: (typeof NAV)[number]) => (n.exact ? path === n.href : path.startsWith(n.href));

function Badge({ n, className = "" }: { n: number; className?: string }) {
  if (n <= 0) return null;
  return <span className={`grid min-w-5 place-items-center rounded-full bg-bad px-1.5 text-[11px] font-bold leading-5 text-white ${className}`}>{n > 99 ? "99+" : n}</span>;
}

function Brand() {
  return (
    <span className="flex items-center gap-2.5 font-black tracking-tight">
      <span className="grid size-8 place-items-center rounded-lg bg-accent text-accent-ink"><Store size={17} /></span>
      Painel
    </span>
  );
}

const sideLink = "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition active:scale-[0.98]";

function SideNav({ pending, onNavigate }: { pending: number; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1" aria-label="Menu do painel">
      {NAV.map((n) => {
        const on = isActive(pathname, n);
        return (
          <Link key={n.href} href={n.href} onClick={onNavigate} aria-current={on ? "page" : undefined}
            className={`${sideLink} ${on ? "bg-white/10 text-white shadow-[inset_3px_0_0_var(--accent)]" : "text-side-ink hover:bg-white/5 hover:text-white"}`}>
            <n.icon size={18} />
            <span className="flex-1">{n.label}</span>
            {n.href === "/admin/possiveis-vendas" && <Badge n={pending} />}
          </Link>
        );
      })}
      <a href="/" target="_blank" rel="noopener noreferrer" className={`${sideLink} text-side-ink hover:bg-white/5 hover:text-white`}>
        <ExternalLink size={18} />
        <span className="flex-1">Visitar o site</span>
      </a>
    </nav>
  );
}

function UserBox({ name, role }: { name: string; role: keyof typeof ROLES }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-accent-ink">{name.trim().charAt(0).toUpperCase() || "?"}</span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-white">{name}</p>
        <p className="text-xs text-side-ink">{ROLES[role]}</p>
      </div>
    </div>
  );
}

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

  return (
    <div className="adm-bg min-h-dvh lg:grid lg:grid-cols-[17rem_1fr]">
      {/* Computador: menu lateral fixo */}
      <aside className="sticky top-0 hidden h-dvh flex-col justify-between bg-side p-4 text-white lg:flex">
        <div className="space-y-8">
          <div className="px-3 pt-2 text-lg text-white"><Brand /></div>
          <SideNav pending={pending} />
        </div>
        <div className="space-y-1 border-t border-white/10 pt-3">
          <AdminThemeToggle variant="side" />
          <UserBox name={name} role={role} />
          <SignOutButton variant="side" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* Celular/tablet: barra superior */}
        <header className="sticky top-0 z-30 flex items-center justify-between bg-side px-4 py-1.5 pt-[max(0.375rem,env(safe-area-inset-top))] text-white shadow-lg lg:hidden">
          <Brand />
          <AdminThemeToggle variant="icon" />
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 p-4 pb-28 sm:p-6 sm:pb-28 lg:p-8 lg:pb-10">{children}</main>
      </div>

      {/* Celular/tablet: navegação inferior (alcance do polegar) */}
      <nav aria-label="Navegação principal" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur lg:hidden">
        <ul className="grid grid-cols-5">
          {TABS.map((n) => {
            const on = isActive(pathname, n);
            return (
              <li key={n.href}>
                <Link href={n.href} aria-current={on ? "page" : undefined}
                  className={`relative flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition active:scale-95 ${on ? "text-accent" : "text-muted"}`}>
                  {on && <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-accent" />}
                  <span className="relative"><n.icon size={22} />{n.href === "/admin/possiveis-vendas" && <Badge n={pending} className="absolute -right-3 -top-2" />}</span>
                  {n.short}
                </Link>
              </li>
            );
          })}
          <li>
            <button type="button" onClick={() => setOpen(true)} aria-expanded={open} aria-label="Abrir menu completo"
              className="flex min-h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-semibold text-muted transition active:scale-95">
              <Menu size={22} /> Menu
            </button>
          </li>
        </ul>
      </nav>

      {/* Menu completo (celular): fundo sólido, sobreposição e fechamento ao tocar fora */}
      <AnimatePresence>
        {open && [
          <motion.div key="overlay" className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm lg:hidden" aria-hidden="true"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onClick={() => setOpen(false)} />,
          <motion.aside key="drawer" role="dialog" aria-modal="true" aria-label="Menu completo"
            className="fixed inset-y-0 right-0 z-[100] flex w-[86%] max-w-sm flex-col justify-between overflow-y-auto bg-side p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-white shadow-2xl lg:hidden"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "tween", duration: 0.28, ease: "easeOut" }}>
            <div className="space-y-6">
              <div className="flex items-center justify-between px-1">
                <Brand />
                <button type="button" aria-label="Fechar menu" onClick={() => setOpen(false)} className="grid size-11 place-items-center rounded-full transition hover:bg-white/10 active:scale-90"><X size={22} /></button>
              </div>
              <SideNav pending={pending} onNavigate={() => setOpen(false)} />
            </div>
            <div className="space-y-1 border-t border-white/10 pt-3">
              <AdminThemeToggle variant="side" />
              <UserBox name={name} role={role} />
              <SignOutButton variant="side" />
            </div>
          </motion.aside>,
        ]}
      </AnimatePresence>
    </div>
  );
}
