import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente SEM sessão de login: sempre age como visitante (anon), no servidor ou no navegador.
 * É o usado pela loja virtual, para que o catálogo mostre exatamente o que o público pode ver
 * (mesmo que uma pessoa da equipe esteja logada no mesmo navegador) e nunca misture lojas.
 */
export function createPublicClient() {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "sb-public-client" },
  });
}
