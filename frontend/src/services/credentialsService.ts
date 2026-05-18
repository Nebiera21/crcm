import apiClient from '@/lib/apiClient'
import type {
  CredentialsStatus,
  CredentialsUpdate,
  SshCredentialCreate,
  SshCredentialItem,
  SshCredentialList,
  SshCredentialUpdate,
} from '@/types/credentials'

export async function getGlobalCredentials(): Promise<CredentialsStatus> {
  const { data } = await apiClient.get<CredentialsStatus>('/credentials/')
  return data
}

export async function updateGlobalCredentials(body: CredentialsUpdate): Promise<CredentialsStatus> {
  const { data } = await apiClient.put<CredentialsStatus>('/credentials/', body)
  return data
}

export async function listSshCredentials(): Promise<SshCredentialList> {
  const { data } = await apiClient.get<SshCredentialList>('/credentials/ssh')
  return data
}

export async function createSshCredential(body: SshCredentialCreate): Promise<SshCredentialItem> {
  const { data } = await apiClient.post<SshCredentialItem>('/credentials/ssh', body)
  return data
}

export async function updateSshCredential(id: string, body: SshCredentialUpdate): Promise<SshCredentialItem> {
  const { data } = await apiClient.put<SshCredentialItem>(`/credentials/ssh/${id}`, body)
  return data
}

export async function deleteSshCredential(id: string): Promise<void> {
  await apiClient.delete(`/credentials/ssh/${id}`)
}
