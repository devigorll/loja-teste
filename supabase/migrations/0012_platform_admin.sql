-- =========================================================
-- 0012 — ADMINISTRAÇÃO DA PLATAFORMA (para o dono do sistema)
--
-- Funções para cadastrar lojas e associar usuários a elas. Rodam SOMENTE no SQL Editor do Supabase
-- (papel "postgres"): ficam bloqueadas para anon/authenticated e recusam chamadas feitas por usuários
-- logados no app. Assim nenhuma loja consegue criar/alterar outra pela API.
-- Rode depois do 0011.
-- =========================================================
begin;

-- Formas de pagamento padrão de uma loja nova (PIX, crédito, débito; "Dinheiro" fica desativada)
create or replace function public.seed_store_defaults(p_store_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then raise exception 'Função de plataforma: execute pelo SQL Editor do Supabase.'; end if;
  insert into public.payment_methods (store_id, name, position, is_active) values
    (p_store_id, 'PIX', 1, true),
    (p_store_id, 'Cartão de crédito', 2, true),
    (p_store_id, 'Cartão de débito', 3, true),
    (p_store_id, 'Dinheiro', 4, false)
  on conflict (store_id, name) do nothing;
end $$;

-- Cria uma loja completa (cadastro, configurações, contador de pedidos, código de autorização e pagamentos).
-- Se informar p_admin_email, associa esse usuário (já criado em Authentication > Users) como administrador.
create or replace function public.platform_create_store(
  p_name text,
  p_slug text default null,
  p_admin_email text default null,
  p_admin_name text default 'Administrador',
  p_custom_domain text default null,
  p_whatsapp text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_slug text;
begin
  if auth.uid() is not null then raise exception 'Função de plataforma: execute pelo SQL Editor do Supabase.'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Informe o nome da loja.'; end if;

  v_slug := public.slugify(coalesce(nullif(trim(p_slug), ''), p_name));
  if exists (select 1 from public.stores where slug = v_slug) then
    raise exception 'Já existe uma loja com o endereço (slug) "%". Informe outro em p_slug.', v_slug;
  end if;

  insert into public.stores (slug, name, custom_domain)
  values (v_slug, trim(p_name), nullif(lower(trim(coalesce(p_custom_domain, ''))), ''))
  returning id into v_id;

  insert into public.store_settings (store_id, name, whatsapp) values (v_id, trim(p_name), nullif(regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g'), ''));
  insert into public.store_security (store_id) values (v_id);
  insert into public.store_counters (store_id) values (v_id);
  perform public.seed_store_defaults(v_id);

  if nullif(trim(coalesce(p_admin_email, '')), '') is not null then
    perform public.platform_assign_user(v_slug, p_admin_email, p_admin_name, 'admin');
  end if;
  return v_id;
end $$;

-- Associa (ou move) um usuário a uma loja. O usuário precisa existir em Authentication > Users.
create or replace function public.platform_assign_user(
  p_store_slug text, p_email text, p_full_name text default 'Administrador', p_role app_role default 'admin'
) returns void
language plpgsql security definer set search_path = public as $$
declare v_store uuid; v_user uuid;
begin
  if auth.uid() is not null then raise exception 'Função de plataforma: execute pelo SQL Editor do Supabase.'; end if;
  select id into v_store from public.stores where slug = lower(trim(p_store_slug));
  if v_store is null then raise exception 'Loja "%" não encontrada.', p_store_slug; end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then raise exception 'Usuário "%" não encontrado. Crie-o antes em Authentication > Users (marque Auto Confirm).', p_email; end if;

  insert into public.profiles (id, full_name, role, is_active, store_id)
  values (v_user, coalesce(nullif(trim(p_full_name), ''), 'Administrador'), p_role, true, v_store)
  on conflict (id) do update
    set store_id = excluded.store_id, role = excluded.role, is_active = true,
        full_name = coalesce(nullif(trim(p_full_name), ''), public.profiles.full_name);
end $$;

-- Suspende ou reativa uma loja (loja suspensa: site fora do ar e painel bloqueado; dados preservados)
create or replace function public.platform_set_store_active(p_store_slug text, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then raise exception 'Função de plataforma: execute pelo SQL Editor do Supabase.'; end if;
  update public.stores set is_active = p_active where slug = lower(trim(p_store_slug));
  if not found then raise exception 'Loja "%" não encontrada.', p_store_slug; end if;
end $$;

revoke all on function public.seed_store_defaults(uuid) from public, anon, authenticated;
revoke all on function public.platform_create_store(text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.platform_assign_user(text, text, text, app_role) from public, anon, authenticated;
revoke all on function public.platform_set_store_active(text, boolean) from public, anon, authenticated;

commit;
