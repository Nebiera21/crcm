export type Role = 'admin' | 'operator' | 'readonly'

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface UserMe {
  id: string
  username: string
  email: string
  role: Role
  is_active: boolean
  created_at: string
}
