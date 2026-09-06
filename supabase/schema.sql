-- =====================================================================
-- Sistema de Apontamento Gráfico — schema completo
-- Execute este arquivo no SQL Editor do Supabase (uma única vez).
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------

create table if not exists etapas (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ativa boolean not null default true
);

create table if not exists apontamentos (
  id uuid primary key default gen_random_uuid(),
  etapa_id uuid not null references etapas(id),
  numero_os text not null,
  tipo text not null check (tipo in ('OPERACAO','PAUSA')),
  inicio timestamptz not null,
  fim timestamptz not null,
  duracao_segundos int not null,
  justificativa text
);

-- Apontamento em curso de cada etapa. Uma linha por etapa, removida ao
-- finalizar. Fonte de verdade do tempo decorrido: o cronômetro é sempre
-- recalculado por diferença de timestamps a partir de segmento_inicio,
-- de modo que o tempo corre na nuvem mesmo com o navegador fechado.
create table if not exists sessoes (
  etapa_id uuid primary key references etapas(id),
  numero_os text not null,
  status text not null check (status in ('EM_ANDAMENTO','PAUSADO')),
  segmento_inicio timestamptz not null,
  motivo text
);

create index if not exists apontamentos_numero_os_idx on apontamentos (numero_os);
create index if not exists apontamentos_inicio_idx on apontamentos (inicio);

-- ---------------------------------------------------------------------
-- RLS liberado para o papel anônimo (sem autenticação, conforme escopo)
-- ---------------------------------------------------------------------

alter table etapas       enable row level security;
alter table apontamentos enable row level security;
alter table sessoes      enable row level security;

drop policy if exists etapas_anon       on etapas;
drop policy if exists apontamentos_anon on apontamentos;
drop policy if exists sessoes_anon      on sessoes;

create policy etapas_anon       on etapas       for all to anon, authenticated using (true) with check (true);
create policy apontamentos_anon on apontamentos for all to anon, authenticated using (true) with check (true);
create policy sessoes_anon      on sessoes      for all to anon, authenticated using (true) with check (true);

-- ---------------------------------------------------------------------
-- Etapas de exemplo (opcional — remova se for cadastrar pelo painel)
-- ---------------------------------------------------------------------

insert into etapas (nome) values
  ('Impressão'),
  ('Corte'),
  ('Acabamento')
on conflict (nome) do nothing;
