-- ============================================================================
-- Migration 005: PM Project Dashboard
-- Currie & Brown Budget Management Application
-- ============================================================================
-- ADDITIVE ONLY — no existing tables are modified or dropped.
--
-- Adds 5 new tables:
--   1. project_meetings     — Client meeting log with action items
--   2. project_contacts     — Stakeholder map per project
--   3. project_risks        — Risk and issue register per project
--   4. project_lessons      — Lessons learned log per project
--   5. project_savings      — Tangible and intangible savings log per project
--
-- Adds 1 new view:
--   v_project_health        — Composite health score per project
--
-- All tables follow the established pattern:
--   - sector_id foreign key for tenant isolation
--   - RLS policies using user_sector_ids() and user_has_role()
--   - PM / Sector Lead / Admin write access, Viewer read-only
--   - updated_at trigger where applicable
--   - Deterministic UUIDs in seed data
-- ============================================================================


-- ============================================================================
-- TABLE 1: PROJECT_MEETINGS
-- ============================================================================
-- Structured meeting log replacing ad-hoc minutes.
-- action_items stored as JSONB array: [{description, owner, due, status}]
-- client_sentiment tracked per meeting for trend analysis.
-- ============================================================================

create table public.project_meetings (
  id uuid primary key default uuid_generate_v4(),
  sector_id uuid not null references public.sectors(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  meeting_date date not null,
  meeting_type text not null default 'standard'
    check (meeting_type in ('kickoff', 'standard', 'review', 'escalation', 'ad_hoc')),
  attendees text[],                       -- array of attendee names
  agenda text,
  notes text,
  action_items jsonb,                     -- [{description, owner, due, status}]
  next_meeting_date date,
  client_sentiment text
    check (client_sentiment in (
      'very_satisfied', 'satisfied', 'neutral', 'concerned', 'dissatisfied'
    )),
  recorded_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index idx_project_meetings_sector on public.project_meetings(sector_id);
create index idx_project_meetings_project on public.project_meetings(project_id);
create index idx_project_meetings_date on public.project_meetings(meeting_date);

-- RLS
alter table public.project_meetings enable row level security;

create policy "project_meetings_select"
  on public.project_meetings for select
  using (sector_id in (select public.user_sector_ids()));

create policy "project_meetings_insert"
  on public.project_meetings for insert
  with check (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));

create policy "project_meetings_update"
  on public.project_meetings for update
  using (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));

create policy "project_meetings_delete"
  on public.project_meetings for delete
  using (public.user_has_role(sector_id, array['sector_lead', 'admin']));

-- updated_at trigger
create trigger trg_project_meetings_updated_at
  before update on public.project_meetings
  for each row execute function public.set_updated_at();


-- ============================================================================
-- TABLE 2: PROJECT_CONTACTS
-- ============================================================================
-- Stakeholder map per project. Both client-side and CB-side contacts.
-- stakeholder_type drives grouping in the UI.
-- is_primary flags the main point of contact on each side.
-- ============================================================================

create table public.project_contacts (
  id uuid primary key default uuid_generate_v4(),
  sector_id uuid not null references public.sectors(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  organisation text,                      -- client org name or 'Currie & Brown'
  role text,                              -- their role on the project
  email text,
  phone text,
  stakeholder_type text not null default 'operational'
    check (stakeholder_type in ('decision_maker', 'influencer', 'operational', 'observer')),
  is_primary boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index idx_project_contacts_sector on public.project_contacts(sector_id);
create index idx_project_contacts_project on public.project_contacts(project_id);

-- RLS
alter table public.project_contacts enable row level security;

create policy "project_contacts_select"
  on public.project_contacts for select
  using (sector_id in (select public.user_sector_ids()));

create policy "project_contacts_insert"
  on public.project_contacts for insert
  with check (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));

create policy "project_contacts_update"
  on public.project_contacts for update
  using (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));

create policy "project_contacts_delete"
  on public.project_contacts for delete
  using (public.user_has_role(sector_id, array['sector_lead', 'admin']));

-- updated_at trigger
create trigger trg_project_contacts_updated_at
  before update on public.project_contacts
  for each row execute function public.set_updated_at();


-- ============================================================================
-- TABLE 3: PROJECT_RISKS
-- ============================================================================
-- Lightweight risk and issue register per project.
-- Escalated risks surface on the sector-level dashboard for Christine.
-- category covers the six areas relevant to PCS operations.
-- ============================================================================

create table public.project_risks (
  id uuid primary key default uuid_generate_v4(),
  sector_id uuid not null references public.sectors(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  description text,
  category text not null default 'operational'
    check (category in ('operational', 'financial', 'compliance', 'resource', 'client', 'hse')),
  likelihood text not null default 'medium'
    check (likelihood in ('high', 'medium', 'low')),
  impact text not null default 'medium'
    check (impact in ('critical', 'high', 'medium', 'low')),
  status text not null default 'open'
    check (status in ('open', 'mitigating', 'closed', 'escalated')),
  mitigation text,
  owner text,                             -- person responsible for managing the risk
  identified_date date not null default current_date,
  review_date date,                       -- next scheduled review
  closed_date date,
  raised_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index idx_project_risks_sector on public.project_risks(sector_id);
create index idx_project_risks_project on public.project_risks(project_id);
create index idx_project_risks_status on public.project_risks(status);

-- RLS
alter table public.project_risks enable row level security;

create policy "project_risks_select"
  on public.project_risks for select
  using (sector_id in (select public.user_sector_ids()));

create policy "project_risks_insert"
  on public.project_risks for insert
  with check (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));

create policy "project_risks_update"
  on public.project_risks for update
  using (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));

create policy "project_risks_delete"
  on public.project_risks for delete
  using (public.user_has_role(sector_id, array['sector_lead', 'admin']));

-- updated_at trigger
create trigger trg_project_risks_updated_at
  before update on public.project_risks
  for each row execute function public.set_updated_at();

-- Auto-set closed_date when status transitions to 'closed'
create or replace function public.auto_set_risk_closed_date()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'closed' and old.status != 'closed' then
    new.closed_date = current_date;
  end if;
  if new.status != 'closed' and old.status = 'closed' then
    new.closed_date = null;
  end if;
  return new;
end;
$$;

create trigger trg_risk_auto_close
  before update on public.project_risks
  for each row execute function public.auto_set_risk_closed_date();


-- ============================================================================
-- TABLE 4: PROJECT_LESSONS
-- ============================================================================
-- Lessons learned captured during the project lifecycle, not just at close.
-- outcome separates "went well" from "needs improvement" for two-column display.
-- category enables cross-project pattern analysis at sector level.
-- ============================================================================

create table public.project_lessons (
  id uuid primary key default uuid_generate_v4(),
  sector_id uuid not null references public.sectors(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  lesson_date date not null default current_date,
  category text not null default 'process'
    check (category in ('process', 'technical', 'client', 'commercial', 'resource')),
  what_happened text not null,
  root_cause text,
  outcome text not null
    check (outcome in ('went_well', 'improve')),
  action_taken text,
  recorded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Indexes
create index idx_project_lessons_sector on public.project_lessons(sector_id);
create index idx_project_lessons_project on public.project_lessons(project_id);
create index idx_project_lessons_outcome on public.project_lessons(outcome);
create index idx_project_lessons_category on public.project_lessons(category);

-- RLS
alter table public.project_lessons enable row level security;

create policy "project_lessons_select"
  on public.project_lessons for select
  using (sector_id in (select public.user_sector_ids()));

create policy "project_lessons_insert"
  on public.project_lessons for insert
  with check (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));

create policy "project_lessons_update"
  on public.project_lessons for update
  using (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));

create policy "project_lessons_delete"
  on public.project_lessons for delete
  using (public.user_has_role(sector_id, array['sector_lead', 'admin']));


-- ============================================================================
-- TABLE 5: PROJECT_SAVINGS
-- ============================================================================
-- Tracks tangible (hard dollar) and intangible (soft/qualitative) savings
-- delivered by each project. This is critical for demonstrating value to
-- clients and justifying fees in procurement/compliance work.
--
-- Tangible savings: quantifiable dollar amounts (e.g. avoided penalties,
--   reduced rework, prevented overpayments, compliance fine avoidance)
-- Intangible savings: qualitative value (e.g. improved processes, reduced
--   risk exposure, better stakeholder relationships, knowledge transfer)
--
-- Each entry is a single saving event. Multiple entries per project.
-- All entries roll up to project-level totals and sector-level aggregation.
-- ============================================================================

create table public.project_savings (
  id uuid primary key default uuid_generate_v4(),
  sector_id uuid not null references public.sectors(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  saving_date date not null default current_date,
  saving_type text not null
    check (saving_type in ('tangible', 'intangible')),
  category text not null default 'compliance'
    check (category in (
      'compliance',                       -- avoided fines, penalties, violations
      'cost_avoidance',                   -- prevented overpayments, duplicate charges
      'efficiency',                       -- time savings, process improvements
      'risk_reduction',                   -- reduced exposure, insurance, liability
      'quality',                          -- rework prevention, defect reduction
      'relationship',                     -- stakeholder satisfaction, retention
      'knowledge',                        -- training, capability building, IP
      'other'
    )),
  title text not null,                    -- short description of the saving
  description text,                       -- detailed explanation
  -- Tangible fields (populated when saving_type = 'tangible')
  amount numeric(14,2),                   -- dollar value of the saving
  currency text not null default 'USD',
  calculation_basis text,                 -- how the amount was calculated
  verified boolean not null default false,-- has this been verified/signed off
  verified_by uuid references auth.users(id),
  verified_date date,
  -- Intangible fields (populated when saving_type = 'intangible')
  impact_level text
    check (impact_level in ('high', 'medium', 'low')),
  beneficiary text,                       -- who benefits (client, CB, both)
  -- Common fields
  evidence text,                          -- supporting documentation reference
  client_id uuid references public.clients(id),  -- which client benefits
  recorded_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index idx_project_savings_sector on public.project_savings(sector_id);
create index idx_project_savings_project on public.project_savings(project_id);
create index idx_project_savings_type on public.project_savings(saving_type);
create index idx_project_savings_category on public.project_savings(category);
create index idx_project_savings_client on public.project_savings(client_id);

-- RLS
alter table public.project_savings enable row level security;

create policy "project_savings_select"
  on public.project_savings for select
  using (sector_id in (select public.user_sector_ids()));

create policy "project_savings_insert"
  on public.project_savings for insert
  with check (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));

create policy "project_savings_update"
  on public.project_savings for update
  using (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));

create policy "project_savings_delete"
  on public.project_savings for delete
  using (public.user_has_role(sector_id, array['sector_lead', 'admin']));

-- updated_at trigger
create trigger trg_project_savings_updated_at
  before update on public.project_savings
  for each row execute function public.set_updated_at();


-- ============================================================================
-- VIEW: v_project_health
-- ============================================================================
-- Composite health score per project based on four weighted dimensions:
--   Resource Utilisation (40%) — actual vs planned hours
--   Client Satisfaction  (25%) — most recent meeting sentiment
--   Invoice Health       (20%) — overdue invoices, billing currency
--   Risk Status          (15%) — escalated/high-impact open risks
--
-- Each dimension returns 'green', 'amber', or 'red'.
-- Composite: Green = all green or at most one amber
--            Amber = two+ amber or one red
--            Red   = two+ red
-- ============================================================================

create or replace view public.v_project_health as
with resource_health as (
  -- Compare actual hours to planned for the current month
  select
    ra.project_id,
    ra.sector_id,
    sum(ra.planned_hours) as planned,
    sum(coalesce(ra.actual_hours, 0)) as actual,
    case
      when sum(ra.planned_hours) = 0 then 'green'
      when abs(sum(coalesce(ra.actual_hours, 0)) - sum(ra.planned_hours))
           / nullif(sum(ra.planned_hours), 0) <= 0.10 then 'green'
      when abs(sum(coalesce(ra.actual_hours, 0)) - sum(ra.planned_hours))
           / nullif(sum(ra.planned_hours), 0) <= 0.25 then 'amber'
      else 'red'
    end as status
  from public.resource_allocations ra
  where ra.month = date_trunc('month', current_date)::date
  group by ra.project_id, ra.sector_id
),
client_health as (
  -- Most recent meeting sentiment per project
  select distinct on (pm.project_id)
    pm.project_id,
    pm.sector_id,
    pm.client_sentiment,
    pm.meeting_date,
    case
      when pm.client_sentiment in ('very_satisfied', 'satisfied') then 'green'
      when pm.client_sentiment = 'neutral' then 'amber'
      when pm.client_sentiment in ('concerned', 'dissatisfied') then 'red'
      when pm.meeting_date < current_date - interval '30 days' then 'amber'
      else 'green'  -- no sentiment recorded but recent meeting
    end as status
  from public.project_meetings pm
  order by pm.project_id, pm.meeting_date desc
),
invoice_health as (
  -- Check for overdue invoices per project's client
  select
    p.id as project_id,
    p.sector_id,
    coalesce(sum(case when i.status = 'overdue' then 1 else 0 end), 0) as overdue_count,
    coalesce(max(
      case when i.status = 'overdue' then current_date - i.due_date else 0 end
    ), 0) as max_days_overdue,
    case
      when coalesce(max(
        case when i.status = 'overdue' then current_date - i.due_date else 0 end
      ), 0) >= 60 then 'red'
      when coalesce(sum(case when i.status = 'overdue' then 1 else 0 end), 0) > 0 then 'amber'
      else 'green'
    end as status
  from public.projects p
  left join public.invoices i on i.client_id = p.client_id and i.sector_id = p.sector_id
  where p.type = 'billable'
  group by p.id, p.sector_id
),
risk_health as (
  -- Open risks with high/critical impact or escalated status
  select
    pr.project_id,
    pr.sector_id,
    coalesce(sum(case when pr.status = 'escalated' then 1 else 0 end), 0) as escalated_count,
    coalesce(sum(case when pr.status in ('open', 'mitigating')
                      and pr.impact in ('critical', 'high') then 1 else 0 end), 0) as high_impact_open,
    coalesce(sum(case when pr.review_date < current_date
                      and pr.status in ('open', 'mitigating') then 1 else 0 end), 0) as overdue_reviews,
    case
      when coalesce(sum(case when pr.status = 'escalated' then 1 else 0 end), 0) > 0 then 'red'
      when coalesce(sum(case when pr.review_date < current_date
                        and pr.status in ('open', 'mitigating') then 1 else 0 end), 0) > 0 then 'red'
      when coalesce(sum(case when pr.status in ('open', 'mitigating')
                        and pr.impact in ('critical', 'high') then 1 else 0 end), 0) > 0 then 'amber'
      else 'green'
    end as status
  from public.project_risks pr
  group by pr.project_id, pr.sector_id
)
select
  p.id as project_id,
  p.sector_id,
  p.code as project_code,
  p.name as project_name,
  -- Individual dimension statuses
  coalesce(rh.status, 'green') as resource_status,
  coalesce(ch.status, 'green') as client_status,
  coalesce(ih.status, 'green') as invoice_status,
  coalesce(rkh.status, 'green') as risk_status,
  -- Dimension detail for drill-down
  coalesce(rh.planned, 0) as resource_planned_hours,
  coalesce(rh.actual, 0) as resource_actual_hours,
  ch.client_sentiment as latest_sentiment,
  ch.meeting_date as latest_meeting_date,
  coalesce(ih.overdue_count, 0) as overdue_invoice_count,
  coalesce(ih.max_days_overdue, 0) as max_days_overdue,
  coalesce(rkh.escalated_count, 0) as escalated_risk_count,
  coalesce(rkh.high_impact_open, 0) as high_impact_open_risks,
  coalesce(rkh.overdue_reviews, 0) as overdue_risk_reviews,
  -- Composite health score
  case
    when (
      (case when coalesce(rh.status, 'green') = 'red' then 1 else 0 end) +
      (case when coalesce(ch.status, 'green') = 'red' then 1 else 0 end) +
      (case when coalesce(ih.status, 'green') = 'red' then 1 else 0 end) +
      (case when coalesce(rkh.status, 'green') = 'red' then 1 else 0 end)
    ) >= 2 then 'red'
    when (
      (case when coalesce(rh.status, 'green') = 'red' then 1 else 0 end) +
      (case when coalesce(ch.status, 'green') = 'red' then 1 else 0 end) +
      (case when coalesce(ih.status, 'green') = 'red' then 1 else 0 end) +
      (case when coalesce(rkh.status, 'green') = 'red' then 1 else 0 end)
    ) = 1 then 'amber'
    when (
      (case when coalesce(rh.status, 'green') = 'amber' then 1 else 0 end) +
      (case when coalesce(ch.status, 'green') = 'amber' then 1 else 0 end) +
      (case when coalesce(ih.status, 'green') = 'amber' then 1 else 0 end) +
      (case when coalesce(rkh.status, 'green') = 'amber' then 1 else 0 end)
    ) >= 2 then 'amber'
    else 'green'
  end as health_status
from public.projects p
left join resource_health rh on rh.project_id = p.id
left join client_health ch on ch.project_id = p.id
left join invoice_health ih on ih.project_id = p.id
left join risk_health rkh on rkh.project_id = p.id
where p.type = 'billable';


-- ============================================================================
-- VIEW: v_project_savings_summary
-- ============================================================================
-- Aggregates savings per project for the project dashboard header
-- and rolls up to sector level for Christine's dashboard.
-- ============================================================================

create or replace view public.v_project_savings_summary as
select
  ps.sector_id,
  ps.project_id,
  p.code as project_code,
  p.name as project_name,
  c.name as client_name,
  -- Tangible totals
  coalesce(sum(ps.amount) filter (where ps.saving_type = 'tangible'), 0) as total_tangible_savings,
  coalesce(sum(ps.amount) filter (where ps.saving_type = 'tangible' and ps.verified = true), 0) as verified_tangible_savings,
  count(*) filter (where ps.saving_type = 'tangible') as tangible_count,
  -- Intangible counts by impact
  count(*) filter (where ps.saving_type = 'intangible') as intangible_count,
  count(*) filter (where ps.saving_type = 'intangible' and ps.impact_level = 'high') as intangible_high_count,
  count(*) filter (where ps.saving_type = 'intangible' and ps.impact_level = 'medium') as intangible_medium_count,
  count(*) filter (where ps.saving_type = 'intangible' and ps.impact_level = 'low') as intangible_low_count,
  -- Category breakdown (tangible amounts)
  coalesce(sum(ps.amount) filter (where ps.category = 'compliance'), 0) as compliance_savings,
  coalesce(sum(ps.amount) filter (where ps.category = 'cost_avoidance'), 0) as cost_avoidance_savings,
  coalesce(sum(ps.amount) filter (where ps.category = 'efficiency'), 0) as efficiency_savings,
  coalesce(sum(ps.amount) filter (where ps.category = 'risk_reduction'), 0) as risk_reduction_savings,
  coalesce(sum(ps.amount) filter (where ps.category = 'quality'), 0) as quality_savings,
  -- Total entry count
  count(*) as total_entries
from public.project_savings ps
join public.projects p on p.id = ps.project_id
left join public.clients c on c.id = p.client_id
group by ps.sector_id, ps.project_id, p.code, p.name, c.name;


-- ============================================================================
-- VIEW: v_sector_lessons_summary
-- ============================================================================
-- Cross-project lessons aggregation for sector-level pattern analysis.
-- Christine uses this to spot recurring themes across all projects.
-- ============================================================================

create or replace view public.v_sector_lessons_summary as
select
  pl.sector_id,
  pl.project_id,
  p.code as project_code,
  p.name as project_name,
  pl.category,
  pl.outcome,
  count(*) as lesson_count,
  min(pl.lesson_date) as earliest_lesson,
  max(pl.lesson_date) as latest_lesson
from public.project_lessons pl
join public.projects p on p.id = pl.project_id
group by pl.sector_id, pl.project_id, p.code, p.name, pl.category, pl.outcome;


-- ============================================================================
-- VIEW: v_sector_risks_summary
-- ============================================================================
-- Sector-level risk overview for Christine's dashboard.
-- Surfaces escalated risks and overdue reviews across all projects.
-- ============================================================================

create or replace view public.v_sector_risks_summary as
select
  pr.sector_id,
  pr.project_id,
  p.code as project_code,
  p.name as project_name,
  count(*) filter (where pr.status = 'open') as open_count,
  count(*) filter (where pr.status = 'mitigating') as mitigating_count,
  count(*) filter (where pr.status = 'escalated') as escalated_count,
  count(*) filter (where pr.status = 'closed') as closed_count,
  count(*) filter (where pr.review_date < current_date
                   and pr.status in ('open', 'mitigating')) as overdue_review_count,
  count(*) filter (where pr.impact in ('critical', 'high')
                   and pr.status in ('open', 'mitigating', 'escalated')) as high_impact_active
from public.project_risks pr
join public.projects p on p.id = pr.project_id
group by pr.sector_id, pr.project_id, p.code, p.name;


-- ============================================================================
-- SEED DATA
-- ============================================================================
-- Sample data for PRJ-001 (TSMC Davis Bacon Monitoring FY24) to demonstrate
-- all five tables. Uses deterministic UUIDs (00000000-0000-0000-0000-00000002XXXX).
-- ============================================================================

-- Project Contacts (6 contacts for PRJ-001)
insert into public.project_contacts (id, sector_id, project_id, name, organisation, role, email, stakeholder_type, is_primary) values
  ('00000000-0000-0000-0000-000000020001', '00000000-0000-0000-0000-000000000001',
   (select id from public.projects where code = 'PRJ-001' and sector_id = '00000000-0000-0000-0000-000000000001'),
   'Jane Smith', 'TSMC', 'Program Director', 'jane.smith@tsmc.com', 'decision_maker', true),

  ('00000000-0000-0000-0000-000000020002', '00000000-0000-0000-0000-000000000001',
   (select id from public.projects where code = 'PRJ-001' and sector_id = '00000000-0000-0000-0000-000000000001'),
   'John Doe', 'TSMC', 'Site Manager', 'john.doe@tsmc.com', 'operational', false),

  ('00000000-0000-0000-0000-000000020003', '00000000-0000-0000-0000-000000000001',
   (select id from public.projects where code = 'PRJ-001' and sector_id = '00000000-0000-0000-0000-000000000001'),
   'Sarah Chen', 'TSMC', 'Compliance Lead', 'sarah.chen@tsmc.com', 'influencer', false),

  ('00000000-0000-0000-0000-000000020004', '00000000-0000-0000-0000-000000000001',
   (select id from public.projects where code = 'PRJ-001' and sector_id = '00000000-0000-0000-0000-000000000001'),
   'Jasmine Lugo', 'Currie & Brown', 'Compliance Analyst', 'jasmine.lugo@curriebrown.com', 'operational', true),

  ('00000000-0000-0000-0000-000000020005', '00000000-0000-0000-0000-000000000001',
   (select id from public.projects where code = 'PRJ-001' and sector_id = '00000000-0000-0000-0000-000000000001'),
   'Christine Williams', 'Currie & Brown', 'Principal', 'christine.williams@curriebrown.com', 'decision_maker', false),

  ('00000000-0000-0000-0000-000000020006', '00000000-0000-0000-0000-000000000001',
   (select id from public.projects where code = 'PRJ-001' and sector_id = '00000000-0000-0000-0000-000000000001'),
   'Brnady Keith John', 'Currie & Brown', 'Sr Compliance Manager', 'brnady.john@curriebrown.com', 'operational', false);


-- Project Meetings (3 meetings for PRJ-001)
insert into public.project_meetings (id, sector_id, project_id, meeting_date, meeting_type, attendees, agenda, notes, action_items, next_meeting_date, client_sentiment) values
  ('00000000-0000-0000-0000-000000020101', '00000000-0000-0000-0000-000000000001',
   (select id from public.projects where code = 'PRJ-001' and sector_id = '00000000-0000-0000-0000-000000000001'),
   '2026-01-15', 'review',
   array['Jane Smith', 'John Doe', 'Jasmine Lugo', 'Christine Williams'],
   'Q4 2025 review and Q1 2026 planning',
   'Client satisfied with compliance monitoring quality. Discussed expanding scope to cover additional subcontractors in Phase 2.',
   '[{"description": "Provide Phase 2 scope estimate", "owner": "Christine Williams", "due": "2026-01-31", "status": "complete"},
     {"description": "Update field monitor schedule for Q1", "owner": "Jasmine Lugo", "due": "2026-01-22", "status": "complete"}]'::jsonb,
   '2026-02-12', 'very_satisfied'),

  ('00000000-0000-0000-0000-000000020102', '00000000-0000-0000-0000-000000000001',
   (select id from public.projects where code = 'PRJ-001' and sector_id = '00000000-0000-0000-0000-000000000001'),
   '2026-02-12', 'standard',
   array['Jane Smith', 'Jasmine Lugo', 'Brnady Keith John'],
   'Monthly progress update and field monitoring report',
   'Reviewed January field monitoring results. 3 minor findings documented and remediated. Client requested additional I-9 verification support.',
   '[{"description": "Prepare I-9 verification proposal", "owner": "Brnady Keith John", "due": "2026-02-28", "status": "in_progress"},
     {"description": "Submit January compliance report", "owner": "Jasmine Lugo", "due": "2026-02-19", "status": "complete"}]'::jsonb,
   '2026-03-11', 'satisfied'),

  ('00000000-0000-0000-0000-000000020103', '00000000-0000-0000-0000-000000000001',
   (select id from public.projects where code = 'PRJ-001' and sector_id = '00000000-0000-0000-0000-000000000001'),
   '2025-11-20', 'kickoff',
   array['Jane Smith', 'John Doe', 'Sarah Chen', 'Christine Williams', 'Jasmine Lugo'],
   'Project kickoff and scope confirmation',
   'Confirmed scope, team, and reporting cadence. Monthly meetings agreed. Client provided site access protocols.',
   '[{"description": "Set up site access badges for CB team", "owner": "John Doe", "due": "2025-12-01", "status": "complete"},
     {"description": "Deliver project execution plan", "owner": "Christine Williams", "due": "2025-12-15", "status": "complete"}]'::jsonb,
   '2026-01-15', 'satisfied');


-- Project Risks (3 risks for PRJ-001)
insert into public.project_risks (id, sector_id, project_id, title, description, category, likelihood, impact, status, mitigation, owner, identified_date, review_date) values
  ('00000000-0000-0000-0000-000000020201', '00000000-0000-0000-0000-000000000001',
   (select id from public.projects where code = 'PRJ-001' and sector_id = '00000000-0000-0000-0000-000000000001'),
   'PO expiry before renewal', 'WO-509227 expires end of FY24 period. Renewal discussions not yet started.',
   'financial', 'medium', 'high', 'mitigating',
   'Renew PO 30 days before expiry. Christine to initiate renewal conversation with Jane Smith by March.',
   'Christine Williams', '2026-01-15', '2026-03-01'),

  ('00000000-0000-0000-0000-000000020202', '00000000-0000-0000-0000-000000000001',
   (select id from public.projects where code = 'PRJ-001' and sector_id = '00000000-0000-0000-0000-000000000001'),
   'Field monitor capacity gap', 'NH-02 not starting until April. Current monitors at 95% utilisation with no buffer.',
   'resource', 'high', 'medium', 'mitigating',
   'Cross-train existing monitors on additional sites. NH-02 starting April provides relief. Monitor overtime weekly.',
   'Brnady Keith John', '2026-02-01', '2026-03-15'),

  ('00000000-0000-0000-0000-000000020203', '00000000-0000-0000-0000-000000000001',
   (select id from public.projects where code = 'PRJ-001' and sector_id = '00000000-0000-0000-0000-000000000001'),
   'Subcontractor compliance data quality', 'Inconsistent payroll data submissions from two subcontractors creating rework.',
   'compliance', 'medium', 'medium', 'open',
   'Schedule training session with subcontractor payroll teams. Standardise submission template.',
   'Jasmine Lugo', '2026-02-10', '2026-02-28');


-- Project Lessons (3 lessons for PRJ-001)
insert into public.project_lessons (id, sector_id, project_id, lesson_date, category, what_happened, root_cause, outcome, action_taken) values
  ('00000000-0000-0000-0000-000000020301', '00000000-0000-0000-0000-000000000001',
   (select id from public.projects where code = 'PRJ-001' and sector_id = '00000000-0000-0000-0000-000000000001'),
   '2026-01-20', 'process',
   'Monthly compliance report delivered 5 days ahead of deadline consistently since November.',
   'Standardised the report template and pre-populated recurring data fields.',
   'went_well',
   'Template adopted as sector standard for all compliance monitoring projects.'),

  ('00000000-0000-0000-0000-000000020302', '00000000-0000-0000-0000-000000000001',
   (select id from public.projects where code = 'PRJ-001' and sector_id = '00000000-0000-0000-0000-000000000001'),
   '2026-02-05', 'client',
   'Client escalated a missed site visit that was actually completed but not logged in their system.',
   'Our field monitoring log was not shared with the client in real-time. Reliance on weekly summary reports created a visibility gap.',
   'improve',
   'Implementing shared daily log accessible to client team. Testing with TSMC site manager.'),

  ('00000000-0000-0000-0000-000000020303', '00000000-0000-0000-0000-000000000001',
   (select id from public.projects where code = 'PRJ-001' and sector_id = '00000000-0000-0000-0000-000000000001'),
   '2025-12-15', 'resource',
   'New field monitor (Ethan Stoddard) reached full productivity in 3 weeks vs typical 6 weeks.',
   'Paired with experienced monitor (Shane Stoddard) for first two weeks. Structured onboarding checklist used.',
   'went_well',
   'Buddy system and onboarding checklist formalised for all new field monitors.');


-- Project Savings (4 savings entries for PRJ-001)
insert into public.project_savings (id, sector_id, project_id, saving_date, saving_type, category, title, description, amount, calculation_basis, verified, impact_level, beneficiary, client_id) values
  ('00000000-0000-0000-0000-000000020401', '00000000-0000-0000-0000-000000000001',
   (select id from public.projects where code = 'PRJ-001' and sector_id = '00000000-0000-0000-0000-000000000001'),
   '2026-01-31', 'tangible', 'compliance',
   'Davis-Bacon violation prevention — January',
   'Identified 4 payroll discrepancies across 2 subcontractors during January monitoring. Corrections made before DOL reporting deadline, avoiding potential penalties.',
   85000.00, '4 violations x average $21,250 DOL penalty per violation', true,
   null, 'TSMC', '00000000-0000-0000-0000-000000000101'),

  ('00000000-0000-0000-0000-000000020402', '00000000-0000-0000-0000-000000000001',
   (select id from public.projects where code = 'PRJ-001' and sector_id = '00000000-0000-0000-0000-000000000001'),
   '2026-02-10', 'tangible', 'cost_avoidance',
   'Duplicate certified payroll correction',
   'Caught a subcontractor submitting duplicate certified payroll for 12 workers across 2 weeks. Prevented overpayment before processing.',
   42500.00, '12 workers x avg $1,770/week x 2 weeks duplicate', true,
   null, 'TSMC', '00000000-0000-0000-0000-000000000101'),

  ('00000000-0000-0000-0000-000000020403', '00000000-0000-0000-0000-000000000001',
   (select id from public.projects where code = 'PRJ-001' and sector_id = '00000000-0000-0000-0000-000000000001'),
   '2026-01-20', 'intangible', 'efficiency',
   'Standardised compliance report template',
   'Created reusable monthly report template that reduces report preparation time from 2 days to 4 hours.',
   null, null, false,
   'high', 'Currie & Brown', '00000000-0000-0000-0000-000000000101'),

  ('00000000-0000-0000-0000-000000020404', '00000000-0000-0000-0000-000000000001',
   (select id from public.projects where code = 'PRJ-001' and sector_id = '00000000-0000-0000-0000-000000000001'),
   '2026-02-15', 'intangible', 'relationship',
   'Proactive risk identification builds client trust',
   'TSMC Program Director specifically acknowledged CB team for identifying compliance gaps before they became findings. Strengthens position for scope expansion.',
   null, null, false,
   'high', 'Both', '00000000-0000-0000-0000-000000000101');


-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Summary:
--   5 new tables: project_meetings, project_contacts, project_risks,
--                 project_lessons, project_savings
--   20 RLS policies (4 per table: select, insert, update, delete)
--   14 indexes across all 5 tables
--   4 updated_at triggers (project_meetings, project_contacts,
--                          project_risks, project_savings)
--   1 trigger function: auto_set_risk_closed_date()
--   4 views: v_project_health, v_project_savings_summary,
--            v_sector_lessons_summary, v_sector_risks_summary
--   Seed data: 6 contacts, 3 meetings, 3 risks, 3 lessons, 4 savings
--              (all for PRJ-001 TSMC Davis Bacon Monitoring)
--
-- Existing tables: ZERO changes. All 15 base tables + 3 prior migrations
--                  remain untouched.
-- ============================================================================
