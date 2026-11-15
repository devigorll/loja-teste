import { parseMoney } from "@/lib/admin/products";

export type DiscountMode = "none" | "percent" | "fixed";
export type DiscountState = { mode: DiscountMode; raw: string };
export type DiscountResult = {
  active: boolean;          // há desconto sendo informado
  amount: number;           // valor do desconto em R$ (0 se inválido/vazio)
  percent: number | null;   // percentual, quando o modo é percentual
  error: string | null;
};

const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Calcula o desconto para exibir ao administrador. O banco refaz e valida tudo (esta conta é só a prévia).
 * base = valor sobre o qual o percentual incide; max = maior desconto permitido em R$.
 */
export function computeDiscount(state: DiscountState, base: number, max: number): DiscountResult {
  if (state.mode === "none") return { active: false, amount: 0, percent: null, error: null };
  if (state.raw.trim() === "") return { active: true, amount: 0, percent: null, error: null }; // ainda digitando

  const n = parseMoney(state.raw);
  if (!Number.isFinite(n) || n <= 0) return { active: true, amount: 0, percent: null, error: "Informe um valor maior que zero." };

  let amount: number;
  let percent: number | null = null;
  if (state.mode === "percent") {
    if (n > 100) return { active: true, amount: 0, percent: null, error: "O desconto não pode passar de 100%." };
    percent = Math.round(n * 100) / 100;
    amount = Math.round(base * percent) / 100; // base * percent / 100, arredondado em centavos
  } else {
    amount = Math.round(n * 100) / 100;
  }

  if (amount <= 0) return { active: true, amount: 0, percent, error: "O desconto calculado é R$ 0,00. Informe um valor maior." };
  if (Math.round(amount * 100) > Math.round(max * 100)) {
    return { active: true, amount: 0, percent, error: `O desconto não pode passar de ${money(max)}.` };
  }
  return { active: true, amount, percent, error: null };
}
