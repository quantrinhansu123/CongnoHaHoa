create table public.zalo_messages (
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

create index zalo_messages_contact_idx on public.zalo_messages(contact_id, captured_at desc);
create index zalo_messages_sent_at_idx on public.zalo_messages(contact_id, sent_at);

alter table public.zalo_messages enable row level security;

create policy "authenticated users manage zalo messages" on public.zalo_messages
for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.zalo_messages to authenticated;
revoke all on public.zalo_messages from anon;
