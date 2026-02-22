-- ============================================================================
-- MIGRATION 009: TENANT BRANDING (White-Label Support)
-- ============================================================================
-- Allows each sector to customise colours, fonts, logos.
-- ============================================================================

create table if not exists public.tenant_branding (
  id uuid primary key default uuid_generate_v4(),
  sector_id uuid not null references public.sectors(id) on delete cascade,
  -- Organisation identity
  org_name text not null,                           -- 'Currie & Brown', 'Acme Corp'
  org_name_short text,                              -- 'C&B', 'Acme' (for compact header)
  platform_name text not null default 'Budget Management',
  logo_url text,
  favicon_url text,
  -- Primary brand colours
  colour_primary text not null default '#2B3A67',
  colour_primary_light text default '#3D4F85',
  colour_primary_pale text default '#EBEEF5',
  -- Neutral colours
  colour_text text not null default '#374151',
  colour_text_light text default '#6B7280',
  colour_background text not null default '#F9FAFB',
  colour_surface text not null default '#FFFFFF',
  colour_border text default '#E5E7EB',
  -- Data visualisation colours
  colour_data_positive text default '#059669',
  colour_data_warning text default '#D97706',
  colour_data_negative text default '#DC2626',
  colour_data_info text default '#2563EB',
  colour_data_accent text default '#0D9488',
  -- Typography
  font_family text not null default '''DM Sans'', sans-serif',
  font_url text default 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500&display=swap',
  -- Layout preferences
  show_org_logo boolean not null default true,
  show_org_name_in_header boolean not null default true,
  show_platform_name_in_header boolean not null default true,
  -- Custom footer text
  footer_text text,
  -- Metadata
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sector_id)
);

-- Index
create index if not exists idx_tenant_branding_sector on public.tenant_branding(sector_id);

-- RLS — admin only
alter table public.tenant_branding enable row level security;

create policy "tenant_branding_select" on public.tenant_branding for select
  using (sector_id in (select public.user_sector_ids()));
create policy "tenant_branding_insert" on public.tenant_branding for insert
  with check (public.user_has_role(sector_id, array['admin']));
create policy "tenant_branding_update" on public.tenant_branding for update
  using (public.user_has_role(sector_id, array['admin']));
create policy "tenant_branding_delete" on public.tenant_branding for delete
  using (public.user_has_role(sector_id, array['admin']));

-- Trigger
create trigger trg_tenant_branding_updated_at
  before update on public.tenant_branding
  for each row execute function public.set_updated_at();


-- ============================================================================
-- SEED: PCS sector branding
-- ============================================================================

insert into public.tenant_branding (
  sector_id,
  org_name, org_name_short, platform_name,
  colour_primary, colour_primary_light, colour_primary_pale,
  colour_text, colour_text_light,
  colour_background, colour_surface, colour_border,
  colour_data_positive, colour_data_warning, colour_data_negative,
  colour_data_info, colour_data_accent,
  font_family
) values (
  (select id from public.sectors where code = 'PCS' limit 1),
  'Currie & Brown', 'C&B', 'Budget Management',
  '#4A154B', '#5C2D5E', '#F7F0F7',
  '#63666A', '#63666A',
  '#F5F5F5', '#FFFFFF', '#E0E0E0',
  '#2E7D32', '#F9A825', '#C62828',
  '#1565C0', '#00897B',
  '''DM Sans'', sans-serif'
) on conflict (sector_id) do nothing;
