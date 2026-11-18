-- =========================================================
-- 0010 — ARQUITETURA MULTI-LOJA (multi-tenant), parte 1: ESTRUTURA, MIGRAÇÃO DOS DADOS E SEGURANÇA (RLS)
--
-- Modelo: UM banco, UM esquema, várias lojas. Cada registro "pertence" a uma loja por store_id (UUID).
--  * stores ........ cadastro das lojas (id UUID, slug, nome, domínio próprio opcional, ativa/suspensa)
--  * Todas as tabelas de negócio ganham store_id NOT NULL -> stores(id)
--  * FKs COMPOSTAS (id, store_id) impedem que um registro aponte para dados de OUTRA loja
--  * RLS: o usuário só enxerga/altera a loja a que pertence (profiles.store_id); o público (anon) só lê o catálogo
--  * Triggers impedem trocar a loja de um registro
--  * Os dados existentes são preservados: viram a primeira loja ("loja legada")
--
-- Exige PostgreSQL 15+ (padrão atual do Supabase). Rode TUDO de uma vez; se algo falhar, nada é aplicado.
-- Faça um BACKUP antes (veja docs/MULTI-LOJA.md).
-- =========================================================
begin;

do $$
begin
  if current_setting('server_version_num')::int < 150000 then
    raise exception 'Este script exige PostgreSQL 15 ou superior.';
  end if;
end $$;

-- ---------------------------------------------------------
-- 1) Lojas
-- ---------------------------------------------------------
create or replace function public.slugify(p text)
returns text language sql immutable as $$
  select coalesce(nullif(trim(both '-' from regexp_replace(lower(translate(coalesce(p, ''), 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn')), '[^a-z0-9]+', '-', 'g')), ''), 'loja')
$$;

create table if not exists public.stores (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name          text not null check (char_length(trim(name)) between 2 and 120),
  custom_domain text unique check (custom_domain is null or custom_domain = lower(custom_domain)),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
drop trigger if exists trg_stores_updated on public.stores;
create trigger trg_stores_updated before update on public.stores
  for each row execute function public.set_updated_at();

-- Contador de pedidos por loja (PED-1001, PED-1002... recomeça em cada loja; ninguém vê o volume das outras)
create table if not exists public.store_counters (
  store_id          uuid primary key references public.stores(id) on delete cascade,
  next_order_number int not null default 1001 check (next_order_number >= 1)
);

-- ---------------------------------------------------------
-- 2) Loja existente (legada) + store_id em todas as tabelas de negócio
-- ---------------------------------------------------------
do $$
declare v_legacy uuid; v_name text; t text;
begin
  if not exists (select 1 from public.stores) then
    select coalesce(nullif(trim(name), ''), 'Minha Loja') into v_name from public.store_settings limit 1;
    v_name := coalesce(v_name, 'Minha Loja');
    insert into public.stores (slug, name) values (public.slugify(v_name), v_name);
  end if;

  select id into v_legacy from public.stores order by created_at, id limit 1;

  foreach t in array array[
    'profiles', 'categories', 'products', 'product_images', 'product_variants', 'stock_movements',
    'payment_methods', 'orders', 'order_items', 'sales', 'financial_transactions', 'sale_adjustments', 'order_events'
  ] loop
    execute format('alter table public.%I add column if not exists store_id uuid', t);
    execute format('alter table public.%I disable trigger user', t);      -- não altera updated_at dos registros existentes
    execute format('update public.%I set store_id = %L where store_id is null', t, v_legacy);
    execute format('alter table public.%I enable trigger user', t);
    execute format('alter table public.%I alter column store_id set not null', t);
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_store_id_fkey');
    execute format('alter table public.%I add constraint %I foreign key (store_id) references public.stores(id) on delete restrict', t, t || '_store_id_fkey');
    execute format('create index if not exists %I on public.%I (store_id)', 'idx_' || t || '_store', t);
  end loop;

  -- store_settings e store_security eram "linha única" (id = 1): passam a ter uma linha POR LOJA
  foreach t in array array['store_settings', 'store_security'] loop
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'id') then
      execute format('alter table public.%I add column if not exists store_id uuid', t);
      execute format('alter table public.%I disable trigger user', t);
      execute format('update public.%I set store_id = %L where store_id is null', t, v_legacy);
      execute format('alter table public.%I enable trigger user', t);
      execute format('alter table public.%I alter column store_id set not null', t);
      execute format('alter table public.%I drop column id', t);          -- remove também a PK e o check (id = 1)
      execute format('alter table public.%I add primary key (store_id)', t);
      execute format('alter table public.%I add constraint %I foreign key (store_id) references public.stores(id) on delete cascade', t, t || '_store_id_fkey');
    end if;
  end loop;
end $$;

-- toda loja tem configurações, segurança (código) e contador de pedidos
insert into public.store_settings (store_id, name)
  select s.id, s.name from public.stores s on conflict (store_id) do nothing;
insert into public.store_security (store_id) select s.id from public.stores s on conflict (store_id) do nothing;
insert into public.store_counters (store_id, next_order_number)
  select s.id,
         greatest(1001, coalesce((select max(substring(o.code from '^PED-(\d+)$')::int) + 1 from public.orders o where o.store_id = s.id), 1001))
    from public.stores s
  on conflict (store_id) do update set next_order_number = greatest(public.store_counters.next_order_number, excluded.next_order_number);

-- ---------------------------------------------------------
-- 3) Funções de identificação da loja do usuário (usadas nas políticas RLS)
-- ---------------------------------------------------------
create or replace function public.current_store_id()
returns uuid language sql stable security definer set search_path = public as $$
  select p.store_id
    from public.profiles p
    join public.stores s on s.id = p.store_id
   where p.id = auth.uid() and p.is_active and s.is_active
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_store_id() is not null
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p join public.stores s on s.id = p.store_id
     where p.id = auth.uid() and p.is_active and p.role = 'admin' and s.is_active)
$$;

create or replace function public.store_is_active(p_store uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.stores where id = p_store and is_active)
$$;

grant execute on function public.current_store_id(), public.is_staff(), public.is_admin() to authenticated;
grant execute on function public.store_is_active(uuid) to anon, authenticated;

-- ---------------------------------------------------------
-- 4) Unicidades POR LOJA e chaves-pai (id, store_id) para as FKs compostas
-- ---------------------------------------------------------
do $$
declare r record;
begin
  -- remove as unicidades globais antigas (slug, sku, nome, código do pedido)
  for r in
    select c.conrelid::regclass as tbl, c.conname
      from pg_constraint c
      join (values ('public.categories'::regclass, 'slug'), ('public.products'::regclass, 'slug'),
                   ('public.product_variants'::regclass, 'sku'), ('public.payment_methods'::regclass, 'name'),
                   ('public.orders'::regclass, 'code')) as t(tbl, col) on c.conrelid = t.tbl
      join pg_attribute a on a.attrelid = c.conrelid and a.attname = t.col
     where c.contype = 'u' and c.conkey = array[a.attnum]
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;

  -- remove as FKs simples que serão substituídas por FKs compostas
  for r in
    select c.conrelid::regclass as tbl, c.conname
      from pg_constraint c
      join (values
        ('public.products'::regclass, 'category_id'), ('public.product_images'::regclass, 'product_id'),
        ('public.product_variants'::regclass, 'product_id'),
        ('public.stock_movements'::regclass, 'variant_id'), ('public.stock_movements'::regclass, 'product_id'),
        ('public.stock_movements'::regclass, 'order_id'),
        ('public.order_items'::regclass, 'order_id'), ('public.order_items'::regclass, 'variant_id'),
        ('public.sales'::regclass, 'order_id'), ('public.sales'::regclass, 'payment_method_id'),
        ('public.financial_transactions'::regclass, 'sale_id'), ('public.financial_transactions'::regclass, 'payment_method_id'),
        ('public.financial_transactions'::regclass, 'adjustment_id'),
        ('public.sale_adjustments'::regclass, 'sale_id'), ('public.order_events'::regclass, 'order_id')
      ) as t(tbl, col) on c.conrelid = t.tbl
      join pg_attribute a on a.attrelid = c.conrelid and a.attname = t.col
     where c.contype = 'f' and c.conkey = array[a.attnum]
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

alter table public.categories       add constraint categories_store_slug_key unique (store_id, slug);
alter table public.products         add constraint products_store_slug_key unique (store_id, slug);
alter table public.product_variants add constraint variants_store_sku_key unique (store_id, sku);
alter table public.payment_methods  add constraint payment_methods_store_name_key unique (store_id, name);
alter table public.orders           add constraint orders_store_code_key unique (store_id, code);

alter table public.categories        add constraint categories_id_store_key unique (id, store_id);
alter table public.products          add constraint products_id_store_key unique (id, store_id);
alter table public.product_variants  add constraint variants_id_store_key unique (id, store_id);
alter table public.payment_methods   add constraint payment_methods_id_store_key unique (id, store_id);
alter table public.orders            add constraint orders_id_store_key unique (id, store_id);
alter table public.sales             add constraint sales_id_store_key unique (id, store_id);
alter table public.sale_adjustments  add constraint sale_adjustments_id_store_key unique (id, store_id);

-- ---------------------------------------------------------
-- 5) FKs COMPOSTAS: um registro só pode apontar para dados da MESMA loja
-- ---------------------------------------------------------
alter table public.products add constraint fk_products_category
  foreign key (category_id, store_id) references public.categories(id, store_id) on delete set null (category_id);
alter table public.product_images add constraint fk_product_images_product
  foreign key (product_id, store_id) references public.products(id, store_id) on delete cascade;
alter table public.product_variants add constraint fk_variants_product
  foreign key (product_id, store_id) references public.products(id, store_id) on delete cascade;
alter table public.stock_movements add constraint fk_stock_mov_variant
  foreign key (variant_id, store_id) references public.product_variants(id, store_id) on delete restrict;
alter table public.stock_movements add constraint fk_stock_mov_product
  foreign key (product_id, store_id) references public.products(id, store_id) on delete restrict;
alter table public.stock_movements add constraint fk_stock_mov_order
  foreign key (order_id, store_id) references public.orders(id, store_id) on delete set null (order_id);
alter table public.order_items add constraint fk_order_items_order
  foreign key (order_id, store_id) references public.orders(id, store_id) on delete cascade;
alter table public.order_items add constraint fk_order_items_variant
  foreign key (variant_id, store_id) references public.product_variants(id, store_id) on delete set null (variant_id);
alter table public.sales add constraint fk_sales_order
  foreign key (order_id, store_id) references public.orders(id, store_id) on delete restrict;
alter table public.sales add constraint fk_sales_payment_method
  foreign key (payment_method_id, store_id) references public.payment_methods(id, store_id) on delete set null (payment_method_id);
alter table public.sale_adjustments add constraint fk_sale_adjustments_sale
  foreign key (sale_id, store_id) references public.sales(id, store_id) on delete restrict;
alter table public.financial_transactions add constraint fk_fin_tx_sale
  foreign key (sale_id, store_id) references public.sales(id, store_id) on delete restrict;
alter table public.financial_transactions add constraint fk_fin_tx_payment_method
  foreign key (payment_method_id, store_id) references public.payment_methods(id, store_id) on delete set null (payment_method_id);
alter table public.financial_transactions add constraint fk_fin_tx_adjustment
  foreign key (adjustment_id, store_id) references public.sale_adjustments(id, store_id) on delete restrict;
alter table public.order_events add constraint fk_order_events_order
  foreign key (order_id, store_id) references public.orders(id, store_id) on delete cascade;

-- ---------------------------------------------------------
-- 6) Numeração de pedidos por loja + marca de dados de demonstração
-- ---------------------------------------------------------
alter table public.orders alter column code drop default;
drop sequence if exists public.order_number_seq;
alter table public.orders add column if not exists is_demo boolean not null default false;

create or replace function public.orders_assign_code()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if new.code is null or new.code = '' then
    update public.store_counters set next_order_number = next_order_number + 1
     where store_id = new.store_id
    returning next_order_number - 1 into n;
    if n is null then raise exception 'Loja sem contador de pedidos.'; end if;
    new.code := 'PED-' || n;
  end if;
  return new;
end $$;
drop trigger if exists trg_orders_code on public.orders;
create trigger trg_orders_code before insert on public.orders
  for each row execute function public.orders_assign_code();

-- ---------------------------------------------------------
-- 7) A loja é preenchida sozinha com a loja do usuário logado e NUNCA pode ser trocada
-- ---------------------------------------------------------
create or replace function public.prevent_store_change()
returns trigger language plpgsql as $$
begin
  -- Pedidos de usuários (com login/API) nunca mudam a loja. Manutenção pelo SQL Editor (sem JWT) pode.
  if new.store_id is distinct from old.store_id and auth.uid() is not null then
    raise exception 'A loja de um registro não pode ser alterada.';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'categories', 'products', 'product_images', 'product_variants', 'stock_movements',
    'payment_methods', 'orders', 'order_items', 'sales', 'financial_transactions', 'sale_adjustments', 'order_events',
    'store_settings', 'store_security'
  ] loop
    execute format('drop trigger if exists trg_%s_keep_store on public.%I', t, t);
    execute format('create trigger trg_%s_keep_store before update on public.%I for each row execute function public.prevent_store_change()', t, t);
  end loop;

  foreach t in array array[
    'categories', 'products', 'product_images', 'product_variants', 'stock_movements',
    'payment_methods', 'orders', 'order_items', 'sales', 'financial_transactions', 'sale_adjustments', 'order_events'
  ] loop
    execute format('alter table public.%I alter column store_id set default public.current_store_id()', t);
  end loop;
end $$;

-- ---------------------------------------------------------
-- 8) RLS: isolamento entre lojas
-- ---------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname from pg_policies
     where schemaname = 'public' and tablename in (
       'profiles', 'store_settings', 'store_security', 'store_counters', 'stores', 'categories', 'products',
       'product_images', 'product_variants', 'stock_movements', 'payment_methods', 'orders', 'order_items',
       'sales', 'financial_transactions', 'sale_adjustments', 'order_events')
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

alter table public.stores                 enable row level security;
alter table public.store_counters         enable row level security;
alter table public.store_security         enable row level security;
alter table public.store_settings         enable row level security;
alter table public.profiles               enable row level security;

-- Sem políticas = ninguém acessa direto (só as funções do banco): contador de pedidos e código de autorização
revoke all on public.store_counters, public.store_security from anon, authenticated;

-- Equipe: catálogo (cadastro/edição pelo painel) — somente da própria loja
do $$
declare t text;
begin
  foreach t in array array['categories', 'products', 'product_images', 'product_variants'] loop
    execute format($f$create policy %I on public.%I for all to authenticated
      using (store_id = (select public.current_store_id()))
      with check (store_id = (select public.current_store_id()))$f$, 'tenant_staff_' || t, t);
  end loop;

  -- Equipe: dados financeiros e de pedidos são SOMENTE LEITURA pela API; as alterações passam pelas
  -- funções do banco (que exigem o código de 4 dígitos quando necessário).
  foreach t in array array['stock_movements', 'payment_methods', 'orders', 'order_items', 'sales',
                           'financial_transactions', 'sale_adjustments', 'order_events'] loop
    execute format($f$create policy %I on public.%I for select to authenticated
      using (store_id = (select public.current_store_id()))$f$, 'tenant_staff_read_' || t, t);
  end loop;
end $$;

-- Público (visitantes): lê somente o catálogo ATIVO de lojas ATIVAS
create policy public_read_categories on public.categories for select to anon
  using (is_active and public.store_is_active(store_id));
create policy public_read_products on public.products for select to anon
  using (is_active and public.store_is_active(store_id));
create policy public_read_product_images on public.product_images for select to anon
  using (public.store_is_active(store_id)
         and exists (select 1 from public.products p where p.id = product_images.product_id and p.is_active));
create policy public_read_variants on public.product_variants for select to anon
  using (is_active and public.store_is_active(store_id)
         and exists (select 1 from public.products p where p.id = product_variants.product_id and p.is_active));

-- Configurações da loja
create policy public_read_store_settings on public.store_settings for select to anon
  using (public.store_is_active(store_id));
create policy tenant_staff_read_store_settings on public.store_settings for select to authenticated
  using (store_id = (select public.current_store_id()));
create policy tenant_admin_update_store_settings on public.store_settings for update to authenticated
  using (store_id = (select public.current_store_id()) and (select public.is_admin()))
  with check (store_id = (select public.current_store_id()) and (select public.is_admin()));

-- Usuários: cada um lê o próprio perfil; administrador gerencia os perfis da PRÓPRIA loja
create policy read_own_or_store_profiles on public.profiles for select to authenticated
  using (id = auth.uid() or (store_id = (select public.current_store_id()) and (select public.is_admin())));
create policy admin_manage_store_profiles on public.profiles for all to authenticated
  using ((select public.is_admin()) and store_id = (select public.current_store_id()))
  with check ((select public.is_admin()) and store_id = (select public.current_store_id()));

-- Lojas: o usuário só vê a sua (inclusive se estiver suspensa, para exibir o aviso)
create policy staff_read_own_store on public.stores for select to authenticated
  using (id in (select p.store_id from public.profiles p where p.id = auth.uid()));

-- ---------------------------------------------------------
-- 9) Fotos (Storage): cada loja escreve só na própria pasta (<store_id>/...). Fotos antigas (products/<id>/...) continuam
--    válidas e só podem ser alteradas pela loja dona do produto.
-- ---------------------------------------------------------
drop policy if exists "public_read_media" on storage.objects;
drop policy if exists "staff_write_media" on storage.objects;
drop policy if exists "tenant_staff_write_media" on storage.objects;
create policy "public_read_media" on storage.objects for select using (bucket_id = 'media');
create policy "tenant_staff_write_media" on storage.objects for all to authenticated
  using (bucket_id = 'media' and public.is_staff() and (
           (storage.foldername(name))[1] = public.current_store_id()::text
           or ((storage.foldername(name))[1] = 'products' and exists (
                 select 1 from public.products p
                  where p.id::text = (storage.foldername(name))[2] and p.store_id = public.current_store_id()))))
  with check (bucket_id = 'media' and public.is_staff() and (storage.foldername(name))[1] = public.current_store_id()::text);

commit;
