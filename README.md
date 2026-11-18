# Loja — sistema multi-loja (Next.js + Supabase + Vercel)

Leia **docs/MULTI-LOJA.md** (arquitetura, migração, criação de lojas, dados de demonstração, verificação de isolamento e deploy).

## Atualizar o repositório
1. Apague `src`, `scripts`, `supabase` e `docs` do repositório e envie as pastas deste ZIP (pastas inteiras) + `package.json` e arquivos soltos.
2. Commit. O build confere a estrutura (`scripts/verify-structure.mjs`).

## Banco (Supabase > SQL Editor), uma vez cada, em ordem
0001_schema, 0002_seed, 0003_orders_checkout, 0004_admin_sales, 0005_sales_history_cash, 0006_dashboard,
0007_final_adjustments, 0008_stock_module, 0009_discounts_refunds,
**0010_multitenant_structure, 0011_multitenant_functions, 0012_platform_admin** (multi-loja; veja o guia)
Opcionais: `tests/check_multitenant.sql`, `tests/isolation_test.sql`, `demo/001_demo_sales.sql`, `demo/002_remove_demo_data.sql`.

## Variáveis no Vercel
NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY (opcional: STORE_SLUG)
