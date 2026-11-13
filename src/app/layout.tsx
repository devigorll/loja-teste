import { Header } from "@/components/shop/header";
import { Footer } from "@/components/shop/footer";
import { getCategories, getStore } from "@/lib/catalog";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const [store, categories] = await Promise.all([getStore(), getCategories()]);
  return (
    <>
      <Header storeName={store.name} categories={categories} />
      <main>{children}</main>
      <Footer store={store} />
    </>
  );
}
