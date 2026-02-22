import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

const PERMISSION_MATRIX = {
  admin: {
    manage_sectors: true, manage_members: true, manage_settings: true,
    manage_employees: true, manage_clients: true, manage_projects: true,
    manage_timesheets: true, manage_invoices: true, manage_forecasts: true,
    manage_allocations: true, manage_meetings: true, manage_actions: true,
    manage_quality: true, manage_cross_sell: true, manage_account_plans: true,
    view_financials: true, view_person_costs: true,
  },
  sector_lead: {
    manage_sectors: false, manage_members: false, manage_settings: true,
    manage_employees: true, manage_clients: true, manage_projects: true,
    manage_timesheets: true, manage_invoices: true, manage_forecasts: true,
    manage_allocations: true, manage_meetings: true, manage_actions: true,
    manage_quality: true, manage_cross_sell: true, manage_account_plans: true,
    view_financials: true, view_person_costs: true,
  },
  project_manager: {
    manage_sectors: false, manage_members: false, manage_settings: false,
    manage_employees: false, manage_clients: false, manage_projects: false,
    manage_timesheets: true, manage_invoices: true, manage_forecasts: true,
    manage_allocations: true, manage_meetings: true, manage_actions: true,
    manage_quality: true, manage_cross_sell: true, manage_account_plans: false,
    view_financials: true, view_person_costs: false,
  },
  viewer: {
    manage_sectors: false, manage_members: false, manage_settings: false,
    manage_employees: false, manage_clients: false, manage_projects: false,
    manage_timesheets: false, manage_invoices: false, manage_forecasts: false,
    manage_allocations: false, manage_meetings: false, manage_actions: false,
    manage_quality: false, manage_cross_sell: false, manage_account_plans: false,
    view_financials: false, view_person_costs: false,
  },
}

const ROLE_RANK = { admin: 4, sector_lead: 3, project_manager: 2, viewer: 1 }

export function useRole(userId) {
  const [memberships, setMemberships] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) { setLoading(false); return }
    async function fetchRoles() {
      const { data, error } = await supabase.from('sector_members').select('sector_id, role').eq('user_id', userId)
      if (error) { console.error('[useRole]', error.message); setMemberships([]) }
      else setMemberships(data || [])
      setLoading(false)
    }
    fetchRoles()
  }, [userId])

  const highestRole = useMemo(() => {
    if (memberships.length === 0) return null
    return memberships.reduce((best, m) => (ROLE_RANK[m.role] || 0) > (ROLE_RANK[best] || 0) ? m.role : best, 'viewer')
  }, [memberships])

  const sectorIds = useMemo(() => memberships.map(m => m.sector_id), [memberships])
  const activeSectorId = sectorIds[0] || null
  const activeRole = useMemo(() => {
    const m = memberships.find(m => m.sector_id === activeSectorId)
    return m?.role || null
  }, [memberships, activeSectorId])

  const can = useMemo(() => {
    const role = activeRole || 'viewer'
    const perms = PERMISSION_MATRIX[role] || PERMISSION_MATRIX.viewer
    return (permission) => !!perms[permission]
  }, [activeRole])

  const hasMinRole = useMemo(() => {
    return (minRole) => (ROLE_RANK[activeRole] || 0) >= (ROLE_RANK[minRole] || 0)
  }, [activeRole])

  return {
    memberships, sectorIds, activeSectorId, activeRole, highestRole, loading, can, hasMinRole,
    isAdmin: activeRole === 'admin',
    isSectorLead: activeRole === 'sector_lead' || activeRole === 'admin',
    isPM: (ROLE_RANK[activeRole] || 0) >= ROLE_RANK.project_manager,
    isViewer: activeRole === 'viewer',
  }
}

export const ALL_PERMISSIONS = Object.keys(PERMISSION_MATRIX.admin)
export const ALL_ROLES = ['admin', 'sector_lead', 'project_manager', 'viewer']
