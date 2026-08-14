-- =============================================================================
--  Painel de Ganhos — Freelancer
--  Schema + Row Level Security do Supabase
-- =============================================================================
--  Rode este arquivo UMA VEZ no SQL Editor do seu projeto Supabase
--  (Dashboard → SQL Editor → New query → colar → Run).
--
--  Sem isso o app não funciona. E, mais importante: sem o RLS abaixo, qualquer
--  pessoa autenticada no seu projeto conseguiria ler os lançamentos de todo
--  mundo. O RLS é a única coisa que separa os dados de um usuário do outro.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tabela
-- -----------------------------------------------------------------------------
-- Modelo key-value por usuário: hoje existem duas chaves, 'entries' e 'params'.
-- O default de user_id é auth.uid(), então o cliente nunca precisa (nem deve)
-- escolher de quem é a linha.

create table if not exists public.freelancer_data (
  user_id    uuid        not null default auth.uid()
                         references auth.users (id) on delete cascade,
  key        text        not null,
  value      jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key),
  constraint freelancer_data_key_check check (key in ('entries', 'params'))
);

comment on table  public.freelancer_data is 'Documentos JSON por usuário do Painel de Ganhos.';
comment on column public.freelancer_data.key is 'entries | params';
comment on column public.freelancer_data.updated_at is 'Usado pelo cliente para detectar escrita concorrente entre aparelhos.';

-- -----------------------------------------------------------------------------
-- 2. Row Level Security
-- -----------------------------------------------------------------------------
-- Cada usuário só enxerga e só escreve as próprias linhas. As policies de
-- INSERT/UPDATE usam WITH CHECK para impedir que um cliente adulterado grave
-- uma linha em nome de outro user_id.

alter table public.freelancer_data enable row level security;

drop policy if exists "freelancer_data_select_own" on public.freelancer_data;
create policy "freelancer_data_select_own"
  on public.freelancer_data for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "freelancer_data_insert_own" on public.freelancer_data;
create policy "freelancer_data_insert_own"
  on public.freelancer_data for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "freelancer_data_update_own" on public.freelancer_data;
create policy "freelancer_data_update_own"
  on public.freelancer_data for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "freelancer_data_delete_own" on public.freelancer_data;
create policy "freelancer_data_delete_own"
  on public.freelancer_data for delete
  to authenticated
  using (auth.uid() = user_id);

-- Nenhum acesso anônimo. A chave "anon public" do app só vale depois do login.
revoke all on public.freelancer_data from anon;
grant select, insert, update, delete on public.freelancer_data to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Trigger: carimbo de updated_at e trava de user_id
-- -----------------------------------------------------------------------------
-- Cinto e suspensório: mesmo que o cliente mande user_id ou updated_at errados,
-- o banco reescreve com a verdade (auth.uid() e now()).

create or replace function public.freelancer_data_stamp()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.user_id    := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists freelancer_data_stamp_trg on public.freelancer_data;
create trigger freelancer_data_stamp_trg
  before insert or update on public.freelancer_data
  for each row execute function public.freelancer_data_stamp();

-- -----------------------------------------------------------------------------
-- 4. Verificação
-- -----------------------------------------------------------------------------
-- Depois de rodar, confirme que o RLS ficou ativo. rowsecurity precisa ser true:
--
--   select relname, relrowsecurity from pg_class where relname = 'freelancer_data';
--
-- E que existem exatamente 4 policies:
--
--   select policyname, cmd from pg_policies where tablename = 'freelancer_data';
-- =============================================================================
