import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Generic hook for fetching data from a Supabase table/view
 * filtered by sector_id.
 *
 * @param {string} table - table or view name
 * @param {string} sectorId - sector UUID to filter by
 * @param {object} options - { select, order, filters }
 */
export function useSupabaseQuery(table, sectorId, options = {}) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const { select = '*', order, filters = [] } = options

  useEffect(() => {
    if (!sectorId) return

    setLoading(true)
    let query = supabase.from(table).select(select).eq('sector_id', sectorId)

    // Apply additional filters
    filters.forEach(({ column, op, value }) => {
      if (op === 'eq') query = query.eq(column, value)
      if (op === 'neq') query = query.neq(column, value)
      if (op === 'in') query = query.in(column, value)
    })

    // Apply ordering
    if (order) {
      query = query.order(order.column, { ascending: order.ascending ?? true })
    }

    query.then(({ data, error }) => {
      setData(data || [])
      setError(error)
      setLoading(false)
    })
  }, [table, sectorId, select, JSON.stringify(order), JSON.stringify(filters)])

  return { data, loading, error }
}
