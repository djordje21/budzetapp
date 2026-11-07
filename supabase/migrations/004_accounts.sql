-- Stanje na računima: upisana stanja, prebacivanja između računa i račun na svakom unosu.
create table if not exists public.balance_checks (
  id        uuid primary key,
  account   text not null check (account in ('dj', 'm', 'kes')),
  amount    numeric(14, 2) not null,
  at        timestamptz not null default now(),
  by_member text
);

create table if not exists public.transfers (
  id           uuid primary key,
  date         date not null,
  from_account text not null check (from_account in ('dj', 'm', 'kes')),
  to_account   text not null check (to_account in ('dj', 'm', 'kes')),
  amount       numeric(14, 2) not null check (amount > 0),
  note         text not null default '',
  by_member    text,
  created_at   timestamptz not null default now()
);

alter table public.transactions add column if not exists account text;

alter table public.balance_checks enable row level security;
alter table public.transfers      enable row level security;

do $$
declare t text;
begin
  foreach t in array array['balance_checks', 'transfers'] loop
    execute format('drop policy if exists "household access" on public.%I', t);
    execute format(
      'create policy "household access" on public.%I for all to authenticated
         using (public.is_member()) with check (public.is_member())', t);
  end loop;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.balance_checks, public.transfers;
exception when duplicate_object then null;
end $$;
