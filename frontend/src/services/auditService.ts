import apiClient from '@/lib/apiClient'
import type { AuditLogFilters, AuditLogListResponse } from '@/types/audit'

export async function listAuditLogs(
  filters: AuditLogFilters = {},
  skip = 0,
  limit = 50,
): Promise<AuditLogListResponse> {
  const { data } = await apiClient.get<AuditLogListResponse>('/audit/', {
    params: { ...filters, skip, limit },
  })
  return data
}

export async function exportAuditLogs(filters: AuditLogFilters = {}): Promise<void> {
  const response = await apiClient.get('/audit/export', {
    params: filters,
    responseType: 'blob',
  })
  const blob = new Blob([response.data], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
