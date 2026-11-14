-- =========================================================
-- Ajustes finais:
--  1) revenue_history(): faturamento por mês/ano (gráficos mensal e anual do dashboard)
--  2) orders.source: origem do pedido ('site' ou 'admin')
--  3) admin_create_order(): criação manual de pedido pelo painel (exige o código de 4 dígitos)
-- Os pedidos manuais usam as MESMAS tabelas (orders / order_items) e as mesmas regras dos pedidos do site.
-- =========================================================

-- 1) Faturamento mensal (agrupado por ano e mês, fuso de São Paulo). Somente vendas concluídas.
create or replace function public.revenue_history()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_staff() then raise exception 'Acesso negado.'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('year', t.y, 'month', t.m, 'revenue', t.rev, 'sales', t.cnt)
                            order by t.y, t.m), '[]'::jsonb)
    into r
    from (
      select extract(year  from (s.sold_at at time zone 'America/Sao_Paulo'))::int as y,
             extract(month from (s.sold_at at time zone 'America/Sao_Paulo'))::int as m,
             sum(s.total) as rev,
             count(*)::int as cnt
        from public.sales s
       where s.status = 'completed'
       group by 1, 2
    ) t;
  return r;
end $$;
revoke all on function public.revenue_history() from public, anon;
grant execute on function public.revenue_history() to authenticated;

-- 2) Origem do pedido (pedidos antigos e do site ficam como 'site')
alter table public.orders
  add column if not exists source text not null default 'site' check (source in ('site', 'admin'));

-- 3) Criação manual de pedido pelo administrador/equipe
create or replace function public.admin_create_order(
  p_customer_name   text,
  p_customer_phone  text,
  p_notes           text,
  p_items           jsonb,
  p_pin             text,
  p_idempotency_key uuid
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  err text; o public.orders%rowtype; x record; v record;
  v_total numeric(12,2) := 0; seen uuid[] := '{}';
begin
  if not public.is_staff() then raise exception 'Acesso negado.'; end if;
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
    select * into o from public.orders where idempotency_key = p_idempotency_key;
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
     where pv.id = x.variant_id and pv.is_active and p.is_active;
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
