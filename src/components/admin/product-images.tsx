"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ImagePlus, RefreshCw, Star, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BUCKET, IMAGE_TYPES, MAX_IMAGES, MAX_IMAGE_BYTES, storagePathFromUrl, type AdminImage } from "@/lib/admin/products";
import { ConfirmDialog } from "./confirm-dialog";

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" };

function validate(file: File): string | null {
  if (!IMAGE_TYPES.includes(file.type)) return `“${file.name}”: use JPG, PNG, WebP ou AVIF.`;
  if (file.size > MAX_IMAGE_BYTES) return `“${file.name}”: o arquivo passa de 5 MB.`;
  return null;
}

/** Fotos do produto: enviar, trocar, remover e escolher a principal (a primeira aparece no site). */
export function ProductImages({ productId, productName, images, storeId }: { productId: string; productName: string; images: AdminImage[]; storeId: string }) {
  const router = useRouter();
  const addRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState<AdminImage | null>(null);
  const [removing, setRemoving] = useState<AdminImage | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sorted = [...images].sort((a, b) => a.position - b.position);

  async function uploadFile(file: File) {
    const supabase = createClient();
    const path = `${storeId}/products/${productId}/${crypto.randomUUID()}.${EXT[file.type]}`; // cada loja escreve só na própria pasta
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false, cacheControl: "31536000" });
    if (upErr) throw new Error(upErr.message);
    return { path, url: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl };
  }

  const removeObject = async (url: string) => {
    const old = storagePathFromUrl(url);
    if (old) await createClient().storage.from(BUCKET).remove([old]); // melhor esforço
  };

  async function onAdd(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    const list = Array.from(files);
    if (sorted.length + list.length > MAX_IMAGES) { setError(`Cada produto pode ter até ${MAX_IMAGES} fotos.`); return; }
    for (const f of list) { const v = validate(f); if (v) { setError(v); return; } }

    setBusy("Enviando fotos...");
    const supabase = createClient();
    let pos = sorted.length ? Math.max(...sorted.map((i) => i.position)) + 1 : 0;
    try {
      for (const f of list) {
        const up = await uploadFile(f);
        const { error: dbErr } = await supabase.from("product_images").insert({ product_id: productId, url: up.url, alt: productName, position: pos++ });
        if (dbErr) { await supabase.storage.from(BUCKET).remove([up.path]); throw new Error(dbErr.message); }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao enviar a foto.");
    }
    setBusy(null);
    if (addRef.current) addRef.current.value = "";
    router.refresh();
  }

  async function onReplace(file: File | undefined) {
    const target = replacing;
    setReplacing(null);
    if (replaceRef.current) replaceRef.current.value = "";
    if (!file || !target) return;
    setError(null);
    const v = validate(file);
    if (v) { setError(v); return; }

    setBusy("Substituindo foto...");
    try {
      const up = await uploadFile(file);
      const { error: dbErr } = await createClient().from("product_images").update({ url: up.url }).eq("id", target.id);
      if (dbErr) { await createClient().storage.from(BUCKET).remove([up.path]); throw new Error(dbErr.message); }
      await removeObject(target.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao substituir a foto.");
    }
    setBusy(null);
    router.refresh();
  }

  async function makeMain(img: AdminImage) {
    setError(null); setBusy("Atualizando...");
    const ids = [img.id, ...sorted.filter((i) => i.id !== img.id).map((i) => i.id)];
    const { error: err } = await createClient().rpc("reorder_product_images", { p_product_id: productId, p_ids: ids });
    setBusy(null);
    if (err) { setError(err.message); return; }
    router.refresh();
  }

  async function confirmRemove() {
    const img = removing;
    if (!img) return;
    setBusy("Removendo...");
    const { error: err } = await createClient().from("product_images").delete().eq("id", img.id);
    if (err) { setBusy(null); setError(err.message); setRemoving(null); return; }
    await removeObject(img.url);
    setBusy(null); setRemoving(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <input ref={addRef} type="file" accept={IMAGE_TYPES.join(",")} multiple hidden onChange={(e) => void onAdd(e.target.files)} />
      <input ref={replaceRef} type="file" accept={IMAGE_TYPES.join(",")} hidden onChange={(e) => void onReplace(e.target.files?.[0])} />

      {error && <p role="alert" className="rounded-xl bg-bad/15 p-3 text-sm font-semibold text-bad">{error}</p>}
      {busy && <p role="status" className="rounded-xl bg-surface-2 p-3 text-sm font-medium text-ink">{busy}</p>}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {sorted.map((img, i) => (
          <li key={img.id} className="adm-card overflow-hidden">
            <div className="relative aspect-[4/5] bg-surface-2">
              <Image src={img.url} alt={img.alt ?? productName} fill unoptimized sizes="(min-width:1024px) 25vw, 50vw" className="object-cover" />
              {i === 0 && <span className="adm-badge absolute left-2 top-2 bg-ink text-surface">Principal</span>}
            </div>
            <div className="grid grid-cols-3 gap-1 p-2">
              <button type="button" title="Definir como principal" aria-label="Definir como principal" disabled={i === 0 || busy !== null} onClick={() => void makeMain(img)} className="adm-btn min-h-10 px-0"><Star size={16} /></button>
              <button type="button" title="Trocar foto" aria-label="Trocar foto" disabled={busy !== null} onClick={() => { setReplacing(img); replaceRef.current?.click(); }} className="adm-btn min-h-10 px-0"><RefreshCw size={16} /></button>
              <button type="button" title="Remover foto" aria-label="Remover foto" disabled={busy !== null} onClick={() => setRemoving(img)} className="adm-btn adm-btn-danger min-h-10 px-0"><Trash2 size={16} /></button>
            </div>
          </li>
        ))}
        {sorted.length < MAX_IMAGES && (
          <li>
            <button type="button" disabled={busy !== null} onClick={() => addRef.current?.click()}
              className="adm-card flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 border-dashed text-sm font-semibold text-muted transition hover:border-accent hover:text-ink active:scale-[0.98]">
              <ImagePlus size={28} /> Adicionar fotos
              <span className="text-xs font-normal">JPG, PNG, WebP · até 5 MB</span>
            </button>
          </li>
        )}
      </ul>
      {sorted.length === 0 && <p className="text-sm text-muted">Este produto ainda não tem fotos. No site, aparece sem imagem até você enviar a primeira.</p>}

      {removing && (
        <ConfirmDialog title="Remover esta foto?" confirmLabel="Remover" danger loading={busy !== null}
          description="A foto sai do produto e do site. Esta ação não pode ser desfeita."
          onConfirm={() => void confirmRemove()} onCancel={() => setRemoving(null)} />
      )}
    </div>
  );
}
