-- =========================================================
-- DADOS DE DEMONSTRAÇÃO — vendas fictícias de MARÇO a 16/NOV/2026
--
-- * Cria ~94 vendas (≈10 por mês, variando: 10, 11, 13, 9, 12, 11, 10, 12 e 6 até 16/11), com itens, formas de
--   pagamento, alguns descontos, estornos parciais/integrais e descontos retroativos, tudo ligado ao livro-caixa.
-- * Nenhuma venda tem data posterior a 16/11/2026.
-- * Usa os produtos JÁ CADASTRADOS na loja escolhida e NÃO mexe no estoque.
-- * Tudo é marcado como demonstração: orders.is_demo = true, código "DEMO-0001...", observação "[DEMO] ...".
-- * Seguro para rodar mais de uma vez: se já existirem dados de demonstração nesta loja, não faz nada.
-- * Para apagar: rode supabase/demo/002_remove_demo_data.sql (só remove registros marcados como demo).
-- * Os valores são sempre os mesmos a cada execução (gerador com semente fixa).
--
-- COMO USAR: edite v_slug abaixo (deixe '' se existir apenas UMA loja) e rode no SQL Editor do Supabase.
-- =========================================================
do $$
declare
  v_slug  text := '';        -- <<< EDITE AQUI: slug da loja (ex.: 'vertice-urban'). Deixe '' se só existir uma loja.

  v_store uuid;
  v_cutoff constant timestamptz := (timestamp '2026-11-16 20:00:00') at time zone 'America/Sao_Paulo';
  v_plan  int[] := array[3,10, 4,11, 5,13, 6,9, 7,12, 8,11, 9,10, 10,12, 11,6];   -- (mês, nº de vendas)
  v_names text[] := array['Ana Souza','Bruno Lima','Carla Mendes','Diego Rocha','Eduarda Alves','Felipe Costa','Gabriela Nunes',
    'Henrique Dias','Isabela Ramos','João Pereira','Karen Martins','Lucas Barbosa','Mariana Teixeira','Nicolas Araújo','Olívia Ferreira',
    'Paulo Cardoso','Quésia Moura','Rafael Gomes','Sabrina Lopes','Thiago Ribeiro','Ursula Campos','Vinícius Pinto','Wesley Freitas','Yasmin Duarte'];
  v_reasons text[] := array['Produto devolvido pelo cliente','Tamanho errado, troca não disponível','Cliente desistiu da compra','Defeito de fabricação'];
  v_dreasons text[] := array['Desconto combinado depois da venda','Cortesia ao cliente','Ajuste de preço'];

  v_variants jsonb[]; v_pm_ids uuid[]; v_pm_names text[];
  v_ts timestamptz[] := '{}'; v_sorted timestamptz[];
  i int; k int; j int; n int; v_m int; v_cnt int; v_last int; v_day int;
  v_sold timestamptz; v_nitems int; v_pick jsonb; v_used text[]; v_items jsonb; v_it record;
  v_qty int; v_price numeric; v_subtotal numeric; v_disc numeric; v_dtype text; v_dpct numeric; v_total numeric;
  v_r double precision; v_pidx int;
  v_adj_kind text; v_adj_amt numeric; v_adj_ts timestamptz; v_refunded numeric; v_retro numeric; v_status text; v_reason text;
  v_order uuid; v_code text; v_sale uuid; v_adj uuid; v_created int := 0;
begin
  -- loja
  if nullif(trim(v_slug), '') is not null then
    select id into v_store from public.stores where slug = lower(trim(v_slug));
    if v_store is null then raise exception 'Loja "%" não encontrada.', v_slug; end if;
  else
    if (select count(*) from public.stores) <> 1 then
      raise exception 'Existe mais de uma loja: informe o slug em v_slug.';
    end if;
    select id into v_store from public.stores;
  end if;

  if exists (select 1 from public.orders where store_id = v_store and is_demo) then
    raise notice 'Esta loja já tem dados de demonstração. Nada foi feito. Para refazer, rode antes 002_remove_demo_data.sql.';
    return;
  end if;

  -- produtos e formas de pagamento da loja
  select array_agg(jsonb_build_object('id', pv.id, 'name', p.name, 'size', pv.size, 'color', pv.color,
                                      'price', coalesce(pv.price_override, p.promo_price, p.price)) order by p.name, pv.size, pv.color)
    into v_variants
    from public.product_variants pv join public.products p on p.id = pv.product_id
   where pv.store_id = v_store and pv.is_active and p.is_active;
  if v_variants is null then
    select array_agg(jsonb_build_object('id', pv.id, 'name', p.name, 'size', pv.size, 'color', pv.color,
                                        'price', coalesce(pv.price_override, p.promo_price, p.price)) order by p.name, pv.size, pv.color)
      into v_variants
      from public.product_variants pv join public.products p on p.id = pv.product_id where pv.store_id = v_store;
  end if;
  if v_variants is null then raise exception 'Esta loja ainda não tem produtos. Cadastre produtos antes de gerar a demonstração.'; end if;

  select array_agg(id order by position, name), array_agg(name order by position, name)
    into v_pm_ids, v_pm_names from public.payment_methods where store_id = v_store and is_active;
  if v_pm_ids is null then raise exception 'Esta loja não tem formas de pagamento ativas.'; end if;

  perform setseed(0.31416);   -- valores reproduzíveis

  -- datas das vendas (mês a mês; novembro só até o dia 16)
  for i in 1..array_length(v_plan, 1) / 2 loop
    v_m := v_plan[i * 2 - 1];
    v_cnt := v_plan[i * 2];
    v_last := case when v_m = 11 then 16
                   else extract(day from (make_date(2026, v_m, 1) + interval '1 month - 1 day'))::int end;
    for k in 1..v_cnt loop
      v_day := 1 + floor(random() * v_last)::int;
      v_ts := v_ts || (make_timestamp(2026, v_m, v_day, 9 + floor(random() * 11)::int, floor(random() * 60)::int, 0)
                       at time zone 'America/Sao_Paulo');
    end loop;
  end loop;
  select array_agg(x order by x) into v_sorted from unnest(v_ts) x;

  for n in 1..array_length(v_sorted, 1) loop
    v_sold := v_sorted[n];
    if v_sold >= v_cutoff then continue; end if;   -- proteção: nunca depois de 16/11/2026

    -- itens
    v_nitems := 1 + (random() < 0.45)::int + (random() < 0.15)::int;
    v_used := '{}'; v_items := '[]'::jsonb; v_subtotal := 0;
    for j in 1..v_nitems loop
      v_pick := v_variants[1 + floor(random() * array_length(v_variants, 1))::int];
      continue when j > 1 and (v_pick ->> 'id') = any(v_used);
      v_used := v_used || (v_pick ->> 'id');
      v_qty := 1 + (random() < 0.25)::int;
      v_price := (v_pick ->> 'price')::numeric;
      v_subtotal := v_subtotal + v_price * v_qty;
      v_items := v_items || jsonb_build_object('id', v_pick ->> 'id', 'name', v_pick ->> 'name', 'size', v_pick ->> 'size',
                                               'color', v_pick ->> 'color', 'price', v_price, 'qty', v_qty);
    end loop;

    -- desconto na confirmação (~18% das vendas)
    v_dtype := null; v_dpct := null; v_disc := 0; v_r := random();
    if v_r < 0.10 then
      v_dtype := 'percent'; v_dpct := (array[5, 10, 15])[1 + floor(random() * 3)::int];
      v_disc := round(v_subtotal * v_dpct / 100, 2);
    elsif v_r < 0.18 then
      v_dtype := 'fixed';
      v_disc := least((array[10, 15, 20, 30])[1 + floor(random() * 4)::int], round(v_subtotal * 0.3, 2));
    end if;
    if v_disc <= 0 then v_dtype := null; v_dpct := null; v_disc := 0; end if;
    v_total := v_subtotal - v_disc;

    -- forma de pagamento: ~50% PIX, 30% crédito, 20% débito (conforme as formas ativas da loja)
    v_r := random();
    v_pidx := case when array_length(v_pm_ids, 1) < 3 then 1 + floor(random() * array_length(v_pm_ids, 1))::int
                   when v_r < 0.5 then 1 when v_r < 0.8 then 2 else 3 end;

    -- estorno / desconto retroativo (~10% das vendas)
    v_adj_kind := null; v_adj_amt := 0; v_adj_ts := null; v_refunded := 0; v_retro := 0; v_reason := null;
    if random() < 0.10 and v_sold + interval '1 day' < v_cutoff and v_total > 1 then
      v_adj_ts := least(v_sold + (1 + floor(random() * 9)) * interval '1 day' + floor(random() * 8) * interval '1 hour', v_cutoff);
      v_r := random();
      if v_r < 0.5 then
        v_adj_kind := 'refund_partial'; v_adj_amt := round(v_total * (0.2 + random() * 0.4), 2);
        v_reason := v_reasons[1 + floor(random() * 4)::int];
      elsif v_r < 0.8 then
        v_adj_kind := 'refund_full'; v_adj_amt := v_total;
        v_reason := v_reasons[1 + floor(random() * 4)::int];
      else
        v_adj_kind := 'retro_discount'; v_adj_amt := round(v_total * (0.05 + random() * 0.10), 2);
        v_reason := v_dreasons[1 + floor(random() * 3)::int];
      end if;
      if v_adj_amt <= 0 or (v_adj_kind <> 'refund_full' and v_adj_amt >= v_total) then
        v_adj_kind := null; v_adj_amt := 0; v_adj_ts := null; v_reason := null;
      elsif v_adj_kind = 'retro_discount' then v_retro := v_adj_amt;
      else v_refunded := v_adj_amt;
      end if;
    end if;
    v_status := case when v_total > 0 and v_total - v_refunded - v_retro <= 0 then 'refunded' else 'completed' end;

    -- pedido
    v_order := gen_random_uuid();
    v_code := 'DEMO-' || lpad(n::text, 4, '0');
    insert into public.orders (id, store_id, code, customer_name, customer_phone, notes, status, total,
                               created_at, updated_at, confirmed_at, source, is_demo)
    values (v_order, v_store, v_code, v_names[1 + floor(random() * array_length(v_names, 1))::int],
            '(00) 00000-' || lpad(n::text, 4, '0'), '[DEMO] Dados de demonstração', 'completed', v_subtotal,
            v_sold - make_interval(mins => 10 + floor(random() * 170)::int), v_sold, v_sold,
            case when random() < 0.2 then 'admin' else 'site' end, true);

    for v_it in select * from jsonb_array_elements(v_items) loop
      insert into public.order_items (store_id, order_id, variant_id, product_name, size, color, unit_price, quantity, subtotal)
      values (v_store, v_order, (v_it.value ->> 'id')::uuid, v_it.value ->> 'name', v_it.value ->> 'size', v_it.value ->> 'color',
              (v_it.value ->> 'price')::numeric, (v_it.value ->> 'qty')::int,
              (v_it.value ->> 'price')::numeric * (v_it.value ->> 'qty')::int);
    end loop;

    -- venda + entrada no caixa
    insert into public.sales (store_id, order_id, payment_method_id, payment_method_name, subtotal, discount_type, discount_percent,
                              discount_amount, total, status, sold_at, refunded_amount, retro_discount_amount, refunded_at, refund_reason)
    values (v_store, v_order, v_pm_ids[v_pidx], v_pm_names[v_pidx], v_subtotal, v_dtype, v_dpct, v_disc, v_total,
            v_status::sale_status, v_sold, v_refunded, v_retro,
            case when v_status = 'refunded' then v_adj_ts end, case when v_status = 'refunded' then v_reason end)
    returning id into v_sale;

    insert into public.financial_transactions (store_id, sale_id, type, amount, payment_method_id, description, created_at)
    values (v_store, v_sale, 'income', v_total, v_pm_ids[v_pidx], 'Venda ' || v_code, v_sold);

    if v_adj_kind is not null then
      insert into public.sale_adjustments (store_id, sale_id, kind, amount, reason, created_at)
      values (v_store, v_sale, v_adj_kind, v_adj_amt, v_reason, v_adj_ts) returning id into v_adj;

      insert into public.financial_transactions (store_id, sale_id, type, amount, payment_method_id, description, created_by, created_at, adjustment_id)
      values (v_store, v_sale, 'refund', -v_adj_amt, v_pm_ids[v_pidx],
              case v_adj_kind when 'refund_full' then 'Estorno integral' when 'refund_partial' then 'Estorno parcial' else 'Desconto retroativo' end
                || ' — ' || v_code, null, v_adj_ts, v_adj);
    end if;
    v_created := v_created + 1;
  end loop;

  raise notice 'Dados de demonstração criados: % vendas (códigos DEMO-xxxx).', v_created;
end $$;

-- Conferência (opcional): vendas e faturamento por mês, só dos dados de demonstração
select to_char(s.sold_at at time zone 'America/Sao_Paulo', 'YYYY-MM') as mes,
       count(*) as vendas,
       sum(s.total) as cobrado,
       sum(s.net_total) as liquido,
       max(s.sold_at at time zone 'America/Sao_Paulo') as ultima_venda
  from public.sales s
  join public.orders o on o.id = s.order_id and o.is_demo
 group by 1 order by 1;
