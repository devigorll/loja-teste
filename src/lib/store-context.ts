import { cache } from "react";
import { headers } from "next/headers";
import { createPublicClient } from "@/lib/supabase/public";

export type CurrentStore = { id: string; slug: string; name: string };

/**
 * Descobre qual loja o site público deve mostrar (uma vez por requisição). Ordem de decisão (feita no banco, resolve_store):
 *  1. variável de ambiente STORE_SLUG (um deploy dedicado a uma loja);
 *  2. domínio acessado = domínio próprio cadastrado na loja (stores.custom_domain);
 *  3. se existir uma única loja ativa, é ela (mantém o funcionamento de loja única).
 */
export const getCurrentStore = cache(async (): Promise<CurrentStore | null> => {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(":")[0].toLowerCase();
  const { data } = await createPublicClient().rpc("resolve_store", {
    p_slug: process.env.STORE_SLUG || null,
    p_host: host || null,
  });
  const row = (Array.isArray(data) ? data[0] : data) as { store_id: string; store_slug: string; store_name: string } | null | undefined;
  return row ? { id: row.store_id, slug: row.store_slug, name: row.store_name } : null;
});
