"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === "dark";

  return (
    <button
      type="button"
      aria-label={dark ? "Ativar tema claro" : "Ativar tema escuro"}
      onClick={() => setTheme(dark ? "light" : "dark")}
      className="grid size-10 place-items-center rounded-full transition hover:bg-neutral-100 active:scale-90 dark:hover:bg-neutral-800"
    >
      {dark ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
}
