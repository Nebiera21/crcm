import apiClient from '@/lib/apiClient'
import type { DashboardStats } from '@/types/stats'

export async function getDashboardStats(): Promise<DashboardStats> {
  const { data } = await apiClient.get<DashboardStats>('/stats/dashboard')
  return data
}
