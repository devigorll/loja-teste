-- =========================================================
-- Etapa 5: pedidos feitos pelo site
-- =========================================================

-- Chave que impede o mesmo pedido de ser gravado duas vezes
alter table public.orders add column if not exists idempotency_key uuid unique;

-- Telefone do cliente passa a ser opcional (ele já conversa pelo WhatsApp)
alter table public.orders alter column customer_phone drop not null;

-- Resumo do pedido em JSON (uso interno das funções; ninguém chama direto)
create or replace function public.order_json(p_order_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', o.id, 'code', o.code, 'customer_name', o.customer_name,
    'notes', o.notes, 'total', o.total, 'created_at', o.created_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_name', i.product_name, 'size', i.size, 'color', i.color,
        'unit_price', i.unit_price, 'quantity', i.quantity, 'subtotal', i.subtotal
      ) order by i.product_name)
      from public.order_items i where i.order_id = o.id
    ), '[]'::jsonb))
  from public.orders o where o.id = p_order_id
$$;
revoke all on function public.order_json(uuid) from public, anon, authenticated;

-- Criação do pedido: tudo validado e calculado aqui, em uma única transação
create or replace function public.create_order(
  p_customer_name  text,
  p_customer_phone text,
  p_notes          text,
  p_items          jsonb,
  p_idempotency_key uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
  r record;
  v record;
  v_total numeric(12,2) := 0;
begin
  if p_idempotency_key is null then
    raise exception 'Requisição inválida.';
  end if;
  if char_length(trim(coalesce(p_customer_name, ''))) < 2 or char_length(coalesce(p_customer_name, '')) > 80 then
    raise exception 'Informe seu nome (de 2 a 80 caracteres).';
  end if;
  if (case when jsonb_typeof(p_items) = 'array' then jsonb_array_length(p_items) else 0 end) not between 1 and 30 then
    raise exception 'Seu carrinho está vazio ou inválido.';
  end if;

  insert into public.orders (customer_name, customer_phone, notes, total, idempotency_key)
  values (
    trim(p_customer_name),
    nullif(left(trim(coalesce(p_customer_phone, '')), 30), ''),
    nullif(left(trim(coalesce(p_notes, '')), 500), ''),
    0, p_idempotency_key)
  on conflict (idempotency_key) do nothing
  returning * into v_order;

  -- Mesmo pedido enviado duas vezes: devolve o que já existe
  if v_order.id is null then
    select * into v_order from public.orders where idempotency_key = p_idempotency_key;
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
     where pv.id = r.variant_id and pv.is_active and p.is_active;

    if not found then
      raise exception 'Um dos produtos do carrinho não está mais disponível.';
    end if;
    if v.stock < r.qty then
      raise exception 'Estoque insuficiente: % (% / %) tem apenas % unidade(s).', v.name, v.size, v.color, v.stock;
    end if;

    insert into public.order_items (order_id, variant_id, product_name, size, color, unit_price, quantity, subtotal)
    values (v_order.id, r.variant_id, v.name, v.size, v.color, v.unit_price, r.qty, v.unit_price * r.qty);

    v_total := v_total + v.unit_price * r.qty;
  end loop;

  update public.orders set total = v_total where id = v_order.id;
  return public.order_json(v_order.id);
end $$;

revoke all on function public.create_order(text, text, text, jsonb, uuid) from public;
grant execute on function public.create_order(text, text, text, jsonb, uuid) to anon, authenticated;