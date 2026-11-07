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
