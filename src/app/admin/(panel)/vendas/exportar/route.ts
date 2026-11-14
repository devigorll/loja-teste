import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStaffStatus } from "@/lib/auth/require-staff";
import { SALE_STATUS, listSales, parseSalesFilters } from "@/lib/admin/sales";
import { fmtDateTime } from "@/lib/dates";

export const dynamic = "force-dynamic";

// Protege contra "injeção de fórmula" ao abrir o CSV no Excel.
function cell(v: string | number) {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
const money = (n: number) => Number(n).toFixed(2).replace(".", ",");

export async function GET(req: NextRequest) {
  const staff = await getStaffStatus();
  if (staff.state !== "ok") return new NextResponse("Não autorizado.", { status: 401 });

  const f = parseSalesFilters(Object.fromEntries(req.nextUrl.searchParams));
  const supabase = await createClient();
  const { data, error } = await listSales(supabase, f, 5000, 0);
  if (error || !data) return new NextResponse(`Erro ao exportar: ${error ?? "sem dados"}`, { status: 500 });

  const header = ["Pedido", "Data", "Cliente", "Produtos", "Unidades", "Pagamento", "Total (R$)", "Status"];
  const lines = data.rows.map((s) =>
    [
      s.code,
      fmtDateTime(s.sold_at),
      s.customer,
      s.items.map((i) => `${i.name} (${i.size}/${i.color}) x${i.qty}`).join("; "),
      s.items.reduce((n, i) => n + i.qty, 0),
      s.method,
      money(s.total),
      SALE_STATUS[s.status]?.label ?? s.status,
    ].map(cell).join(";")
  );

  const csv = "\uFEFF" + [header.map(cell).join(";"), ...lines].join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vendas_${f.de}_${f.ate}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
