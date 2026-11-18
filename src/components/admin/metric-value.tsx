import type { CSSProperties } from "react";

/**
 * Valor de indicador (R$, totais...). O tamanho da fonte é o do design atual, mas encolhe sozinho
 * quando o cartão é estreito, para o número nunca passar do limite (container queries; veja globals.css).
 * Defina o tamanho máximo com [--fit-max:1.5rem] na className.
 */
export function MetricValue({ text, className = "" }: { text: string; className?: string }) {
  return (
    <p className={`adm-fit font-black tracking-tight ${className}`} style={{ "--chars": text.length } as CSSProperties}>
      {text}
    </p>
  );
}
