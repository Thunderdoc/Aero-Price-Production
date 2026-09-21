-- AeroPrice India — Supabase Schema
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/pfleoerlqesisbtdcfnw/sql

-- ── Fare Observations ─────────────────────────────────────────────────────────
create table if not exists fare_observations (
  id                bigserial primary key,
  observation_id    text unique,
  collected_at      timestamptz not null default now(),
  travel_date       date not null,
  origin            text not null,
  destination       text not null,
  route             text not null,
  airline           text,
  flight_number     text,
  departure_time    text,
  arrival_time      text,
  duration          text,
  stops             int default 0,
  base_fare         numeric(10,2),
  taxes             numeric(10,2),
  total_fare        numeric(10,2) not null,
  currency          text default 'INR',
  cabin             text default 'ECONOMY',
  advance_days      int,
  data_origin       text not null default 'REAL',
  source            text,
  quality_flags     text[] default '{}',
  created_at        timestamptz default now()
);

create index if not exists idx_fare_obs_route on fare_observations(route);
create index if not exists idx_fare_obs_collected on fare_observations(collected_at desc);
create index if not exists idx_fare_obs_travel_date on fare_observations(travel_date);

-- ── Price Alerts ──────────────────────────────────────────────────────────────
create table if not exists price_alerts (
  id              bigserial primary key,
  user_email      text not null,
  route           text not null,
  threshold_fare  numeric(10,2) not null,
  travel_date     date,
  status          text default 'ACTIVE',
  triggered_at    timestamptz,
  triggered_fare  numeric(10,2),
  created_at      timestamptz default now()
);

create index if not exists idx_alerts_user on price_alerts(user_email);
create index if not exists idx_alerts_route on price_alerts(route);

-- ── App Settings (admin config) ───────────────────────────────────────────────
create table if not exists app_settings (
  key     text primary key,
  value   jsonb not null,
  updated_at timestamptz default now()
);

insert into app_settings (key, value) values
  ('jevons_weights', '{"DEL-BOM": 0.18, "DEL-BLR": 0.12, "BOM-BLR": 0.09, "DEL-MAA": 0.08, "DEL-CCU": 0.07, "BOM-MAA": 0.07, "BLR-HYD": 0.06, "DEL-HYD": 0.06, "DEL-AMD": 0.05, "DEL-JAI": 0.05, "BOM-GOI": 0.05, "CCU-GAU": 0.04}'::jsonb),
  ('anomaly_threshold', '{"spike_pct": 40, "min_observations": 5}'::jsonb),
  ('collection_interval_minutes', '60'::jsonb)
on conflict (key) do nothing;

-- ── Audit Log ─────────────────────────────────────────────────────────────────
create table if not exists audit_log (
  id          bigserial primary key,
  actor       text not null,
  action      text not null,
  target      text,
  details     jsonb,
  created_at  timestamptz default now()
);

-- ── Row Level Security (public read for fare_observations) ────────────────────
alter table fare_observations enable row level security;
alter table price_alerts enable row level security;
alter table app_settings enable row level security;
alter table audit_log enable row level security;

drop policy if exists "Public can read fares" on fare_observations;
drop policy if exists "Service can insert fares" on fare_observations;
drop policy if exists "Users see own alerts" on price_alerts;
drop policy if exists "Users create own alerts" on price_alerts;
drop policy if exists "Users update own alerts" on price_alerts;
drop policy if exists "Users delete own alerts" on price_alerts;
drop policy if exists "Public read settings" on app_settings;
drop policy if exists "Service inserts audit" on audit_log;
drop policy if exists "Anon reads audit" on audit_log;

-- Allow anon read on fare_observations (public data)
create policy "Public can read fares" on fare_observations
  for select using (true);

-- Writes must use the backend service role; browser clients are read-only.
create policy "Service can insert fares" on fare_observations
  for insert to service_role with check (true);

-- Price alerts: users see only their own
create policy "Users see own alerts" on price_alerts
  for select using (auth.email() = user_email);
create policy "Users create own alerts" on price_alerts
  for insert with check (auth.email() = user_email);
create policy "Users update own alerts" on price_alerts
  for update using (auth.email() = user_email) with check (auth.email() = user_email);
create policy "Users delete own alerts" on price_alerts
  for delete using (auth.email() = user_email);

-- App settings: read-only for anon
create policy "Public read settings" on app_settings
  for select using (true);

-- Audit log is backend-only; never expose it to anonymous clients.
create policy "Service inserts audit" on audit_log
  for insert to service_role with check (true);
