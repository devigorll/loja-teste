import { formatBRL } from "@/lib/format";

export type OrderResult = {
  id: string;
  code: string;
  customer_name: string;
  notes: string | null;
  total: number;
  items: { product_name: string; size: string; color: string; unit_price: number; quantity: number; subtotal: number }[];
};

/** Mantém só dígitos e garante o DDI 55. Retorna null se o número for curto demais. */
export function normalizeWhatsApp(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.length <= 11 ? `55${digits}` : digits;
}

export function buildOrderMessage(o: OrderResult): string {
  const lines = o.items.map(
    (i, n) =>
      `${n + 1}. ${i.product_name}\n   Tam. ${i.size} | Cor ${i.color}\n   ${i.quantity} x ${formatBRL(i.unit_price)} = ${formatBRL(i.subtotal)}`
  );
  return [
    `*Novo pedido ${o.code}*`,
    `Cliente: ${o.customer_name}`,
    "",
    "*Itens*",
    ...lines,
    "",
    `*Total: ${formatBRL(o.total)}*`,
    ...(o.notes ? ["", `Observações: ${o.notes}`] : []),
    "",
    "Pedido registrado pelo site. Aguardo a confirmação!",
  ].join("\n");
}

export function buildWhatsAppUrl(number: string, o: OrderResult): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(buildOrderMessage(o))}`;
}