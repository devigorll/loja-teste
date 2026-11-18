-- =========================================================
-- 0011 — ARQUITETURA MULTI-LOJA, parte 2: FUNÇÕES DO BANCO
--
-- Todas as funções do painel passam a enxergar SOMENTE a loja do usuário logado (current_store_id()).
-- As funções públicas (loja virtual) recebem a loja explicitamente e validam que ela está ativa.
-- Funções SECURITY DEFINER ignoram o RLS, por isso cada consulta está filtrada por loja aqui dentro.
-- Rode depois do 0010.
-- =========================================================
begin;

-- Funções com assinatura nova: remove as antigas para não haver duas versões
drop function if exists public.create_order(text, text, text, jsonb, uuid);
drop function if exists public.get_product_badges();

-- ---------------------------------------------------------
-- Resolve qual loja o site público deve mostrar (por slug fixo, domínio próprio, ou a única loja ativa)
-- ---------------------------------------------------------
create or replace function public.resolve_store(p_slug text, p_host text)
returns table (store_id uuid, store_slug text, store_name text)
language plpgsql stable security definer set search_path = public as $$
declare v_host text := lower(trim(coalesce(p_host, '')));
begin
  if nullif(trim(coalesce(p_slug, '')), '') is not null then
    return query
      select s.id, s.slug, coalesce(ss.name, s.name)
        from public.stores s left join public.store_settings ss on ss.store_id = s.id
       where s.is_active and s.slug = lower(trim(p_slug)) limit 1;
    return;
  end if;

  if v_host <> '' then
    return query
      select s.id, s.slug, coalesce(ss.name, s.name)
        from public.stores s left join public.store_settings ss on ss.store_id = s.id
       where s.is_active and s.custom_domain = v_host limit 1;
    if found then return; end if;
  end if;

  -- Sem slug nem domínio: se existir uma única loja ativa, é ela (mantém o comportamento de loja única)
  if (select count(*) from public.stores where is_active) = 1 then
    return query
      select s.id, s.slug, coalesce(ss.name, s.name)
        from public.stores s left join public.store_settings ss on ss.store_id = s.id
       where s.is_active limit 1;
  end if;
end $$;
revoke all on function public.resolve_store(text, text) from public;
grant execute on function public.resolve_store(text, text) to anon, authenticated;

-- ---------------------------------------------------------
-- Pedido feito pelo cliente na loja virtual (público): a loja vem do site e é validada aqui
-- ---------------------------------------------------------
create or replace function public.create_order(
  p_store_id        uuid,
  p_customer_name   text,
  p_customer_phone  text,
  p_notes           text,
  p_items           jsonb,
  p_idempotency_key uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
  r record;
  v record;
  v_total numeric(12,2) := 0;
begin
  if p_store_id is null or not public.store_is_active(p_store_id) then
    raise exception 'Loja não encontrada.';
  end if;
  if p_idempotency_key is null then
    raise exception 'Requisição inválida.';
  end if;
  if char_length(trim(coalesce(p_customer_name, ''))) < 2 or char_length(coalesce(p_customer_name, '')) > 80 then
    raise exception 'Informe seu nome (de 2 a 80 caracteres).';
  end if;
  if (case when jsonb_typeof(p_items) = 'array' then jsonb_array_length(p_items) else 0 end) not between 1 and 30 then
    raise exception 'Seu carrinho está vazio ou inválido.';
  end if;

  insert into public.orders (store_id, customer_name, customer_phone, notes, total, idempotency_key)
  values (
    p_store_id,
    trim(p_customer_name),
    nullif(left(trim(coalesce(p_customer_phone, '')), 30), ''),
    nullif(left(trim(coalesce(p_notes, '')), 500), ''),
    0, p_idempotency_key)
  on conflict (idempotency_key) do nothing
  returning * into v_order;

  -- Mesmo pedido enviado duas vezes: devolve o que já existe (somente se for desta loja)
  if v_order.id is null then
    select * into v_order from public.orders where idempotency_key = p_idempotency_key and store_id = p_store_id;
    if v_order.id is null then raise exception 'Requisição inválida.'; end if;
    return public.order_json(v_order.id);
  end if;

  for r in
    select x.variant_id, sum(x.quantity)::int as qty
    from jsonb_to_recordset(p_items) as x(variant_id uuid, quantity int)
    group by x.variant_id
  loop
    if r.qty is null or r.qty < 1 or r.qty > 99 then
      raise exception 'Quantidade inválida.';
    end if;

    select pv.size, pv.color, pv.stock, p.name,
           coalesce(pv.price_override, p.promo_price, p.price) as unit_price
      into v
      from public.product_variants pv
      join public.products p on p.id = pv.product_id
     where pv.id = r.variant_id and pv.store_id = p_store_id and pv.is_active and p.is_active;

    if not found then
      raise exception 'Um dos produtos do carrinho não está mais disponível.';
    end if;
    if v.stock < r.qty then
      raise exception 'Estoque insuficiente: % (% / %) tem apenas % unidade(s).', v.name, v.size, v.color, v.stock;
    end if;

    insert into public.order_items (store_id, order_id, variant_id, product_name, size, color, unit_price, quantity, subtotal)
    values (p_store_id, v_order.id, r.variant_id, v.name, v.size, v.color, v.unit_price, r.qty, v.unit_price * r.qty);

    v_total := v_total + v.unit_price * r.qty;
  end loop;

  update public.orders set total = v_total where id = v_order.id;
  return public.order_json(v_order.id);
end $$;
revoke all on function public.create_order(uuid, text, text, text, jsonb, uuid) from public;
grant execute on function public.create_order(uuid, text, text, text, jsonb, uuid) to anon, authenticated;

-- ---------------------------------------------------------
-- Selos efetivos de uma loja (público)
-- ---------------------------------------------------------
create or replace function public.get_product_badges(p_store_id uuid)
returns table (product_id uuid, badge text)
language sql stable security definer set search_path = public as $$
  with cfg as (
    select new_badge_days as d, bestseller_top_n as n, bestseller_min_units as m, bestseller_window_days as w
      from public.store_settings where store_id = p_store_id
  ),
  sold as (
    select pv.product_id as pid, sum(oi.quantity)::int as units
      from public.sales s
      join public.order_items oi on oi.order_id = s.order_id
      join public.product_variants pv on pv.id = oi.variant_id
      cross join cfg
     where s.store_id = p_store_id and s.status = 'completed'
       and s.sold_at >= now() - make_interval(days => cfg.w)
     group by pv.product_id
  ),
  ranked as (
    select sold.pid, sold.units, row_number() over (order by sold.units desc, sold.pid) as rn from sold
  )
  select p.id as product_id,
         case
           when p.badge_override = 'none' then null
           when p.badge_override is not null then p.badge_override
           when exists (select 1 from ranked r cross join cfg where r.pid = p.id and r.rn <= cfg.n and r.units >= cfg.m) then 'bestseller'
           when p.created_at >= now() - make_interval(days => (select d from cfg)) then 'new'
           else null
         end as badge
    from public.products p
   where p.store_id = p_store_id and p.is_active and public.store_is_active(p_store_id);
$$;
revoke all on function public.get_product_badges(uuid) from public;
grant execute on function public.get_product_badges(uuid) to anon, authenticated;

-- Código de 4 dígitos: um por loja
create or replace function public.check_store_pin(p_pin text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare s public.store_security%rowtype; v_store uuid := public.current_store_id();
begin
  if v_store is null then return 'Acesso negado.'; end if;
  select * into s from public.store_security where store_id = v_store for update;

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
    where store_id = v_store;
    return 'Código incorreto.';
  end if;

  update public.store_security set failed_attempts = 0, locked_until = null where store_id = v_store;
  return null;
end $$;
revoke all on function public.check_store_pin(text) from public, anon, authenticated;

create or replace function public.pin_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('is_set', pin_hash is not null, 'updated_at', pin_updated_at)
  from public.store_security where store_id = public.current_store_id()
$$;
revoke all on function public.pin_status() from public, anon;
grant execute on function public.pin_status() to authenticated;

create or replace function public.set_store_pin(p_new text, p_current text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare h text; err text;
begin
  if not public.is_admin() then raise exception 'Apenas administradores podem alterar o código.'; end if;
  if p_new is null or p_new !~ '^[0-9]{4}$' then raise exception 'O código deve ter exatamente 4 dígitos.'; end if;
  if p_new ~ '^(.)\1{3}$' or p_new in ('1234', '4321', '0123') then
    raise exception 'Escolha um código menos óbvio (evite 1111, 1234 etc.).';
  end if;

  select pin_hash into h from public.store_security where store_id = public.current_store_id();
  if h is not null then
    err := public.check_store_pin(p_current);
    if err is not null then return jsonb_build_object('ok', false, 'error', err); end if;
  end if;

  update public.store_security
     set pin_hash = crypt(p_new, gen_salt('bf', 10)), pin_updated_at = now(),
         failed_attempts = 0, locked_until = null
   where store_id = public.current_store_id();
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.set_store_pin(text, text) from public, anon;
grant execute on function public.set_store_pin(text, text) to authenticated;

-- Pedidos
create or replace function public.update_order_items(p_order_id uuid, p_items jsonb, p_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_store uuid;
  err text; o public.orders%rowtype; x record; v record;
  keep uuid[] := '{}'; new_id uuid; v_total numeric(12,2);
begin
  v_store := public.current_store_id();
  if v_store is null then raise exception 'Acesso negado.'; end if;

  err := public.check_store_pin(p_pin);
  if err is not null then return jsonb_build_object('ok', false, 'error', err); end if;

  select * into o from public.orders where id = p_order_id and store_id = v_store for update;
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
       where pv.id = x.variant_id and pv.store_id = v_store;
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

create or replace function public.cancel_order(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_store uuid; o public.orders%rowtype;
begin
  v_store := public.current_store_id();
  if v_store is null then raise exception 'Acesso negado.'; end if;
  select * into o from public.orders where id = p_order_id and store_id = v_store for update;
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

create or replace function public.admin_create_order(
  p_customer_name   text,
  p_customer_phone  text,
  p_notes           text,
  p_items           jsonb,
  p_pin             text,
  p_idempotency_key uuid
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_store uuid;
  err text; o public.orders%rowtype; x record; v record;
  v_total numeric(12,2) := 0; seen uuid[] := '{}';
begin
  v_store := public.current_store_id();
  if v_store is null then raise exception 'Acesso negado.'; end if;
  if p_idempotency_key is null then raise exception 'Requisição inválida.'; end if;
  if char_length(trim(coalesce(p_customer_name, ''))) < 2 or char_length(coalesce(p_customer_name, '')) > 80 then
    raise exception 'Informe o nome do cliente (de 2 a 80 caracteres).';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'O pedido precisa ter de 1 a 50 itens.';
  end if;

  -- Mesma regra de segurança dos demais pedidos: código de 4 dígitos validado no banco
  err := public.check_store_pin(p_pin);
  if err is not null then return jsonb_build_object('ok', false, 'error', err); end if;

  insert into public.orders (customer_name, customer_phone, notes, total, idempotency_key, source)
  values (
    trim(p_customer_name),
    nullif(left(trim(coalesce(p_customer_phone, '')), 30), ''),
    nullif(left(trim(coalesce(p_notes, '')), 500), ''),
    0, p_idempotency_key, 'admin')
  on conflict (idempotency_key) do nothing
  returning * into o;

  -- Mesmo envio repetido: devolve o pedido que já existe (não duplica)
  if o.id is null then
    select * into o from public.orders where idempotency_key = p_idempotency_key and store_id = v_store;
    return jsonb_build_object('ok', true, 'order', public.order_json(o.id));
  end if;

  for x in
    select * from jsonb_to_recordset(p_items) as t(variant_id uuid, quantity int, unit_price numeric)
  loop
    if x.variant_id is null then raise exception 'Item inválido.'; end if;
    if x.variant_id = any(seen) then raise exception 'Há produtos repetidos no pedido.'; end if;
    seen := seen || x.variant_id;
    if x.quantity is null or x.quantity < 1 or x.quantity > 999 then raise exception 'Quantidade inválida.'; end if;
    if x.unit_price is null or x.unit_price < 0 or x.unit_price > 1000000 then raise exception 'Preço inválido.'; end if;

    select pv.size, pv.color, pv.stock, p.name into v
      from public.product_variants pv
      join public.products p on p.id = pv.product_id
     where pv.id = x.variant_id and pv.store_id = v_store and pv.is_active and p.is_active;
    if not found then raise exception 'Um dos produtos não está mais disponível.'; end if;
    if v.stock < x.quantity then
      raise exception 'Estoque insuficiente: % (% / %) tem apenas % unidade(s).', v.name, v.size, v.color, v.stock;
    end if;

    insert into public.order_items (order_id, variant_id, product_name, size, color, unit_price, quantity, subtotal)
    values (o.id, x.variant_id, v.name, v.size, v.color, round(x.unit_price, 2), x.quantity, round(x.unit_price, 2) * x.quantity);

    v_total := v_total + round(x.unit_price, 2) * x.quantity;
  end loop;

  update public.orders set total = v_total where id = o.id;

  insert into public.order_events (order_id, type, details, created_by)
  values (o.id, 'created_manually', jsonb_build_object('total', v_total), auth.uid());

  return jsonb_build_object('ok', true, 'order', public.order_json(o.id));
end $$;
revoke all on function public.admin_create_order(text, text, text, jsonb, text, uuid) from public, anon;
grant execute on function public.admin_create_order(text, text, text, jsonb, text, uuid) to authenticated;

-- Vendas, descontos e estornos
create or replace function public.confirm_sale(
  p_order_id          uuid,
  p_payment_method_id uuid,
  p_pin               text    default null,
  p_discount_type     text    default null,
  p_discount_value    numeric default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_store uuid;
  o public.orders%rowtype; pm public.payment_methods%rowtype; err text;
  r record; v record;
  v_subtotal numeric(12,2); v_discount numeric(12,2) := 0; v_total numeric(12,2);
  v_pct numeric(5,2); v_type text; v_sale uuid; v_lines int;
begin
  v_store := public.current_store_id();
  if v_store is null then raise exception 'Acesso negado.'; end if;

  select * into o from public.orders where id = p_order_id and store_id = v_store for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;

  if o.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'error', 'Este pedido foi cancelado.');
  end if;
  if o.status in ('confirmed', 'completed') or exists (select 1 from public.sales where order_id = p_order_id) then
    return jsonb_build_object('ok', false, 'error', 'Este pedido já foi confirmado.');
  end if;

  select * into pm from public.payment_methods where id = p_payment_method_id and store_id = v_store and is_active;
  if not found then raise exception 'Forma de pagamento inválida.'; end if;

  select count(*), coalesce(sum(subtotal), 0) into v_lines, v_subtotal from public.order_items where order_id = p_order_id;
  if v_lines = 0 then raise exception 'O pedido não tem itens.'; end if;

  -- Desconto (validado no banco; o navegador só envia a intenção)
  v_type := nullif(trim(coalesce(p_discount_type, '')), '');
  if v_type is not null then
    if v_type not in ('percent', 'fixed') then raise exception 'Tipo de desconto inválido.'; end if;
    if p_discount_value is null or p_discount_value <= 0 then raise exception 'Informe um desconto maior que zero.'; end if;
    if v_type = 'percent' then
      if p_discount_value > 100 then raise exception 'O desconto percentual não pode passar de 100%%.'; end if;
      v_pct := round(p_discount_value, 2);
      v_discount := round(v_subtotal * v_pct / 100, 2);
    else
      v_discount := round(p_discount_value, 2);
      if v_discount > v_subtotal then
        raise exception 'O desconto (R$ %) não pode ser maior que o valor do pedido (R$ %).',
          replace(v_discount::text, '.', ','), replace(v_subtotal::text, '.', ',');
      end if;
    end if;
    if v_discount <= 0 then raise exception 'O desconto calculado é R$ 0,00. Informe um valor maior.'; end if;
  end if;
  v_total := v_subtotal - v_discount;

  if o.was_edited or v_type is not null then
    err := public.check_store_pin(p_pin);
    if err is not null then return jsonb_build_object('ok', false, 'error', err); end if;
  end if;

  for r in
    select oi.variant_id, sum(oi.quantity)::int as qty, min(oi.product_name) as name
      from public.order_items oi where oi.order_id = p_order_id
     group by oi.variant_id order by oi.variant_id
  loop
    if r.variant_id is null then
      raise exception 'O item "%" não existe mais no catálogo. Remova-o do pedido antes de confirmar.', r.name;
    end if;

    select pv.stock, pv.product_id into v
      from public.product_variants pv where pv.id = r.variant_id and pv.store_id = v_store for update;

    if not found or v.stock < r.qty then
      raise exception 'Estoque insuficiente para "%": disponível %, pedido %.', r.name, coalesce(v.stock, 0), r.qty;
    end if;

    update public.product_variants set stock = stock - r.qty where id = r.variant_id;

    insert into public.stock_movements
      (variant_id, product_id, type, quantity_before, quantity_change, quantity_after, reason, order_id, created_by)
    values (r.variant_id, v.product_id, 'sale', v.stock, -r.qty, v.stock - r.qty, 'Venda ' || o.code, o.id, auth.uid());
  end loop;

  update public.orders set status = 'completed', total = v_subtotal, confirmed_at = now() where id = o.id;

  insert into public.sales
    (order_id, payment_method_id, payment_method_name, subtotal, discount_type, discount_percent, discount_amount, total, sold_by)
  values (o.id, pm.id, pm.name, v_subtotal, v_type, v_pct, v_discount, v_total, auth.uid())
  returning id into v_sale;

  -- Entrada no caixa = valor efetivamente cobrado (já com o desconto)
  insert into public.financial_transactions (sale_id, type, amount, payment_method_id, description, created_by)
  values (v_sale, 'income', v_total, pm.id, 'Venda ' || o.code, auth.uid());

  insert into public.order_events (order_id, type, details, created_by)
  values (o.id, 'sale_confirmed',
          jsonb_build_object('sale_id', v_sale, 'subtotal', v_subtotal, 'discount', v_discount, 'total', v_total, 'payment', pm.name),
          auth.uid());

  return jsonb_build_object('ok', true, 'sale_id', v_sale, 'subtotal', v_subtotal, 'discount', v_discount, 'total', v_total);
end $$;
revoke all on function public.confirm_sale(uuid, uuid, text, text, numeric) from public, anon;
grant execute on function public.confirm_sale(uuid, uuid, text, text, numeric) to authenticated;

create or replace function public.register_sale_adjustment(
  p_sale_id uuid, p_mode text, p_amount numeric default null, p_reason text default null, p_pin text default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_store uuid;
  s public.sales%rowtype; err text; v_code text;
  v_remaining numeric(12,2); v_amount numeric(12,2); v_kind text; v_adj uuid; v_net numeric(12,2); v_label text;
  v_reason text;
begin
  v_store := public.current_store_id();
  if v_store is null then raise exception 'Acesso negado.'; end if;
  if p_mode not in ('full', 'partial', 'discount') then raise exception 'Tipo de ajuste inválido.'; end if;
  v_reason := nullif(left(trim(coalesce(p_reason, '')), 200), '');

  select * into s from public.sales where id = p_sale_id and store_id = v_store for update;
  if not found then raise exception 'Venda não encontrada.'; end if;

  v_remaining := s.total - s.refunded_amount - s.retro_discount_amount;
  if v_remaining <= 0 then raise exception 'Esta venda não tem mais saldo: já foi totalmente estornada.'; end if;

  if p_mode = 'full' then
    v_amount := v_remaining; v_kind := 'refund_full';
  else
    v_amount := round(coalesce(p_amount, 0), 2);
    if v_amount <= 0 then raise exception 'Informe um valor maior que zero.'; end if;
    if v_amount > v_remaining then
      raise exception 'O valor (R$ %) é maior que o saldo líquido da venda (R$ %).',
        replace(v_amount::text, '.', ','), replace(v_remaining::text, '.', ',');
    end if;
    if p_mode = 'discount' then
      if v_amount >= v_remaining then
        raise exception 'O desconto deve ser menor que o saldo líquido (R$ %). Para devolver tudo, use o estorno integral.',
          replace(v_remaining::text, '.', ',');
      end if;
      v_kind := 'retro_discount';
    else
      v_kind := case when v_amount = v_remaining then 'refund_full' else 'refund_partial' end;
    end if;
  end if;

  err := public.check_store_pin(p_pin);
  if err is not null then return jsonb_build_object('ok', false, 'error', err); end if;

  select code into v_code from public.orders where id = s.order_id;

  insert into public.sale_adjustments (sale_id, kind, amount, reason, created_by)
  values (s.id, v_kind, v_amount, v_reason, auth.uid())
  returning id into v_adj;

  update public.sales
     set refunded_amount       = refunded_amount + case when v_kind in ('refund_full', 'refund_partial') then v_amount else 0 end,
         retro_discount_amount = retro_discount_amount + case when v_kind = 'retro_discount' then v_amount else 0 end
   where id = s.id;

  -- Zerou o saldo? A venda passa a "estornada" (o registro original continua intacto)
  update public.sales
     set status = 'refunded', refunded_at = now(), refund_reason = v_reason
   where id = s.id and total > 0 and net_total <= 0;

  v_label := case v_kind when 'refund_full' then 'Estorno integral' when 'refund_partial' then 'Estorno parcial' else 'Desconto retroativo' end;

  insert into public.financial_transactions (sale_id, type, amount, payment_method_id, description, created_by, adjustment_id)
  values (s.id, 'refund', -v_amount, s.payment_method_id, v_label || ' — ' || coalesce(v_code, ''), auth.uid(), v_adj);

  select net_total into v_net from public.sales where id = s.id;

  insert into public.order_events (order_id, type, details, created_by)
  values (s.order_id, 'sale_adjusted', jsonb_build_object('kind', v_kind, 'amount', v_amount, 'net', v_net, 'reason', v_reason), auth.uid());

  return jsonb_build_object('ok', true, 'adjustment_id', v_adj, 'kind', v_kind, 'amount', v_amount, 'net', v_net);
end $$;
revoke all on function public.register_sale_adjustment(uuid, text, numeric, text, text) from public, anon;
grant execute on function public.register_sale_adjustment(uuid, text, numeric, text, text) to authenticated;

-- Relatórios (somente da loja do usuário)
create or replace function public.list_sales(
  p_from date, p_to date,
  p_method uuid default null, p_q text default null, p_product text default null, p_adjust text default null,
  p_limit int default 20, p_offset int default 0
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_store uuid; r jsonb; v_q text; v_p text; v_adj text;
begin
  v_store := public.current_store_id();
  if v_store is null then raise exception 'Acesso negado.'; end if;
  v_q := nullif(trim(coalesce(p_q, '')), '');
  v_p := nullif(trim(coalesce(p_product, '')), '');
  v_adj := nullif(trim(coalesce(p_adjust, '')), '');
  if v_adj is not null and v_adj not in ('none', 'partial', 'full') then raise exception 'Filtro de estorno inválido.'; end if;

  with f as (
    select s.*, o.code, o.customer_name
      from public.sales s
      join public.orders o on o.id = s.order_id
     where s.store_id = v_store and (s.sold_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
       and (p_method is null or s.payment_method_id = p_method)
       and (v_q is null or o.customer_name ilike '%' || v_q || '%' or o.code ilike '%' || v_q || '%')
       and (v_p is null or exists (
             select 1 from public.order_items i
              where i.order_id = s.order_id and i.product_name ilike '%' || v_p || '%'))
       and (v_adj is null
            or (v_adj = 'none'    and s.refunded_amount = 0 and s.retro_discount_amount = 0)
            or (v_adj = 'partial' and (s.refunded_amount > 0 or s.retro_discount_amount > 0) and s.net_total > 0)
            or (v_adj = 'full'    and s.total > 0 and s.net_total <= 0))
  )
  select jsonb_build_object(
    'count', (select count(*) from f),
    'total', coalesce((select sum(net_total) from f), 0),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.sold_at desc)
        from (
          select f.id, f.sold_at, f.total, f.subtotal, f.discount_amount,
                 f.refunded_amount as refunded, f.retro_discount_amount as retro, f.net_total as net,
                 f.status, f.payment_method_name as method, f.code, f.customer_name as customer, f.order_id,
                 (select coalesce(jsonb_agg(jsonb_build_object('name', i.product_name, 'size', i.size, 'color', i.color, 'qty', i.quantity)
                                            order by i.product_name), '[]'::jsonb)
                    from public.order_items i where i.order_id = f.order_id) as items
            from f
           order by f.sold_at desc
           limit least(greatest(p_limit, 1), 5000) offset greatest(p_offset, 0)
        ) x
    ), '[]'::jsonb)
  ) into r;
  return r;
end $$;
revoke all on function public.list_sales(date, date, uuid, text, text, text, int, int) from public, anon;
grant execute on function public.list_sales(date, date, uuid, text, text, text, int, int) to authenticated;

create or replace function public.cash_summary(p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_store uuid; r jsonb;
begin
  v_store := public.current_store_id();
  if v_store is null then raise exception 'Acesso negado.'; end if;

  with tx as (
    select ft.amount, ft.type, sa.kind as adj_kind,
           (ft.created_at at time zone 'America/Sao_Paulo')::date as d,
           coalesce(pm.name, 'Outros') as method
      from public.financial_transactions ft
      left join public.payment_methods pm on pm.id = ft.payment_method_id
      left join public.sale_adjustments sa on sa.id = ft.adjustment_id
     where ft.store_id = v_store and (ft.created_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
  ),
  sv as (
    select s.discount_amount
      from public.sales s
     where s.store_id = v_store and (s.sold_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
  )
  select jsonb_build_object(
    'net',             coalesce((select sum(amount) from tx), 0),
    'income',          coalesce((select sum(amount) from tx where type = 'income'), 0),
    'refunds',         coalesce((select -sum(amount) from tx where type = 'refund' and coalesce(adj_kind, 'refund_partial') <> 'retro_discount'), 0),
    'retro_discounts', coalesce((select -sum(amount) from tx where adj_kind = 'retro_discount'), 0),
    'sale_discounts',  coalesce((select sum(discount_amount) from sv), 0),
    'sales_count',     (select count(*) from tx where type = 'income'),
    'by_method',       coalesce((
        select jsonb_agg(jsonb_build_object('method', m.method, 'total', m.t, 'count', m.c) order by m.t desc)
          from (select method, sum(amount) as t, count(*) filter (where type = 'income') as c from tx group by method) m
    ), '[]'::jsonb),
    'daily',           coalesce((
        select jsonb_agg(jsonb_build_object('day', x.d, 'total', x.t, 'count', x.c) order by x.d desc)
          from (select d, sum(amount) as t, count(*) filter (where type = 'income') as c from tx group by d) x
    ), '[]'::jsonb)
  ) into r;
  return r;
end $$;
revoke all on function public.cash_summary(date, date) from public, anon;
grant execute on function public.cash_summary(date, date) to authenticated;

create or replace function public.dashboard_summary(p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_store uuid; r jsonb;
begin
  v_store := public.current_store_id();
  if v_store is null then raise exception 'Acesso negado.'; end if;
  if p_to < p_from then raise exception 'Período inválido.'; end if;
  if p_to - p_from > 366 then raise exception 'Período máximo: 366 dias.'; end if;

  with
  tx as (
    select ft.amount, ft.type, sa.kind as adj_kind,
           (ft.created_at at time zone 'America/Sao_Paulo')::date as d,
           coalesce(pm.name, 'Outros') as method
      from public.financial_transactions ft
      left join public.payment_methods pm on pm.id = ft.payment_method_id
      left join public.sale_adjustments sa on sa.id = ft.adjustment_id
     where ft.store_id = v_store and (ft.created_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
  ),
  sv as (  -- todas as vendas confirmadas no período (valor original e desconto na venda)
    select s.subtotal, s.discount_amount
      from public.sales s
     where s.store_id = v_store and (s.sold_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
  ),
  sl as (  -- vendas não estornadas por completo: base dos rankings de produtos e categorias
    select s.id, s.order_id, s.subtotal, s.total
      from public.sales s
     where s.store_id = v_store and s.status = 'completed'
       and (s.sold_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
  ),
  od as (
    select (o.created_at at time zone 'America/Sao_Paulo')::date as d
      from public.orders o
     where o.store_id = v_store and (o.created_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
  ),
  days as (
    select gs::date as d from generate_series(p_from, p_to, interval '1 day') gs
  ),
  items as (  -- valor de cada item já com o desconto da venda (antes de estornos)
    select oi.product_name, oi.quantity,
           case when sl.subtotal > 0 then round(oi.subtotal * sl.total / sl.subtotal, 2) else oi.subtotal end as value,
           c.name as category
      from sl
      join public.order_items oi on oi.order_id = sl.order_id
      left join public.product_variants pv on pv.id = oi.variant_id
      left join public.products p on p.id = pv.product_id
      left join public.categories c on c.id = p.category_id
  ),
  sold as (
    select product_name, sum(quantity)::int as qty, sum(value) as revenue from items group by product_name
  )
  select jsonb_build_object(
    'revenue',         coalesce((select sum(amount) from tx), 0),
    'income',          coalesce((select sum(amount) from tx where type = 'income'), 0),
    'refunds',         coalesce((select -sum(amount) from tx where type = 'refund' and coalesce(adj_kind, 'refund_partial') <> 'retro_discount'), 0),
    'retro_discounts', coalesce((select -sum(amount) from tx where adj_kind = 'retro_discount'), 0),
    'original_total',  coalesce((select sum(subtotal) from sv), 0),
    'sale_discounts',  coalesce((select sum(discount_amount) from sv), 0),
    'sales_count',     (select count(*) from tx where type = 'income'),
    'orders_count',    (select count(*) from od),
    'pending_orders',  (select count(*) from public.orders where store_id = v_store and status = 'awaiting_confirmation'),
    'products_count',  (select count(*) from public.products where store_id = v_store and is_active),
    'low_stock', (
      select count(*) from public.product_variants pv
        join public.products p on p.id = pv.product_id
       where pv.store_id = v_store and pv.is_active and p.is_active and pv.stock > 0 and pv.stock <= pv.low_stock_threshold),
    'out_of_stock', (
      select count(*) from public.products p
       where p.store_id = v_store and p.is_active
         and coalesce((select sum(pv.stock) from public.product_variants pv
                        where pv.product_id = p.id and pv.is_active), 0) = 0),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'day', days.d, 'revenue', coalesce(a.rev, 0), 'sales', coalesce(a.cnt, 0), 'orders', coalesce(b.cnt, 0)
             ) order by days.d), '[]'::jsonb)
        from days
        left join (select d, sum(amount) as rev, count(*) filter (where type = 'income') as cnt from tx group by d) a on a.d = days.d
        left join (select d, count(*) as cnt from od group by d) b on b.d = days.d),
    'payments', (
      select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
        from (select method as name, sum(amount) as total, (count(*) filter (where type = 'income'))::int as count
                from tx group by method having sum(amount) > 0 order by sum(amount) desc) t),
    'top_products', (
      select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
        from (select product_name as name, qty, revenue from sold order by qty desc, revenue desc limit 5) t),
    'bottom_products', (
      select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
        from (select p.name, coalesce(so.qty, 0) as qty, coalesce(so.revenue, 0) as revenue
                from public.products p
                left join sold so on so.product_name = p.name
               where p.store_id = v_store and p.is_active
               order by coalesce(so.qty, 0) asc, p.name limit 5) t),
    'categories', (
      select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
        from (select coalesce(category, 'Sem categoria') as name, sum(quantity)::int as qty, sum(value) as revenue
                from items group by coalesce(category, 'Sem categoria') order by sum(value) desc) t)
  ) into r;
  return r;
end $$;
revoke all on function public.dashboard_summary(date, date) from public, anon;
grant execute on function public.dashboard_summary(date, date) to authenticated;

create or replace function public.revenue_history()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_store uuid; r jsonb;
begin
  v_store := public.current_store_id();
  if v_store is null then raise exception 'Acesso negado.'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('year', t.y, 'month', t.m, 'revenue', t.rev, 'sales', t.cnt)
                            order by t.y, t.m), '[]'::jsonb)
    into r
    from (
      select extract(year  from (ft.created_at at time zone 'America/Sao_Paulo'))::int as y,
             extract(month from (ft.created_at at time zone 'America/Sao_Paulo'))::int as m,
             sum(ft.amount) as rev,
             (count(*) filter (where ft.type = 'income'))::int as cnt
        from public.financial_transactions ft
       where ft.store_id = v_store
       group by 1, 2
    ) t;
  return r;
end $$;
revoke all on function public.revenue_history() from public, anon;
grant execute on function public.revenue_history() to authenticated;

-- Produtos e estoque
create or replace function public.admin_save_product(p_id uuid, p_data jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_store uuid;
  v_name text; v_desc text; v_cat uuid; v_price numeric; v_promo numeric; v_feat boolean;
  v_status text; v_badge text; v_slug text; v_base text; v_n int := 1;
  pid uuid; x record; vid uuid; v_hex text; v_size text; v_color text;
begin
  v_store := public.current_store_id();
  if v_store is null then raise exception 'Acesso negado.'; end if;

  v_name := trim(coalesce(p_data->>'name', ''));
  if char_length(v_name) < 2 or char_length(v_name) > 120 then raise exception 'O nome deve ter de 2 a 120 caracteres.'; end if;
  if exists (select 1 from public.products where store_id = v_store and lower(name) = lower(v_name) and (p_id is null or id <> p_id)) then
    raise exception 'Já existe um produto com este nome.';
  end if;

  v_desc := nullif(left(trim(coalesce(p_data->>'description', '')), 3000), '');
  v_cat  := nullif(p_data->>'category_id', '')::uuid;
  if v_cat is not null and not exists (select 1 from public.categories where id = v_cat and store_id = v_store) then raise exception 'Categoria inválida.'; end if;

  v_price := round((p_data->>'price')::numeric, 2);
  if v_price is null or v_price < 0 or v_price > 1000000 then raise exception 'Preço inválido.'; end if;
  v_promo := nullif(p_data->>'promo_price', '')::numeric;
  if v_promo is not null then
    v_promo := round(v_promo, 2);
    if v_promo < 0 or v_promo >= v_price then raise exception 'O preço promocional deve ser menor que o preço normal.'; end if;
  end if;

  v_feat   := coalesce((p_data->>'is_featured')::boolean, false);
  v_status := coalesce(p_data->>'status', 'active');
  if v_status not in ('active', 'unavailable', 'archived') then raise exception 'Situação inválida.'; end if;
  v_badge := nullif(p_data->>'badge_override', '');
  if v_badge is not null and v_badge not in ('new', 'bestseller', 'none') then raise exception 'Selo inválido.'; end if;

  if jsonb_typeof(p_data->'variants') <> 'array' or jsonb_array_length(p_data->'variants') not between 1 and 60 then
    raise exception 'Cadastre de 1 a 60 variações (tamanho e cor).';
  end if;

  if p_id is null then
    v_base := lower(translate(v_name, 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn'));
    v_base := trim(both '-' from regexp_replace(v_base, '[^a-z0-9]+', '-', 'g'));
    if v_base = '' then v_base := 'produto'; end if;
    v_slug := v_base;
    while exists (select 1 from public.products where store_id = v_store and slug = v_slug) loop
      v_n := v_n + 1; v_slug := v_base || '-' || v_n;
    end loop;

    insert into public.products (category_id, name, slug, description, price, promo_price, is_active, is_archived, is_featured, badge_override)
    values (v_cat, v_name, v_slug, v_desc, v_price, v_promo, v_status = 'active', v_status = 'archived', v_feat, v_badge)
    returning id into pid;
  else
    update public.products
       set category_id = v_cat, name = v_name, description = v_desc, price = v_price, promo_price = v_promo,
           is_active = (v_status = 'active'), is_archived = (v_status = 'archived'),
           is_featured = v_feat, badge_override = v_badge
     where id = p_id and store_id = v_store
    returning id, slug into pid, v_slug;
    if not found then raise exception 'Produto não encontrado.'; end if;
  end if;

  begin
    for x in
      select * from jsonb_to_recordset(p_data->'variants')
        as t(id uuid, size text, color text, color_hex text, sku text, price_override numeric,
             stock int, low_stock_threshold int, is_active boolean)
    loop
      v_size  := trim(coalesce(x.size, ''));
      v_color := trim(coalesce(x.color, ''));
      if char_length(v_size) not between 1 and 20 then raise exception 'O tamanho de cada variação deve ter de 1 a 20 caracteres.'; end if;
      if char_length(v_color) not between 1 and 30 then raise exception 'A cor de cada variação deve ter de 1 a 30 caracteres.'; end if;
      v_hex := case when x.color_hex ~ '^#[0-9a-fA-F]{6}$' then x.color_hex else null end;
      if x.price_override is not null and (x.price_override < 0 or x.price_override > 1000000) then raise exception 'Preço da variação inválido.'; end if;
      if coalesce(x.low_stock_threshold, 3) not between 0 and 1000 then raise exception 'Alerta de estoque baixo inválido.'; end if;

      if x.id is not null then
        update public.product_variants
           set size = v_size, color = v_color, color_hex = v_hex, sku = nullif(trim(coalesce(x.sku, '')), ''),
               price_override = x.price_override, low_stock_threshold = coalesce(x.low_stock_threshold, 3),
               is_active = coalesce(x.is_active, true)
         where id = x.id and product_id = pid;
        if not found then raise exception 'Variação não encontrada neste produto.'; end if;
      else
        if coalesce(x.stock, 0) not between 0 and 1000000 then raise exception 'Estoque inicial inválido.'; end if;
        insert into public.product_variants (product_id, size, color, color_hex, sku, price_override, stock, low_stock_threshold, is_active)
        values (pid, v_size, v_color, v_hex, nullif(trim(coalesce(x.sku, '')), ''), x.price_override,
                coalesce(x.stock, 0), coalesce(x.low_stock_threshold, 3), coalesce(x.is_active, true))
        returning id into vid;
        if coalesce(x.stock, 0) > 0 then
          insert into public.stock_movements (variant_id, product_id, type, quantity_before, quantity_change, quantity_after, reason, created_by)
          values (vid, pid, 'entry', 0, x.stock, x.stock, 'Estoque inicial', auth.uid());
        end if;
      end if;
    end loop;
  exception when unique_violation then
    raise exception 'Já existe uma variação com o mesmo tamanho e cor (ou o SKU está repetido).';
  end;

  return jsonb_build_object('ok', true, 'id', pid, 'slug', v_slug);
end $$;
revoke all on function public.admin_save_product(uuid, jsonb) from public, anon;
grant execute on function public.admin_save_product(uuid, jsonb) to authenticated;

create or replace function public.adjust_stock(p_variant_id uuid, p_mode text, p_quantity int, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_store uuid; v record; v_new int; v_type stock_movement_type;
begin
  v_store := public.current_store_id();
  if v_store is null then raise exception 'Acesso negado.'; end if;
  if p_mode not in ('add', 'remove', 'set') then raise exception 'Operação inválida.'; end if;
  if p_quantity is null or p_quantity < 0 or p_quantity > 1000000 or (p_mode <> 'set' and p_quantity < 1) then
    raise exception 'Quantidade inválida.';
  end if;

  select stock, product_id into v from public.product_variants where id = p_variant_id and store_id = v_store for update;
  if not found then raise exception 'Variação não encontrada.'; end if;

  if p_mode = 'add' then v_new := v.stock + p_quantity; v_type := 'entry';
  elsif p_mode = 'remove' then
    if p_quantity > v.stock then raise exception 'Não é possível remover % unidade(s): o estoque atual é %.', p_quantity, v.stock; end if;
    v_new := v.stock - p_quantity; v_type := 'exit';
  else v_new := p_quantity; v_type := 'adjustment';
  end if;

  if v_new > 1000000 then raise exception 'Estoque máximo excedido.'; end if;
  if v_new = v.stock then return jsonb_build_object('ok', true, 'stock', v.stock); end if;

  update public.product_variants set stock = v_new where id = p_variant_id;
  insert into public.stock_movements (variant_id, product_id, type, quantity_before, quantity_change, quantity_after, reason, created_by)
  values (p_variant_id, v.product_id, v_type, v.stock, v_new - v.stock, v_new, nullif(left(trim(coalesce(p_reason, '')), 200), ''), auth.uid());

  return jsonb_build_object('ok', true, 'stock', v_new);
end $$;
revoke all on function public.adjust_stock(uuid, text, int, text) from public, anon;
grant execute on function public.adjust_stock(uuid, text, int, text) to authenticated;

create or replace function public.set_product_status(p_product_id uuid, p_status text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_store uuid;
begin
  v_store := public.current_store_id();
  if v_store is null then raise exception 'Acesso negado.'; end if;
  if p_status not in ('active', 'unavailable', 'archived') then raise exception 'Situação inválida.'; end if;
  update public.products
     set is_active = (p_status = 'active'), is_archived = (p_status = 'archived')
   where id = p_product_id and store_id = v_store;
  if not found then raise exception 'Produto não encontrado.'; end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.set_product_status(uuid, text) from public, anon;
grant execute on function public.set_product_status(uuid, text) to authenticated;

create or replace function public.delete_product(p_product_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_store uuid;
begin
  v_store := public.current_store_id();
  if not public.is_admin() then raise exception 'Somente administradores podem excluir produtos.'; end if;
  if not exists (select 1 from public.products where id = p_product_id and store_id = v_store) then raise exception 'Produto não encontrado.'; end if;
  delete from public.stock_movements where product_id = p_product_id and store_id = v_store;
  delete from public.products where id = p_product_id and store_id = v_store;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.delete_product(uuid) from public, anon;
grant execute on function public.delete_product(uuid) to authenticated;

create or replace function public.reorder_product_images(p_product_id uuid, p_ids uuid[])
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_store uuid; v_id uuid; i int := 0;
begin
  v_store := public.current_store_id();
  if v_store is null then raise exception 'Acesso negado.'; end if;
  foreach v_id in array p_ids loop
    update public.product_images set position = i where id = v_id and product_id = p_product_id and store_id = v_store;
    i := i + 1;
  end loop;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.reorder_product_images(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_product_images(uuid, uuid[]) to authenticated;


commit;
