# Loja — Etapas 1 a 3 (Next.js + Supabase + Vercel)

Projeto completo: não precisa rodar `create-next-app`.

## Rodar no computador
1. `npm install`
2. Copie `.env.local.example` para `.env.local` e preencha.
3. No Supabase (SQL Editor), rode `supabase/migrations/0001_schema.sql` e depois `0002_seed.sql` (uma vez cada).
4. Crie o admin (Authentication > Users) e rode o INSERT em `profiles`.
5. `npm run dev` e abra http://localhost:3000

## Publicar
Suba o projeto para o GitHub, importe no Vercel e cadastre as 3 variáveis de ambiente do `.env.local.example`.
