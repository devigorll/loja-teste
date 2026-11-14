-- =========================================================
-- Etapa 7: histórico de vendas e controle de caixa
-- Funções de leitura (somente equipe autenticada). Dias calculados no fuso de São Paulo.
-- =========================================================

create or replace function public.list_sales(
  p_from date, p_to date,
  p_method uuid default null, p_q text default null, p_product text default null,
  p_limit int default 20, p_offset int default 0
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb; v_q text; v_p text;
begin
  if not public.is_staff() then raise exception 'Acesso negado.'; end if;
  v_q := nullif(trim(coalesce(p_q, '')), '');
  v_p := nullif(trim(coalesce(p_product, '')), '');

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
  )
  select jsonb_build_object(
    'count', (select count(*) from f),
    'total', coalesce((select sum(total) from f where status = 'completed'), 0),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.sold_at desc)
        from (
          select f.id, f.sold_at, f.total, f.status, f.payment_method_name as method,
                 f.code, f.customer_name as customer, f.order_id,
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
revoke all on function public.list_sales(date, date, uuid, text, text, int, int) from public, anon;
grant execute on function public.list_sales(date, date, uuid, text, text, int, int) to authenticated;

create or replace function public.cash_summary(p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_staff() then raise exception 'Acesso negado.'; end if;

  with tx as (
    select ft.amount, ft.type,
           (ft.created_at at time zone 'America/Sao_Paulo')::date as d,
           coalesce(pm.name, 'Outros') as method
      from public.financial_transactions ft
      left join public.payment_methods pm on pm.id = ft.payment_method_id
     where (ft.created_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
  )
  select jsonb_build_object(
    'net',         coalesce((select sum(amount) from tx), 0),
    'income',      coalesce((select sum(amount) from tx where type = 'income'), 0),
    'refunds',     coalesce((select -sum(amount) from tx where type = 'refund'), 0),
    'sales_count', (select count(*) from tx where type = 'income'),
    'by_method',   coalesce((
        select jsonb_agg(jsonb_build_object('method', m.method, 'total', m.t, 'count', m.c) order by m.t desc)
          from (select method, sum(amount) as t, count(*) filter (where type = 'income') as c from tx group by method) m
    ), '[]'::jsonb),
    'daily',       coalesce((
        select jsonb_agg(jsonb_build_object('day', x.d, 'total', x.t, 'count', x.c) order by x.d desc)
          from (select d, sum(amount) as t, count(*) filter (where type = 'income') as c from tx group by d) x
    ), '[]'::jsonb)
  ) into r;
  return r;
end $$;
revoke all on function public.cash_summary(date, date) from public, anon;
grant execute on function public.cash_summary(date, date) to authenticated;
