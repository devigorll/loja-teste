import { Header } from "@/components/shop/header";
import { Footer } from "@/components/shop/footer";
import { getCategories, getStore } from "@/lib/catalog";
import { getCurrentStore } from "@/lib/store-context";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  if (!(await getCurrentStore())) {
    return (
      <main className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Loja não encontrada</h1>
          <p className="mt-2 max-w-sm text-neutral-500">Este endereço não está associado a nenhuma loja ativa.</p>
        </div>
      </main>
    );
  }
  const [store, categories] = await Promise.all([getStore(), getCategories()]);
  return (
    <>
      <Header storeName={store.name} categories={categories} />
      <main>{children}</main>
      <Footer store={store} />
    </>
  );
}
