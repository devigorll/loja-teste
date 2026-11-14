-- =========================================================
-- Etapa 8: indicadores do dashboard (somente leitura, somente equipe)
-- Dias calculados no fuso de São Paulo. Faturamento = vendas concluídas (não estornadas).
-- =========================================================
create or replace function public.dashboard_summary(p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_staff() then raise exception 'Acesso negado.'; end if;
  if p_to < p_from then raise exception 'Período inválido.'; end if;
  if p_to - p_from > 366 then raise exception 'Período máximo: 366 dias.'; end if;

  with
  sl as (
    select s.id, s.order_id, s.total, s.payment_method_name,
           (s.sold_at at time zone 'America/Sao_Paulo')::date as d
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
  items as (
    select oi.product_name, oi.quantity, oi.subtotal, c.name as category
      from sl
      join public.order_items oi on oi.order_id = sl.order_id
      left join public.product_variants pv on pv.id = oi.variant_id
      left join public.products p on p.id = pv.product_id
      left join public.categories c on c.id = p.category_id
  ),
  sold as (
    select product_name, sum(quantity)::int as qty, sum(subtotal) as revenue
      from items group by product_name
  )
  select jsonb_build_object(
    'revenue',        coalesce((select sum(total) from sl), 0),
    'sales_count',    (select count(*) from sl),
    'orders_count',   (select count(*) from od),
    'pending_orders', (select count(*) from public.orders where status = 'awaiting_confirmation'),
    'products_count', (select count(*) from public.products where is_active),
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
        left join (select d, sum(total) as rev, count(*) as cnt from sl group by d) a on a.d = days.d
        left join (select d, count(*) as cnt from od group by d) b on b.d = days.d),
    'payments', (
      select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
        from (select payment_method_name as name, sum(total) as total, count(*)::int as count
                from sl group by payment_method_name order by sum(total) desc) t),
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
        from (select coalesce(category, 'Sem categoria') as name, sum(quantity)::int as qty, sum(subtotal) as revenue
                from items group by coalesce(category, 'Sem categoria') order by sum(subtotal) desc) t)
  ) into r;
  return r;
end $$;
revoke all on function public.dashboard_summary(date, date) from public, anon;
grant execute on function public.dashboard_summary(date, date) to authenticated;
