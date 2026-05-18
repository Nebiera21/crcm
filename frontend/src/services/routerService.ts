import apiClient from '@/lib/apiClient'
import type { ImportResult, Router, RouterCreate, RouterListResponse, RouterStats, RouterUpdate } from '@/types/router'

interface ListParams {
  search?: string
  is_active?: boolean
  skip?: number
  limit?: number
}

export async function listRouters(params: ListParams = {}): Promise<RouterListResponse> {
  const { data } = await apiClient.get<RouterListResponse>('/inventory/routers/', { params })
  return data
}

export async function getRouterStats(): Promise<RouterStats> {
  const { data } = await apiClient.get<RouterStats>('/inventory/routers/stats')
  return data
}

export async function createRouter(body: RouterCreate): Promise<Router> {
  const { data } = await apiClient.post<Router>('/inventory/routers/', body)
  return data
}

export async function updateRouter(id: string, body: RouterUpdate): Promise<Router> {
  const { data } = await apiClient.put<Router>(`/inventory/routers/${id}`, body)
  return data
}

export async function deleteRouter(id: string): Promise<void> {
  await apiClient.delete(`/inventory/routers/${id}`)
}

export async function importRouters(file: File): Promise<ImportResult> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await apiClient.post<ImportResult>('/inventory/routers/import', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}
