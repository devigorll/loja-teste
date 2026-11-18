# Arquitetura multi-loja — guia de implantação

Este guia explica **o que mudou**, **como migrar o banco atual** para a arquitetura multi-loja, **como criar novas lojas**,
**como rodar os dados de demonstração**, **como verificar o isolamento** e **como publicar na Vercel**.

---

## 1. Como funciona (resumo)

- **Um único banco**, vários clientes. Cada loja é uma linha em `stores` (identificada por um **UUID**, com `slug` e, se quiser, um domínio próprio).
- **Todas as tabelas de negócio** (produtos, categorias, estoque, pedidos, vendas, financeiro, configurações...) têm `store_id` (obrigatório) apontando para a loja dona do registro.
- **Cada usuário do painel pertence a UMA loja** (`profiles.store_id`). Ao logar, o sistema descobre a loja pelo usuário — não existe parâmetro de loja para o usuário alterar.
- **Isolamento em 4 camadas** (se uma falhar, as outras seguram):
  1. **RLS** (Row Level Security): o banco só devolve/altera linhas da loja do usuário.
  2. **Chaves estrangeiras compostas** `(id, store_id)`: um registro não consegue apontar para dado de outra loja (ex.: item de pedido da loja A com produto da loja B é recusado pelo banco).
  3. **Triggers**: ninguém consegue trocar a loja de um registro (`A loja de um registro não pode ser alterada`).
  4. **Funções do banco** (estoque, vendas, estornos, relatórios): filtram pela loja do usuário logado dentro delas.
- **Loja virtual (site público)**: descobre qual loja mostrar por (1) variável `STORE_SLUG`, (2) domínio acessado, (3) se só existir uma loja ativa, é ela. O visitante usa sempre uma conexão *sem login* (papel `anon`), que só lê o catálogo ativo de lojas ativas.
- **Cadastro de lojas e usuários** é feito pelo dono da plataforma, no **SQL Editor** (funções `platform_*`, bloqueadas para o app).
- **Numeração de pedidos por loja**: cada loja tem seu contador (`PED-1001`, `PED-1002`...). Uma loja não vê o volume de pedidos das outras.

---

## 2. Arquivos criados e modificados

**SQL (pasta `supabase/`)** — rode nesta ordem:

| Ordem | Arquivo | Para quê |
|---|---|---|
| 1 | `migrations/0010_multitenant_structure.sql` | Cria `stores`, adiciona `store_id`, migra os dados atuais para a "loja legada", FKs compostas, triggers e RLS |
| 2 | `migrations/0011_multitenant_functions.sql` | Reescreve todas as funções do banco para respeitarem a loja |
| 3 | `migrations/0012_platform_admin.sql` | Funções do dono da plataforma: criar loja, associar usuário, suspender loja |
| 4 | `tests/check_multitenant.sql` | Verificação estrutural (todas as linhas devem dar `OK`) |
| 5 | `tests/isolation_test.sql` | Teste de isolamento entre duas lojas (opcional, exige 2 lojas) |
| 6 | `demo/001_demo_sales.sql` | Vendas fictícias de março a 16/11/2026 (opcional) |
| — | `demo/002_remove_demo_data.sql` | Remove só os dados de demonstração |

> Os arquivos `0001` a `0009` são os que você já rodou. **Não rode de novo.**

**Aplicativo (Next.js):**

- **Novos:** `src/lib/store-context.ts` (descobre a loja do site), `src/lib/supabase/public.ts` (conexão pública sem login), `src/components/admin/metric-value.tsx` (números dos cartões que se ajustam à largura).
- **Alterados (loja):** `src/lib/catalog.ts`, `src/lib/auth/require-staff.ts`, `src/app/(public)/layout.tsx`, `src/app/(public)/carrinho/page.tsx`, `src/components/shop/cart-view.tsx`, `src/app/admin/acesso-negado/page.tsx`, `src/app/admin/(panel)/layout.tsx` (mostra o nome da loja), `src/app/admin/(panel)/estoque/page.tsx`, `src/app/admin/(panel)/estoque/[id]/page.tsx`, `src/components/admin/badge-rules-form.tsx`, `src/components/admin/product-images.tsx` (fotos na pasta da loja), `src/components/admin/admin-shell.tsx`.
- **Alterados (responsividade dos cartões):** `src/app/globals.css`, dashboard (`admin/(panel)/page.tsx`), `caixa/page.tsx`, `vendas/[id]/page.tsx`, `revenue-history.tsx`, `order-lines.tsx`.
- **Proteção do build:** `scripts/verify-structure.mjs` (confere os arquivos novos).

---

## 3. Cuidados antes de rodar no banco de PRODUÇÃO

1. **Faça backup.** Supabase → *Database → Backups* (ou clique em *Create backup*, se o plano permitir). Alternativa: `pg_dump` pela string de conexão. **Sem backup, não rode.**
2. **Teste primeiro num projeto de teste** (ex.: restaure o backup em um projeto novo do Supabase e rode todos os passos lá).
3. **PostgreSQL 15 ou superior** (padrão do Supabase). O script confere e avisa.
4. **Rode `0010`, `0011` e `0012` em sequência, sem intervalo**, de preferência num horário de pouco movimento. Entre o `0010` e o `0011` as funções antigas deixam de funcionar. Logo depois, publique o novo código (passo 6). Na prática a janela é de poucos minutos.
5. **Cada script roda uma única vez** e dentro de uma transação: se der erro, **nada é aplicado** e você pode corrigir e rodar de novo.
6. **Não edite os scripts** (exceto a variável `v_slug` dos scripts de demonstração).
7. Tenha os dados do seu usuário administrador à mão (e-mail) — ele continua funcionando, pois é associado automaticamente à loja legada.

---

## 4. Migração passo a passo

1. **Backup** (item 3 acima).
2. Supabase → **SQL Editor → New query**. Cole o conteúdo de `migrations/0010_multitenant_structure.sql` → **Run**. Deve terminar sem erro.
   - O que ele faz com seus dados: cria a loja legada (nome vindo de `store_settings`, slug gerado a partir do nome, ex.: `vertice-urban`) e **vincula todos os registros e usuários atuais a ela**. Nada é apagado. Os códigos de pedido existentes (`PED-1001`...) continuam e a numeração segue de onde parou.
3. **Imediatamente**: `migrations/0011_multitenant_functions.sql` → **Run**.
4. `migrations/0012_platform_admin.sql` → **Run**.
5. `tests/check_multitenant.sql` → **Run**. **Todas as linhas devem ser `OK`.** Se alguma for `FALHA`, não publique: me envie o resultado.
6. **Publique o código** (item 7 abaixo). Abra o site e o `/admin` e confira: o painel mostra o **nome da loja** no menu e os dados de sempre.

---

## 5. Criar uma nova loja e associar o administrador

Faça tudo no **SQL Editor** (não existe tela para isso no app, por segurança):

1. **Crie o usuário** da loja: Supabase → *Authentication → Users → Add user → Create new user*. Informe e-mail e senha e marque **Auto Confirm User**.
2. **Crie a loja e associe o administrador** (troque os valores):

```sql
select public.platform_create_store(
  p_name         => 'Loja da Maria',
  p_slug         => 'loja-da-maria',              -- opcional: endereço único (se omitir, vem do nome)
  p_admin_email  => 'maria@email.com',            -- o usuário criado no passo 1
  p_admin_name   => 'Maria',
  p_custom_domain=> 'www.lojadamaria.com.br',     -- opcional
  p_whatsapp     => '5511999999999'               -- opcional
);
```

3. Pronto: a loja nasce com configurações, formas de pagamento (PIX, crédito, débito), contador de pedidos e código de autorização (a Maria define o código em **Segurança**, no painel dela).
4. **Outros usuários na mesma loja** (gerente/equipe):

```sql
select public.platform_assign_user('loja-da-maria', 'joao@email.com', 'João', 'staff');   -- 'admin' | 'manager' | 'staff'
```

5. **Suspender / reativar** uma loja (site fora do ar e painel bloqueado; dados preservados):

```sql
select public.platform_set_store_active('loja-da-maria', false);   -- true para reativar
```

**Seu administrador atual** já está na loja legada: não precisa fazer nada. Para listar as lojas e usuários:

```sql
select s.slug, s.name, s.is_active, s.custom_domain from public.stores s order by s.created_at;
select p.full_name, p.role, p.is_active, s.slug as loja, u.email
  from public.profiles p join public.stores s on s.id = p.store_id join auth.users u on u.id = p.id;
```

---

## 6. Dados de demonstração (vendas fictícias)

1. Abra `demo/001_demo_sales.sql`. Se tiver mais de uma loja, edite `v_slug` (ex.: `'vertice-urban'`). Com uma loja só, deixe `''`.
2. **Run.** Cria ~94 vendas de **março a 16/11/2026** (10, 11, 13, 9, 12, 11, 10, 12 e 6 por mês), com itens, pagamentos variados, alguns descontos, estornos e descontos retroativos, tudo ligado ao livro-caixa. Ao final mostra uma tabela de conferência por mês.
3. **Só usa produtos já cadastrados** na loja (cadastre produtos antes) e **não mexe no estoque**.
4. **Como identificar:** pedidos com `is_demo = true`, código `DEMO-0001...` e observação `[DEMO] Dados de demonstração`.
5. **Rodar duas vezes é seguro:** se já houver demonstração na loja, avisa e não faz nada. Os valores são sempre os mesmos.
6. **Para apagar:** `demo/002_remove_demo_data.sql` → Run. Remove só o que é demonstração (vendas reais não são tocadas).
7. Efeitos esperados: dashboard, gráficos mensal/anual, caixa e histórico passam a mostrar dados; os selos "Mais vendido" do site podem refletir as vendas de demonstração dos últimos 30 dias (some ao remover os dados).

---

## 7. Atualizar o repositório e publicar na Vercel

1. Extraia o ZIP. No repositório, **apague as pastas `src`, `scripts`, `supabase` e `docs`** (se existir) e envie as do ZIP **como pastas inteiras**, junto com `package.json` e os arquivos soltos. (Não copie arquivo por arquivo.)
2. Commit. A Vercel publica sozinha. O build roda `scripts/verify-structure.mjs` e lista qualquer arquivo no lugar errado.
3. **Variáveis de ambiente** (Vercel → Settings → Environment Variables): as de sempre (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`). Opcional: `STORE_SLUG` (fixa a loja do site — útil para um deploy dedicado a uma loja).
4. **Várias lojas no mesmo projeto Vercel:** adicione o domínio de cada loja em *Settings → Domains* e cadastre o mesmo domínio na loja: `update public.stores set custom_domain = 'www.lojadamaria.com.br' where slug = 'loja-da-maria';`. Cada domínio mostra só a sua loja.
5. Faça o deploy **logo depois** de rodar os SQLs (item 3 dos cuidados).

---

## 8. Como verificar o isolamento

**A) Verificação estrutural** — `tests/check_multitenant.sql`: tudo `OK` (RLS ligado, `store_id` obrigatório, FKs, triggers, políticas, funções de plataforma bloqueadas).

**B) Teste automático entre duas lojas** — `tests/isolation_test.sql`:
1. Tenha duas lojas com usuário e dados cada (use o item 5 e a demonstração, se quiser).
2. Em *Authentication → Users*, copie o **User UID** de um usuário de cada loja e cole em `ua` e `ub` no topo do script.
3. **Run.** Resultado esperado: `ISOLAMENTO OK`. Se algo vazar, o script falha listando o que foi visto/alterado. O teste **não deixa alterações** no banco.

**C) Teste manual no app:**
1. Logue como administrador da loja A e anote o código de um pedido. Saia.
2. Logue como administrador da loja B: **não aparece nenhum dado da loja A** (pedidos, vendas, caixa, produtos, estoque, dashboard).
3. Cole na barra de endereço o link de um pedido da loja A (`/admin/possiveis-vendas/<id>`) estando logado na B: deve dar **“não encontrado”**.
4. O menu mostra sempre o **nome da loja** do usuário logado.

---

## 9. Segurança: resumo

- **Equipe** só acessa a própria loja. Catálogo (produtos, categorias, fotos, variações) é editável pela equipe; **pedidos, vendas, estoque (movimentos), financeiro e ajustes são somente leitura pela API** — alterações passam pelas funções do banco (que exigem o código de 4 dígitos quando aplicável). Isso também fecha uma brecha antiga: antes, um usuário da equipe poderia alterar tabelas financeiras diretamente.
- **Visitante** (loja virtual) só lê catálogo ativo de lojas ativas e cria pedidos pela função `create_order`, que valida a loja, os produtos, o estoque e os preços no banco.
- **Fotos** (Storage): cada loja escreve só em `<id-da-loja>/...`. Fotos antigas continuam válidas.
- **Plataforma**: `platform_*` só rodam no SQL Editor; recusam chamadas de usuários logados.
- **Loja suspensa**: o painel bloqueia e o site some, sem apagar dados.

## 10. Limitações e próximos passos

- Não há tela no app para o dono da plataforma gerenciar lojas (é por SQL, de propósito: nenhuma loja pode criar outra). Dá para construir um painel “super-admin” numa etapa futura.
- Cada usuário pertence a **uma** loja (para usar em mais de uma, crie outro login).
- Dados de demonstração marcados com `is_demo` aparecem normalmente nos painéis (é a ideia); remova-os antes de uso real, se não quiser que contem.

## 11. Problemas comuns

| Mensagem | Causa / solução |
|---|---|
| `Este script exige PostgreSQL 15 ou superior` | Projeto antigo do Supabase: atualize o Postgres (Settings → Infrastructure) antes. |
| `column "store_id" ... violates not-null constraint` ao inserir manualmente | Tabelas de negócio agora exigem `store_id`. Use as telas do painel ou informe a loja no INSERT. |
| `function public.get_product_badges() does not exist` / checkout falha logo após o SQL | O código antigo ainda está publicado: faça o deploy do novo código. |
| `Acesso negado` no painel | O usuário não tem perfil/loja, ou a loja está suspensa. Use `platform_assign_user` / `platform_set_store_active`. |
| Site mostra “Loja não encontrada” | Há mais de uma loja ativa e o domínio não está cadastrado. Defina `STORE_SLUG` ou o `custom_domain` da loja. |
| Quero desfazer tudo | Restaure o backup feito no item 3. |
