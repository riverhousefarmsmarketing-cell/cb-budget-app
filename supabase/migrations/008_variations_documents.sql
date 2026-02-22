-- ============================================================================
-- MIGRATION 008: PROJECT VARIATIONS + PROJECT DOCUMENTS
-- ============================================================================
-- Change order / variation management and document register.
-- ============================================================================


-- ============================================================================
-- 1. PROJECT_VARIATIONS (Change Orders)
-- ============================================================================

create table if not exists public.project_variations (
  id uuid primary key default uuid_generate_v4(),
  sector_id uuid not null references public.sectors(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  variation_ref text not null,            -- 'V-001', 'V-002' per project
  title text not null,
  description text not null,
  variation_type text not null default 'scope_change'
    check (variation_type in (
      'scope_change',
      'fee_variation',
      'contract_amendment',
      'schedule_change',
      'resource_change',
      'other'
    )),
  -- Financial impact
  original_value numeric(14,2),
  variation_amount numeric(14,2),
  revised_value numeric(14,2),
  impact_description text,
  -- Approval workflow
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'under_review',
                      'approved', 'rejected', 'withdrawn')),
  raised_by text not null,
  raised_date date not null default current_date,
  submitted_date date,
  approved_by text,
  approved_date date,
  rejected_reason text,
  -- Linkage
  client_id uuid references public.clients(id),
  related_meeting_id uuid references public.meetings(id),
  related_risk_id uuid references public.project_risks(id),
  -- Documentation
  client_reference text,
  po_impact text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sector_id, project_id, variation_ref)
);

-- Indexes
create index if not exists idx_project_variations_sector on public.project_variations(sector_id);
create index if not exists idx_project_variations_project on public.project_variations(project_id);
create index if not exists idx_project_variations_status on public.project_variations(status);
create index if not exists idx_project_variations_type on public.project_variations(variation_type);

-- RLS
alter table public.project_variations enable row level security;

create policy "project_variations_select" on public.project_variations for select
  using (sector_id in (select public.user_sector_ids()));
create policy "project_variations_insert" on public.project_variations for insert
  with check (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));
create policy "project_variations_update" on public.project_variations for update
  using (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));
create policy "project_variations_delete" on public.project_variations for delete
  using (public.user_has_role(sector_id, array['sector_lead', 'admin']));

-- Trigger
create trigger trg_project_variations_updated_at
  before update on public.project_variations
  for each row execute function public.set_updated_at();

-- Auto-generate variation_ref per project
create or replace function public.generate_variation_ref()
returns trigger
language plpgsql
as $$
declare v_count integer;
begin
  if new.variation_ref is null or new.variation_ref = '' then
    select count(*) + 1 into v_count
    from public.project_variations
    where sector_id = new.sector_id and project_id = new.project_id;
    new.variation_ref = 'V-' || lpad(v_count::text, 3, '0');
  end if;
  return new;
end;
$$;

create trigger trg_variation_ref
  before insert on public.project_variations
  for each row execute function public.generate_variation_ref();


-- ============================================================================
-- 2. PROJECT_DOCUMENTS (Document Register)
-- ============================================================================
-- Tracks what was issued, when, to whom, and approval status.
-- NOT file storage — it's a transmittal and deliverable tracking log.
-- ============================================================================

create table if not exists public.project_documents (
  id uuid primary key default uuid_generate_v4(),
  sector_id uuid not null references public.sectors(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  document_ref text not null,             -- 'DOC-001' per project
  title text not null,
  document_type text not null default 'report'
    check (document_type in (
      'report',
      'certificate',
      'submission',
      'correspondence',
      'proposal',
      'contract',
      'meeting_minutes',
      'field_log',
      'other'
    )),
  -- Version tracking
  version text not null default '1.0',
  revision_date date,
  -- Issuance
  issued_date date,
  issued_by text,
  issued_to text,
  transmittal_ref text,
  -- Approval
  approval_status text not null default 'not_required'
    check (approval_status in (
      'not_required', 'pending', 'approved',
      'approved_with_comments', 'rejected', 'superseded'
    )),
  approved_by text,
  approved_date date,
  comments text,
  -- Linkage
  client_id uuid references public.clients(id),
  meeting_id uuid references public.meetings(id),
  -- Metadata
  description text,
  file_reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sector_id, project_id, document_ref)
);

-- Indexes
create index if not exists idx_project_documents_sector on public.project_documents(sector_id);
create index if not exists idx_project_documents_project on public.project_documents(project_id);
create index if not exists idx_project_documents_type on public.project_documents(document_type);
create index if not exists idx_project_documents_status on public.project_documents(approval_status);
create index if not exists idx_project_documents_issued on public.project_documents(issued_date);

-- RLS
alter table public.project_documents enable row level security;

create policy "project_documents_select" on public.project_documents for select
  using (sector_id in (select public.user_sector_ids()));
create policy "project_documents_insert" on public.project_documents for insert
  with check (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));
create policy "project_documents_update" on public.project_documents for update
  using (public.user_has_role(sector_id, array['project_manager', 'sector_lead', 'admin']));
create policy "project_documents_delete" on public.project_documents for delete
  using (public.user_has_role(sector_id, array['sector_lead', 'admin']));

-- Trigger
create trigger trg_project_documents_updated_at
  before update on public.project_documents
  for each row execute function public.set_updated_at();

-- Auto-generate document_ref per project
create or replace function public.generate_document_ref()
returns trigger
language plpgsql
as $$
declare v_count integer;
begin
  if new.document_ref is null or new.document_ref = '' then
    select count(*) + 1 into v_count
    from public.project_documents
    where sector_id = new.sector_id and project_id = new.project_id;
    new.document_ref = 'DOC-' || lpad(v_count::text, 3, '0');
  end if;
  return new;
end;
$$;

create trigger trg_document_ref
  before insert on public.project_documents
  for each row execute function public.generate_document_ref();
