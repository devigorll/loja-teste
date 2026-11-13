import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth/require-staff";
import { SignOutButton } from "@/components/admin/sign-out-button";

export const metadata: Metadata = { title: "Painel", robots: { index: false, follow: false } };

export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireStaff();
  return (
    <div className="min-h-dvh">
      <header className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 sm:px-6 dark:border-neutral-800">
        <span className="truncate text-sm text-neutral-500">Logado como {profile.full_name} ({profile.role})</span>
        <SignOutButton />
      </header>
      <main className="p-4 sm:p-6">{children}</main>
    </div>
  );
}