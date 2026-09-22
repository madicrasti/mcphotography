-- Madi Crasti Photography — booking back office.
-- Everything is stored as JSON "data" plus a few indexed columns. Row level security is ON with
-- no policies, so the tables are only reachable through the back-office functions (service role).
-- The "clients" table is the shared client list that Contact Sheet moves onto.

create table if not exists settings (id int primary key default 1, data jsonb not null, updated_at timestamptz default now());
create table if not exists offers (id text primary key, sort int default 0, data jsonb not null, updated_at timestamptz default now());
create table if not exists locations (id text primary key, data jsonb not null, updated_at timestamptz default now());
create table if not exists email_templates (key text primary key, data jsonb not null, updated_at timestamptz default now());

create table if not exists bookings (
  id text primary key,
  token text unique not null,
  status text not null,
  start_ms bigint not null,
  end_ms bigint not null,
  client_email text,
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists bookings_start on bookings (start_ms);
create index if not exists bookings_status on bookings (status);
create index if not exists bookings_email on bookings (client_email);

create table if not exists blocks (id text primary key, start_ms bigint not null, end_ms bigint not null, data jsonb not null);
create index if not exists blocks_range on blocks (start_ms, end_ms);

create table if not exists clients (
  id text primary key,
  email text unique,
  stage text,
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists outbox (id text primary key, created_at timestamptz default now(), booking_id text, data jsonb not null);
create index if not exists outbox_created on outbox (created_at desc);

create table if not exists payments (id text primary key, booking_id text, status text, data jsonb not null, created_at timestamptz default now());

-- Tokens for Google and iCloud. Never exposed to the website.
create table if not exists secrets (key text primary key, value jsonb not null, updated_at timestamptz default now());

alter table settings enable row level security;
alter table offers enable row level security;
alter table locations enable row level security;
alter table email_templates enable row level security;
alter table bookings enable row level security;
alter table blocks enable row level security;
alter table clients enable row level security;
alter table outbox enable row level security;
alter table payments enable row level security;
alter table secrets enable row level security;

-- Hourly jobs (expire unpaid holds, draft 2nd invoices and reminders, mark shoots done).
create extension if not exists pg_cron;
create extension if not exists pg_net;
