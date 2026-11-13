"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type CartItem = {
  variantId: string; slug: string; name: string; size: string; color: string;
  price: number; qty: number; max: number; image: string | null;
};

type CartState = {
  items: CartItem[];
  add: (item: CartItem) => void;
  remove: (variantId: string) => void;
  setQty: (variantId: string, qty: number) => void;
  clear: () => void;
};

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      add: (item) =>
        set((s) => {
          const found = s.items.find((i) => i.variantId === item.variantId);
          if (!found) return { items: [...s.items, { ...item, qty: Math.min(item.qty, item.max) }] };
          return {
            items: s.items.map((i) =>
              i.variantId === item.variantId ? { ...i, qty: Math.min(i.qty + item.qty, item.max), max: item.max } : i
            ),
          };
        }),
      remove: (id) => set((s) => ({ items: s.items.filter((i) => i.variantId !== id) })),
      setQty: (id, qty) =>
        set((s) => ({
          items: s.items.map((i) => (i.variantId === id ? { ...i, qty: Math.max(1, Math.min(qty, i.max)) } : i)),
        })),
      clear: () => set({ items: [] }),
    }),
    { name: "loja-cart" }
  )
);
