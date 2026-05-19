export interface Router {
  id: string
  hostname: string
  ip_address: string
  location: string | null
  model: string | null
  is_active: boolean
  snmp_community: string | null
  notes: string | null
  credential_id: string | null
  wan_ip_address: string | null
  wan_ssh_port: number | null
  use_wan_ip: boolean
  created_at: string
  updated_at: string
}

export interface RouterCreate {
  hostname: string
  ip_address: string
  location?: string | null
  model?: string | null
  is_active?: boolean
  snmp_community?: string | null
  notes?: string | null
  credential_id?: string | null
  wan_ip_address?: string | null
  wan_ssh_port?: number | null
  use_wan_ip?: boolean
}

export type RouterUpdate = Partial<RouterCreate>

export interface RouterListResponse {
  items: Router[]
  total: number
}

export interface RouterStats {
  total: number
  active: number
}

export interface ImportResult {
  created: number
  skipped_duplicate: number
  errors: string[]
}
