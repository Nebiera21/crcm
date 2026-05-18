import apiClient from '@/lib/apiClient'
import type { SNMPMetrics } from '@/types/snmp'

export async function pollSNMP(routerId: string): Promise<SNMPMetrics> {
  const { data } = await apiClient.post<SNMPMetrics>('/monitor/snmp/poll', { router_id: routerId })
  return data
}
