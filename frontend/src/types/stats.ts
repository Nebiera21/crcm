import type { DeployStatus } from './deploy'

export interface RecentDeployItem {
  id: string
  router_hostname: string | null
  router_ip: string | null
  status: DeployStatus
  deployed_at: string
}

export interface DashboardStats {
  routers_total: number
  routers_active: number
  templates_total: number
  deploys_total: number
  deploys_last_30d: number
  deploys_success_last_30d: number
  deploys_failed_last_30d: number
  recent_deploys: RecentDeployItem[]
}
