import apiClient from '@/lib/apiClient'
import type { CredentialsStatus, CredentialsUpdate } from '@/types/credentials'

export async function getCredentials(): Promise<CredentialsStatus> {
  const { data } = await apiClient.get<CredentialsStatus>('/credentials/')
  return data
}

export async function updateCredentials(body: CredentialsUpdate): Promise<CredentialsStatus> {
  const { data } = await apiClient.put<CredentialsStatus>('/credentials/', body)
  return data
}
