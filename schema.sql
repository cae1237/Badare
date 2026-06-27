-- ============================================================
-- Badaré CRM — Esquema do banco (Supabase / PostgreSQL)
-- Rode este script primeiro, no SQL Editor do Supabase.
-- Depois rode seed.sql para carregar a base inicial.
-- ============================================================

create table if not exists atendimentos (
  id            bigint generated always as identity primary key,
  mes           text,
  data          date,
  tipo          text,
  cliente       text,
  cuidador      text,
  status        text,
  prescritor    text,
  categoria     text,
  produto       text,
  localidade    text,
  "taxaCliente" numeric default 0,
  canal         text,
  atendente     text,
  compra        boolean default false,
  pagamento     text,
  entrega       text,
  retornar      date,
  "retornarTxt" text,
  followup      jsonb default '[]'::jsonb,
  conversao     text,
  obs           text,
  created_at    timestamptz default now()
);

create table if not exists entregas (
  id         bigint generated always as identity primary key,
  mes        text,
  semana     text,
  data       date,
  cliente    text,
  bairro     text,
  valor      numeric default 0,
  created_at timestamptz default now()
);

create index if not exists idx_atend_data on atendimentos (data);
create index if not exists idx_atend_cliente on atendimentos (cliente);
create index if not exists idx_atend_retornar on atendimentos (retornar);

-- ------------------------------------------------------------
-- Row Level Security
-- Política ABERTA para a chave anon — adequada para VALIDAÇÃO de
-- uma ferramenta interna. Para produção com o time, troque por
-- autenticação (Supabase Auth) e políticas por usuário/papel.
-- ------------------------------------------------------------
alter table atendimentos enable row level security;
alter table entregas     enable row level security;

drop policy if exists anon_all_atend on atendimentos;
drop policy if exists anon_all_entregas on entregas;

create policy anon_all_atend    on atendimentos for all using (true) with check (true);
create policy anon_all_entregas on entregas     for all using (true) with check (true);
