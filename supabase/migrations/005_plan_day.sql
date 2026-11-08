-- Dan u mesecu za stavku plana: kad stiže plata, rok za račun.
alter table public.plan_items add column if not exists day smallint check (day between 1 and 31);
