-- Compatible with both old schema (location text) and new schema (locations jsonb).
-- If jsonb columns do not exist yet, add and migrate them first.

alter table public.routes
  add column if not exists locations jsonb not null default '[]'::jsonb,
  add column if not exists assigned_staff jsonb not null default '{"sales":[],"drivers":[]}'::jsonb;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'routes'
      and column_name = 'location'
  ) then
    update public.routes
    set locations = case
      when location is not null and btrim(location) <> '' then
        jsonb_build_array(jsonb_build_object('order', 1, 'name', btrim(location)))
      else '[]'::jsonb
    end
    where jsonb_array_length(locations) = 0
      and location is not null
      and btrim(location) <> '';

    update public.routes r
    set assigned_staff = case
      when s.department ilike '%lái xe%' or s.department ilike '%lai xe%' then
        jsonb_build_object('sales', '[]'::jsonb, 'drivers', jsonb_build_array(r.assigned_staff_id::text))
      else
        jsonb_build_object('sales', jsonb_build_array(r.assigned_staff_id::text), 'drivers', '[]'::jsonb)
    end
    from public.staff_members s
    where r.assigned_staff_id is not null
      and r.assigned_staff_id = s.id
      and r.assigned_staff = '{"sales":[],"drivers":[]}'::jsonb;

    update public.routes
    set assigned_staff = jsonb_build_object(
      'sales', jsonb_build_array(assigned_staff_id::text),
      'drivers', '[]'::jsonb
    )
    where assigned_staff_id is not null
      and assigned_staff = '{"sales":[],"drivers":[]}'::jsonb;

    drop index if exists public.routes_staff_idx;

    alter table public.routes
      drop column if exists location,
      drop column if exists assigned_staff_id;
  end if;
end $$;

alter table public.routes
  drop constraint if exists routes_locations_is_array,
  drop constraint if exists routes_assigned_staff_is_object;

alter table public.routes
  add constraint routes_locations_is_array check (jsonb_typeof(locations) = 'array'),
  add constraint routes_assigned_staff_is_object check (jsonb_typeof(assigned_staff) = 'object');

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

grant select on public.customer_list_overview, public.route_overview to authenticated;
