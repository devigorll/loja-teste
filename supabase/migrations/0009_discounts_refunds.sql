-- =========================================================
-- Descontos na confirmação, estornos (integral/parcial) e descontos retroativos
--
-- Princípios:
--  * A venda original NUNCA é sobrescrita: sales.subtotal (valor do pedido) e sales.total (valor cobrado)
--    ficam como foram confirmados. Estornos e descontos retroativos são lançamentos separados
--    (tabela sale_adjustments) e entram no livro-caixa (financial_transactions) com valor negativo.
--  * Valor líquido da venda = total - estornos - descontos retroativos (coluna calculada net_total).
--  * Todo valor monetário dos painéis (dashboard, caixa, histórico mensal/anual) sai de
--    financial_transactions, a mesma fonte do Controle de caixa. Assim os números sempre batem.
--  * Entradas (income) = valor cobrado na confirmação, já com o desconto aplicado.
-- =========================================================

-- 1) Colunas novas em sales
alter table public.sales
  add column if not exists subtotal               numeric(12,2),
  add column if not exists discount_type          text,
  add column if not exists discount_percent       numeric(5,2),
  add column if not exists discount_amount        numeric(12,2) not null default 0,
  add column if not exists refunded_amount        numeric(12,2) not null default 0,
  add column if not exists retro_discount_amount  numeric(12,2) not null default 0;

-- Vendas anteriores: valor original = valor cobrado (não havia desconto nem estorno)
update public.sales set subtotal = total where subtotal is null;
alter table public.sales alter column subtotal set not null;

alter table public.sales drop constraint if exists sales_discount_type_chk;
alter table public.sales add constraint sales_discount_type_chk
  check (discount_type is null or discount_type in ('percent', 'fixed'));

alter table public.sales drop constraint if exists sales_amounts_chk;
alter table public.sales add constraint sales_amounts_chk check (
  subtotal >= 0 and discount_amount >= 0 and refunded_amount >= 0 and retro_discount_amount >= 0
  and total = subtotal - discount_amount
  and refunded_amount + retro_discount_amount <= total
);

-- Valor líquido sempre consistente (não dá para ficar fora de sincronia)
alter table public.sales
  add column if not exists net_total numeric(12,2)
  generated always as (total - refunded_amount - retro_discount_amount) stored;

-- 2) Lançamentos de ajuste (estornos e descontos retroativos)
create table if not exists public.sale_adjustments (
  id         uuid primary key default gen_random_uuid(),
  sale_id    uuid not null references public.sales(id) on delete restrict,
  kind       text not null check (kind in ('refund_full', 'refund_partial', 'retro_discount')),
  amount     numeric(12,2) not null check (amount > 0),
  reason     text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_sale_adjustments_sale on public.sale_adjustments(sale_id, created_at desc);
alter table public.sale_adjustments enable row level security;
drop policy if exists "staff_read_sale_adjustments" on public.sale_adjustments;
create policy "staff_read_sale_adjustments" on public.sale_adjustments
  for select to authenticated using (public.is_staff());   -- escrita só pelas funções abaixo

alter table public.financial_transactions
  add column if not exists adjustment_id uuid references public.sale_adjustments(id) on delete restrict;

-- 3) Confirmar venda, agora com desconto (percentual ou valor fixo)
--    O código de 4 dígitos é exigido quando o pedido foi editado OU quando há desconto.
drop function if exists public.confirm_sale(uuid, uuid, text);
create or replace function public.confirm_sale(
  p_order_id          uuid,
  p_payment_method_id uuid,
  p_pin               text    default null,
  p_discount_type     text    default null,
  p_discount_value    numeric default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  o public.orders%rowtype; pm public.payment_methods%rowtype; err text;
  r record; v record;
  v_subtotal numeric(12,2); v_discount numeric(12,2) := 0; v_total numeric(12,2);
  v_pct numeric(5,2); v_type text; v_sale uuid; v_lines int;
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

  select * into pm from public.payment_methods where id = p_payment_method_id and is_active;
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
      from public.product_variants pv where pv.id = r.variant_id for update;

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

-- 4) Inserir estorno / desconto retroativo em uma venda já confirmada (exige o código de 4 dígitos)
--    p_mode: 'full'     = estorna todo o saldo líquido restante
--            'partial'  = estorna o valor informado
--            'discount' = desconto retroativo (valor informado, menor que o saldo líquido)
create or replace function public.register_sale_adjustment(
  p_sale_id uuid, p_mode text, p_amount numeric default null, p_reason text default null, p_pin text default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  s public.sales%rowtype; err text; v_code text;
  v_remaining numeric(12,2); v_amount numeric(12,2); v_kind text; v_adj uuid; v_net numeric(12,2); v_label text;
  v_reason text;
begin
  if not public.is_staff() then raise exception 'Acesso negado.'; end if;
  if p_mode not in ('full', 'partial', 'discount') then raise exception 'Tipo de ajuste inválido.'; end if;
  v_reason := nullif(left(trim(coalesce(p_reason, '')), 200), '');

  select * into s from public.sales where id = p_sale_id for update;
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

-- 5) Histórico de vendas (agora com valores originais, descontos, estornos e líquido)
drop function if exists public.list_sales(date, date, uuid, text, text, int, int);
create or replace function public.list_sales(
  p_from date, p_to date,
  p_method uuid default null, p_q text default null, p_product text default null, p_adjust text default null,
  p_limit int default 20, p_offset int default 0
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb; v_q text; v_p text; v_adj text;
begin
  if not public.is_staff() then raise exception 'Acesso negado.'; end if;
  v_q := nullif(trim(coalesce(p_q, '')), '');
  v_p := nullif(trim(coalesce(p_product, '')), '');
  v_adj := nullif(trim(coalesce(p_adjust, '')), '');
  if v_adj is not null and v_adj not in ('none', 'partial', 'full') then raise exception 'Filtro de estorno inválido.'; end if;

  with f as (
    select s.*, o.code, o.customer_name
      from public.sales s
      join public.orders o on o.id = s.order_id
     where (s.sold_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
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

-- 6) Controle de caixa: entradas, estornos e descontos retroativos separados (por data do lançamento)
create or replace function public.cash_summary(p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_staff() then raise exception 'Acesso negado.'; end if;

  with tx as (
    select ft.amount, ft.type, sa.kind as adj_kind,
           (ft.created_at at time zone 'America/Sao_Paulo')::date as d,
           coalesce(pm.name, 'Outros') as method
      from public.financial_transactions ft
      left join public.payment_methods pm on pm.id = ft.payment_method_id
      left join public.sale_adjustments sa on sa.id = ft.adjustment_id
     where (ft.created_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
  ),
  sv as (
    select s.discount_amount
      from public.sales s
     where (s.sold_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
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

-- 7) Dashboard: o faturamento sai do livro-caixa (igual ao Controle de caixa)
create or replace function public.dashboard_summary(p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_staff() then raise exception 'Acesso negado.'; end if;
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
     where (ft.created_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
  ),
  sv as (  -- todas as vendas confirmadas no período (valor original e desconto na venda)
    select s.subtotal, s.discount_amount
      from public.sales s
     where (s.sold_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
  ),
  sl as (  -- vendas não estornadas por completo: base dos rankings de produtos e categorias
    select s.id, s.order_id, s.subtotal, s.total
      from public.sales s
     where s.status = 'completed'
       and (s.sold_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
  ),
  od as (
    select (o.created_at at time zone 'America/Sao_Paulo')::date as d
      from public.orders o
     where (o.created_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
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
    'pending_orders',  (select count(*) from public.orders where status = 'awaiting_confirmation'),
    'products_count',  (select count(*) from public.products where is_active),
    'low_stock', (
      select count(*) from public.product_variants pv
        join public.products p on p.id = pv.product_id
       where pv.is_active and p.is_active and pv.stock > 0 and pv.stock <= pv.low_stock_threshold),
    'out_of_stock', (
      select count(*) from public.products p
       where p.is_active
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
               where p.is_active
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

-- 8) Histórico mensal/anual: também do livro-caixa (líquido de estornos)
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
      select extract(year  from (ft.created_at at time zone 'America/Sao_Paulo'))::int as y,
             extract(month from (ft.created_at at time zone 'America/Sao_Paulo'))::int as m,
             sum(ft.amount) as rev,
             (count(*) filter (where ft.type = 'income'))::int as cnt
        from public.financial_transactions ft
       group by 1, 2
    ) t;
  return r;
end $$;
revoke all on function public.revenue_history() from public, anon;
grant execute on function public.revenue_history() to authenticated;
