import { supabase } from './supabase'
import { PCS_SECTOR_ID } from '../hooks/useData'

// ============================================================================
// Deletion Audit Log
// ============================================================================
// Every delete in the application goes through this utility.
// It records: what table, what record ID, a snapshot of the data,
// when it was deleted, and who deleted it (current user).
//
// Uses app_settings table with key pattern: deletion_log_{timestamp}
// because we don't have a dedicated deletion_log table.
// ============================================================================

/**
 * Delete a record with audit logging.
 * Fetches the record first, logs it, then deletes.
 *
 * @param {string} table - Supabase table name
 * @param {string} id - Record UUID
 * @param {object} [snapshot] - Optional pre-fetched record data (avoids extra fetch)
 * @returns {object} - { error } from the delete operation
 */
export async function auditDelete(table, id, snapshot = null) {
  // 1. Fetch record if snapshot not provided
  let recordData = snapshot
  if (!recordData) {
    const { data } = await supabase.from(table).select('*').eq('id', id).single()
    recordData = data
  }

  // 2. Log the deletion
  const logEntry = {
    table,
    record_id: id,
    snapshot: recordData,
    deleted_at: new Date().toISOString(),
    deleted_by: 'current_user', // Will be replaced with auth user when auth is wired
  }

  await supabase.from('app_settings').insert({
    sector_id: PCS_SECTOR_ID,
    setting_key: `deletion_log_${Date.now()}_${id.slice(0, 8)}`,
    setting_value: JSON.stringify(logEntry),
  })

  // 3. Perform the actual delete
  const { error } = await supabase.from(table).delete().eq('id', id)
  return { error }
}

/**
 * Delete with audit — convenience for when you already have the record data.
 * Avoids the extra fetch.
 */
export async function auditDeleteWithData(table, id, recordData) {
  return auditDelete(table, id, recordData)
}

/**
 * Fetch recent deletion log entries (for admin review)
 * @param {number} limit - Max entries to return
 * @returns {Array} - Parsed deletion log entries
 */
export async function getDeletionLog(limit = 50) {
  const { data } = await supabase.from('app_settings')
    .select('*')
    .eq('sector_id', PCS_SECTOR_ID)
    .like('setting_key', 'deletion_log_%')
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data || []).map(d => {
    try { return { id: d.id, key: d.setting_key, logged_at: d.created_at, ...JSON.parse(d.setting_value) } }
    catch { return null }
  }).filter(Boolean)
}
