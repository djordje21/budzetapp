-- Veza stvarnog unosa sa stavkom plana (dugme "Plaćeno").
alter table public.transactions add column if not exists plan_line uuid;
