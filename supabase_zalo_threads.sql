-- Chạy toàn bộ file này một lần trong Supabase SQL Editor nếu chưa dùng Supabase CLI.
-- File tạo nơi lưu lịch sử hội thoại; không lưu cookie, mật khẩu hoặc token Zalo.

create table if not exists public.zalo_messages (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.zalo_contacts(id) on delete cascade,
  message_key text not null check (btrim(message_key) <> ''),
  direction text not null check (direction in ('incoming', 'outgoing', 'system')),
  sender_name text,
  body text not null check (btrim(body) <> ''),
  display_time text,
  sent_at timestamptz,
  message_type text not null default 'text' check (message_type in ('text', 'image', 'file', 'system')),
  sort_order integer not null default 0,
  captured_at timestamptz not null default now(),
  constraint zalo_messages_contact_message_key unique (contact_id, message_key)
);

create index if not exists zalo_messages_contact_idx on public.zalo_messages(contact_id, captured_at desc);
create index if not exists zalo_messages_sent_at_idx on public.zalo_messages(contact_id, sent_at);

alter table public.zalo_messages enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'zalo_messages'
      and policyname = 'authenticated users manage zalo messages'
  ) then
    create policy "authenticated users manage zalo messages" on public.zalo_messages
    for all to authenticated using (true) with check (true);
  end if;
end $$;

grant select, insert, update, delete on public.zalo_messages to authenticated;
revoke all on public.zalo_messages from anon;

-- Lưu gợi ý AI mới nhất cho từng hội thoại để tải lại trang vẫn còn kết quả.
create table if not exists public.zalo_ai_suggestions (
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

create index if not exists zalo_ai_suggestions_updated_idx on public.zalo_ai_suggestions(updated_at desc);

drop trigger if exists zalo_ai_suggestions_set_updated_at on public.zalo_ai_suggestions;
create trigger zalo_ai_suggestions_set_updated_at before update on public.zalo_ai_suggestions
for each row execute function public.set_updated_at();

alter table public.zalo_ai_suggestions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'zalo_ai_suggestions'
      and policyname = 'authenticated users manage zalo ai suggestions'
  ) then
    create policy "authenticated users manage zalo ai suggestions" on public.zalo_ai_suggestions
    for all to authenticated using (true) with check (true);
  end if;
end $$;

grant select, insert, update, delete on public.zalo_ai_suggestions to authenticated;
revoke all on public.zalo_ai_suggestions from anon;
