-- ============================================================================
-- Migration 004: Cross-Charge Employees
-- Adds cross-charge flag and originating sector to employees table
-- ============================================================================

-- Add cross-charge fields to employees
alter table public.employees
  add column if not exists is_cross_charge boolean not null default false,
  add column if not exists originating_sector text;  -- sector name/code where employee is based

-- Comment for clarity
comment on column public.employees.is_cross_charge is 'True if employee is charged from another sector';
comment on column public.employees.originating_sector is 'Name or code of the sector this employee belongs to (for cross-charges)';
