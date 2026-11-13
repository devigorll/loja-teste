import type { Store } from "@/lib/catalog";

export function Footer({ store }: { store: Store }) {
  const wa = store.whatsapp ? `https://wa.me/${store.whatsapp}` : null;
  return (
    <footer className="mt-24 border-t border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-3">
        <div>
          <p className="text-xl font-black tracking-tight">{store.name}</p>
          {store.description && <p className="mt-3 max-w-xs text-sm text-neutral-600 dark:text-neutral-400">{store.description}</p>}
        </div>
        <div className="space-y-1 text-sm text-neutral-600 dark:text-neutral-400">
          <p className="mb-2 font-semibold text-neutral-950 dark:text-white">Atendimento</p>
          {wa && <p><a className="underline" href={wa} target="_blank" rel="noopener noreferrer">WhatsApp</a></p>}
          {store.phone && <p>{store.phone}</p>}
          {store.address && <p>{store.address}</p>}
          {Object.entries(store.opening_hours).map(([k, v]) => <p key={k}>{k}: {v}</p>)}
        </div>
        <div className="space-y-1 text-sm text-neutral-600 dark:text-neutral-400">
          <p className="mb-2 font-semibold text-neutral-950 dark:text-white">Entrega e retirada</p>
          {store.delivery_info && <p>{store.delivery_info}</p>}
          {store.pickup_info && <p>{store.pickup_info}</p>}
          {Object.entries(store.social_links).map(([k, v]) => (
            <p key={k}><a className="underline" href={v} target="_blank" rel="noopener noreferrer">{k}</a></p>
          ))}
        </div>
      </div>
    </footer>
  );
}
