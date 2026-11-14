"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

type Variant = "icon" | "side" | "row";

/** Alterna entre tema claro e escuro (a escolha fica salva no navegador). */
export function AdminThemeToggle({ variant = "row" }: { variant?: Variant }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const dark = mounted && resolvedTheme === "dark";
  const Icon = dark ? Sun : Moon;
  const label = dark ? "Tema claro" : "Tema escuro";
  const toggle = () => setTheme(dark ? "light" : "dark");

  if (variant === "icon") {
    return (
      <button type="button" onClick={toggle} aria-label={`Ativar ${label.toLowerCase()}`}
        className="grid size-11 place-items-center rounded-full text-white transition hover:bg-white/10 active:scale-90">
        <Icon size={20} />
      </button>
    );
  }
  if (variant === "side") {
    return (
      <button type="button" onClick={toggle}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-side-ink transition hover:bg-white/5 hover:text-white active:scale-[0.98]">
        <Icon size={18} /> {label}
      </button>
    );
  }
  return (
    <button type="button" onClick={toggle} className="adm-btn w-full justify-start">
      <Icon size={18} /> {label}
    </button>
  );
}
