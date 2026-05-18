import axios from 'axios'
import apiClient from '@/lib/apiClient'
import type { TokenResponse, UserMe } from '@/types/auth'

export async function login(username: string, password: string): Promise<TokenResponse> {
  const params = new URLSearchParams()
  params.append('username', username)
  params.append('password', password)

  const { data } = await axios.post<TokenResponse>('/api/v1/auth/token', params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  return data
}

export async function getMe(): Promise<UserMe> {
  const { data } = await apiClient.get<UserMe>('/users/me')
  return data
}
