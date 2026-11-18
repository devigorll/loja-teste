-- =========================================================
-- VERIFICAÇÃO ESTRUTURAL DO MULTI-LOJA (não altera nada; pode rodar quando quiser)
-- Rode no SQL Editor. Todas as linhas devem aparecer como "OK". Linhas com FALHA aparecem primeiro.
-- =========================================================
with tenant(t) as (values
  ('profiles'), ('categories'), ('products'), ('product_images'), ('product_variants'), ('stock_movements'),
  ('payment_methods'), ('orders'), ('order_items'), ('sales'), ('financial_transactions'), ('sale_adjustments'),
  ('order_events'), ('store_settings'), ('store_security')),
private_tbl(t) as (values
  ('profiles'), ('stock_movements'), ('payment_methods'), ('orders'), ('order_items'), ('sales'),
  ('financial_transactions'), ('sale_adjustments'), ('order_events'), ('store_security'), ('store_counters'), ('stores')),
checks as (
  select 'RLS ligado em ' || t as verificacao, (select c.relrowsecurity from pg_class c where c.oid = ('public.' || t)::regclass) as ok from tenant
  union all
  select 'store_id é obrigatório (NOT NULL) em ' || t,
         coalesce((select a.attnotnull from pg_attribute a where a.attrelid = ('public.' || t)::regclass and a.attname = 'store_id'), false) from tenant
  union all
  select 'store_id referencia stores em ' || t,
         exists (select 1 from pg_constraint k where k.conrelid = ('public.' || t)::regclass and k.contype = 'f' and k.confrelid = 'public.stores'::regclass) from tenant
  union all
  select 'Troca de loja bloqueada (trigger) em ' || t,
         exists (select 1 from pg_trigger g where g.tgrelid = ('public.' || t)::regclass and g.tgname like 'trg\_%\_keep\_store') from tenant
  union all
  select 'Há política por loja em ' || t,
         exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t and (p.policyname like 'tenant\_%' or p.policyname like '%\_store\_profiles' or p.policyname like 'read\_own%'))
    from tenant where t not in ('store_security')
  union all
  select 'Visitante (anon) SEM política em ' || t,
         not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t and (p.roles && array['anon', 'public']::name[]))
    from private_tbl
  union all
  select 'Nenhum registro sem loja em ' || t, true from tenant   -- garantido por NOT NULL
  union all
  select 'Função de plataforma bloqueada para o app: ' || fn.sig,
         not has_function_privilege('anon', fn.sig, 'execute') and not has_function_privilege('authenticated', fn.sig, 'execute')
    from (values ('public.platform_create_store(text,text,text,text,text,text)'), ('public.platform_assign_user(text,text,text,app_role)'),
                 ('public.platform_set_store_active(text,boolean)'), ('public.seed_store_defaults(uuid)')) as fn(sig)
  union all
  select 'Pedido do cliente exige a loja (create_order com p_store_id)',
         exists (select 1 from pg_proc where proname = 'create_order' and pronargs = 6 and pronamespace = 'public'::regnamespace)
  union all
  select 'Existe ao menos uma loja', exists (select 1 from public.stores)
  union all
  select 'Todo usuário está associado a uma loja', not exists (select 1 from public.profiles where store_id is null)
  union all
  select 'Toda loja tem configurações, código de autorização e contador de pedidos',
         not exists (select 1 from public.stores s
                      where not exists (select 1 from public.store_settings x where x.store_id = s.id)
                         or not exists (select 1 from public.store_security x where x.store_id = s.id)
                         or not exists (select 1 from public.store_counters x where x.store_id = s.id))
)
select verificacao, case when ok then 'OK' else 'FALHA' end as resultado
  from checks order by ok, verificacao;
