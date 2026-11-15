-- =========================================================
-- Controle de estoque: produtos, fotos, selos e situação (disponível / indisponível / arquivado)
--
-- Situação do produto (sem quebrar nada do que já existe):
--   Disponível   -> is_active = true,  is_archived = false  (aparece no site e pode ser comprado)
--   Indisponível -> is_active = false, is_archived = false  (cadastrado, mas fora do site e da compra)
--   Arquivado    -> is_active = false, is_archived = true   (fora de circulação; dados preservados)
-- As políticas do site, create_order, dashboard etc. continuam usando is_active.
-- =========================================================

-- 1) Situação e selo manual
alter table public.products add column if not exists is_archived boolean not null default false;
alter table public.products add column if not exists badge_override text
  check (badge_override in ('new', 'bestseller', 'none'));   -- NULL = automático
alter table public.products drop constraint if exists products_archived_not_active;
alter table public.products add constraint products_archived_not_active check (not (is_archived and is_active));
create index if not exists idx_products_archived on public.products(is_archived);

-- 2) Regras configuráveis dos selos automáticos
alter table public.store_settings
  add column if not exists new_badge_days        int not null default 14 check (new_badge_days between 1 and 365),
  add column if not exists bestseller_top_n      int not null default 3  check (bestseller_top_n between 1 and 50),
  add column if not exists bestseller_min_units  int not null default 3  check (bestseller_min_units between 1 and 1000),
  add column if not exists bestseller_window_days int not null default 30 check (bestseller_window_days between 1 and 365);

-- 3) Fotos: limite de tamanho e tipos aceitos no bucket (valida também no servidor)
update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
 where id = 'media';

-- 4) Selos efetivos (público): manual manda; sem manual, vale a regra automática.
--    "Mais vendido" tem prioridade sobre "Novidade" quando ambos se aplicam.
create or replace function public.get_product_badges()
returns table (product_id uuid, badge text)
language sql stable security definer set search_path = public as $$
  with cfg as (
    select new_badge_days as d, bestseller_top_n as n, bestseller_min_units as m, bestseller_window_days as w
      from public.store_settings where id = 1
  ),
  sold as (
    select pv.product_id as pid, sum(oi.quantity)::int as units
      from public.sales s
      join public.order_items oi on oi.order_id = s.order_id
      join public.product_variants pv on pv.id = oi.variant_id
      cross join cfg
     where s.status = 'completed' and s.sold_at >= now() - make_interval(days => cfg.w)
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
   where p.is_active;
$$;
revoke all on function public.get_product_badges() from public;
grant execute on function public.get_product_badges() to anon, authenticated;

-- 5) Criar / editar produto + variações (atômico). O estoque existente NÃO é alterado aqui:
--    só o estoque inicial de variações novas (registrado no histórico). Ajustes usam adjust_stock().
create or replace function public.admin_save_product(p_id uuid, p_data jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_name text; v_desc text; v_cat uuid; v_price numeric; v_promo numeric; v_feat boolean;
  v_status text; v_badge text; v_slug text; v_base text; v_n int := 1;
  pid uuid; x record; vid uuid; v_hex text; v_size text; v_color text;
begin
  if not public.is_staff() then raise exception 'Acesso negado.'; end if;

  v_name := trim(coalesce(p_data->>'name', ''));
  if char_length(v_name) < 2 or char_length(v_name) > 120 then raise exception 'O nome deve ter de 2 a 120 caracteres.'; end if;
  if exists (select 1 from public.products where lower(name) = lower(v_name) and (p_id is null or id <> p_id)) then
    raise exception 'Já existe um produto com este nome.';
  end if;

  v_desc := nullif(left(trim(coalesce(p_data->>'description', '')), 3000), '');
  v_cat  := nullif(p_data->>'category_id', '')::uuid;
  if v_cat is not null and not exists (select 1 from public.categories where id = v_cat) then raise exception 'Categoria inválida.'; end if;

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
    while exists (select 1 from public.products where slug = v_slug) loop
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
     where id = p_id
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

-- 6) Ajuste de estoque com histórico: add | remove | set
create or replace function public.adjust_stock(p_variant_id uuid, p_mode text, p_quantity int, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v record; v_new int; v_type stock_movement_type;
begin
  if not public.is_staff() then raise exception 'Acesso negado.'; end if;
  if p_mode not in ('add', 'remove', 'set') then raise exception 'Operação inválida.'; end if;
  if p_quantity is null or p_quantity < 0 or p_quantity > 1000000 or (p_mode <> 'set' and p_quantity < 1) then
    raise exception 'Quantidade inválida.';
  end if;

  select stock, product_id into v from public.product_variants where id = p_variant_id for update;
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

-- 7) Situação: disponibilizar / indisponibilizar / arquivar / restaurar
create or replace function public.set_product_status(p_product_id uuid, p_status text)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Acesso negado.'; end if;
  if p_status not in ('active', 'unavailable', 'archived') then raise exception 'Situação inválida.'; end if;
  update public.products
     set is_active = (p_status = 'active'), is_archived = (p_status = 'archived')
   where id = p_product_id;
  if not found then raise exception 'Produto não encontrado.'; end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.set_product_status(uuid, text) from public, anon;
grant execute on function public.set_product_status(uuid, text) to authenticated;

-- 8) Excluir definitivamente (somente administrador).
--    Remove o produto, variações, fotos (registros) e o histórico de movimentações dele.
--    Pedidos e vendas já registrados permanecem intactos (guardam nome/tamanho/cor/valor).
create or replace function public.delete_product(p_product_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Somente administradores podem excluir produtos.'; end if;
  if not exists (select 1 from public.products where id = p_product_id) then raise exception 'Produto não encontrado.'; end if;
  delete from public.stock_movements where product_id = p_product_id;
  delete from public.products where id = p_product_id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.delete_product(uuid) from public, anon;
grant execute on function public.delete_product(uuid) to authenticated;

-- 9) Ordem das fotos (a primeira é a principal)
create or replace function public.reorder_product_images(p_product_id uuid, p_ids uuid[])
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid; i int := 0;
begin
  if not public.is_staff() then raise exception 'Acesso negado.'; end if;
  foreach v_id in array p_ids loop
    update public.product_images set position = i where id = v_id and product_id = p_product_id;
    i := i + 1;
  end loop;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.reorder_product_images(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_product_images(uuid, uuid[]) to authenticated;
