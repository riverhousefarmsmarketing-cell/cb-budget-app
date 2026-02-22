-- ============================================================================
-- Currie & Brown Budget Management Application
-- COMPLETE CONSOLIDATED SCHEMA — 21 February 2026 (Rev 2)
-- ============================================================================
--
-- FINAL STATE after: Base (000) + Migrations 005–009 + Work Orders + Weekly
-- Planning + Opportunity Management additions
--
-- To deploy from scratch: run this single file on a fresh Supabase project.
--
-- INVENTORY:
--   37 tables (30 migration-chain + 4 work-order/planning + 3 opportunity)
--   19 views  (14 migration-chain + 5 additional)
--   ~150 RLS policies
--   ~105 indexes
--   ~36 triggers
--   2 helper functions
--   2 storage buckets
--   Full PCS sector seed data
--
-- Migration history:
--   000 Base: 15 tables (sectors through working_hours_calendar)
--   005 PM Dashboard: +5 tables (contacts, risks, lessons, savings, project_meetings)
--   006 Opportunities: modified 6 tables (forecast_id, pursuit columns)
--   007 Meetings/Cross-Sell/Action Plans: +8 tables, -1 (project_meetings dropped)
--   008 Variations/Documents/RAID: +2 tables
--   009 Tenant Branding: +1 table
--   +   Work Orders & Rate Lines: +2 tables, +2 columns on projects
--   +   Weekly Planning: +2 tables (planned_weekly_hours, week_endings)
--   +   Opportunity Management: +3 tables (opportunity_contacts/activities/notes)
--   Net: 30 + 2 + 2 + 3 = 37 tables
-- ============================================================================


-- Enable required extensions
create extension if not exists "uuid-ossp";


-- ============================================================================
-- 1. SECTORS (multi-tenant root)
-- ============================================================================

create table public.sectors (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  code text not null unique,              -- e.g. 'PCS', 'INFRA', 'PM'
  description text,
  budget_year integer not null default 2026,
  annual_budget_target numeric(14,2),     -- total revenue target for the year
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- 2. SECTOR MEMBERS (user-to-sector access control)
-- ============================================================================
-- Maps Supabase Auth users to sectors with role-based access.
-- A user can belong to multiple sectors (combined dashboard).
-- Roles: admin, sector_lead, project_manager, viewer
-- ============================================================================


-- ============================================================================
-- 2. SECTOR MEMBERS (user-to-sector access control)
-- ============================================================================

create table public.sector_members (
  id uuid primary key default uuid_generate_v4(),
  sector_id uuid not null references public.sectors(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer'
    check (role in ('admin', 'sector_lead', 'project_manager', 'viewer')),
  created_at timestamptz not null default now(),
  unique (sector_id, user_id)
);

-- ============================================================================
-- 3. EMPLOYEES
-- ============================================================================
-- Employee rate card from the Resource Profiler.
-- Hourly cost = fully loaded (salary + 3% inflation + 8% payroll tax
--               + medical + pension) / 2,080 annual hours.
-- ============================================================================


-- ============================================================================
-- 3. EMPLOYEES
-- ============================================================================

create table public.employees (
  id uuid primary key default uuid_generate_v4(),
  sector_id uuid not null references public.sectors(id) on delete cascade,
  employee_code text not null,            -- 'EMP-01', 'NH-1', etc.
  name text not null,
  role text not null,                     -- 'Sr Compliance Mgr', 'Field Monitor', etc.
  hourly_cost numeric(10,2) not null,     -- fully loaded hourly employment cost
  target_utilization numeric(4,2) not null default 0.75,  -- 0.00 to 1.00
  start_date date,
  end_date date,                          -- null = still active
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sector_id, employee_code)
);

-- ============================================================================
-- 4. CLIENTS
-- ============================================================================


-- ============================================================================
-- 4. CLIENTS
-- ============================================================================

create table public.clients (
  id uuid primary key default uuid_generate_v4(),
  sector_id uuid not null references public.sectors(id) on delete cascade,
  name text not null,
  standard_bill_rate numeric(10,2) not null,
  po_reference text,                      -- 'WO-509227', 'Pipeline', etc.
  budget numeric(14,2),                   -- contract/budget amount
  status text not null default 'active'
    check (status in ('active', 'pipeline', 'closed')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sector_id, name)
);

-- ============================================================================
-- 5. PROJECTS
-- ============================================================================
-- Every time entry is charged to a project code.
-- Billable projects generate revenue; overhead projects reduce utilization.
-- Cross-sector projects use adjusted_bill_rate instead of client standard.
-- ============================================================================


-- ============================================================================
-- 5. PROJECTS
-- ============================================================================

create table public.projects (
  id uuid primary key default uuid_generate_v4(),
  sector_id uuid not null references public.sectors(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  code text not null,                     -- 'PRJ-001', 'OVH-001', etc.
  name text not null,
  type text not null default 'billable'
    check (type in ('billable', 'overhead')),
  rate_type text not null default 'standard'
    check (rate_type in ('standard', 'cross_sector_adjusted')),
  adjusted_bill_rate numeric(10,2),       -- only for cross-sector projects
  -- Cross-sector charge fields
  originating_sector text,                -- sector name or code that originated the charge
  receiving_sector text,                  -- always this sector for incoming charges
  cross_charge_justification text,
  cross_charge_approved_by uuid references auth.users(id),
  cross_charge_approved_at timestamptz,
  effective_start date,
  effective_end date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Added post-migration: work order linkage and PM assignment
  work_order_id uuid,                     -- FK added after work_orders table created
  assigned_pm uuid references auth.users(id),
  unique (sector_id, code)
);

-- ============================================================================
-- 6. TIMESHEET ENTRIES
-- ============================================================================
-- Ingested via CSV/Excel upload by project managers.
-- Each row = one employee, one project, one week.
-- ============================================================================


-- ============================================================================
-- 6. TIMESHEET ENTRIES
-- ============================================================================

create table public.timesheet_entries (
  id uuid primary key default uuid_generate_v4(),
  sector_id uuid not null references public.sectors(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  week_ending date not null,              -- always a Friday/Sunday depending on convention
  hours numeric(6,2) not null check (hours >= 0),
  upload_batch_id uuid,                   -- links to timesheet_uploads for traceability
  created_at timestamptz not null default now(),
  unique (sector_id, employee_id, project_id, week_ending)
);

-- ============================================================================
-- 7. TIMESHEET UPLOADS (audit trail)
-- ============================================================================


-- ============================================================================
-- 7. TIMESHEET UPLOADS
-- ============================================================================

create table public.timesheet_uploads (
  id uuid primary key default uuid_generate_v4(),
  sector_id uuid not null references public.sectors(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id),
  filename text not null,
  row_count integer not null default 0,
  validation_status text not null default 'pending'
    check (validation_status in ('pending', 'valid', 'errors', 'imported')),
  validation_errors jsonb,                -- array of error objects
  period_start date,                      -- first week_ending in the file
  period_end date,                        -- last week_ending in the file
  replaced_upload_id uuid references public.timesheet_uploads(id),
  created_at timestamptz not null default now()
);


alter table public.timesheet_entries
  add constraint fk_upload_batch
  foreign key (upload_batch_id) references public.timesheet_uploads(id);

-- ============================================================================
-- 8. INVOICES
-- ============================================================================
-- Monthly data entry by project managers.
-- date_paid auto-transitions status to 'paid'.
-- ============================================================================


-- ============================================================================
-- 8. INVOICES
-- ============================================================================

create table public.invoices (
  id uuid primary key default uuid_generate_v4(),
  sector_id uuid not null references public.sectors(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  invoice_number text not null,           -- 'INV-2026-01-C1' auto-generated, editable
  billing_month date not null,            -- first day of the billing month
  amount numeric(14,2) not null,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'paid', 'overdue')),
  date_paid date,                         -- when populated, status -> 'paid'
  due_date date,                          -- billing_month end + overdue threshold
  notes text,                             -- PO numbers, payment references
  entered_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sector_id, invoice_number)
);

-- ============================================================================
-- 9. INVOICE LINE ITEMS (employee-level breakdown)
-- ============================================================================


-- ============================================================================
-- 9. INVOICE LINE ITEMS
-- ============================================================================

create table public.invoice_line_items (
  id uuid primary key default uuid_generate_v4(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  sector_id uuid not null references public.sectors(id) on delete cascade,
  employee_id uuid not null references public.employees(id),
  project_id uuid not null references public.projects(id),
  hours numeric(6,2) not null,
  rate numeric(10,2) not null,            -- standard or adjusted, whichever applies
  rate_type text not null default 'standard'
    check (rate_type in ('standard', 'cross_sector_adjusted')),
  amount numeric(14,2) generated always as (hours * rate) stored,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 10. FORECASTS
-- ============================================================================
-- Revenue/resource demand projections.
-- Two types: change_order (existing project) and new_project (pipeline).
-- Probability-weighted: committed=100%, high=75%, medium=50%, low=25%.
-- ============================================================================


-- ============================================================================
-- 10. FORECASTS (modified by migration 006: pursuit columns added)
-- ============================================================================

create table public.forecasts (
  id uuid primary key default uuid_generate_v4(),
  sector_id uuid not null references public.sectors(id) on delete cascade,
  name text not null,
  description text,
  forecast_type text not null
    check (forecast_type in ('change_order', 'new_project')),
  parent_project_id uuid references public.projects(id),  -- for change_order
  proposed_client_id uuid references public.clients(id),  -- for new_project
  bill_rate numeric(10,2) not null,       -- inherited or manual
  rate_type text not null default 'standard'
    check (rate_type in ('standard', 'cross_sector_adjusted')),
  probability text not null default 'medium'
    check (probability in ('committed', 'high', 'medium', 'low')),
  probability_weight numeric(4,2) generated always as (
    case probability
      when 'committed' then 1.00
      when 'high' then 0.75
      when 'medium' then 0.50
      when 'low' then 0.25
    end
  ) stored,
  start_date date not null,
  end_date date not null,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'approved', 'won', 'lost')),
  created_by uuid not null references auth.users(id),
  -- Added by migration 006: Opportunity management
  assigned_to uuid references auth.users(id),
  assigned_to_name text,
  pursuit_stage text default 'identified'
    check (pursuit_stage in (
      'identified', 'qualifying', 'proposal_prep', 'proposal_submitted',
      'negotiation', 'awaiting_decision', 'won', 'lost'
    )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- 11. FORECAST ALLOCATIONS (monthly resource plan per forecast)
-- ============================================================================


-- ============================================================================
-- 11. FORECAST ALLOCATIONS
-- ============================================================================

create table public.forecast_allocations (
  id uuid primary key default uuid_generate_v4(),
  forecast_id uuid not null references public.forecasts(id) on delete cascade,
  sector_id uuid not null references public.sectors(id) on delete cascade,
  employee_id uuid references public.employees(id),       -- null if role-based
  role_name text,                         -- fallback when no specific employee assigned
  month date not null,                    -- first day of month
  planned_hours numeric(6,2) not null check (planned_hours >= 0),
  created_at timestamptz not null default now(),
  unique (forecast_id, employee_id, month)
);

-- ============================================================================
-- 12. RESOURCE ALLOCATIONS (live project assignments)
-- ============================================================================
-- One employee -> one project -> one month = one allocation record.
-- Multiple records per employee per month = shared across projects.
-- ============================================================================


-- ============================================================================
-- 12. RESOURCE ALLOCATIONS
-- ============================================================================

create table public.resource_allocations (
  id uuid primary key default uuid_generate_v4(),
  sector_id uuid not null references public.sectors(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  month date not null,                    -- first day of month
  planned_hours numeric(6,2) not null check (planned_hours >= 0),
  actual_hours numeric(6,2),              -- populated from timesheets
  rate_type text not null default 'standard'
    check (rate_type in ('standard', 'cross_sector_adjusted')),
  allocation_status text not null default 'planned'
    check (allocation_status in ('planned', 'confirmed', 'actual', 'tentative')),
  source_forecast_id uuid references public.forecasts(id), -- if from a converted forecast
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sector_id, employee_id, project_id, month)
);

-- ============================================================================
-- 13. RATE CHANGE AUDIT LOG
-- ============================================================================
-- Tracks all cross-sector rate changes and project rate modifications.
-- ============================================================================


-- ============================================================================
-- 13. RATE CHANGE AUDIT LOG
-- ============================================================================

create table public.rate_audit_log (
  id uuid primary key default uuid_generate_v4(),
  sector_id uuid not null references public.sectors(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  changed_by uuid not null references auth.users(id),
  previous_rate numeric(10,2),
  new_rate numeric(10,2),
  change_type text not null
    check (change_type in ('adjusted_rate_set', 'adjusted_rate_changed', 'cross_charge_approved', 'cross_charge_revoked')),
  notes text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 14. APP SETTINGS (per-sector configuration)
-- ============================================================================


-- ============================================================================
-- 14. APP SETTINGS
-- ============================================================================

create table public.app_settings (
  id uuid primary key default uuid_generate_v4(),
  sector_id uuid not null references public.sectors(id) on delete cascade,
  setting_key text not null,
  setting_value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sector_id, setting_key)
);

-- ============================================================================
-- 15. WORKING HOURS CALENDAR (weeks-per-month, public holidays)
-- ============================================================================


-- ============================================================================
-- 15. WORKING HOURS CALENDAR
-- ============================================================================

create table public.working_hours_calendar (
  id uuid primary key default uuid_generate_v4(),
  sector_id uuid not null references public.sectors(id) on delete cascade,
  month date not null,                    -- first day of month
  weekdays_in_month integer not null,
  public_holidays numeric(4,1) not null default 0,
  assumed_vacation numeric(4,1) not null default 0,
  working_days numeric(5,1) generated always as (
    weekdays_in_month - public_holidays - assumed_vacation
  ) stored,
  created_at timestamptz not null default now(),
  unique (sector_id, month)
);



-- ============================================================================
-- INDEXES: BASE TABLES (1-15)
-- ============================================================================

create index idx_employees_sector on public.employees(sector_id);
create index idx_clients_sector on public.clients(sector_id);
create index idx_projects_sector on public.projects(sector_id);
create index idx_projects_client on public.projects(client_id);
create index idx_timesheet_entries_sector on public.timesheet_entries(sector_id);
create index idx_timesheet_entries_employee on public.timesheet_entries(employee_id);
create index idx_timesheet_entries_project on public.timesheet_entries(project_id);
create index idx_timesheet_entries_week on public.timesheet_entries(week_ending);
create index idx_invoices_sector on public.invoices(sector_id);
create index idx_invoices_client on public.invoices(client_id);
create index idx_invoices_status on public.invoices(status);
create index idx_invoice_lines_invoice on public.invoice_line_items(invoice_id);
create index idx_forecasts_sector on public.forecasts(sector_id);
create index idx_forecasts_status on public.forecasts(status);
create index idx_forecast_alloc_forecast on public.forecast_allocations(forecast_id);
create index idx_resource_alloc_sector on public.resource_allocations(sector_id);
create index idx_resource_alloc_employee on public.resource_allocations(employee_id);
create index idx_resource_alloc_project on public.resource_allocations(project_id);
create index idx_resource_alloc_month on public.resource_allocations(month);
create index idx_rate_audit_project on public.rate_audit_log(project_id);
create index idx_sector_members_user on public.sector_members(user_id);
create index idx_sector_members_sector on public.sector_members(sector_id);


-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================
create or replace function public.user_sector_ids()
returns setof uuid
language sql
security definer
stable
as $$
  select sector_id
  from public.sector_members
  where user_id = auth.uid();
$$;

-- Helper: check if user has a specific role (or higher) in a sector
create or replace function public.user_has_role(p_sector_id uuid, p_roles text[])
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from public.sector_members
    where user_id = auth.uid()
      and sector_id = p_sector_id
      and role = any(p_roles)
  );
$$;


-- ============================================================================
-- ENABLE RLS ON BASE TABLES
-- ============================================================================
alter table public.sectors enable row level security;
alter table public.sector_members enable row level security;
alter table public.employees enable row level security;
alter table public.clients enable row level security;
alter table public.projects enable row level security;
alter table public.timesheet_entries enable row level security;
alter table public.timesheet_uploads enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_line_items enable row level security;
alter table public.forecasts enable row level security;
alter table public.forecast_allocations enable row level security;
alter table public.resource_allocations enable row level security;
alter table public.rate_audit_log enable row level security;
alter table public.app_settings enable row level security;
alter table public.working_hours_calendar enable row level security;


-- ============================================================================
-- RLS POLICIES: SECTORS
-- ============================================================================
-- All members can view their sectors. Only admin can modify.
-- ============================================================================

create policy "sectors_select"
  on public.sectors for select
  using (id in (select public.user_sector_ids()));

create policy "sectors_insert"
  on public.sectors for insert
  with check (public.user_has_role(id, array['admin']));

create policy "sectors_update"
  on public.sectors for update
  using (public.user_has_role(id, array['admin']));

create policy "sectors_delete"
  on public.sectors for delete
  using (public.user_has_role(id, array['admin']));


-- ============================================================================
-- RLS POLICIES: SECTOR MEMBERS
-- ============================================================================
-- All members can see who is in their sector. Only admin can add/remove.
-- ============================================================================

create policy "sector_members_select"
  on public.sector_members for select
  using (sector_id in (select public.user_sector_ids()));

create policy "sector_members_insert"
  on public.sector_members for insert
  with check (public.user_has_role(sector_id, array['admin']));

create policy "sector_members_update"
  on public.sector_members for update
  using (public.user_has_role(sector_id, array['admin']));

create policy "sector_members_delete"
  on public.sector_members for delete
  using (public.user_has_role(sector_id, array['admin']));


-- ============================================================================
-- RLS POLICIES: EMPLOYEES
-- ============================================================================
-- All members can view. Sector lead and admin can modify.
-- ============================================================================

create policy "employees_select"
  on public.employees for select
  using (sector_id in (select public.user_sector_ids()));

create policy "employees_insert"
  on public.employees for insert
  with check (public.user_has_role(sector_id, array['sector_lead', 'admin']));

create policy "employees_update"
  on public.employees for update
  using (public.user_has_role(sector_id, array['sector_lead', 'admin']));

create policy "employees_delete"
  on public.employees for delete
  using (public.user_has_role(sector_id, array['sector_lead', 'admin']));


-- ============================================================================
-- RLS POLICIES: CLIENTS
-- ============================================================================

create policy "clients_select"
  on public.clients for select
  using (sector_id in (select public.user_sector_ids()));

create policy "clients_insert"
  on public.clients for insert
  with check (public.user_has_role(sector_id, array['sector_lead', 'admin']));

create policy "clients_update"
  on public.clients for update
  using (public.user_has_role(sector_id, array['sector_lead', 'admin']));

create policy "clients_delete"
  on public.clients for delete
  using (public.user_has_role(sector_id, array['sector_lead', 'admin']));


-- ============================================================================
-- RLS POLICIES: PROJECTS
-- ============================================================================

create policy "projects_select"
  on public.projects for select
  using (sector_id in (select public.user_sector_ids()));

create policy "projects_insert"
  on public.projects for insert
  with check (public.user_has_role(sector_id, array['sector_lead', 'admin']));

create policy "projects_update"
  on public.projects for update
  using (public.user_has_role(sector_id, array['sector_lead', 'admin']));

create policy "projects_delete"
  on public.projects for delete
  using (public.user_has_role(sector_id, array['sector_lead', 'admin']));


-- ============================================================================
-- RLS POLICIES: TIMESHEET ENTRIES
-- ============================================================================
-- PM, sector lead, admin can manage. Viewers can see.
-- ============================================================================

create policy "timesheet_entries_select"
  on public.timesheet_entries for select
  using (sector_id in (select public.user_sector_ids()));

create policy "timesheet_entries_insert"
  on public.timesheet_entries for insert
  with check (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));

create policy "timesheet_entries_update"
  on public.timesheet_entries for update
  using (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));

create policy "timesheet_entries_delete"
  on public.timesheet_entries for delete
  using (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));


-- ============================================================================
-- RLS POLICIES: TIMESHEET UPLOADS
-- ============================================================================

create policy "timesheet_uploads_select"
  on public.timesheet_uploads for select
  using (sector_id in (select public.user_sector_ids()));

create policy "timesheet_uploads_insert"
  on public.timesheet_uploads for insert
  with check (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));

create policy "timesheet_uploads_update"
  on public.timesheet_uploads for update
  using (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));


-- ============================================================================
-- RLS POLICIES: INVOICES
-- ============================================================================

create policy "invoices_select"
  on public.invoices for select
  using (sector_id in (select public.user_sector_ids()));

create policy "invoices_insert"
  on public.invoices for insert
  with check (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));

create policy "invoices_update"
  on public.invoices for update
  using (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));

create policy "invoices_delete"
  on public.invoices for delete
  using (public.user_has_role(sector_id, array['sector_lead', 'admin']));


-- ============================================================================
-- RLS POLICIES: INVOICE LINE ITEMS
-- ============================================================================

create policy "invoice_line_items_select"
  on public.invoice_line_items for select
  using (sector_id in (select public.user_sector_ids()));

create policy "invoice_line_items_insert"
  on public.invoice_line_items for insert
  with check (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));

create policy "invoice_line_items_update"
  on public.invoice_line_items for update
  using (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));

create policy "invoice_line_items_delete"
  on public.invoice_line_items for delete
  using (public.user_has_role(sector_id, array['sector_lead', 'admin']));


-- ============================================================================
-- RLS POLICIES: FORECASTS
-- ============================================================================

create policy "forecasts_select"
  on public.forecasts for select
  using (sector_id in (select public.user_sector_ids()));

create policy "forecasts_insert"
  on public.forecasts for insert
  with check (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));

create policy "forecasts_update"
  on public.forecasts for update
  using (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));

create policy "forecasts_delete"
  on public.forecasts for delete
  using (public.user_has_role(sector_id, array['sector_lead', 'admin']));


-- ============================================================================
-- RLS POLICIES: FORECAST ALLOCATIONS
-- ============================================================================

create policy "forecast_allocations_select"
  on public.forecast_allocations for select
  using (sector_id in (select public.user_sector_ids()));

create policy "forecast_allocations_insert"
  on public.forecast_allocations for insert
  with check (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));

create policy "forecast_allocations_update"
  on public.forecast_allocations for update
  using (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));

create policy "forecast_allocations_delete"
  on public.forecast_allocations for delete
  using (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));


-- ============================================================================
-- RLS POLICIES: RESOURCE ALLOCATIONS
-- ============================================================================

create policy "resource_allocations_select"
  on public.resource_allocations for select
  using (sector_id in (select public.user_sector_ids()));

create policy "resource_allocations_insert"
  on public.resource_allocations for insert
  with check (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));

create policy "resource_allocations_update"
  on public.resource_allocations for update
  using (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));

create policy "resource_allocations_delete"
  on public.resource_allocations for delete
  using (public.user_has_role(sector_id, array['sector_lead', 'admin']));


-- ============================================================================
-- RLS POLICIES: RATE AUDIT LOG (append-only)
-- ============================================================================

create policy "rate_audit_log_select"
  on public.rate_audit_log for select
  using (sector_id in (select public.user_sector_ids()));

create policy "rate_audit_log_insert"
  on public.rate_audit_log for insert
  with check (sector_id in (select public.user_sector_ids()));

-- No update or delete policies: audit trail is immutable


-- ============================================================================
-- RLS POLICIES: APP SETTINGS
-- ============================================================================

create policy "app_settings_select"
  on public.app_settings for select
  using (sector_id in (select public.user_sector_ids()));

create policy "app_settings_insert"
  on public.app_settings for insert
  with check (public.user_has_role(sector_id, array['sector_lead', 'admin']));

create policy "app_settings_update"
  on public.app_settings for update
  using (public.user_has_role(sector_id, array['sector_lead', 'admin']));

create policy "app_settings_delete"
  on public.app_settings for delete
  using (public.user_has_role(sector_id, array['admin']));


-- ============================================================================
-- RLS POLICIES: WORKING HOURS CALENDAR
-- ============================================================================

create policy "working_hours_calendar_select"
  on public.working_hours_calendar for select
  using (sector_id in (select public.user_sector_ids()));

create policy "working_hours_calendar_insert"
  on public.working_hours_calendar for insert
  with check (public.user_has_role(sector_id, array['sector_lead', 'admin']));

create policy "working_hours_calendar_update"
  on public.working_hours_calendar for update
  using (public.user_has_role(sector_id, array['sector_lead', 'admin']));

create policy "working_hours_calendar_delete"
  on public.working_hours_calendar for delete
  using (public.user_has_role(sector_id, array['sector_lead', 'admin']));



-- ============================================================================
-- TRIGGER FUNCTIONS
-- ============================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Apply to all tables with updated_at
create trigger trg_sectors_updated_at
  before update on public.sectors
  for each row execute function public.set_updated_at();

create trigger trg_employees_updated_at
  before update on public.employees
  for each row execute function public.set_updated_at();

create trigger trg_clients_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

create trigger trg_projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

create trigger trg_invoices_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

create trigger trg_forecasts_updated_at
  before update on public.forecasts
  for each row execute function public.set_updated_at();

create trigger trg_resource_allocations_updated_at
  before update on public.resource_allocations
  for each row execute function public.set_updated_at();

create trigger trg_app_settings_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();


-- 2. Auto-set invoice status to 'paid' when date_paid is populated
create or replace function public.auto_set_invoice_status()
returns trigger
language plpgsql
as $$
begin
  if new.date_paid is not null and old.date_paid is null then
    new.status = 'paid';
  end if;
  if new.date_paid is null and old.date_paid is not null then
    -- Payment cleared/reversed: revert to sent
    new.status = 'sent';
  end if;
  return new;
end;
$$;

create trigger trg_invoice_auto_status
  before update on public.invoices
  for each row execute function public.auto_set_invoice_status();


-- 3. Auto-flag overdue invoices (called by pg_cron or Supabase scheduled function)
create or replace function public.auto_set_overdue()
returns void
language plpgsql
security definer
as $$
declare
  v_threshold integer;
begin
  -- Default 30 days if no setting found
  select coalesce(
    (select setting_value::integer
     from public.app_settings
     where setting_key = 'overdue_threshold_days'
     limit 1),
    30
  ) into v_threshold;

  update public.invoices
  set status = 'overdue',
      updated_at = now()
  where status = 'sent'
    and due_date < current_date
    and date_paid is null;
end;
$$;


-- 4. Log rate changes on projects
create or replace function public.log_rate_change()
returns trigger
language plpgsql
as $$
begin
  -- Log when adjusted_bill_rate is set for the first time
  if old.adjusted_bill_rate is null and new.adjusted_bill_rate is not null then
    insert into public.rate_audit_log (
      sector_id, project_id, changed_by, previous_rate, new_rate, change_type, notes
    ) values (
      new.sector_id, new.id, auth.uid(), null, new.adjusted_bill_rate,
      'adjusted_rate_set', 'Initial cross-sector rate set'
    );
  -- Log when adjusted_bill_rate changes
  elsif old.adjusted_bill_rate is distinct from new.adjusted_bill_rate
        and old.adjusted_bill_rate is not null then
    insert into public.rate_audit_log (
      sector_id, project_id, changed_by, previous_rate, new_rate, change_type, notes
    ) values (
      new.sector_id, new.id, auth.uid(), old.adjusted_bill_rate, new.adjusted_bill_rate,
      'adjusted_rate_changed', null
    );
  end if;

  -- Log cross-charge approval
  if old.cross_charge_approved_at is null and new.cross_charge_approved_at is not null then
    insert into public.rate_audit_log (
      sector_id, project_id, changed_by, previous_rate, new_rate, change_type, notes
    ) values (
      new.sector_id, new.id, auth.uid(), null, new.adjusted_bill_rate,
      'cross_charge_approved', new.cross_charge_justification
    );
  end if;

  -- Log cross-charge revocation
  if old.cross_charge_approved_at is not null and new.cross_charge_approved_at is null then
    insert into public.rate_audit_log (
      sector_id, project_id, changed_by, previous_rate, new_rate, change_type, notes
    ) values (
      new.sector_id, new.id, auth.uid(), old.adjusted_bill_rate, null,
      'cross_charge_revoked', 'Approval revoked'
    );
  end if;

  return new;
end;
$$;

create trigger trg_project_rate_change
  after update on public.projects
  for each row execute function public.log_rate_change();


-- 5. Convert forecast to project when status changes to 'won'
create or replace function public.convert_forecast_to_project()
returns trigger
language plpgsql
security definer
as $$
declare
  v_new_project_id uuid;
  v_client_id uuid;
  v_project_code text;
  v_project_count integer;
begin
  if old.status != 'won' and new.status = 'won' then

    -- Determine client: parent project's client for change_order, proposed_client for new_project
    if new.forecast_type = 'change_order' and new.parent_project_id is not null then
      select client_id into v_client_id
      from public.projects
      where id = new.parent_project_id;
    else
      v_client_id = new.proposed_client_id;
    end if;

    -- Generate next project code
    select count(*) + 1 into v_project_count
    from public.projects
    where sector_id = new.sector_id
      and type = 'billable';
    v_project_code = 'PRJ-' || lpad(v_project_count::text, 3, '0');

    -- Create the project
    insert into public.projects (
      sector_id, client_id, code, name, type, rate_type,
      adjusted_bill_rate, effective_start, effective_end
    ) values (
      new.sector_id, v_client_id, v_project_code, new.name,
      'billable', new.rate_type,
      case when new.rate_type = 'cross_sector_adjusted' then new.bill_rate else null end,
      new.start_date, new.end_date
    ) returning id into v_new_project_id;

    -- Convert forecast allocations to resource allocations
    insert into public.resource_allocations (
      sector_id, employee_id, project_id, month, planned_hours,
      rate_type, allocation_status, source_forecast_id
    )
    select
      fa.sector_id, fa.employee_id, v_new_project_id, fa.month,
      fa.planned_hours, new.rate_type, 'planned', new.id
    from public.forecast_allocations fa
    where fa.forecast_id = new.id
      and fa.employee_id is not null;

  end if;

  return new;
end;
$$;

create trigger trg_forecast_to_project
  after update on public.forecasts
  for each row execute function public.convert_forecast_to_project();



-- ============================================================================
-- SEED DATA: PCS SECTOR
-- ============================================================================
-- SEED DATA: PCS SECTOR
-- ============================================================================
-- Data sourced from the corporate budget workbook and technical spec.
-- Employee hourly costs are fully loaded (salary + 3% inflation + payroll
-- tax 8% + medical + pension) / 2,080 annual hours.
-- ============================================================================

-- Sector
insert into public.sectors (id, name, code, description, budget_year, annual_budget_target)
values (
  '00000000-0000-0000-0000-000000000001',
  'Procurement & Compliance',
  'PCS',
  'Davis Bacon, DBRA compliance monitoring, procurement services, I-9 verification',
  2026,
  4133424.68
);

-- Employees (16 total: 13 existing + 3 new hires)
-- Hourly costs from Employment Costs sheet with 3% salary inflation applied for 2026
insert into public.employees (sector_id, employee_code, name, role, hourly_cost, target_utilization, start_date) values
  ('00000000-0000-0000-0000-000000000001', 'EMP-01', 'John, Brnady Keith', 'Sr Compliance Manager', 76.53, 0.75, '2024-04-01'),
  ('00000000-0000-0000-0000-000000000001', 'EMP-02', 'Jones, Leah', 'Team Connect Lead', 65.70, 0.25, '2023-01-01'),
  ('00000000-0000-0000-0000-000000000001', 'EMP-03', 'Lugo, Jasmine', 'Compliance Analyst', 59.42, 0.95, '2023-01-01'),
  ('00000000-0000-0000-0000-000000000001', 'EMP-04', 'Madrigal, Frank', 'Senior Analyst', 81.56, 0.50, '2023-01-01'),
  ('00000000-0000-0000-0000-000000000001', 'EMP-05', 'Ochoa, Norma', 'Compliance Analyst', 65.22, 0.95, '2023-01-01'),
  ('00000000-0000-0000-0000-000000000001', 'EMP-06', 'Stoddard, Shane', 'Field Monitor', 39.62, 0.95, '2023-02-01'),
  ('00000000-0000-0000-0000-000000000001', 'EMP-07', 'Strehler, Samantha', 'Senior Compliance', 47.74, 0.95, '2023-01-01'),
  ('00000000-0000-0000-0000-000000000001', 'EMP-08', 'Williams, Christine', 'Principal / X-Sector', 119.35, 0.25, '2023-01-01'),
  ('00000000-0000-0000-0000-000000000001', 'EMP-09', 'Dorothy Taylor', 'Senior Compliance', 74.27, 0.75, '2025-09-01'),
  ('00000000-0000-0000-0000-000000000001', 'EMP-10', 'Ethan Stoddard', 'Field Monitor', 32.19, 0.70, '2025-08-01'),
  ('00000000-0000-0000-0000-000000000001', 'EMP-11', 'Ana Arreola', 'Field Monitor', 32.19, 0.70, '2025-08-01'),
  ('00000000-0000-0000-0000-000000000001', 'EMP-12', 'Deanna Cordova', 'Field Monitor', 34.66, 0.70, '2025-08-01'),
  ('00000000-0000-0000-0000-000000000001', 'EMP-13', 'Adrian Medina', 'Field Monitor', 34.66, 0.70, '2025-08-01'),
  ('00000000-0000-0000-0000-000000000001', 'NH-01', 'NH1 Senior', 'Senior Compliance', 72.12, 0.95, '2026-01-01'),
  ('00000000-0000-0000-0000-000000000001', 'NH-02', 'NH2 Junior', 'Field Monitor', 48.08, 0.70, '2026-04-01'),
  ('00000000-0000-0000-0000-000000000001', 'NH-03', 'NH3 Junior', 'Field Monitor', 48.08, 0.70, '2026-06-01');

-- Clients (7)
insert into public.clients (id, sector_id, name, standard_bill_rate, po_reference, budget, status) values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'TSMC', 159.65, 'WO-509227', 4286860.13, 'active'),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000001', 'Okland', 159.65, 'WO-510916', 596305.00, 'active'),
  ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000001', 'Texas Instruments', 145.00, null, null, 'pipeline'),
  ('00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000001', 'Micron', 145.00, null, null, 'pipeline'),
  ('00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-000000000001', 'Client 5 (X-Sector)', 180.25, null, 100000.00, 'active'),
  ('00000000-0000-0000-0000-000000000106', '00000000-0000-0000-0000-000000000001', 'Client 6', 145.00, null, null, 'pipeline'),
  ('00000000-0000-0000-0000-000000000107', '00000000-0000-0000-0000-000000000001', 'Client 7', 145.00, null, null, 'pipeline');

-- Projects (12: 8 billable + 4 overhead)
insert into public.projects (sector_id, client_id, code, name, type, rate_type, adjusted_bill_rate, effective_start, effective_end) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101', 'PRJ-001', 'TSMC Davis Bacon Monitoring FY24', 'billable', 'standard', null, '2024-01-01', '2025-12-31'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000102', 'PRJ-002', 'Okland B51U DBRA', 'billable', 'standard', null, '2025-07-01', '2026-12-31'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101', 'PRJ-003', 'TSMC I-9 Verification', 'billable', 'standard', null, '2025-09-01', null),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000103', 'PRJ-004', 'TI Davis Bacon Monitoring SVS', 'billable', 'standard', null, null, null),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000104', 'PRJ-005', 'Micron CHIPS Support', 'billable', 'standard', null, null, null),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000105', 'PRJ-006', 'X-Sector ASML Support', 'billable', 'cross_sector_adjusted', 145.00, '2025-08-01', null),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101', 'PRJ-007', 'TSMC I-9 Verification Svs', 'billable', 'standard', null, null, null),
  ('00000000-0000-0000-0000-000000000001', null, 'PRJ-008', 'Blue Sky Pipeline', 'billable', 'standard', null, null, null),
  ('00000000-0000-0000-0000-000000000001', null, 'OVH-001', 'Overhead - Admin & Management', 'overhead', 'standard', null, '2024-01-01', null),
  ('00000000-0000-0000-0000-000000000001', null, 'OVH-002', 'Overhead - Training & Development', 'overhead', 'standard', null, '2024-01-01', null),
  ('00000000-0000-0000-0000-000000000001', null, 'OVH-003', 'Overhead - Business Development', 'overhead', 'standard', null, '2024-01-01', null),
  ('00000000-0000-0000-0000-000000000001', null, 'OVH-004', 'Overhead - Quarterly Meetings', 'overhead', 'standard', null, '2024-01-01', null);

-- Working Hours Calendar 2026 (from vLookups sheet)
insert into public.working_hours_calendar (sector_id, month, weekdays_in_month, public_holidays, assumed_vacation) values
  ('00000000-0000-0000-0000-000000000001', '2026-01-01', 22, 1.5, 1),
  ('00000000-0000-0000-0000-000000000001', '2026-02-01', 20, 0.5, 1),
  ('00000000-0000-0000-0000-000000000001', '2026-03-01', 22, 0, 1),
  ('00000000-0000-0000-0000-000000000001', '2026-04-01', 22, 0, 1.5),
  ('00000000-0000-0000-0000-000000000001', '2026-05-01', 21, 1, 1),
  ('00000000-0000-0000-0000-000000000001', '2026-06-01', 22, 0, 1.5),
  ('00000000-0000-0000-0000-000000000001', '2026-07-01', 23, 1, 1.5),
  ('00000000-0000-0000-0000-000000000001', '2026-08-01', 21, 0, 2),
  ('00000000-0000-0000-0000-000000000001', '2026-09-01', 22, 1, 1.5),
  ('00000000-0000-0000-0000-000000000001', '2026-10-01', 22, 0, 1.5),
  ('00000000-0000-0000-0000-000000000001', '2026-11-01', 21, 2, 1),
  ('00000000-0000-0000-0000-000000000001', '2026-12-01', 23, 2.5, 3);

-- App Settings (defaults for PCS sector)
insert into public.app_settings (sector_id, setting_key, setting_value) values
  ('00000000-0000-0000-0000-000000000001', 'weekly_hours', '40'),
  ('00000000-0000-0000-0000-000000000001', 'overdue_threshold_days', '30'),
  ('00000000-0000-0000-0000-000000000001', 'salary_inflation', '0.03'),
  ('00000000-0000-0000-0000-000000000001', 'payroll_tax_rate', '0.08'),
  ('00000000-0000-0000-0000-000000000001', 'medical_inflation', '0.08'),
  ('00000000-0000-0000-0000-000000000001', 'pension_rate', '0.03'),
  ('00000000-0000-0000-0000-000000000001', 'default_bill_rate', '145.00'),
  ('00000000-0000-0000-0000-000000000001', 'cross_sector_multiplier', '1.7'),
  ('00000000-0000-0000-0000-000000000001', 'budget_year', '2026'),
  ('00000000-0000-0000-0000-000000000001', 'invoice_prefix', 'INV'),
  ('00000000-0000-0000-0000-000000000001', 'invoice_payment_terms_days', '30');


-- ============================================================================


-- DATABASE VIEWS
-- ============================================================================



-- ============================================================================
-- BASE VIEWS
-- ============================================================================
create or replace view public.v_employee_utilization as
select
  e.sector_id,
  e.id as employee_id,
  e.name as employee_name,
  e.role,
  e.hourly_cost,
  e.target_utilization,
  ra.month,
  whc.working_days,
  (whc.working_days * 8) as available_hours,
  coalesce(sum(ra.planned_hours) filter (where p.type = 'billable'), 0) as planned_billable_hours,
  coalesce(sum(ra.planned_hours) filter (where p.type = 'overhead'), 0) as planned_overhead_hours,
  coalesce(sum(ra.actual_hours) filter (where p.type = 'billable'), 0) as actual_billable_hours,
  coalesce(sum(ra.actual_hours) filter (where p.type = 'overhead'), 0) as actual_overhead_hours,
  case
    when (whc.working_days * 8) > 0 then
      round(coalesce(sum(ra.planned_hours) filter (where p.type = 'billable'), 0)
        / (whc.working_days * 8), 4)
    else 0
  end as planned_utilization,
  case
    when (whc.working_days * 8) > 0 then
      round(coalesce(sum(ra.actual_hours) filter (where p.type = 'billable'), 0)
        / (whc.working_days * 8), 4)
    else 0
  end as actual_utilization,
  case
    when (whc.working_days * 8) > 0 then
      case
        when coalesce(sum(ra.actual_hours) filter (where p.type = 'billable'), 0)
          / (whc.working_days * 8) >= e.target_utilization then 'on_target'
        when coalesce(sum(ra.actual_hours) filter (where p.type = 'billable'), 0)
          / (whc.working_days * 8) >= e.target_utilization * 0.8 then 'near_target'
        else 'below_target'
      end
    else 'no_data'
  end as utilization_status
from public.employees e
cross join public.working_hours_calendar whc
left join public.resource_allocations ra
  on ra.employee_id = e.id and ra.month = whc.month
left join public.projects p
  on p.id = ra.project_id
where e.sector_id = whc.sector_id
  and e.is_active = true
group by e.sector_id, e.id, e.name, e.role, e.hourly_cost,
         e.target_utilization, ra.month, whc.working_days;


-- 2. Invoice Aging
create or replace view public.v_invoice_aging as
select
  i.sector_id,
  i.id as invoice_id,
  i.invoice_number,
  c.name as client_name,
  i.billing_month,
  i.amount,
  i.status,
  i.due_date,
  i.date_paid,
  case
    when i.status = 'paid' then 0
    else current_date - i.due_date
  end as days_outstanding,
  case
    when i.status = 'paid' then 'paid'
    when i.due_date >= current_date then 'current'
    when current_date - i.due_date <= 30 then '1_to_30_days'
    when current_date - i.due_date <= 60 then '31_to_60_days'
    when current_date - i.due_date <= 90 then '61_to_90_days'
    else 'over_90_days'
  end as aging_bucket,
  i.notes,
  i.entered_by,
  i.created_at
from public.invoices i
join public.clients c on c.id = i.client_id;


-- 3. Forecast Pipeline (weighted revenue by month)
create or replace view public.v_forecast_pipeline as
select
  f.sector_id,
  f.id as forecast_id,
  f.name as forecast_name,
  f.forecast_type,
  f.probability,
  f.probability_weight,
  f.bill_rate,
  f.status,
  fa.month,
  fa.planned_hours,
  round(fa.planned_hours * f.bill_rate, 2) as gross_revenue,
  round(fa.planned_hours * f.bill_rate * f.probability_weight, 2) as weighted_revenue,
  fa.employee_id,
  e.name as employee_name,
  fa.role_name
from public.forecasts f
join public.forecast_allocations fa on fa.forecast_id = f.id
left join public.employees e on e.id = fa.employee_id
where f.status not in ('lost');


-- 4. Resource Capacity (monthly per employee)
create or replace view public.v_resource_capacity as
select
  e.sector_id,
  e.id as employee_id,
  e.name as employee_name,
  e.role,
  e.target_utilization,
  whc.month,
  (whc.working_days * 8) as total_available_hours,
  coalesce(sum(ra.planned_hours), 0) as total_allocated_hours,
  (whc.working_days * 8) - coalesce(sum(ra.planned_hours), 0) as remaining_capacity,
  case
    when (whc.working_days * 8) > 0 then
      round(coalesce(sum(ra.planned_hours), 0) / (whc.working_days * 8), 4)
    else 0
  end as allocation_pct,
  case
    when coalesce(sum(ra.planned_hours), 0) > (whc.working_days * 8) then true
    else false
  end as is_over_allocated
from public.employees e
cross join public.working_hours_calendar whc
left join public.resource_allocations ra
  on ra.employee_id = e.id and ra.month = whc.month
where e.sector_id = whc.sector_id
  and e.is_active = true
group by e.sector_id, e.id, e.name, e.role, e.target_utilization,
         whc.month, whc.working_days;


-- 5. Sector Summary (KPI rollup)
create or replace view public.v_sector_summary as
with monthly_revenue as (
  select
    ra.sector_id,
    ra.month,
    sum(
      case
        when p.rate_type = 'cross_sector_adjusted' then ra.planned_hours * p.adjusted_bill_rate
        else ra.planned_hours * c.standard_bill_rate
      end
    ) as planned_revenue,
    sum(
      case
        when ra.actual_hours is not null then
          case
            when p.rate_type = 'cross_sector_adjusted' then ra.actual_hours * p.adjusted_bill_rate
            else ra.actual_hours * c.standard_bill_rate
          end
        else 0
      end
    ) as actual_revenue,
    sum(ra.planned_hours * e.hourly_cost) as planned_cost,
    sum(coalesce(ra.actual_hours, 0) * e.hourly_cost) as actual_cost
  from public.resource_allocations ra
  join public.projects p on p.id = ra.project_id
  join public.employees e on e.id = ra.employee_id
  left join public.clients c on c.id = p.client_id
  where p.type = 'billable'
  group by ra.sector_id, ra.month
),
invoice_totals as (
  select
    sector_id,
    sum(amount) filter (where status = 'paid') as total_paid,
    sum(amount) filter (where status = 'sent') as total_outstanding,
    sum(amount) filter (where status = 'overdue') as total_overdue,
    sum(amount) as total_invoiced
  from public.invoices
  group by sector_id
),
headcount as (
  select
    sector_id,
    count(*) filter (where is_active = true) as active_headcount
  from public.employees
  group by sector_id
)
select
  s.id as sector_id,
  s.name as sector_name,
  s.code as sector_code,
  s.budget_year,
  s.annual_budget_target,
  coalesce(sum(mr.planned_revenue), 0) as total_planned_revenue,
  coalesce(sum(mr.actual_revenue), 0) as total_actual_revenue,
  coalesce(sum(mr.planned_cost), 0) as total_planned_cost,
  coalesce(sum(mr.actual_cost), 0) as total_actual_cost,
  coalesce(sum(mr.planned_revenue), 0) - coalesce(sum(mr.planned_cost), 0) as planned_margin,
  coalesce(sum(mr.actual_revenue), 0) - coalesce(sum(mr.actual_cost), 0) as actual_margin,
  case
    when coalesce(sum(mr.planned_revenue), 0) > 0 then
      round((coalesce(sum(mr.planned_revenue), 0) - coalesce(sum(mr.planned_cost), 0))
        / sum(mr.planned_revenue), 4)
    else 0
  end as planned_margin_pct,
  case
    when coalesce(sum(mr.actual_revenue), 0) > 0 then
      round((coalesce(sum(mr.actual_revenue), 0) - coalesce(sum(mr.actual_cost), 0))
        / sum(mr.actual_revenue), 4)
    else 0
  end as actual_margin_pct,
  coalesce(it.total_invoiced, 0) as total_invoiced,
  coalesce(it.total_paid, 0) as total_paid,
  coalesce(it.total_outstanding, 0) as total_outstanding,
  coalesce(it.total_overdue, 0) as total_overdue,
  coalesce(hc.active_headcount, 0) as active_headcount
from public.sectors s
left join monthly_revenue mr on mr.sector_id = s.id
left join invoice_totals it on it.sector_id = s.id
left join headcount hc on hc.sector_id = s.id
group by s.id, s.name, s.code, s.budget_year, s.annual_budget_target,
         it.total_invoiced, it.total_paid, it.total_outstanding,
         it.total_overdue, hc.active_headcount;


-- ============================================================================



-- ============================================================================
-- ADDITIONAL VIEWS FROM MIGRATIONS 005-009
-- ============================================================================


-- ============================================================================
-- STORAGE BUCKETS
-- ============================================================================
-- STORAGE BUCKETS
-- ============================================================================

insert into storage.buckets (id, name, public)
values
  ('timesheet-uploads', 'timesheet-uploads', false),
  ('invoice-documents', 'invoice-documents', false);

-- Storage RLS: only authenticated sector members can access their files
create policy "timesheet_uploads_storage_select"
  on storage.objects for select
  using (
    bucket_id = 'timesheet-uploads'
    and auth.role() = 'authenticated'
  );

create policy "timesheet_uploads_storage_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'timesheet-uploads'
    and auth.role() = 'authenticated'
  );

create policy "invoice_documents_storage_select"
  on storage.objects for select
  using (
    bucket_id = 'invoice-documents'
    and auth.role() = 'authenticated'
  );

create policy "invoice_documents_storage_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'invoice-documents'
    and auth.role() = 'authenticated'
  );


-- ============================================================================



-- ============================================================================
-- SCHEMA COMPLETE — 21 February 2026 (Rev 2)
-- ============================================================================
-- Summary:
--   37 tables:
--     Base (15): sectors, sector_members, employees, clients, projects,
--                timesheet_entries, timesheet_uploads, invoices,
--                invoice_line_items, forecasts, forecast_allocations,
