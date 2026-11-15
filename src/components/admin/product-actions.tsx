"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Eye, EyeOff, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BUCKET, storagePathFromUrl, type Status } from "@/lib/admin/products";
import { ConfirmDialog } from "./confirm-dialog";

type Props = {
  product: { id: string; name: string; status: Status };
  isAdmin: boolean;
  afterDelete?: string; // rota para ir depois de excluir (ex.: lista), quando estiver na página do produto
  full?: boolean;       // botões em largura total (usado no celular/zona de risco)
};

type Action = "unavailable" | "archive" | "delete";

/** Disponibilizar, indisponibilizar, arquivar, restaurar e excluir (cada um com comportamento próprio). */
export function ProductActions({ product, isAdmin, afterDelete, full = false }: Props) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(status: Status) {
    setBusy(true); setError(null);
    const { error: err } = await createClient().rpc("set_product_status", { p_product_id: product.id, p_status: status });
    setBusy(false);
    if (err) { setError(err.message); return false; }
    setConfirm(null);
    router.refresh();
    return true;
  }

  async function remove() {
    setBusy(true); setError(null);
    const supabase = createClient();
    // guarda os caminhos das fotos antes de excluir, para limpar o Storage depois
    const { data: imgs } = await supabase.from("product_images").select("url").eq("product_id", product.id);
    const { error: err } = await supabase.rpc("delete_product", { p_product_id: product.id });
    if (err) { setBusy(false); setError(err.message); return; }
    const paths = ((imgs ?? []) as { url: string }[]).map((i) => storagePathFromUrl(i.url)).filter((p): p is string => Boolean(p));
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths); // melhor esforço
    setBusy(false);
    setConfirm(null);
    if (afterDelete) router.push(afterDelete);
    router.refresh();
  }

  const btn = `adm-btn ${full ? "w-full" : "min-h-10 px-4"}`;
  const { status } = product;

  return (
    <>
      <div className={full ? "grid gap-2 sm:grid-cols-2" : "flex flex-wrap gap-2"}>
        {status === "active" && <button type="button" className={btn} disabled={busy} onClick={() => { setError(null); setConfirm("unavailable"); }}><EyeOff size={16} /> Indisponibilizar</button>}
        {status === "unavailable" && <button type="button" className={btn} disabled={busy} onClick={() => void setStatus("active")}><Eye size={16} /> Disponibilizar</button>}
        {status !== "archived" && <button type="button" className={btn} disabled={busy} onClick={() => { setError(null); setConfirm("archive"); }}><Archive size={16} /> Arquivar</button>}
        {status === "archived" && <button type="button" className={btn} disabled={busy} onClick={() => void setStatus("unavailable")}><ArchiveRestore size={16} /> Restaurar</button>}
        {isAdmin && <button type="button" className={`${btn} adm-btn-danger`} disabled={busy} onClick={() => { setError(null); setConfirm("delete"); }}><Trash2 size={16} /> Excluir</button>}
      </div>
      {!confirm && error && <p role="alert" className="mt-2 rounded-xl bg-bad/15 p-3 text-sm font-semibold text-bad">{error}</p>}

      {confirm === "unavailable" && (
        <ConfirmDialog title="Indisponibilizar produto?" confirmLabel="Indisponibilizar" loading={busy} error={error}
          description={`“${product.name}” continua cadastrado, mas some do site e não poderá ser comprado. Você pode disponibilizá-lo de novo quando quiser.`}
          onConfirm={() => void setStatus("unavailable")} onCancel={() => setConfirm(null)} />
      )}
      {confirm === "archive" && (
        <ConfirmDialog title="Arquivar produto?" confirmLabel="Arquivar" loading={busy} error={error}
          description={`“${product.name}” sai de circulação e do site, mas todos os dados ficam guardados. Você poderá consultá-lo em “Arquivados” e restaurá-lo depois.`}
          onConfirm={() => void setStatus("archived")} onCancel={() => setConfirm(null)} />
      )}
      {confirm === "delete" && (
        <ConfirmDialog title="Excluir definitivamente?" confirmLabel="Excluir para sempre" danger loading={busy} error={error}
          description={`“${product.name}” será removido para sempre, junto com as variações, as fotos e o histórico de estoque dele. Pedidos e vendas já registrados não mudam. Se um pedido pendente tiver este produto, o item precisará ser removido antes de confirmar. Para só tirar do site, prefira Arquivar.`}
          onConfirm={() => void remove()} onCancel={() => setConfirm(null)} />
      )}
    </>
  );
}
