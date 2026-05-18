import apiClient from '@/lib/apiClient'
import type {
  DeployJobResponse,
  DeployRequest,
  HistoryDetail,
  HistoryListResponse,
  RollbackJobResponse,
} from '@/types/deploy'
import type { DeployStatus } from '@/types/deploy'

export async function deploy(body: DeployRequest): Promise<DeployJobResponse> {
  const { data } = await apiClient.post<DeployJobResponse>('/deploy/', body)
  return data
}

export async function listHistory(params?: {
  router_id?: string
  status?: DeployStatus
  skip?: number
  limit?: number
}): Promise<HistoryListResponse> {
  const { data } = await apiClient.get<HistoryListResponse>('/history/', { params })
  return data
}

export async function getHistory(id: string): Promise<HistoryDetail> {
  const { data } = await apiClient.get<HistoryDetail>(`/history/${id}`)
  return data
}

export async function rollback(historyId: string): Promise<RollbackJobResponse> {
  const { data } = await apiClient.post<RollbackJobResponse>(`/history/${historyId}/rollback`)
  return data
}
