// Roda automaticamente antes do build (prebuild). Se algum arquivo estiver no lugar errado
// ou com o conteúdo de outro arquivo, o build falha com uma mensagem clara
// e o Vercel mantém no ar a versão anterior do site.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const checks = [
  ["src/middleware.ts", "export async function middleware", "deve conter a função 'middleware' (não o código de src/lib/supabase/middleware.ts)"],
  ["src/lib/supabase/middleware.ts", "export async function updateSession", "deve conter 'updateSession'"],
  ["src/app/layout.tsx", "<html", "deve ser o layout raiz, com <html> e <body>"],
  ["src/app/(public)/layout.tsx", "PublicLayout", "deve ser o layout do site público (Header/Footer)"],
  ["src/app/(public)/page.tsx", "HomePage", "deve ser a página inicial (HomePage)"],
  ["src/app/(public)/carrinho/page.tsx", "CartPage", "deve ser a página da sacola (CartPage)"],
  ["src/app/admin/(panel)/layout.tsx", "AdminPanelLayout", "deve ser o layout do painel"],
  ["src/app/admin/(panel)/page.tsx", "AdminDashboardPage", "deve ser o início do painel (AdminDashboardPage)"],
  ["src/app/admin/(panel)/page.tsx", "getDashboard", "deve ser o dashboard (usa getDashboard)"],
  ["src/components/admin/admin-shell.tsx", "AdminShell", "deve ser o menu do painel (AdminShell)"],
  ["src/components/admin/dashboard-charts.tsx", "RevenueChart", "deve conter os gráficos do dashboard"],
  ["src/components/admin/admin-theme-toggle.tsx", "AdminThemeToggle", "deve ser o botão de tema do painel"],
  ["src/lib/admin/dashboard.ts", "parseDashboardRange", "deve conter as funções do dashboard"],
  ["src/app/globals.css", "--accent", "deve conter as cores do tema do painel"],
  ["src/app/admin/(panel)/possiveis-vendas/novo/page.tsx", "NewOrderPage", "deve ser a página de novo pedido"],
  ["src/components/admin/new-order-form.tsx", "NewOrderForm", "deve ser o formulário de novo pedido"],
  ["src/components/admin/order-lines.tsx", "OrderLines", "deve ser a lista de itens do pedido"],
  ["src/components/admin/revenue-history.tsx", "RevenueHistory", "deve ser o gráfico mensal/anual"],
  ["src/lib/admin/catalog.ts", "loadCatalog", "deve conter o carregador de catálogo do painel"],
  ["src/app/admin/(panel)/estoque/page.tsx", "StockPage", "deve ser a lista do controle de estoque"],
  ["src/app/admin/(panel)/estoque/novo/page.tsx", "NewProductPage", "deve ser a página de novo produto"],
  ["src/app/admin/(panel)/estoque/[id]/page.tsx", "EditProductPage", "deve ser a página de edição do produto"],
  ["src/components/admin/product-form.tsx", "ProductForm", "deve ser o formulário de produto"],
  ["src/components/admin/product-images.tsx", "ProductImages", "deve ser o gerenciador de fotos"],
  ["src/components/admin/product-actions.tsx", "ProductActions", "deve conter as ações disponibilizar/arquivar/excluir"],
  ["src/lib/admin/products.ts", "stockInfo", "deve conter os utilitários de estoque"],
  ["src/components/admin/sale-adjustment-panel.tsx", "SaleAdjustmentPanel", "deve ser o painel Inserir estorno"],
  ["src/components/admin/discount-fields.tsx", "DiscountFields", "deve ser o campo de desconto"],
  ["src/lib/discount.ts", "computeDiscount", "deve conter o cálculo de desconto"],
  ["src/components/admin/collapsible-section.tsx", "CollapsibleSection", "deve ser a seção que expande e recolhe"],
  ["src/app/admin/(panel)/possiveis-vendas/page.tsx", "PossibleSalesPage", "deve ser a lista de possíveis vendas"],
  ["src/app/admin/(panel)/possiveis-vendas/[id]/page.tsx", "OrderDetailPage", "deve ser o detalhe do pedido"],
  ["src/app/admin/(panel)/vendas/page.tsx", "SalesHistoryPage", "deve ser o histórico de vendas"],
  ["src/app/admin/(panel)/vendas/[id]/page.tsx", "SaleDetailPage", "deve ser o detalhe da venda"],
  ["src/app/admin/(panel)/caixa/page.tsx", "CashPage", "deve ser o controle de caixa"],
  ["src/app/admin/(panel)/seguranca/page.tsx", "SecurityPage", "deve ser a página de segurança"],
];
const forbidden = ["src/app/(panel)", "src/components/admin/(panel)"];

const problems = [];
for (const [file, needle, hint] of checks) {
  const full = join(root, ...file.split("/"));
  if (!existsSync(full)) { problems.push(`FALTA o arquivo ${file}`); continue; }
  if (!readFileSync(full, "utf8").includes(needle)) problems.push(`CONTEÚDO ERRADO em ${file}: ${hint}`);
}
for (const dir of forbidden) {
  if (existsSync(join(root, ...dir.split("/")))) problems.push(`PASTA no lugar errado: ${dir} (apague-a)`);
}

if (problems.length) {
  console.error("\n❌ Estrutura do projeto incorreta:\n");
  problems.forEach((p) => console.error("  - " + p));
  console.error("\nSubstitua a pasta 'src' inteira pela do ZIP mais recente e faça o deploy novamente.\n");
  process.exit(1);
}
console.log("✔ Estrutura do projeto verificada.");
