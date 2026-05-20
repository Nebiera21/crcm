export interface MonitoringSettings {
  retention_days: number
  ping_enabled: boolean
  snmp_traffic_enabled: boolean
  updated_at: string
}

export interface LatestPing {
  target: 'lan' | 'wan'
  latency_ms: number | null
  packet_loss: number
  is_up: boolean
  timestamp: string
}

export interface LatestTraffic {
  interface_name: string
  bits_in_per_sec: number | null
  bits_out_per_sec: number | null
  if_status: 'up' | 'down' | null
  timestamp: string
}

export interface RouterStatus {
  router_id: string
  hostname: string
  ip_address: string
  wan_ip_address: string | null
  wan_interface: string | null
  snmp_version: string
  has_snmp: boolean
  location: string | null
  lan_ping: LatestPing | null
  wan_ping: LatestPing | null
  traffic: LatestTraffic | null
}

export interface RouterStatusList {
  routers: RouterStatus[]
  total: number
}

export interface PingPoint {
  timestamp: string
  target: 'lan' | 'wan'
  latency_ms: number | null
  packet_loss: number
  is_up: boolean
}

export interface TrafficPoint {
  timestamp: string
  bits_in_per_sec: number | null
  bits_out_per_sec: number | null
  if_status: 'up' | 'down' | null
}

export interface AggregatePoint {
  timestamp: string
  total_bits_in: number
  total_bits_out: number
  router_count: number
}

export type RouterHealth = 'online' | 'degraded' | 'offline' | 'no-data'
