-- Outbox schema. Run once in Supabase > SQL Editor (safe to re-run).
-- Every row belongs to a user (user_id). The app talks to the database server-side with the service key and
-- always filters by user_id; row-level security below is a second wall in case anything is ever queried with a user token.

create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  onboarded boolean not null default false,
  name text, email text, phone text,
  headline text,                 -- one line: who you are, e.g. "final-year B.Com student at XYZ college"
  target text,                   -- what you are looking for, e.g. "VC and strategy internships"
  links jsonb not null default '[]',   -- [{label, url}]
  cv_text text,                  -- plain text of your CV (what the AI is allowed to know about you)
  cv_data jsonb,                 -- structured CV used for tailoring and the PDF
  tone text not null default 'warm',
  personality text,              -- editable description of how you write
  sample_email text,             -- optional: a cold email you wrote and liked
  timezone text not null default 'UTC'
);

create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  parent_id uuid references items(id) on delete cascade,
  status text not null default 'queued',
  kind text,
  raw_text text,
  files jsonb default '[]',
  source_text text,
  info jsonb default '{}',
  form jsonb default '[]',
  people jsonb default '[]',
  email jsonb default '{}',
  cv_tweaks jsonb default '[]',
  cv jsonb,
  cv_changes jsonb default '[]',
  cv_sent text,
  thread_id text,
  last_msg_id text,
  sent_at timestamptz,
  follow_count int default 0,
  next_follow_at timestamptz,
  follow jsonb,
  reply jsonb,
  error text
);
create index if not exists items_user_status on items (user_id, status);
create index if not exists items_status on items (status);

create table if not exists notes (       -- writing samples + swipe verdicts
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  kind text not null default 'sample',   -- 'sample' | 'swipe'
  title text, body text, source text
);
create index if not exists notes_user_kind on notes (user_id, kind, created_at desc);

create table if not exists style (       -- what the AI drafted vs what you actually sent
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  type text, ai_draft text, final text
);

create table if not exists settings (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value jsonb,
  primary key (user_id, key)
);

alter table profiles enable row level security;
alter table items enable row level security;
alter table notes enable row level security;
alter table style enable row level security;
alter table settings enable row level security;

do $$ begin
  create policy own_profile on profiles for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
  create policy own_items on items for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
  create policy own_notes on notes for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
  create policy own_style on style for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
  create policy own_settings on settings for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
exception when duplicate_object then null; end $$;

-- Private bucket for screenshots and CV PDFs. Files live under "<user_id>/...".
insert into storage.buckets (id, name, public) values ('dumps', 'dumps', false) on conflict do nothing;
