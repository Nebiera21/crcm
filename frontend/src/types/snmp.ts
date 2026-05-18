export interface SNMPMetrics {
  router_id: string
  hostname: string
  ip_address: string
  community: string
  reachable: boolean
  sys_descr: string | null
  sys_name: string | null
  uptime_seconds: number | null
  cpu_5min_percent: number | null
  mem_free_bytes: number | null
  if_number: number | null
  error: string | null
  polled_at: string
}
