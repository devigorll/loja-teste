# Loja — Etapas 1 a 8 + ajustes finais + controle de estoque (Next.js + Supabase + Vercel)

## Como atualizar o repositório (IMPORTANTE)
1. Apague as pastas `src`, `scripts` e `supabase` do repositório e coloque as deste ZIP (substituição de PASTAS inteiras, não arquivo por arquivo).
2. Copie também `package.json` e os demais arquivos soltos.
3. Faça o commit. O build roda `scripts/verify-structure.mjs` antes e falha com mensagem clara se algum arquivo estiver no lugar errado.

## Banco (Supabase > SQL Editor), rodar uma vez cada, em ordem
0001_schema, 0002_seed, 0003_orders_checkout, 0004_admin_sales, 0005_sales_history_cash, 0006_dashboard, 0007_final_adjustments, 0008_stock_module

## Variáveis no Vercel
NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY
