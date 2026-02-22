-- ============================================================================
-- MIGRATION 007: MEETINGS + CROSS-SELL + ACCOUNT ACTION PLANS
-- ============================================================================
-- Part A: Full meeting management system (5 tables)
-- Part B: Cross-sell opportunities + FK additions to PM tool tables
-- Part C: Account action plans + account actions
-- ============================================================================


-- ============================================================================
-- PART A: MEETING MANAGEMENT SYSTEM (5 tables)
-- ============================================================================

-- A1. MEETINGS
create table if not exists public.meetings (
  id uuid primary key default uuid_generate_v4(),
  sector_id uuid not null references public.sectors(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  forecast_id uuid references public.forecasts(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  meeting_number text not null,
  title text not null,
  description text,
  meeting_type text not null default 'project'
    check (meeting_type in (
      'project', 'internal', 'client', 'governance', 'other',
      'kickoff', 'standard', 'review', 'escalation', 'ad_hoc',
      'introduction', 'proposal', 'pitch', 'negotiation', 'site_visit'
    )),
  meeting_date date not null,
  start_time time,
  end_time time,
  location text,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'in_progress', 'completed', 'cancelled')),
  minutes_status text not null default 'not_started'
    check (minutes_status in ('not_started', 'draft', 'issued', 'accepted')),
  client_sentiment text
    check (client_sentiment in (
      'very_satisfied', 'satisfied', 'neutral', 'concerned', 'dissatisfied'
    )),
  next_meeting_date date,
  minute_taker uuid references auth.users(id),
  distribution_list text,
  acceptance_deadline date,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sector_id, meeting_number)
);

-- A2. MEETING ATTENDEES
create table if not exists public.meeting_attendees (
  id uuid primary key default uuid_generate_v4(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  sector_id uuid not null references public.sectors(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  external_name text,
  external_organisation text,
  external_role text,
  attendance_status text not null default 'invited'
    check (attendance_status in ('invited', 'present', 'apologies', 'absent')),
  created_at timestamptz not null default now(),
  check (employee_id is not null or external_name is not null)
);

-- A3. MEETING AGENDA ITEMS
create table if not exists public.meeting_agenda_items (
  id uuid primary key default uuid_generate_v4(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  sector_id uuid not null references public.sectors(id) on delete cascade,
  item_order integer not null,
  title text not null,
  description text,
  discussion_notes text,
  presenter uuid references auth.users(id),
  duration_minutes integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (meeting_id, item_order)
);

-- A4. MEETING DECISIONS
create table if not exists public.meeting_decisions (
  id uuid primary key default uuid_generate_v4(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  sector_id uuid not null references public.sectors(id) on delete cascade,
  agenda_item_id uuid references public.meeting_agenda_items(id) on delete set null,
  decision_ref text not null,
  description text not null,
  agreed_by text,
  decision_date date not null,
  created_at timestamptz not null default now(),
  unique (meeting_id, decision_ref)
);

-- A5. MEETING ACTIONS
create table if not exists public.meeting_actions (
  id uuid primary key default uuid_generate_v4(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  sector_id uuid not null references public.sectors(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  agenda_item_id uuid references public.meeting_agenda_items(id) on delete set null,
  action_ref text not null,
  description text not null,
  owner_employee_id uuid references public.employees(id) on delete set null,
  owner_name text,
  due_date date,
  completed_date date,
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'closed', 'superseded')),
  priority text not null default 'normal'
    check (priority in ('critical', 'high', 'normal', 'low')),
  superseded_by uuid references public.meeting_actions(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sector_id, action_ref)
);

-- Meeting indexes
create index if not exists idx_meetings_sector on public.meetings(sector_id);
create index if not exists idx_meetings_project on public.meetings(project_id);
create index if not exists idx_meetings_forecast on public.meetings(forecast_id);
create index if not exists idx_meetings_client on public.meetings(client_id);
create index if not exists idx_meetings_date on public.meetings(meeting_date);
create index if not exists idx_meeting_attendees_meeting on public.meeting_attendees(meeting_id);
create index if not exists idx_meeting_attendees_sector on public.meeting_attendees(sector_id);
create index if not exists idx_meeting_agenda_meeting on public.meeting_agenda_items(meeting_id);
create index if not exists idx_meeting_decisions_meeting on public.meeting_decisions(meeting_id);
create index if not exists idx_meeting_actions_meeting on public.meeting_actions(meeting_id);
create index if not exists idx_meeting_actions_sector on public.meeting_actions(sector_id);
create index if not exists idx_meeting_actions_project on public.meeting_actions(project_id);
create index if not exists idx_meeting_actions_status on public.meeting_actions(status);
create index if not exists idx_meeting_actions_owner on public.meeting_actions(owner_employee_id);
create index if not exists idx_meeting_actions_due on public.meeting_actions(due_date);

-- Meeting RLS
alter table public.meetings enable row level security;
alter table public.meeting_attendees enable row level security;
alter table public.meeting_agenda_items enable row level security;
alter table public.meeting_decisions enable row level security;
alter table public.meeting_actions enable row level security;

create policy "meetings_select" on public.meetings for select using (sector_id in (select public.user_sector_ids()));
create policy "meetings_insert" on public.meetings for insert with check (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));
create policy "meetings_update" on public.meetings for update using (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));
create policy "meetings_delete" on public.meetings for delete using (public.user_has_role(sector_id, array['sector_lead', 'admin']));

create policy "meeting_attendees_select" on public.meeting_attendees for select using (sector_id in (select public.user_sector_ids()));
create policy "meeting_attendees_insert" on public.meeting_attendees for insert with check (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));
create policy "meeting_attendees_update" on public.meeting_attendees for update using (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));
create policy "meeting_attendees_delete" on public.meeting_attendees for delete using (public.user_has_role(sector_id, array['sector_lead', 'admin']));

create policy "meeting_agenda_items_select" on public.meeting_agenda_items for select using (sector_id in (select public.user_sector_ids()));
create policy "meeting_agenda_items_insert" on public.meeting_agenda_items for insert with check (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));
create policy "meeting_agenda_items_update" on public.meeting_agenda_items for update using (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));
create policy "meeting_agenda_items_delete" on public.meeting_agenda_items for delete using (public.user_has_role(sector_id, array['sector_lead', 'admin']));

create policy "meeting_decisions_select" on public.meeting_decisions for select using (sector_id in (select public.user_sector_ids()));
create policy "meeting_decisions_insert" on public.meeting_decisions for insert with check (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));
create policy "meeting_decisions_update" on public.meeting_decisions for update using (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));
create policy "meeting_decisions_delete" on public.meeting_decisions for delete using (public.user_has_role(sector_id, array['sector_lead', 'admin']));

create policy "meeting_actions_select" on public.meeting_actions for select using (sector_id in (select public.user_sector_ids()));
create policy "meeting_actions_insert" on public.meeting_actions for insert with check (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));
create policy "meeting_actions_update" on public.meeting_actions for update using (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));
create policy "meeting_actions_delete" on public.meeting_actions for delete using (public.user_has_role(sector_id, array['sector_lead', 'admin']));

-- Meeting triggers
create trigger trg_meetings_updated_at before update on public.meetings for each row execute function public.set_updated_at();
create trigger trg_meeting_attendees_updated_at before update on public.meeting_attendees for each row execute function public.set_updated_at();
create trigger trg_meeting_agenda_updated_at before update on public.meeting_agenda_items for each row execute function public.set_updated_at();
create trigger trg_meeting_actions_updated_at before update on public.meeting_actions for each row execute function public.set_updated_at();


-- ============================================================================
-- PART B: CROSS-SELL OPPORTUNITIES
-- ============================================================================

create table if not exists public.cross_sell_opportunities (
  id uuid primary key default uuid_generate_v4(),
  sector_id uuid not null references public.sectors(id) on delete cascade,
  source_project_id uuid references public.projects(id) on delete set null,
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null,
  description text,
  target_service text not null,
  target_sector text not null,
  estimated_value numeric(14,2),
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
  pursuit_stage text not null default 'identified'
    check (pursuit_stage in (
      'identified', 'qualifying', 'introduced', 'proposal_prep',
      'proposal_submitted', 'negotiation', 'won', 'lost', 'parked'
    )),
  assigned_to_name text,
  assigned_to uuid references auth.users(id),
  identified_date date not null default current_date,
  won_date date,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cross_sell_sector on public.cross_sell_opportunities(sector_id);
create index if not exists idx_cross_sell_client on public.cross_sell_opportunities(client_id);
create index if not exists idx_cross_sell_source_project on public.cross_sell_opportunities(source_project_id);
create index if not exists idx_cross_sell_stage on public.cross_sell_opportunities(pursuit_stage);

alter table public.cross_sell_opportunities enable row level security;
create policy "cross_sell_select" on public.cross_sell_opportunities for select using (sector_id in (select public.user_sector_ids()));
create policy "cross_sell_insert" on public.cross_sell_opportunities for insert with check (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));
create policy "cross_sell_update" on public.cross_sell_opportunities for update using (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));
create policy "cross_sell_delete" on public.cross_sell_opportunities for delete using (public.user_has_role(sector_id, array['sector_lead', 'admin']));

create trigger trg_cross_sell_updated_at before update on public.cross_sell_opportunities for each row execute function public.set_updated_at();

-- Add cross_sell_id to PM tool tables
alter table public.project_contacts add column if not exists cross_sell_id uuid references public.cross_sell_opportunities(id) on delete cascade;
alter table public.project_risks add column if not exists cross_sell_id uuid references public.cross_sell_opportunities(id) on delete cascade;
alter table public.project_savings add column if not exists cross_sell_id uuid references public.cross_sell_opportunities(id) on delete cascade;
alter table public.project_lessons add column if not exists cross_sell_id uuid references public.cross_sell_opportunities(id) on delete cascade;
alter table public.meetings add column if not exists cross_sell_id uuid references public.cross_sell_opportunities(id) on delete set null;

create index if not exists idx_project_contacts_cross_sell on public.project_contacts(cross_sell_id);
create index if not exists idx_project_risks_cross_sell on public.project_risks(cross_sell_id);
create index if not exists idx_project_savings_cross_sell on public.project_savings(cross_sell_id);
create index if not exists idx_project_lessons_cross_sell on public.project_lessons(cross_sell_id);
create index if not exists idx_meetings_cross_sell on public.meetings(cross_sell_id);


-- ============================================================================
-- PART C: ACCOUNT ACTION PLANS
-- ============================================================================

-- C1. ACCOUNT ACTION PLANS (one per client per year)
create table if not exists public.account_action_plans (
  id uuid primary key default uuid_generate_v4(),
  sector_id uuid not null references public.sectors(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  plan_year integer not null,
  account_lead_name text not null,
  account_lead_user_id uuid references auth.users(id),
  sector_lead_name text,
  date_submitted date,
  -- Mid-year review scoring
  midyear_category_coverage text check (midyear_category_coverage in ('strong', 'adequate', 'weak')),
  midyear_specificity text check (midyear_specificity in ('strong', 'adequate', 'weak')),
  midyear_strategic_depth text check (midyear_strategic_depth in ('strong', 'adequate', 'weak')),
  midyear_cb_tools text check (midyear_cb_tools in ('strong', 'adequate', 'weak')),
  midyear_accountability text check (midyear_accountability in ('strong', 'adequate', 'weak')),
  midyear_overall text check (midyear_overall in ('strong', 'adequate', 'weak')),
  midyear_feedback text,
  midyear_review_date date,
  -- Year-end review scoring
  yearend_category_coverage text check (yearend_category_coverage in ('strong', 'adequate', 'weak')),
  yearend_specificity text check (yearend_specificity in ('strong', 'adequate', 'weak')),
  yearend_strategic_depth text check (yearend_strategic_depth in ('strong', 'adequate', 'weak')),
  yearend_cb_tools text check (yearend_cb_tools in ('strong', 'adequate', 'weak')),
  yearend_accountability text check (yearend_accountability in ('strong', 'adequate', 'weak')),
  yearend_overall text check (yearend_overall in ('strong', 'adequate', 'weak')),
  yearend_feedback text,
  yearend_review_date date,
  -- Status
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'under_review', 'revision_required', 'accepted')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sector_id, client_id, plan_year)
);

-- C2. ACCOUNT ACTIONS (individual items within a plan)
create table if not exists public.account_actions (
  id uuid primary key default uuid_generate_v4(),
  plan_id uuid not null references public.account_action_plans(id) on delete cascade,
  sector_id uuid not null references public.sectors(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  category text not null
    check (category in ('margin', 'people', 'growth')),
  action_description text not null,
  success_criteria text,
  cb_tool_used text,
  owner_name text not null,
  deadline text not null,
  milestones text,
  -- Progress tracking
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed', 'at_risk', 'cancelled')),
  progress_notes text,
  midyear_update text,
  midyear_status text check (midyear_status in ('on_track', 'at_risk', 'behind', 'completed', 'not_started')),
  yearend_update text,
  yearend_status text check (yearend_status in ('achieved', 'partially_achieved', 'not_achieved', 'superseded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Account plan indexes
create index if not exists idx_account_plans_sector on public.account_action_plans(sector_id);
create index if not exists idx_account_plans_client on public.account_action_plans(client_id);
create index if not exists idx_account_actions_plan on public.account_actions(plan_id);
create index if not exists idx_account_actions_sector on public.account_actions(sector_id);
create index if not exists idx_account_actions_category on public.account_actions(category);
create index if not exists idx_account_actions_status on public.account_actions(status);

-- Account plan RLS
alter table public.account_action_plans enable row level security;
alter table public.account_actions enable row level security;

create policy "account_action_plans_select" on public.account_action_plans for select using (sector_id in (select public.user_sector_ids()));
create policy "account_action_plans_insert" on public.account_action_plans for insert with check (public.user_has_role(sector_id, array['sector_lead', 'admin']));
create policy "account_action_plans_update" on public.account_action_plans for update using (public.user_has_role(sector_id, array['sector_lead', 'admin']));
create policy "account_action_plans_delete" on public.account_action_plans for delete using (public.user_has_role(sector_id, array['admin']));

create policy "account_actions_select" on public.account_actions for select using (sector_id in (select public.user_sector_ids()));
create policy "account_actions_insert" on public.account_actions for insert with check (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));
create policy "account_actions_update" on public.account_actions for update using (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));
create policy "account_actions_delete" on public.account_actions for delete using (public.user_has_role(sector_id, array['sector_lead', 'admin']));

-- Account plan triggers
create trigger trg_account_plans_updated_at before update on public.account_action_plans for each row execute function public.set_updated_at();
create trigger trg_account_actions_updated_at before update on public.account_actions for each row execute function public.set_updated_at();
