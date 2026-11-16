import type { ReactNode } from "react";

type Props = {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  /** "card": a seção inteira fica dentro de um cartão (ex.: Regras dos selos). "list": só o título é um cartão e o conteúdo (cartões de produtos) fica abaixo. */
  variant?: "card" | "list";
};

/**
 * Seção que expande e recolhe pela setinha (<details> nativo), no mesmo padrão
 * usado em "Regras dos selos automáticos". Recolhida, o conteúdo fica oculto.
 */
export function CollapsibleSection({ title, children, defaultOpen = false, variant = "card" }: Props) {
  if (variant === "list") {
    return (
      <details open={defaultOpen}>
        <summary className="adm-card list-inside cursor-pointer p-4 text-base font-bold text-ink sm:p-5">{title}</summary>
        <div className="mt-4">{children}</div>
      </details>
    );
  }
  return (
    <details className="adm-card p-4 sm:p-5" open={defaultOpen}>
      <summary className="cursor-pointer text-base font-bold text-ink">{title}</summary>
      {children}
    </details>
  );
}
