-- ============================================================================
-- MIGRATION 010: Quality Management + Standalone Project Actions
-- ============================================================================
-- Run AFTER migrations 001-009 are live.
-- Adds: project_actions, quality_plan_items tables
-- Updates: v_sector_action_tracker (UNION meeting + standalone actions)
-- Creates: v_quality_dashboard, v_quality_sector_summary views
-- ============================================================================


-- ============================================================================
-- TABLE 1: PROJECT_ACTIONS (standalone project actions)
-- ============================================================================
-- Actions that exist independently of meetings. Sources include manual entry,
-- phone calls, site visits, emails, risk responses, client requests, etc.
-- The v_sector_action_tracker view UNIONs these with meeting_actions.
-- ============================================================================

create table if not exists public.project_actions (
  id uuid primary key default uuid_generate_v4(),
  sector_id uuid not null references public.sectors(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  action_ref text not null default '',
  description text not null,
  owner_name text,
  owner_employee_id uuid references public.employees(id),
  due_date date,
  completed_date date,
  priority text not null default 'normal'
    check (priority in ('critical', 'high', 'normal', 'low')),
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'closed', 'superseded')),
  source text not null default 'manual'
    check (source in (
      'manual', 'phone_call', 'site_visit', 'email', 'data_review',
      'risk_response', 'client_request', 'internal_review', 'other'
    )),
  source_detail text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_actions_sector on public.project_actions(sector_id);
create index if not exists idx_project_actions_project on public.project_actions(project_id);
create index if not exists idx_project_actions_status on public.project_actions(status);
create index if not exists idx_project_actions_owner on public.project_actions(owner_employee_id);


-- ============================================================================
-- TABLE 2: QUALITY_PLAN_ITEMS (quality management)
-- ============================================================================
-- Quality objectives and compliance items tracked per client or project.
-- Supports audit cycle tracking, corrective actions, and compliance scoring.
-- ============================================================================

create table if not exists public.quality_plan_items (
  id uuid primary key default uuid_generate_v4(),
  sector_id uuid not null references public.sectors(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  objective text not null,
  category text not null default 'general'
    check (category in (
      'general', 'deliverable', 'process', 'compliance',
      'health_safety', 'environmental'
    )),
  owner_name text,
  deadline date,
  status text not null default 'not_started'
    check (status in (
      'not_started', 'in_progress', 'compliant', 'non_compliant', 'not_applicable'
    )),
  -- Audit tracking
  last_audit_date date,
  next_audit_date date,
  audit_outcome text
    check (audit_outcome in ('pass', 'fail', 'partial', 'deferred')),
  -- Corrective action tracking
  corrective_action text,
  corrective_owner text,
  corrective_deadline date,
  corrective_status text
    check (corrective_status in ('open', 'in_progress', 'closed', 'overdue')),
  corrective_closed_date date,
  -- General
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_quality_plan_items_sector on public.quality_plan_items(sector_id);
create index if not exists idx_quality_plan_items_client on public.quality_plan_items(client_id);
create index if not exists idx_quality_plan_items_project on public.quality_plan_items(project_id);
create index if not exists idx_quality_plan_items_status on public.quality_plan_items(status);


-- ============================================================================
-- RLS POLICIES
-- ============================================================================

alter table public.project_actions enable row level security;

do $$ begin
  if not exists (select from pg_policies where tablename = 'project_actions' and policyname = 'project_actions_select') then
    create policy "project_actions_select" on public.project_actions for select
      using (sector_id in (select user_sector_ids()));
  end if;
  if not exists (select from pg_policies where tablename = 'project_actions' and policyname = 'project_actions_insert') then
    create policy "project_actions_insert" on public.project_actions for insert
      with check (sector_id in (select user_sector_ids()));
  end if;
  if not exists (select from pg_policies where tablename = 'project_actions' and policyname = 'project_actions_update') then
    create policy "project_actions_update" on public.project_actions for update
      using (sector_id in (select user_sector_ids()));
  end if;
  if not exists (select from pg_policies where tablename = 'project_actions' and policyname = 'project_actions_delete') then
    create policy "project_actions_delete" on public.project_actions for delete
      using (sector_id in (select user_sector_ids()));
  end if;
end $$;


alter table public.quality_plan_items enable row level security;

do $$ begin
  if not exists (select from pg_policies where tablename = 'quality_plan_items' and policyname = 'quality_plan_items_select') then
    create policy "quality_plan_items_select" on public.quality_plan_items for select
      using (sector_id in (select user_sector_ids()));
  end if;
  if not exists (select from pg_policies where tablename = 'quality_plan_items' and policyname = 'quality_plan_items_insert') then
    create policy "quality_plan_items_insert" on public.quality_plan_items for insert
      with check (sector_id in (select user_sector_ids()));
  end if;
  if not exists (select from pg_policies where tablename = 'quality_plan_items' and policyname = 'quality_plan_items_update') then
    create policy "quality_plan_items_update" on public.quality_plan_items for update
      using (sector_id in (select user_sector_ids()));
  end if;
  if not exists (select from pg_policies where tablename = 'quality_plan_items' and policyname = 'quality_plan_items_delete') then
    create policy "quality_plan_items_delete" on public.quality_plan_items for delete
      using (sector_id in (select user_sector_ids()));
  end if;
end $$;


-- ============================================================================
-- TRIGGERS
-- ============================================================================

create or replace trigger set_updated_at_project_actions
  before update on public.project_actions
  for each row execute function set_updated_at();

create or replace trigger set_updated_at_quality_plan_items
  before update on public.quality_plan_items
  for each row execute function set_updated_at();


-- ============================================================================
-- VIEW: v_sector_action_tracker (UPDATED — UNION of meeting + standalone)
-- ============================================================================
-- FIX: Wraps the UNION ALL in a subquery so ORDER BY with CASE works.
-- PostgreSQL requires ORDER BY after UNION to use only column names
-- unless the UNION is wrapped in a subquery.
-- ============================================================================

create or replace view public.v_sector_action_tracker as
select * from (
  -- Meeting actions
  select
    ma.sector_id,
    ma.id as action_id,
    ma.action_ref,
    ma.description as action_description,
    ma.status,
    ma.priority,
    ma.due_date,
    case
      when ma.due_date is null then 'no_due_date'
      when ma.due_date < current_date then 'overdue'
      when ma.due_date <= current_date + interval '3 days' then 'due_now'
      when ma.due_date <= current_date + interval '7 days' then 'due_this_week'
      when ma.due_date <= current_date + interval '14 days' then 'due_next_week'
      else 'on_track'
    end as urgency,
    greatest(current_date - ma.due_date, 0) as days_overdue,
    coalesce(e.name, ma.owner_name) as owner_name,
    ma.owner_employee_id,
    ma.project_id,
    p.code as project_code,
    p.name as project_name,
    c.name as client_name,
    'meeting'::text as source_type,
    m.title as source_ref,
    ma.notes,
    ma.created_at
  from public.meeting_actions ma
  join public.meetings m on m.id = ma.meeting_id
  left join public.projects p on p.id = ma.project_id
  left join public.clients c on c.id = p.client_id
  left join public.employees e on e.id = ma.owner_employee_id
  where ma.status not in ('closed', 'superseded')

  union all

  -- Standalone project actions
  select
    pa.sector_id,
    pa.id as action_id,
    pa.action_ref,
    pa.description as action_description,
    pa.status,
    pa.priority,
    pa.due_date,
    case
      when pa.due_date is null then 'no_due_date'
      when pa.due_date < current_date then 'overdue'
      when pa.due_date <= current_date + interval '3 days' then 'due_now'
      when pa.due_date <= current_date + interval '7 days' then 'due_this_week'
      when pa.due_date <= current_date + interval '14 days' then 'due_next_week'
      else 'on_track'
    end as urgency,
    greatest(current_date - pa.due_date, 0) as days_overdue,
    coalesce(e2.name, pa.owner_name) as owner_name,
    pa.owner_employee_id,
    pa.project_id,
    p2.code as project_code,
    p2.name as project_name,
    c2.name as client_name,
    pa.source as source_type,
    pa.source_detail as source_ref,
    pa.notes,
    pa.created_at
  from public.project_actions pa
  left join public.projects p2 on p2.id = pa.project_id
  left join public.clients c2 on c2.id = p2.client_id
  left join public.employees e2 on e2.id = pa.owner_employee_id
  where pa.status not in ('closed', 'superseded')
) as combined
order by
  case
    when combined.due_date < current_date then 0
    when combined.due_date is null then 2
    else 1
  end,
  combined.due_date asc nulls last;


-- ============================================================================
-- VIEW: v_quality_dashboard (per-client quality compliance summary)
-- ============================================================================

create or replace view public.v_quality_dashboard as
select
  qi.sector_id,
  qi.client_id,
  c.name as client_name,
  count(*) as total_items,
  count(*) filter (where qi.status = 'compliant') as compliant_count,
  count(*) filter (where qi.status = 'non_compliant') as non_compliant_count,
  count(*) filter (where qi.status = 'not_started') as not_started_count,
  count(*) filter (where qi.status = 'in_progress') as in_progress_count,
  case when count(*) filter (where qi.status != 'not_applicable') > 0
    then round(
      count(*) filter (where qi.status = 'compliant') * 100.0 /
      count(*) filter (where qi.status != 'not_applicable'), 1
    )
    else 0
  end as compliance_pct,
  count(*) filter (where qi.corrective_status in ('open', 'in_progress', 'overdue')) as open_corrective_actions,
  count(*) filter (where qi.next_audit_date < current_date and qi.status != 'not_applicable') as overdue_audits
from public.quality_plan_items qi
left join public.clients c on c.id = qi.client_id
where qi.client_id is not null
group by qi.sector_id, qi.client_id, c.name;


-- ============================================================================
-- VIEW: v_quality_sector_summary (sector-wide quality KPIs)
-- ============================================================================

create or replace view public.v_quality_sector_summary as
select
  qi.sector_id,
  count(*) as total_items,
  count(*) filter (where qi.status = 'compliant') as compliant_count,
  count(*) filter (where qi.status = 'non_compliant') as non_compliant_count,
  case when count(*) filter (where qi.status != 'not_applicable') > 0
    then round(
      count(*) filter (where qi.status = 'compliant') * 100.0 /
      count(*) filter (where qi.status != 'not_applicable'), 1
    )
    else 0
  end as compliance_pct,
  count(*) filter (where qi.corrective_status in ('open', 'in_progress', 'overdue')) as open_corrective_actions,
  count(*) filter (where qi.next_audit_date < current_date and qi.status != 'not_applicable') as overdue_audits,
  count(distinct qi.client_id) as client_count,
  count(*) filter (where qi.client_id is null) as sector_template_count
from public.quality_plan_items qi
group by qi.sector_id;


-- ============================================================================
-- END MIGRATION 010
-- ============================================================================
