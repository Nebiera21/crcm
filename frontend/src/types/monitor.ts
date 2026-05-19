export interface TestConnectionResult {
  success: boolean
  message: string
  latency_ms: number | null
}

export interface CommandRunRequest {
  router_id: string
  commands: string[]
}

export interface CommandRunResponse {
  router_id: string
  hostname: string
  ip_address: string
  results: Record<string, string>
  executed_at: string
}

export interface TaskStatus {
  job_id: string
  state: 'PENDING' | 'STARTED' | 'SUCCESS' | 'FAILURE' | 'REVOKED' | string
  result: Record<string, unknown> | null
  error: string | null
}

export interface CommandPreset {
  id: string
  command: string
  created_by_username: string | null
  created_at: string
}

export interface CommandPresetList {
  items: CommandPreset[]
  total: number
}

export interface RouterRunResult {
  router_id: string
  hostname: string
  ip_address: string
  results?: Record<string, string>
  error?: string
}

export interface SNMPBulkResult {
  router_id: string
  hostname: string
  ip_address: string
  reachable: boolean
  sys_name: string | null
  uptime_seconds: number | null
  cpu_5min_percent: number | null
  mem_free_bytes: number | null
  if_number: number | null
  error: string | null
  polled_at: string
}
