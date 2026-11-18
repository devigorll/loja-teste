-- =========================================================
-- TESTE DE ISOLAMENTO ENTRE LOJAS (não deixa nenhuma alteração no banco)
--
-- Pré-requisitos: duas lojas (A e B) com PELO MENOS um usuário cada, e dados nas duas
-- (produtos, pedidos...). Informe abaixo o UUID de um usuário da loja A e de um da loja B
-- (Authentication > Users > copie o "User UID").
--
-- O script age COMO cada usuário (o mesmo mecanismo de segurança do app) e tenta ver/alterar dados da outra loja.
-- Resultado: "ISOLAMENTO OK" ou erro listando o que vazou.
-- =========================================================
do $$
declare
  ua uuid := '00000000-0000-0000-0000-000000000000';   -- <<< UUID do usuário da loja A
  ub uuid := '00000000-0000-0000-0000-000000000000';   -- <<< UUID do usuário da loja B

  sa uuid; sb uuid; d int; uid uuid; mine uuid; other uuid;
  fails text := ''; n int; c int; t text;
  other_variant uuid; other_order uuid; other_sale uuid; my_product uuid; mine_sales int; res jsonb;
begin
  select store_id into sa from public.profiles where id = ua;
  select store_id into sb from public.profiles where id = ub;
  if sa is null or sb is null then raise exception 'Informe UUIDs válidos de usuários que tenham perfil em uma loja.'; end if;
  if sa = sb then raise exception 'Os dois usuários são da MESMA loja. Escolha usuários de lojas diferentes.'; end if;

  for d in 1..2 loop
    if d = 1 then uid := ua; mine := sa; other := sb; else uid := ub; mine := sb; other := sa; end if;

    -- dados de referência (lidos como administrador do banco, antes de assumir o usuário)
    select id into other_variant from public.product_variants where store_id = other limit 1;
    select id into other_order   from public.orders           where store_id = other limit 1;
    select id into other_sale    from public.sales            where store_id = other limit 1;
    select id into my_product    from public.products         where store_id = mine  limit 1;
    select count(*) into mine_sales from public.sales where store_id = mine;

    -- passa a agir como o usuário logado
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
    set local role authenticated;

    -- 1) leitura: nenhuma linha da outra loja em nenhuma tabela
    foreach t in array array['profiles','categories','products','product_images','product_variants','stock_movements',
      'payment_methods','orders','order_items','sales','financial_transactions','sale_adjustments','order_events','store_settings'] loop
      execute format('select count(*) from public.%I where store_id = $1', t) into n using other;
      if n <> 0 then fails := fails || format(E'\n - [usuário %s] enxerga %s linha(s) de %s da OUTRA loja', d, n, t); end if;
    end loop;

    select count(*) into n from public.stores where id = other;
    if n <> 0 then fails := fails || format(E'\n - [usuário %s] enxerga o cadastro da outra loja', d); end if;

    -- 2) escrita: não altera linhas da outra loja
    update public.products set name = name where store_id = other;
    get diagnostics n = row_count;
    if n <> 0 then fails := fails || format(E'\n - [usuário %s] conseguiu alterar produtos da outra loja', d); end if;

    -- 3) trocar a loja de um registro próprio para a outra loja
    if my_product is not null then
      begin
        update public.products set store_id = other where id = my_product;
        get diagnostics c = row_count;
        if c > 0 then raise exception 'ISO_LEAK'; end if;      -- desfaz o teste, se funcionou
      exception when others then
        if sqlerrm = 'ISO_LEAK' then fails := fails || format(E'\n - [usuário %s] conseguiu MOVER um produto para a outra loja', d); end if;
      end;
    end if;

    -- 4) inserir registro já na outra loja
    begin
      insert into public.categories (store_id, name, slug) values (other, 'ISO', 'iso-' || gen_random_uuid()::text);
      raise exception 'ISO_LEAK';
    exception when others then
      if sqlerrm = 'ISO_LEAK' then fails := fails || format(E'\n - [usuário %s] conseguiu CRIAR categoria na outra loja', d); end if;
    end;

    -- 5) funções do painel (SECURITY DEFINER) também respeitam a loja
    res := public.list_sales(date '2000-01-01', date '2100-01-01', null, null, null, null, 5000, 0);
    if (res ->> 'count')::int <> mine_sales then fails := fails || format(E'\n - [usuário %s] list_sales devolveu %s vendas (esperado %s)', d, res ->> 'count', mine_sales); end if;

    if other_variant is not null then
      begin perform public.adjust_stock(other_variant, 'add', 1, 'teste isolamento'); fails := fails || format(E'\n - [usuário %s] adjust_stock mexeu no estoque da outra loja', d);
      exception when others then if sqlerrm not like '%não encontrad%' then fails := fails || format(E'\n - [usuário %s] adjust_stock: erro inesperado (%s)', d, sqlerrm); end if; end;
    end if;
    if other_order is not null then
      begin perform public.cancel_order(other_order); fails := fails || format(E'\n - [usuário %s] cancel_order cancelou pedido da outra loja', d);
      exception when others then if sqlerrm not like '%não encontrad%' then fails := fails || format(E'\n - [usuário %s] cancel_order: erro inesperado (%s)', d, sqlerrm); end if; end;
    end if;
    if other_sale is not null then
      begin perform public.register_sale_adjustment(other_sale, 'full', null, 'teste', '0000'); fails := fails || format(E'\n - [usuário %s] register_sale_adjustment alcançou venda da outra loja', d);
      exception when others then if sqlerrm not like '%não encontrad%' then fails := fails || format(E'\n - [usuário %s] register_sale_adjustment: erro inesperado (%s)', d, sqlerrm); end if; end;
    end if;

    reset role;
  end loop;

  if fails <> '' then raise exception E'VAZAMENTO ENTRE LOJAS DETECTADO:%', fails; end if;
  raise notice 'ISOLAMENTO OK: nenhum dos dois usuários vê ou altera dados da outra loja.';
end $$;
