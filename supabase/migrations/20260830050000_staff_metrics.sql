alter table public.staff_members
  add column if not exists total_revenue numeric(16, 2) not null default 0 check (total_revenue >= 0),
  add column if not exists total_collected numeric(16, 2) not null default 0 check (total_collected >= 0),
  add column if not exists total_debt numeric(16, 2) not null default 0 check (total_debt >= 0),
  add column if not exists metrics_synced_at timestamptz;
