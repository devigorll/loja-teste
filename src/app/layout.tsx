import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";

const font = Archivo({ subsets: ["latin"], variable: "--font-archivo", axes: ["wdth"] });

export const metadata: Metadata = { title: "Vértice Urban", description: "Catálogo digital" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${font.variable} font-sans antialiased bg-white text-neutral-950 dark:bg-neutral-950 dark:text-neutral-100`}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
