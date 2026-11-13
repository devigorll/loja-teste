import { requireStaff } from "@/lib/auth/require-staff";

export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireStaff();
  return (
    <div className="min-h-dvh">
      <header className="border-b border-neutral-200 px-6 py-4 dark:border-neutral-800">
        <span className="text-sm text-neutral-500">Logado como {profile.full_name} ({profile.role})</span>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
