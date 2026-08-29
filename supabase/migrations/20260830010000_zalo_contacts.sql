create table public.zalo_contacts (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (btrim(display_name) <> ''),
  phone text,
  conversation_id text,
  conversation_key text,
  conversation_url text,
  source text not null default 'manual' check (source in ('manual', 'zalo_extension')),
  last_synced_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint zalo_contacts_phone_or_conversation_check check (
    btrim(coalesce(phone, '')) <> ''
    or btrim(coalesce(conversation_id, '')) <> ''
    or btrim(coalesce(conversation_key, '')) <> ''
  ),
  constraint zalo_contacts_conversation_url_check check (
    conversation_url is null
    or conversation_url ~ '^https://([a-z0-9-]+\.)*zalo\.me(/|$)'
  )
);

create unique index zalo_contacts_phone_key
on public.zalo_contacts ((regexp_replace(phone, '[^0-9+]', '', 'g')))
where btrim(coalesce(phone, '')) <> '';

create unique index zalo_contacts_conversation_id_key
on public.zalo_contacts (conversation_id)
where btrim(coalesce(conversation_id, '')) <> '';

create index zalo_contacts_name_idx on public.zalo_contacts (lower(display_name));
create index zalo_contacts_updated_idx on public.zalo_contacts (updated_at desc);

create trigger zalo_contacts_set_updated_at before update on public.zalo_contacts
for each row execute function public.set_updated_at();

alter table public.zalo_contacts enable row level security;

create policy "authenticated users manage zalo contacts" on public.zalo_contacts
for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.zalo_contacts to authenticated;
revoke all on public.zalo_contacts from anon;
