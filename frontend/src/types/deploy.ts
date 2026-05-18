export type DeployStatus = 'pending' | 'success' | 'failed' | 'rolled_back'

export interface DeployRequest {
  router_ids: string[]
  template_id: string | null
  rendered_config: string
}

export interface DeployJobResponse {
  job_id: string
  history_ids: string[]
}

export interface RollbackJobResponse {
  job_id: string
  history_id: string
}

export interface HistoryListItem {
  id: string
  router_id: string
  router_hostname: string | null
  router_ip: string | null
  template_id: string | null
  deployed_by: string | null
  status: DeployStatus
  job_id: string | null
  deployed_at: string
  can_rollback: boolean
}

export interface HistoryDetail extends HistoryListItem {
  rendered_config: string | null
  config_snapshot: string | null
  output: string | null
}

export interface HistoryListResponse {
  items: HistoryListItem[]
  total: number
}

export interface BulkDeployResult {
  history_id: string
  router_id: string
  hostname?: string
  status: DeployStatus
  output?: string
}

export interface BulkDeployTaskResult {
  results: BulkDeployResult[]
}
