create table public.staff_members (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  phone text,
  account text not null check (btrim(account) <> ''),
  password text not null default '',
  department text,
  position text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_members_account_key unique (account)
);

create table public.routes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  locations jsonb not null default '[]'::jsonb,
  assigned_staff jsonb not null default '{"sales":[],"drivers":[]}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint routes_name_key unique (name),
  constraint routes_locations_is_array check (jsonb_typeof(locations) = 'array'),
  constraint routes_assigned_staff_is_object check (jsonb_typeof(assigned_staff) = 'object')
);

alter table public.customers
  add column if not exists route_id uuid references public.routes(id) on delete set null;

create index customers_route_idx on public.customers(route_id);
create index staff_members_name_idx on public.staff_members(name);

create trigger staff_members_set_updated_at before update on public.staff_members
for each row execute function public.set_updated_at();

create trigger routes_set_updated_at before update on public.routes
for each row execute function public.set_updated_at();

create or replace view public.customer_list_overview
with (security_invoker = true)
as
with debt_totals as (
  select
    customer_id,
    coalesce(sum(amount), 0)::numeric(16, 2) as total_revenue,
    coalesce(sum(paid_amount), 0)::numeric(16, 2) as total_collected,
    coalesce(sum(remaining_amount), 0)::numeric(16, 2) as total_debt
  from public.debt_overview
  group by customer_id
)
select
  c.id,
  c.name,
  c.phone,
  c.route_id,
  r.name as route_name,
  r.locations as route_locations,
  coalesce(
    (
      select string_agg(
        (item->>'order') || '. ' || (item->>'name'),
        ', ' order by (item->>'order')::int
      )
      from jsonb_array_elements(r.locations) as item
    ),
    ''
  ) as route_location,
  coalesce(dt.total_revenue, 0) as total_revenue,
  coalesce(dt.total_collected, 0) as total_collected,
  coalesce(dt.total_debt, 0) as total_debt,
  c.created_at,
  c.updated_at
from public.customers c
left join public.routes r on r.id = c.route_id
left join debt_totals dt on dt.customer_id = c.id;

create or replace view public.route_overview
with (security_invoker = true)
as
select
  r.id,
  r.name,
  r.locations,
  r.assigned_staff,
  r.created_at,
  r.updated_at
from public.routes r;

alter table public.staff_members enable row level security;
alter table public.routes enable row level security;

create policy "authenticated users manage staff_members" on public.staff_members
for all to authenticated using (true) with check (true);

create policy "authenticated users manage routes" on public.routes
for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.staff_members, public.routes to authenticated;
grant select on public.customer_list_overview, public.route_overview to authenticated;
