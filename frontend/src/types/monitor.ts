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
