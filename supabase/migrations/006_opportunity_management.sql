-- ============================================================================
-- MIGRATION 006: OPPORTUNITY MANAGEMENT + PROJECT ACTIONS
-- ============================================================================
-- Adds pursuit tracking columns to forecasts table,
-- forecast_id to PM tool tables (contacts, risks, lessons, savings),
-- widens check constraints for broader categories,
-- creates project_actions table,
-- creates opportunity detail tables (contacts, activities, notes).
-- ============================================================================

-- ============================================================================
-- PART A: Add pursuit columns to forecasts
-- ============================================================================

alter table public.forecasts
  add column if not exists assigned_to uuid references auth.users(id),
  add column if not exists assigned_to_name text,
  add column if not exists pursuit_stage text default 'identified'
    check (pursuit_stage in (
      'identified', 'qualifying', 'proposal_prep', 'proposal_submitted',
      'negotiation', 'awaiting_decision', 'won', 'lost'
    ));

create index if not exists idx_forecasts_assigned on public.forecasts(assigned_to);
create index if not exists idx_forecasts_pursuit_stage on public.forecasts(pursuit_stage);


-- ============================================================================
-- PART B: Add forecast_id to PM tool tables
-- ============================================================================

alter table public.project_contacts
  add column if not exists forecast_id uuid references public.forecasts(id) on delete cascade;

alter table public.project_risks
  add column if not exists forecast_id uuid references public.forecasts(id) on delete cascade;

alter table public.project_lessons
  add column if not exists forecast_id uuid references public.forecasts(id) on delete cascade;

alter table public.project_savings
  add column if not exists forecast_id uuid references public.forecasts(id) on delete cascade;

create index if not exists idx_project_contacts_forecast on public.project_contacts(forecast_id);
create index if not exists idx_project_risks_forecast on public.project_risks(forecast_id);
create index if not exists idx_project_lessons_forecast on public.project_lessons(forecast_id);
create index if not exists idx_project_savings_forecast on public.project_savings(forecast_id);


-- ============================================================================
-- PART C: Widen check constraints for broader categories
-- ============================================================================

-- Risks: add competition, pricing, timeline, scope, relationship
alter table public.project_risks drop constraint if exists project_risks_category_check;
alter table public.project_risks add constraint project_risks_category_check
  check (category in (
    'operational', 'financial', 'compliance', 'resource', 'client', 'hse',
    'competition', 'pricing', 'timeline', 'scope', 'relationship'
  ));

-- Savings: add projected categories
alter table public.project_savings drop constraint if exists project_savings_category_check;
alter table public.project_savings add constraint project_savings_category_check
  check (category in (
    'compliance', 'cost_avoidance', 'efficiency', 'risk_reduction',
    'quality', 'relationship', 'knowledge', 'other',
    'projected_compliance', 'projected_cost_avoidance',
    'projected_efficiency', 'projected_risk_reduction'
  ));


-- ============================================================================
-- PART D: PROJECT_ACTIONS table
-- ============================================================================

create table if not exists public.project_actions (
  id uuid primary key default uuid_generate_v4(),
  sector_id uuid not null references public.sectors(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  action_ref text not null default '',
  description text not null,
  owner_name text not null,
  due_date date,
  priority text not null default 'normal'
    check (priority in ('critical', 'high', 'normal', 'low')),
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'closed', 'superseded')),
  source text not null default 'manual'
    check (source in ('manual', 'meeting', 'risk', 'audit', 'client', 'management')),
  source_detail text,
  notes text,
  completed_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_actions_sector on public.project_actions(sector_id);
create index if not exists idx_project_actions_project on public.project_actions(project_id);
create index if not exists idx_project_actions_status on public.project_actions(status);

alter table public.project_actions enable row level security;

create policy "project_actions_select" on public.project_actions for select
  using (sector_id in (select public.user_sector_ids()));
create policy "project_actions_insert" on public.project_actions for insert
  with check (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));
create policy "project_actions_update" on public.project_actions for update
  using (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));
create policy "project_actions_delete" on public.project_actions for delete
  using (public.user_has_role(sector_id, array['sector_lead', 'admin']));

create trigger trg_project_actions_updated_at
  before update on public.project_actions
  for each row execute function public.set_updated_at();

-- Auto-generate action_ref per project
create or replace function public.generate_action_ref()
returns trigger
language plpgsql
as $$
declare v_count integer;
begin
  if new.action_ref is null or new.action_ref = '' then
    select count(*) + 1 into v_count
    from public.project_actions
    where sector_id = new.sector_id and project_id = new.project_id;
    new.action_ref = 'ACT-' || lpad(v_count::text, 3, '0');
  end if;
  return new;
end;
$$;

create trigger trg_action_ref
  before insert on public.project_actions
  for each row execute function public.generate_action_ref();


-- ============================================================================
-- PART E: OPPORTUNITY DETAIL TABLES
-- ============================================================================

-- E1. OPPORTUNITY CONTACTS
create table if not exists public.opportunity_contacts (
  id uuid primary key default uuid_generate_v4(),
  sector_id uuid not null references public.sectors(id) on delete cascade,
  forecast_id uuid not null references public.forecasts(id) on delete cascade,
  name text not null,
  organisation text,
  role text,
  email text,
  phone text,
  relationship_status text not null default 'new'
    check (relationship_status in ('new', 'warm', 'engaged', 'champion', 'blocker')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- E2. OPPORTUNITY ACTIVITIES
create table if not exists public.opportunity_activities (
  id uuid primary key default uuid_generate_v4(),
  sector_id uuid not null references public.sectors(id) on delete cascade,
  forecast_id uuid not null references public.forecasts(id) on delete cascade,
  activity_type text not null
    check (activity_type in ('meeting', 'call', 'email', 'proposal', 'site_visit', 'presentation', 'negotiation', 'other')),
  activity_date date not null,
  description text not null,
  outcome text,
  next_steps text,
  logged_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- E3. OPPORTUNITY NOTES
create table if not exists public.opportunity_notes (
  id uuid primary key default uuid_generate_v4(),
  sector_id uuid not null references public.sectors(id) on delete cascade,
  forecast_id uuid not null references public.forecasts(id) on delete cascade,
  note_type text not null default 'general'
    check (note_type in ('general', 'strategy', 'risk', 'competitor', 'pricing', 'relationship')),
  content text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- RLS
alter table public.opportunity_contacts enable row level security;
alter table public.opportunity_activities enable row level security;
alter table public.opportunity_notes enable row level security;

create policy "opp_contacts_select" on public.opportunity_contacts for select using (sector_id in (select public.user_sector_ids()));
create policy "opp_contacts_insert" on public.opportunity_contacts for insert with check (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));
create policy "opp_contacts_update" on public.opportunity_contacts for update using (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));
create policy "opp_contacts_delete" on public.opportunity_contacts for delete using (public.user_has_role(sector_id, array['sector_lead', 'admin']));

create policy "opp_activities_select" on public.opportunity_activities for select using (sector_id in (select public.user_sector_ids()));
create policy "opp_activities_insert" on public.opportunity_activities for insert with check (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));
create policy "opp_activities_update" on public.opportunity_activities for update using (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));
create policy "opp_activities_delete" on public.opportunity_activities for delete using (public.user_has_role(sector_id, array['sector_lead', 'admin']));

create policy "opp_notes_select" on public.opportunity_notes for select using (sector_id in (select public.user_sector_ids()));
create policy "opp_notes_insert" on public.opportunity_notes for insert with check (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));
create policy "opp_notes_update" on public.opportunity_notes for update using (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));
create policy "opp_notes_delete" on public.opportunity_notes for delete using (public.user_has_role(sector_id, array['sector_lead', 'admin']));

-- Indexes
create index if not exists idx_opp_contacts_sector on public.opportunity_contacts(sector_id);
create index if not exists idx_opp_contacts_forecast on public.opportunity_contacts(forecast_id);
create index if not exists idx_opp_activities_sector on public.opportunity_activities(sector_id);
create index if not exists idx_opp_activities_forecast on public.opportunity_activities(forecast_id);
create index if not exists idx_opp_activities_date on public.opportunity_activities(activity_date);
create index if not exists idx_opp_notes_sector on public.opportunity_notes(sector_id);
create index if not exists idx_opp_notes_forecast on public.opportunity_notes(forecast_id);

-- Triggers
create trigger trg_opp_contacts_updated_at before update on public.opportunity_contacts for each row execute function public.set_updated_at();
create trigger trg_opp_activities_updated_at before update on public.opportunity_activities for each row execute function public.set_updated_at();
create trigger trg_opp_notes_updated_at before update on public.opportunity_notes for each row execute function public.set_updated_at();


-- ============================================================================
-- VIEWS
-- ============================================================================

-- v_project_health — project health score
create or replace view public.v_project_health as
select
  p.id as project_id,
  p.sector_id,
  p.code,
  p.name,
  p.client_id,
  -- Open risks count
  (select count(*) from public.project_risks r
   where r.project_id = p.id and r.status in ('open', 'mitigating', 'escalated')) as open_risks,
  -- High/critical risks
  (select count(*) from public.project_risks r
   where r.project_id = p.id and r.status in ('open', 'mitigating', 'escalated')
   and r.impact in ('critical', 'high')) as high_risks,
  -- Open actions
  (select count(*) from public.project_actions a
   where a.project_id = p.id and a.status in ('open', 'in_progress')) as open_actions,
  -- Overdue actions
  (select count(*) from public.project_actions a
   where a.project_id = p.id and a.status in ('open', 'in_progress')
   and a.due_date < current_date) as overdue_actions,
  -- Lessons logged
  (select count(*) from public.project_lessons l where l.project_id = p.id) as lessons_count,
  -- Savings logged
  (select coalesce(sum(s.amount), 0) from public.project_savings s
   where s.project_id = p.id and s.saving_type = 'tangible') as tangible_savings,
  -- Last meeting
  (select max(m.meeting_date) from public.meetings m where m.project_id = p.id) as last_meeting_date
from public.projects p
where p.is_active = true;


-- v_project_raid — RAID summary per project
create or replace view public.v_project_raid as
select
  p.id as project_id,
  p.sector_id,
  p.code,
  p.name,
  p.client_id,
  (select count(*) from public.project_risks r where r.project_id = p.id and r.status in ('open', 'mitigating', 'escalated')) as open_risks,
  (select count(*) from public.project_risks r where r.project_id = p.id and r.status in ('open', 'mitigating', 'escalated') and r.impact in ('critical', 'high')) as high_risks,
  (select count(*) from public.project_actions a where a.project_id = p.id and a.status in ('open', 'in_progress')) as open_actions,
  (select count(*) from public.project_actions a where a.project_id = p.id and a.status in ('open', 'in_progress') and a.due_date < current_date) as overdue_actions,
  (select count(*) from public.project_risks r where r.project_id = p.id and r.status in ('open', 'mitigating', 'escalated') and r.category in ('compliance', 'hse')) as compliance_issues,
  (select count(*) from public.meeting_actions ma where ma.project_id = p.id and ma.status in ('open', 'in_progress')) as open_meeting_actions,
  (select count(*) from public.meeting_actions ma where ma.project_id = p.id and ma.status in ('open', 'in_progress') and ma.due_date < current_date) as overdue_meeting_actions
from public.projects p;


-- v_sector_action_tracker — all open actions across sector
create or replace view public.v_sector_action_tracker as
select
  'project' as source_type,
  a.id, a.sector_id, a.project_id,
  p.code as project_code, p.name as project_name,
  a.action_ref, a.description, a.owner_name,
  a.due_date, a.priority, a.status, a.source,
  a.created_at, a.updated_at
from public.project_actions a
join public.projects p on p.id = a.project_id
where a.status in ('open', 'in_progress')
union all
select
  'meeting' as source_type,
  ma.id, ma.sector_id, ma.project_id,
  p.code as project_code, p.name as project_name,
  ma.action_ref, ma.description, ma.owner_name,
  ma.due_date, ma.priority, ma.status,
  'meeting' as source,
  ma.created_at, ma.updated_at
from public.meeting_actions ma
left join public.projects p on p.id = ma.project_id
where ma.status in ('open', 'in_progress');
