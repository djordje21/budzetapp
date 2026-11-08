-- Budžet — šema baze za Supabase.
-- Pokreni ceo fajl jednom u Supabase: SQL Editor → New query → nalepi → Run.
-- Na dnu zameni dve email adrese pravim adresama (Đorđe i Maksijana).

-- Članovi domaćinstva: samo ovi emailovi imaju pristup podacima.
create table if not exists public.members (
  email      text primary key,
  member_id  text not null unique check (member_id in ('dj', 'm')),
  name       text not null
);

create or replace function public.is_member()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.members
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create table if not exists public.categories (
  id         text primary key,
  name       text not null,
  kind       text not null check (kind in ('expense', 'income', 'saving')),
  icon       text,
  color      text,
  fixed      boolean not null default false,
  archived   boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.plan_items (
  id          uuid primary key,
  month       text not null check (month ~ '^\d{4}-\d{2}$'),
  line        uuid not null,
  category_id text not null references public.categories (id),
  name        text not null,
  amount      numeric(14, 2) not null default 0 check (amount >= 0),
  owner       text not null default 'zaj' check (owner in ('zaj', 'dj', 'm')),
  updated_at  timestamptz not null default now()
);
create index if not exists plan_items_month_idx on public.plan_items (month);

create table if not exists public.transactions (
  id          uuid primary key,
  date        date not null,
  kind        text not null check (kind in ('expense', 'income', 'saving')),
  category_id text not null references public.categories (id),
  amount      numeric(14, 2) not null check (amount >= 0),
  note        text not null default '',
  by_member   text not null check (by_member in ('dj', 'm')),
  plan_line   uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists transactions_date_idx on public.transactions (date);
alter table public.transactions add column if not exists plan_line uuid;

create table if not exists public.notes (
  month      text primary key check (month ~ '^\d{4}-\d{2}$'),
  text       text not null default '',
  updated_at timestamptz not null default now()
);

-- Row Level Security: bez ovoga bi svako sa javnim ključem mogao da čita podatke.
alter table public.members      enable row level security;
alter table public.categories   enable row level security;
alter table public.plan_items   enable row level security;
alter table public.transactions enable row level security;
alter table public.notes        enable row level security;

drop policy if exists "members read" on public.members;
create policy "members read" on public.members
  for select to authenticated using (public.is_member());

do $$
declare t text;
begin
  foreach t in array array['categories', 'plan_items', 'transactions', 'notes'] loop
    execute format('drop policy if exists "household access" on public.%I', t);
    execute format(
      'create policy "household access" on public.%I for all to authenticated
         using (public.is_member()) with check (public.is_member())', t);
  end loop;
end $$;

-- Promene stižu odmah na drugi telefon.
do $$
begin
  alter publication supabase_realtime add table public.categories, public.plan_items, public.transactions, public.notes;
exception when duplicate_object then null;
end $$;

-- Ciljevi štednje + veza uplate sa ciljem.
create table if not exists public.goals (
  id           uuid primary key,
  name         text not null,
  icon         text,
  target       numeric(14, 2) not null check (target > 0),
  start_amount numeric(14, 2) not null default 0,
  due          text check (due ~ '^\d{4}-\d{2}$'),
  archived     boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.goals enable row level security;
drop policy if exists "household access" on public.goals;
create policy "household access" on public.goals for all to authenticated
  using (public.is_member()) with check (public.is_member());

alter table public.transactions add column if not exists goal_id uuid;

do $$
begin
  alter publication supabase_realtime add table public.goals;
exception when duplicate_object then null;
end $$;

alter table public.transactions add column if not exists plan_line uuid;

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

alter table public.plan_items add column if not exists day smallint check (day between 1 and 31);

-- >>> ZAMENI EMAIL ADRESE <<<
insert into public.members (email, member_id, name) values
  ('djordje@primer.com',   'dj', 'Đorđe'),
  ('maksijana@primer.com', 'm',  'Maksijana')
on conflict (member_id) do update set email = excluded.email, name = excluded.name;
