create table public.zalo_ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null unique references public.zalo_contacts(id) on delete cascade,
  trigger_message_key text,
  summary text not null default '',
  customer_intent text not null default '',
  suggestions jsonb not null default '[]'::jsonb check (jsonb_typeof(suggestions) = 'array'),
  next_action text not null default '',
  status text not null default 'ready' check (status in ('ready', 'failed')),
  error text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index zalo_ai_suggestions_updated_idx on public.zalo_ai_suggestions(updated_at desc);

create trigger zalo_ai_suggestions_set_updated_at before update on public.zalo_ai_suggestions
for each row execute function public.set_updated_at();

alter table public.zalo_ai_suggestions enable row level security;

create policy "authenticated users manage zalo ai suggestions" on public.zalo_ai_suggestions
for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.zalo_ai_suggestions to authenticated;
revoke all on public.zalo_ai_suggestions from anon;
