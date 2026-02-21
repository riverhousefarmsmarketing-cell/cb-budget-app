-- ============================================================================
-- Migration 003: Work Orders, Rate Lines, Client Profile, PM Assignment
-- ============================================================================
-- Run AFTER 002_weekly_hours.sql
--
-- New hierarchy: Client → Work Orders → Rate Lines
--                                     → Projects (with assigned PM)
--
-- Client profiles and WO details: admin + sector_lead only
-- Project data entry: assigned PM can manage their own projects
-- ============================================================================


-- ============================================================================
-- 1. WORK ORDERS
-- ============================================================================
-- Each work order represents a PO/contract under a client.
-- A client can have multiple work orders.
-- Projects are linked to a work order rather than directly to a client.
-- ============================================================================

create table if not exists public.work_orders (
  id uuid primary key default uuid_generate_v4(),
  sector_id uuid not null references public.sectors(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  po_reference text not null,               -- 'WO-509227', 'WO-510916', etc.
  name text,                                -- descriptive name for the WO
  budget numeric(14,2),                     -- PO value / contract amount
  monthly_forecast numeric(14,2),           -- expected monthly invoice amount
  start_date date,
  end_date date,
  status text not null default 'active'
    check (status in ('active', 'pipeline', 'closed', 'expired')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sector_id, po_reference)
);

-- Indexes
create index idx_work_orders_sector on public.work_orders(sector_id);
create index idx_work_orders_client on public.work_orders(client_id);
create index idx_work_orders_status on public.work_orders(status);

-- updated_at trigger
create trigger trg_work_orders_updated_at
  before update on public.work_orders
  for each row execute function public.set_updated_at();


-- ============================================================================
-- 2. WORK ORDER RATE LINES
-- ============================================================================
-- Multiple bill rates per work order.
-- Each rate line has a label (e.g. 'Senior Compliance', 'Field Monitor')
-- and a dollar amount.
-- When assigning hours, the user picks which rate line applies.
-- ============================================================================

create table if not exists public.work_order_rate_lines (
  id uuid primary key default uuid_generate_v4(),
  sector_id uuid not null references public.sectors(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  label text not null,                      -- 'Senior Compliance', 'Field Monitor', etc.
  bill_rate numeric(10,2) not null,         -- dollar amount per hour
  is_default boolean not null default false, -- default rate for new assignments
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_rate_lines_wo on public.work_order_rate_lines(work_order_id);
create index idx_rate_lines_sector on public.work_order_rate_lines(sector_id);

create trigger trg_rate_lines_updated_at
  before update on public.work_order_rate_lines
  for each row execute function public.set_updated_at();


-- ============================================================================
-- 3. ADD WORK ORDER + PM COLUMNS TO PROJECTS
-- ============================================================================

-- Link project to work order (nullable for overhead projects)
alter table public.projects
  add column if not exists work_order_id uuid references public.work_orders(id) on delete set null;

-- Assigned project manager
alter table public.projects
  add column if not exists assigned_pm uuid references auth.users(id);

create index idx_projects_work_order on public.projects(work_order_id);
create index idx_projects_pm on public.projects(assigned_pm);


-- ============================================================================
-- 4. ADD RATE LINE REFERENCE TO PLANNED WEEKLY HOURS
-- ============================================================================
-- When entering hours, user selects which rate line applies to each assignment.
-- This determines the bill rate for revenue calculations.
-- ============================================================================

alter table public.planned_weekly_hours
  add column if not exists rate_line_id uuid references public.work_order_rate_lines(id);


-- ============================================================================
-- 5. RLS POLICIES: WORK ORDERS (admin + sector_lead edit, all members view)
-- ============================================================================

alter table public.work_orders enable row level security;

create policy "work_orders_select"
  on public.work_orders for select
  using (sector_id in (select public.user_sector_ids()));

create policy "work_orders_insert"
  on public.work_orders for insert
  with check (public.user_has_role(sector_id, array['sector_lead', 'admin']));

create policy "work_orders_update"
  on public.work_orders for update
  using (public.user_has_role(sector_id, array['sector_lead', 'admin']));

create policy "work_orders_delete"
  on public.work_orders for delete
  using (public.user_has_role(sector_id, array['sector_lead', 'admin']));


-- ============================================================================
-- 6. RLS POLICIES: WORK ORDER RATE LINES (admin + sector_lead edit)
-- ============================================================================

alter table public.work_order_rate_lines enable row level security;

create policy "rate_lines_select"
  on public.work_order_rate_lines for select
  using (sector_id in (select public.user_sector_ids()));

create policy "rate_lines_insert"
  on public.work_order_rate_lines for insert
  with check (public.user_has_role(sector_id, array['sector_lead', 'admin']));

create policy "rate_lines_update"
  on public.work_order_rate_lines for update
  using (public.user_has_role(sector_id, array['sector_lead', 'admin']));

create policy "rate_lines_delete"
  on public.work_order_rate_lines for delete
  using (public.user_has_role(sector_id, array['sector_lead', 'admin']));


-- ============================================================================
-- 7. RESTRICT CLIENT EDITING TO ADMIN + SECTOR_LEAD
-- ============================================================================
-- Drop existing permissive policies and recreate with tighter roles.
-- (The original schema allowed sector_lead + admin, which is correct.)
-- This is a no-op confirmation that the existing policies are correct.
-- ============================================================================

-- Already correct from the base schema. No changes needed.


-- ============================================================================
-- 8. SEED DATA: Migrate existing client PO data to work orders
-- ============================================================================
-- Create work orders from the existing client PO references and budgets.
-- This preserves the data while moving to the new structure.
-- ============================================================================

-- TSMC main WO
insert into public.work_orders (id, sector_id, client_id, po_reference, name, budget, start_date, end_date, status)
values (
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000101',
  'WO-509227',
  'TSMC Davis Bacon & DBRA Monitoring',
  4286860.13,
  '2024-01-01', '2026-12-31',
  'active'
);

-- TSMC rate lines
insert into public.work_order_rate_lines (sector_id, work_order_id, label, bill_rate, is_default, sort_order) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', 'Senior Compliance', 159.65, true, 1),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', 'Compliance Analyst', 159.65, false, 2),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', 'Field Monitor', 159.65, false, 3),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', 'Principal / Management', 159.65, false, 4);

-- Okland WO
insert into public.work_orders (id, sector_id, client_id, po_reference, name, budget, start_date, end_date, status)
values (
  '00000000-0000-0000-0000-000000000202',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000102',
  'WO-510916',
  'Okland B51U DBRA',
  596305.00,
  '2025-07-01', '2026-12-31',
  'active'
);

-- Okland rate lines
insert into public.work_order_rate_lines (sector_id, work_order_id, label, bill_rate, is_default, sort_order) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000202', 'Senior Compliance', 159.65, true, 1),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000202', 'Field Monitor', 159.65, false, 2);

-- X-Sector WO
insert into public.work_orders (id, sector_id, client_id, po_reference, name, budget, start_date, end_date, status)
values (
  '00000000-0000-0000-0000-000000000203',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000105',
  'XS-001',
  'Cross-Sector ASML Support',
  100000.00,
  '2025-08-01', null,
  'active'
);

-- X-Sector rate lines (adjusted rate)
insert into public.work_order_rate_lines (sector_id, work_order_id, label, bill_rate, is_default, sort_order) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000203', 'Cross-Sector Standard', 145.00, true, 1);


-- Link existing projects to work orders
update public.projects set work_order_id = '00000000-0000-0000-0000-000000000201'
  where code in ('PRJ-001', 'PRJ-003', 'PRJ-007')
    and sector_id = '00000000-0000-0000-0000-000000000001';

update public.projects set work_order_id = '00000000-0000-0000-0000-000000000202'
  where code = 'PRJ-002'
    and sector_id = '00000000-0000-0000-0000-000000000001';

update public.projects set work_order_id = '00000000-0000-0000-0000-000000000203'
  where code = 'PRJ-006'
    and sector_id = '00000000-0000-0000-0000-000000000001';


-- ============================================================================
-- 9. UPDATED VIEWS
-- ============================================================================

-- Work order summary with financials
create or replace view public.v_work_order_summary as
select
  wo.id as work_order_id,
  wo.sector_id,
  wo.client_id,
  c.name as client_name,
  wo.po_reference,
  wo.name as work_order_name,
  wo.budget,
  wo.monthly_forecast,
  wo.start_date,
  wo.end_date,
  wo.status,
  -- Count of projects under this WO
  (select count(*) from public.projects p where p.work_order_id = wo.id) as project_count,
  -- Total planned hours (from weekly hours on projects linked to this WO)
  coalesce(
    (select sum(pwh.planned_hours)
     from public.planned_weekly_hours pwh
     join public.projects p on p.id = pwh.project_id
     where p.work_order_id = wo.id), 0
  ) as total_planned_hours,
  -- Total invoiced against this WO's client
  coalesce(
    (select sum(i.amount)
     from public.invoices i
     where i.client_id = wo.client_id
       and i.sector_id = wo.sector_id), 0
  ) as total_invoiced,
  -- Rate line count
  (select count(*) from public.work_order_rate_lines rl where rl.work_order_id = wo.id) as rate_line_count
from public.work_orders wo
join public.clients c on c.id = wo.client_id;


-- Updated project profile with WO and PM info
drop view if exists public.v_project_profile;
create or replace view public.v_project_profile as
select
  p.id as project_id,
  p.sector_id,
  p.code,
  p.name,
  p.type,
  p.rate_type,
  p.adjusted_bill_rate,
  p.effective_start,
  p.effective_end,
  p.is_active,
  p.work_order_id,
  p.assigned_pm,
  p.client_id,
  c.name as client_name,
  c.standard_bill_rate,
  wo.po_reference,
  wo.budget as wo_budget,
  wo.monthly_forecast as wo_monthly_forecast,
  wo.start_date as wo_start_date,
  wo.end_date as wo_end_date,
  wo.status as wo_status,
  -- Total planned hours
  coalesce(
    (select sum(pwh.planned_hours)
     from public.planned_weekly_hours pwh
     where pwh.project_id = p.id), 0
  ) as total_planned_hours,
  -- Total actual hours
  coalesce(
    (select sum(te.hours)
     from public.timesheet_entries te
     where te.project_id = p.id), 0
  ) as total_actual_hours
from public.projects p
left join public.clients c on c.id = p.client_id
left join public.work_orders wo on wo.id = p.work_order_id;


-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Summary:
--   2 new tables: work_orders, work_order_rate_lines (with RLS, indexes, triggers)
--   3 columns added: projects.work_order_id, projects.assigned_pm,
--                     planned_weekly_hours.rate_line_id
--   Seed data: 3 work orders with rate lines, projects linked to WOs
--   2 views: v_work_order_summary (new), v_project_profile (updated)
-- ============================================================================
