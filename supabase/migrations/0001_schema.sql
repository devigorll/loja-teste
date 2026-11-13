-- =========================================================
-- EXTENSÕES E TIPOS
-- =========================================================
create extension if not exists pgcrypto;

create type app_role            as enum ('admin', 'manager', 'staff');
create type order_status        as enum ('awaiting_confirmation', 'in_progress', 'confirmed', 'completed', 'cancelled');
create type stock_movement_type as enum ('entry', 'exit', 'adjustment', 'sale', 'refund');
create type sale_status         as enum ('completed', 'refunded');
create type transaction_type    as enum ('income', 'refund');

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- USUÁRIOS E PERMISSÕES
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null,
  role       app_role not null default 'staff',
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_active)
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_active and role = 'admin')
$$;

-- DADOS DA LOJA (linha única)
create table public.store_settings (
  id               int primary key default 1 check (id = 1),
  name             text not null default 'Minha Loja',
  logo_url         text,
  description      text,
  phone            text,
  whatsapp         text,
  address          text,
  social_links     jsonb not null default '{}'::jsonb,
  opening_hours    jsonb not null default '{}'::jsonb,
  delivery_info    text,
  pickup_info      text,
  default_theme    text not null default 'light' check (default_theme in ('light','dark','system')),
  updated_at       timestamptz not null default now()
);
create trigger trg_store_settings_updated before update on public.store_settings
  for each row execute function public.set_updated_at();
insert into public.store_settings (id) values (1);

-- CATÁLOGO
create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  position   int  not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.products (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  name        text not null,
  slug        text not null unique,
  description text,
  price       numeric(12,2) not null check (price >= 0),
  promo_price numeric(12,2) check (promo_price >= 0),
  is_active   boolean not null default true,
  is_featured boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint promo_lower_than_price check (promo_price is null or promo_price < price)
);
create trigger trg_products_updated before update on public.products
  for each row execute function public.set_updated_at();
create index idx_products_category on public.products(category_id);
create index idx_products_active_created on public.products(is_active, created_at desc);

create table public.product_images (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  url        text not null,
  alt        text,
  position   int not null default 0
);
create index idx_product_images_product on public.product_images(product_id, position);

create table public.product_variants (
  id                  uuid primary key default gen_random_uuid(),
  product_id          uuid not null references public.products(id) on delete cascade,
  size                text not null,
  color               text not null,
  color_hex           text,
  sku                 text unique,
  price_override      numeric(12,2) check (price_override >= 0),
  stock               int not null default 0 check (stock >= 0),
  low_stock_threshold int not null default 3 check (low_stock_threshold >= 0),
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (product_id, size, color)
);
create trigger trg_variants_updated before update on public.product_variants
  for each row execute function public.set_updated_at();
create index idx_variants_product on public.product_variants(product_id);

create table public.stock_movements (
  id              uuid primary key default gen_random_uuid(),
  variant_id      uuid not null references public.product_variants(id) on delete restrict,
  product_id      uuid not null references public.products(id) on delete restrict,
  type            stock_movement_type not null,
  quantity_before int not null,
  quantity_change int not null,
  quantity_after  int not null,
  reason          text,
  order_id        uuid,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index idx_stock_mov_variant on public.stock_movements(variant_id, created_at desc);

-- FINANCEIRO
create table public.payment_methods (
  id        uuid primary key default gen_random_uuid(),
  name      text not null unique,
  is_active boolean not null default true,
  position  int not null default 0
);
insert into public.payment_methods (name, position) values
  ('Dinheiro', 1), ('Crédito', 2), ('Débito', 3), ('Pix', 4);

-- PEDIDOS (snapshot dos dados do produto)
create sequence public.order_number_seq start 1001;

create table public.orders (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique default ('PED-' || nextval('public.order_number_seq')),
  customer_name  text not null,
  customer_phone text not null,
  notes          text,
  status         order_status not null default 'awaiting_confirmation',
  total          numeric(12,2) not null check (total >= 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  confirmed_at   timestamptz,
  cancelled_at   timestamptz
);
create trigger trg_orders_updated before update on public.orders
  for each row execute function public.set_updated_at();
create index idx_orders_status_created on public.orders(status, created_at desc);

create table public.order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete cascade,
  variant_id   uuid references public.product_variants(id) on delete set null,
  product_name text not null,
  size         text not null,
  color        text not null,
  unit_price   numeric(12,2) not null check (unit_price >= 0),
  quantity     int not null check (quantity > 0),
  subtotal     numeric(12,2) not null check (subtotal >= 0)
);
create index idx_order_items_order on public.order_items(order_id);

alter table public.stock_movements
  add constraint fk_stock_mov_order foreign key (order_id)
  references public.orders(id) on delete set null;

create table public.sales (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null unique references public.orders(id) on delete restrict,
  payment_method_id   uuid references public.payment_methods(id) on delete set null,
  payment_method_name text not null,
  total               numeric(12,2) not null check (total >= 0),
  status              sale_status not null default 'completed',
  sold_by             uuid references public.profiles(id) on delete set null,
  sold_at             timestamptz not null default now(),
  refunded_at         timestamptz,
  refund_reason       text
);
create index idx_sales_sold_at on public.sales(sold_at desc);

create table public.financial_transactions (
  id                uuid primary key default gen_random_uuid(),
  sale_id           uuid references public.sales(id) on delete restrict,
  type              transaction_type not null,
  amount            numeric(12,2) not null,
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  description       text,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now()
);
create index idx_fin_tx_created on public.financial_transactions(created_at desc);

-- RLS
alter table public.profiles       enable row level security;
alter table public.store_settings enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'categories','products','product_images','product_variants','stock_movements',
    'payment_methods','orders','order_items','sales','financial_transactions'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "staff_all_%1$s" on public.%1$I for all to authenticated
       using (public.is_staff()) with check (public.is_staff())', t);
  end loop;
end $$;

create policy "public_read_categories" on public.categories
  for select to anon, authenticated using (is_active);
create policy "public_read_products" on public.products
  for select to anon, authenticated using (is_active);
create policy "public_read_product_images" on public.product_images
  for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.is_active));
create policy "public_read_variants" on public.product_variants
  for select to anon, authenticated
  using (is_active and exists (select 1 from public.products p where p.id = product_id and p.is_active));

create policy "public_read_store_settings" on public.store_settings
  for select to anon, authenticated using (true);
create policy "admin_write_store_settings" on public.store_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "read_own_profile" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "admin_manage_profiles" on public.profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- STORAGE
insert into storage.buckets (id, name, public) values ('media', 'media', true) on conflict (id) do nothing;
create policy "public_read_media" on storage.objects for select using (bucket_id = 'media');
create policy "staff_write_media" on storage.objects for all to authenticated
  using (bucket_id = 'media' and public.is_staff())
  with check (bucket_id = 'media' and public.is_staff());

-- REALTIME
alter publication supabase_realtime add table public.orders;
