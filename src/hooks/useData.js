import { useSupabaseQuery } from './useSupabaseQuery'

// PCS sector UUID from seed data
export const PCS_SECTOR_ID = '00000000-0000-0000-0000-000000000001'

export function useEmployees(sectorId = PCS_SECTOR_ID) {
  return useSupabaseQuery('employees', sectorId, {
    order: { column: 'employee_code', ascending: true },
  })
}

export function useClients(sectorId = PCS_SECTOR_ID) {
  return useSupabaseQuery('clients', sectorId, {
    order: { column: 'name', ascending: true },
  })
}

export function useProjects(sectorId = PCS_SECTOR_ID) {
  return useSupabaseQuery('projects', sectorId, {
    order: { column: 'code', ascending: true },
  })
}

export function useAllocations(sectorId = PCS_SECTOR_ID) {
  return useSupabaseQuery('resource_allocations', sectorId)
}

export function useInvoices(sectorId = PCS_SECTOR_ID) {
  return useSupabaseQuery('invoices', sectorId, {
    order: { column: 'billing_month', ascending: false },
  })
}

export function useForecasts(sectorId = PCS_SECTOR_ID) {
  return useSupabaseQuery('forecasts', sectorId, {
    select: '*, forecast_allocations(*)',
  })
}

export function useSectorSummary(sectorId = PCS_SECTOR_ID) {
  return useSupabaseQuery('v_sector_summary', sectorId)
}

export function useUtilisation(sectorId = PCS_SECTOR_ID) {
  return useSupabaseQuery('v_employee_utilization', sectorId)
}

export function useInvoiceAging(sectorId = PCS_SECTOR_ID) {
  return useSupabaseQuery('v_invoice_aging', sectorId)
}

export function useResourceCapacity(sectorId = PCS_SECTOR_ID) {
  return useSupabaseQuery('v_resource_capacity', sectorId)
}

export function useForecastPipeline(sectorId = PCS_SECTOR_ID) {
  return useSupabaseQuery('v_forecast_pipeline', sectorId)
}

export function useWorkingHours(sectorId = PCS_SECTOR_ID) {
  return useSupabaseQuery('working_hours_calendar', sectorId, {
    order: { column: 'month', ascending: true },
  })
}

// New hooks for weekly hours system
export function useEmployeeWeeklyTotals(sectorId = PCS_SECTOR_ID) {
  return useSupabaseQuery('v_employee_weekly_totals', sectorId, {
    order: { column: 'week_ending', ascending: true },
  })
}

export function useEmployeeProfile(sectorId = PCS_SECTOR_ID) {
  return useSupabaseQuery('v_employee_profile', sectorId, {
    order: { column: 'employee_code', ascending: true },
  })
}

export function useProjectProfile(sectorId = PCS_SECTOR_ID) {
  return useSupabaseQuery('v_project_profile', sectorId, {
    order: { column: 'code', ascending: true },
  })
}
