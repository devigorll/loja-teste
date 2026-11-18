-- =========================================================
-- REMOVE OS DADOS DE DEMONSTRAÇÃO (somente os marcados como demo: orders.is_demo = true / código DEMO-xxxx)
-- Vendas reais NÃO são tocadas. O estoque não é alterado (a demonstração nunca mexeu nele).
-- Edite v_slug (deixe '' se só existir uma loja) e rode no SQL Editor do Supabase.
-- =========================================================
do $$
declare
  v_slug  text := '';        -- <<< EDITE AQUI: slug da loja. Deixe '' se só existir uma loja.
  v_store uuid; v_n int;
begin
  if nullif(trim(v_slug), '') is not null then
    select id into v_store from public.stores where slug = lower(trim(v_slug));
    if v_store is null then raise exception 'Loja "%" não encontrada.', v_slug; end if;
  else
    if (select count(*) from public.stores) <> 1 then raise exception 'Existe mais de uma loja: informe o slug em v_slug.'; end if;
    select id into v_store from public.stores;
  end if;

  select count(*) into v_n from public.orders where store_id = v_store and is_demo;
  if v_n = 0 then raise notice 'Não há dados de demonstração nesta loja.'; return; end if;

  delete from public.financial_transactions
   where store_id = v_store and sale_id in (select s.id from public.sales s join public.orders o on o.id = s.order_id
                                             where o.store_id = v_store and o.is_demo);
  delete from public.sale_adjustments
   where store_id = v_store and sale_id in (select s.id from public.sales s join public.orders o on o.id = s.order_id
                                             where o.store_id = v_store and o.is_demo);
  delete from public.sales
   where store_id = v_store and order_id in (select id from public.orders where store_id = v_store and is_demo);
  delete from public.orders where store_id = v_store and is_demo;   -- itens e eventos saem em cascata

  raise notice 'Removidos % pedidos de demonstração (e suas vendas e lançamentos financeiros).', v_n;
end $$;
