export interface AuditLogItem {
  id: string
  user_id: string | null
  username: string | null
  action: string
  resource_type: string
  resource_id: string
  detail: Record<string, unknown>
  ip_address: string | null
  created_at: string
}

export interface AuditLogListResponse {
  items: AuditLogItem[]
  total: number
}

export interface AuditLogFilters {
  action?: string
  resource_type?: string
  start_date?: string
  end_date?: string
}
