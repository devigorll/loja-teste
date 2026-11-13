import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-32 text-center">
      <h1 className="text-3xl font-black tracking-tight">Produto não encontrado</h1>
      <p className="mt-3 text-neutral-500">Ele pode ter sido desativado ou o endereço está incorreto.</p>
      <Link href="/catalogo" className="mt-8 inline-block rounded-full bg-neutral-950 px-7 py-3 font-semibold text-white dark:bg-white dark:text-neutral-950">Voltar ao catálogo</Link>
    </div>
  );
}
