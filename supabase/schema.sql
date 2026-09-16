-- Schema do babel-paginas no Supabase.
-- As paginas publicas so gravam (INSERT via service role no servidor).
-- O Babel-OS le direto pelo Supabase, tambem com service role.
-- Nenhuma policy e criada de proposito: com RLS ligada e sem policy,
-- as chaves anon/authenticated nao enxergam nada. Service role ignora RLS.

create table if not exists public.indicacoes (
  id             uuid primary key default gen_random_uuid(),
  referrer_name  text not null default '',
  referrer_code  text not null default '',
  lead_name      text not null,
  lead_whatsapp  text not null,
  company        text not null default '',
  niche          text not null default '',
  need           text not null default '',
  lead_email     text not null default '',
  best_time      text not null default '',
  preferred_date text not null default '',
  status         text not null default 'novo',
  origem         text not null default 'pagina',
  created_at     timestamptz not null default now()
);

create table if not exists public.vendas (
  id               uuid primary key default gen_random_uuid(),
  vendedor_nome    text not null,
  vendedor_codigo  text not null default '',
  data_venda       date not null,
  setup            numeric(12,2) not null default 0 check (setup >= 0),
  plano            text not null check (plano in ('vip','profissional','basico')),
  cliente_nome     text not null,
  empresa          text not null,
  nicho            text not null default '',
  whatsapp         text not null,
  email            text not null,
  comprovante_path text not null,
  comprovante_nome text not null default '',
  comprovante_tipo text not null default '',
  status           text not null default 'pendente',
  origem           text not null default 'pagina',
  created_at       timestamptz not null default now()
);

create index if not exists indicacoes_created_at_idx on public.indicacoes (created_at desc);
create index if not exists vendas_created_at_idx     on public.vendas (created_at desc);
create index if not exists vendas_status_idx         on public.vendas (status);

alter table public.indicacoes enable row level security;
alter table public.vendas     enable row level security;

-- Bucket privado dos comprovantes. Espelha o que foi aplicado no projeto:
-- privado, 3 MB por arquivo, só PDF/JPEG/PNG/WebP.
-- Servido exclusivamente por /api/comprovante (service role + CHAVE_LEITURA).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprovantes', 'comprovantes', false, 3145728,
        array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
