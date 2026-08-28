create table public.sales_route_reports (
  id uuid primary key default gen_random_uuid(),
  distributor text not null default 'NPP Hà Hoà' check (btrim(distributor) <> ''),
  report_date date not null,
  sales_person text not null check (btrim(sales_person) <> ''),
  route_name text not null check (btrim(route_name) <> ''),
  total_customers integer not null default 0 check (total_customers >= 0),
  answered_customers integer not null default 0 check (answered_customers >= 0),
  unanswered_customers integer not null default 0 check (unanswered_customers >= 0),
  ordering_customers integer not null default 0 check (ordering_customers >= 0),
  non_ordering_customers integer not null default 0 check (non_ordering_customers >= 0),
  actual_revenue numeric(16, 2) not null default 0 check (actual_revenue >= 0),
  average_revenue numeric(16, 2) not null default 0 check (average_revenue >= 0),
  product_feedback text,
  delivery_feedback text,
  missing_products text,
  top_products text,
  product_development_feedback text,
  product_quality_feedback text,
  delivery_staff_feedback text,
  distributor_feedback text,
  self_improvement text,
  personal_opinion text,
  next_revenue_target numeric(16, 2) not null default 0 check (next_revenue_target >= 0),
  target_percentage numeric(5, 2) check (target_percentage is null or target_percentage between 0 and 100),
  self_rating text not null default 'Trung bình' check (self_rating in ('Yếu', 'Trung bình', 'Khá', 'Xuất sắc')),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_route_reports_day_person_route_key unique (report_date, sales_person, route_name)
);

create index sales_route_reports_date_idx on public.sales_route_reports(report_date desc);
create index sales_route_reports_person_idx on public.sales_route_reports(sales_person);
create index sales_route_reports_route_idx on public.sales_route_reports(route_name);

create trigger sales_route_reports_set_updated_at before update on public.sales_route_reports
for each row execute function public.set_updated_at();

alter table public.sales_route_reports enable row level security;

create policy "authenticated users manage sales route reports" on public.sales_route_reports
for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.sales_route_reports to authenticated;
revoke all on public.sales_route_reports from anon;

insert into public.sales_route_reports (
  report_date,
  sales_person,
  route_name,
  total_customers,
  answered_customers,
  unanswered_customers,
  ordering_customers,
  non_ordering_customers,
  actual_revenue,
  average_revenue,
  top_products,
  next_revenue_target,
  self_rating
) values (
  '2026-08-27',
  'Hoa',
  'Ba Vì',
  52,
  52,
  0,
  27,
  22,
  27345000,
  1034000,
  'Túi, giấy, cốc xốp, ống hút, chổi',
  25000000,
  'Khá'
) on conflict (report_date, sales_person, route_name) do nothing;
