-- ============================================================================
-- Migration 002: Weekly Planned Hours + Invoice Entry Support
-- ============================================================================
-- Run AFTER 20260220_complete_schema.sql
-- Adds weekly-level resource planning with 40-hour guardrails
-- ============================================================================

-- ============================================================================
-- 1. PLANNED WEEKLY HOURS
-- ============================================================================
-- One row = one employee, one project, one week.
-- The 40-hour check aggregates across all projects for a given employee+week.
-- week_ending should always be a Friday (or Sunday, per convention).
-- ============================================================================

create table if not exists public.planned_weekly_hours (
  id uuid primary key default uuid_generate_v4(),
  sector_id uuid not null references public.sectors(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  week_ending date not null,
  planned_hours numeric(6,2) not null default 0 check (planned_hours >= 0),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sector_id, employee_id, project_id, week_ending)
);

-- Indexes
create index idx_pwh_sector on public.planned_weekly_hours(sector_id);
create index idx_pwh_employee on public.planned_weekly_hours(employee_id);
create index idx_pwh_project on public.planned_weekly_hours(project_id);
create index idx_pwh_week on public.planned_weekly_hours(week_ending);
create index idx_pwh_emp_week on public.planned_weekly_hours(employee_id, week_ending);

-- updated_at trigger
create trigger trg_planned_weekly_hours_updated_at
  before update on public.planned_weekly_hours
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 2. RLS POLICIES for planned_weekly_hours
-- ============================================================================

alter table public.planned_weekly_hours enable row level security;

create policy "pwh_select"
  on public.planned_weekly_hours for select
  using (sector_id in (select public.user_sector_ids()));

create policy "pwh_insert"
  on public.planned_weekly_hours for insert
  with check (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));

create policy "pwh_update"
  on public.planned_weekly_hours for update
  using (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));

create policy "pwh_delete"
  on public.planned_weekly_hours for delete
  using (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));


-- ============================================================================
-- 3. VIEW: Weekly hours per employee (40-hour check)
-- ============================================================================
-- Aggregates planned hours across ALL projects for each employee+week.
-- Flags any week where total exceeds 40 hours.
-- ============================================================================

create or replace view public.v_employee_weekly_totals as
select
  pwh.sector_id,
  pwh.employee_id,
  e.name as employee_name,
  e.employee_code,
  pwh.week_ending,
  sum(pwh.planned_hours) as total_planned_hours,
  case
    when sum(pwh.planned_hours) > 40 then true
    else false
  end as exceeds_40,
  sum(pwh.planned_hours) - 40 as hours_over,
  -- Also pull actual hours from timesheets for the same week
  coalesce(
    (select sum(te.hours)
     from public.timesheet_entries te
     where te.employee_id = pwh.employee_id
       and te.week_ending = pwh.week_ending),
    0
  ) as total_actual_hours
from public.planned_weekly_hours pwh
join public.employees e on e.id = pwh.employee_id
group by pwh.sector_id, pwh.employee_id, e.name, e.employee_code, pwh.week_ending;


-- ============================================================================
-- 4. VIEW: Monthly rollup of weekly planned hours
-- ============================================================================
-- Bridges weekly data back to the monthly resource_allocations model
-- so the existing dashboard KPIs and views continue to work.
-- ============================================================================

create or replace view public.v_monthly_planned_from_weekly as
select
  pwh.sector_id,
  pwh.employee_id,
  pwh.project_id,
  date_trunc('month', pwh.week_ending)::date as month,
  sum(pwh.planned_hours) as planned_hours,
  count(distinct pwh.week_ending) as weeks_in_month
from public.planned_weekly_hours pwh
group by pwh.sector_id, pwh.employee_id, pwh.project_id,
         date_trunc('month', pwh.week_ending)::date;


-- ============================================================================
-- 5. VIEW: Project profile summary
-- ============================================================================
-- Shows per-project: PO value, total planned hours, total planned revenue,
-- total invoiced, remaining PO balance.
-- ============================================================================

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
  c.id as client_id,
  c.name as client_name,
  c.standard_bill_rate,
  c.po_reference,
  c.budget as po_value,
  -- Total planned hours (from weekly)
  coalesce(
    (select sum(pwh.planned_hours)
     from public.planned_weekly_hours pwh
     where pwh.project_id = p.id), 0
  ) as total_planned_hours,
  -- Total actual hours (from timesheets)
  coalesce(
    (select sum(te.hours)
     from public.timesheet_entries te
     where te.project_id = p.id), 0
  ) as total_actual_hours,
  -- Planned revenue
  coalesce(
    (select sum(pwh.planned_hours) *
      case
        when p.rate_type = 'cross_sector_adjusted' then p.adjusted_bill_rate
        else c.standard_bill_rate
      end
     from public.planned_weekly_hours pwh
     where pwh.project_id = p.id), 0
  ) as planned_revenue,
  -- Total invoiced against this project's client
  coalesce(
    (select sum(i.amount)
     from public.invoices i
     where i.client_id = p.client_id
       and i.sector_id = p.sector_id), 0
  ) as total_invoiced
from public.projects p
left join public.clients c on c.id = p.client_id;


-- ============================================================================
-- 6. VIEW: Employee profile summary
-- ============================================================================
-- Shows per-employee: total planned hours by month, total across all projects,
-- project assignments, weekly warnings.
-- ============================================================================

create or replace view public.v_employee_profile as
select
  e.id as employee_id,
  e.sector_id,
  e.employee_code,
  e.name,
  e.role,
  e.hourly_cost,
  e.target_utilization,
  e.start_date,
  e.end_date,
  e.is_active,
  -- Total planned hours for the year
  coalesce(
    (select sum(pwh.planned_hours)
     from public.planned_weekly_hours pwh
     where pwh.employee_id = e.id), 0
  ) as total_planned_hours,
  -- Count of projects assigned
  (select count(distinct pwh.project_id)
   from public.planned_weekly_hours pwh
   where pwh.employee_id = e.id
     and pwh.planned_hours > 0
  ) as project_count,
  -- Count of weeks exceeding 40 hours
  (select count(*)
   from (
     select pwh.week_ending
     from public.planned_weekly_hours pwh
     where pwh.employee_id = e.id
     group by pwh.week_ending
     having sum(pwh.planned_hours) > 40
   ) overloaded
  ) as weeks_over_40
from public.employees e;


-- ============================================================================
-- 7. Generate Fridays for 2026 (week_ending reference)
-- ============================================================================
-- Utility table so the hours grid knows which weeks exist.
-- ============================================================================

create table if not exists public.week_endings (
  week_ending date primary key,
  month date not null,  -- first day of the month this Friday falls in
  year integer not null
);

-- Populate Fridays for 2026
insert into public.week_endings (week_ending, month, year)
select
  d::date as week_ending,
  date_trunc('month', d)::date as month,
  2026 as year
from generate_series('2026-01-02'::date, '2026-12-31'::date, '7 days'::interval) d
where extract(dow from d) = 5  -- 5 = Friday
on conflict do nothing;

-- If the above doesn't start on a Friday, use this approach instead:
-- Find the first Friday of 2026 and generate from there
delete from public.week_endings where year = 2026;
insert into public.week_endings (week_ending, month, year)
select
  d::date as week_ending,
  date_trunc('month', d)::date as month,
  2026 as year
from generate_series(
  -- First Friday of 2026: Jan 2, 2026 is a Friday
  '2026-01-02'::date,
  '2026-12-31'::date,
  '7 days'::interval
) d;


-- ============================================================================
-- 8. Add monthly_forecast column to clients for PO tracking
-- ============================================================================
-- Allows entering expected monthly invoice amount per client
-- so we can compare actual invoiced vs expected.
-- ============================================================================

alter table public.clients
  add column if not exists monthly_forecast numeric(14,2);


-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Summary:
--   1 new table: planned_weekly_hours (with RLS, indexes, trigger)
--   1 reference table: week_endings (Fridays for 2026)
--   4 new views: v_employee_weekly_totals, v_monthly_planned_from_weekly,
--                v_project_profile, v_employee_profile
--   1 column added: clients.monthly_forecast
-- ============================================================================
