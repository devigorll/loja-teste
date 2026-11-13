import type { Metadata } from "next";
import { CartView } from "@/components/shop/cart-view";
import { getStore } from "@/lib/catalog";
import { normalizeWhatsApp } from "@/lib/whatsapp";

export const metadata: Metadata = { title: "Sacola" };
export const dynamic = "force-dynamic";

export default async function CartPage() {
  const store = await getStore();
  return <CartView whatsapp={normalizeWhatsApp(store.whatsapp)} />;
}