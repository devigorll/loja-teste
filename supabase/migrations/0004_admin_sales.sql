-- =========================================================
-- Etapa 6: edição de pedidos, código de autorização e confirmação de venda
-- =========================================================
create extension if not exists pgcrypto with schema extensions;

-- Pedido editado pelo painel passa a exigir o código também na confirmação
alter table public.orders add column if not exists was_edited boolean not null default false;

-- Formas de pagamento: PIX, crédito e débito
update public.payment_methods set name = 'PIX'                where name = 'Pix';
update public.payment_methods set name = 'Cartão de crédito'  where name = 'Crédito';
update public.payment_methods set name = 'Cartão de débito'   where name = 'Débito';
update public.payment_methods set is_active = false           where name = 'Dinheiro';

-- Código de 4 dígitos da loja (só o hash é guardado). Sem políticas RLS = ninguém lê direto.
create table if not exists public.store_security (
  id              int primary key default 1 check (id = 1),
  pin_hash        text,
  pin_updated_at  timestamptz,
  failed_attempts int not null default 0,
  locked_until    timestamptz
);
insert into public.store_security (id) values (1) on conflict do nothing;
alter table public.store_security enable row level security;

-- Auditoria dos pedidos
create table if not exists public.order_events (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders(id) on delete cascade,
  type       text not null,
  details    jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_order_events_order on public.order_events(order_id, created_at desc);
alter table public.order_events enable row level security;
create policy "staff_read_order_events" on public.order_events
  for select to authenticated using (public.is_staff());

-- ---------------------------------------------------------
-- Verificação do código (uso interno). Retorna NULL se correto, ou a mensagem de erro.
-- Tentativas erradas ficam gravadas porque as funções chamadoras retornam (não lançam erro).
-- ---------------------------------------------------------
create or replace function public.check_store_pin(p_pin text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare s public.store_security%rowtype;
begin
  select * into s from public.store_security where id = 1 for update;

  if s.pin_hash is null then
    return 'O código de autorização ainda não foi definido. O administrador deve criá-lo em Segurança.';
  end if;
  if s.locked_until is not null and s.locked_until > now() then
    return 'Muitas tentativas incorretas. Tente novamente em '
           || ceil(extract(epoch from (s.locked_until - now())) / 60)::int || ' minuto(s).';
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{4}$' or s.pin_hash <> crypt(p_pin, s.pin_hash) then
    update public.store_security set
      failed_attempts = case when failed_attempts + 1 >= 5 then 0 else failed_attempts + 1 end,
      locked_until    = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else locked_until end
    where id = 1;
    return 'Código incorreto.';
  end if;

  update public.store_security set failed_attempts = 0, locked_until = null where id = 1;
  return null;
end $$;
revoke all on function public.check_store_pin(text) from public, anon, authenticated;

-- ---------------------------------------------------------
-- Estado do código (para a tela de Segurança)
-- ---------------------------------------------------------
create or replace function public.pin_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('is_set', pin_hash is not null, 'updated_at', pin_updated_at)
  from public.store_security where id = 1 and public.is_staff()
$$;
revoke all on function public.pin_status() from public, anon;
grant execute on function public.pin_status() to authenticated;

-- ---------------------------------------------------------
-- Definir / trocar o código (somente administrador)
-- ---------------------------------------------------------
create or replace function public.set_store_pin(p_new text, p_current text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare h text; err text;
begin
  if not public.is_admin() then raise exception 'Apenas administradores podem alterar o código.'; end if;
  if p_new is null or p_new !~ '^[0-9]{4}$' then raise exception 'O código deve ter exatamente 4 dígitos.'; end if;
  if p_new ~ '^(.)\1{3}$' or p_new in ('1234', '4321', '0123') then
    raise exception 'Escolha um código menos óbvio (evite 1111, 1234 etc.).';
  end if;

  select pin_hash into h from public.store_security where id = 1;
  if h is not null then
    err := public.check_store_pin(p_current);
    if err is not null then return jsonb_build_object('ok', false, 'error', err); end if;
  end if;

  update public.store_security
     set pin_hash = crypt(p_new, gen_salt('bf', 10)), pin_updated_at = now(),
         failed_attempts = 0, locked_until = null
   where id = 1;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.set_store_pin(text, text) from public, anon;
grant execute on function public.set_store_pin(text, text) to authenticated;

-- ---------------------------------------------------------
-- Salvar alterações dos itens do pedido (sempre exige o código)
-- p_items: [{item_id?, variant_id?, quantity, unit_price}]
--   item_id  = linha existente (altera quantidade/preço)
--   variant_id = linha nova
--   linhas existentes que não vierem na lista são removidas
-- ---------------------------------------------------------
create or replace function public.update_order_items(p_order_id uuid, p_items jsonb, p_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  err text; o public.orders%rowtype; x record; v record;
  keep uuid[] := '{}'; new_id uuid; v_total numeric(12,2);
begin
  if not public.is_staff() then raise exception 'Acesso negado.'; end if;

  err := public.check_store_pin(p_pin);
  if err is not null then return jsonb_build_object('ok', false, 'error', err); end if;

  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if o.status not in ('awaiting_confirmation', 'in_progress') then
    raise exception 'Este pedido não pode mais ser editado.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'O pedido precisa ter de 1 a 50 itens.';
  end if;

  for x in
    select * from jsonb_to_recordset(p_items) as t(item_id uuid, variant_id uuid, quantity int, unit_price numeric)
  loop
    if x.quantity is null or x.quantity < 1 or x.quantity > 999 then raise exception 'Quantidade inválida.'; end if;
    if x.unit_price is null or x.unit_price < 0 or x.unit_price > 1000000 then raise exception 'Preço inválido.'; end if;

    if x.item_id is not null then
      update public.order_items
         set quantity = x.quantity, unit_price = round(x.unit_price, 2),
             subtotal = round(x.unit_price, 2) * x.quantity
       where id = x.item_id and order_id = p_order_id;
      if not found then raise exception 'Item do pedido não encontrado.'; end if;
      keep := keep || x.item_id;
    else
      select pv.size, pv.color, p.name into v
        from public.product_variants pv join public.products p on p.id = pv.product_id
       where pv.id = x.variant_id;
      if not found then raise exception 'Produto não encontrado.'; end if;

      insert into public.order_items (order_id, variant_id, product_name, size, color, unit_price, quantity, subtotal)
      values (p_order_id, x.variant_id, v.name, v.size, v.color,
              round(x.unit_price, 2), x.quantity, round(x.unit_price, 2) * x.quantity)
      returning id into new_id;
      keep := keep || new_id;
    end if;
  end loop;

  delete from public.order_items where order_id = p_order_id and id <> all (keep);

  select coalesce(sum(subtotal), 0) into v_total from public.order_items where order_id = p_order_id;
  update public.orders set total = v_total, was_edited = true where id = p_order_id;

  insert into public.order_events (order_id, type, details, created_by)
  values (p_order_id, 'items_updated', jsonb_build_object('total', v_total, 'lines', jsonb_array_length(p_items)), auth.uid());

  return jsonb_build_object('ok', true, 'total', v_total);
end $$;
revoke all on function public.update_order_items(uuid, jsonb, text) from public, anon;
grant execute on function public.update_order_items(uuid, jsonb, text) to authenticated;

-- ---------------------------------------------------------
-- Confirmar venda: transação única (estoque, movimentação, venda e caixa)
-- O código só é exigido se o pedido foi editado.
-- ---------------------------------------------------------
create or replace function public.confirm_sale(p_order_id uuid, p_payment_method_id uuid, p_pin text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  o public.orders%rowtype; pm public.payment_methods%rowtype; err text;
  r record; v record; v_total numeric(12,2); v_sale uuid; v_lines int;
begin
  if not public.is_staff() then raise exception 'Acesso negado.'; end if;

  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;

  if o.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'error', 'Este pedido foi cancelado.');
  end if;
  if o.status in ('confirmed', 'completed') or exists (select 1 from public.sales where order_id = p_order_id) then
    return jsonb_build_object('ok', false, 'error', 'Este pedido já foi confirmado.');
  end if;

  if o.was_edited then
    err := public.check_store_pin(p_pin);
    if err is not null then return jsonb_build_object('ok', false, 'error', err); end if;
  end if;

  select * into pm from public.payment_methods where id = p_payment_method_id and is_active;
  if not found then raise exception 'Forma de pagamento inválida.'; end if;

  select count(*) into v_lines from public.order_items where order_id = p_order_id;
  if v_lines = 0 then raise exception 'O pedido não tem itens.'; end if;

  for r in
    select oi.variant_id, sum(oi.quantity)::int as qty, min(oi.product_name) as name
      from public.order_items oi where oi.order_id = p_order_id
     group by oi.variant_id order by oi.variant_id
  loop
    if r.variant_id is null then
      raise exception 'O item "%" não existe mais no catálogo. Remova-o do pedido antes de confirmar.', r.name;
    end if;

    select pv.stock, pv.product_id into v
      from public.product_variants pv where pv.id = r.variant_id for update;

    if not found or v.stock < r.qty then
      raise exception 'Estoque insuficiente para "%": disponível %, pedido %.', r.name, coalesce(v.stock, 0), r.qty;
    end if;

    update public.product_variants set stock = stock - r.qty where id = r.variant_id;

    insert into public.stock_movements
      (variant_id, product_id, type, quantity_before, quantity_change, quantity_after, reason, order_id, created_by)
    values (r.variant_id, v.product_id, 'sale', v.stock, -r.qty, v.stock - r.qty, 'Venda ' || o.code, o.id, auth.uid());
  end loop;

  select coalesce(sum(subtotal), 0) into v_total from public.order_items where order_id = p_order_id;
  update public.orders set status = 'completed', total = v_total, confirmed_at = now() where id = o.id;

  insert into public.sales (order_id, payment_method_id, payment_method_name, total, sold_by)
  values (o.id, pm.id, pm.name, v_total, auth.uid()) returning id into v_sale;

  insert into public.financial_transactions (sale_id, type, amount, payment_method_id, description, created_by)
  values (v_sale, 'income', v_total, pm.id, 'Venda ' || o.code, auth.uid());

  insert into public.order_events (order_id, type, details, created_by)
  values (o.id, 'sale_confirmed', jsonb_build_object('sale_id', v_sale, 'total', v_total, 'payment', pm.name), auth.uid());

  return jsonb_build_object('ok', true, 'sale_id', v_sale, 'total', v_total);
end $$;
revoke all on function public.confirm_sale(uuid, uuid, text) from public, anon;
grant execute on function public.confirm_sale(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------
-- Cancelar possível venda (não mexe em estoque nem em caixa)
-- ---------------------------------------------------------
create or replace function public.cancel_order(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders%rowtype;
begin
  if not public.is_staff() then raise exception 'Acesso negado.'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if o.status not in ('awaiting_confirmation', 'in_progress') then
    raise exception 'Só é possível cancelar pedidos que ainda não foram confirmados.';
  end if;
  update public.orders set status = 'cancelled', cancelled_at = now() where id = p_order_id;
  insert into public.order_events (order_id, type, created_by) values (p_order_id, 'cancelled', auth.uid());
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.cancel_order(uuid) from public, anon;
grant execute on function public.cancel_order(uuid) to authenticated;
