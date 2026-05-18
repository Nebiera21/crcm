export interface CredentialsStatus {
  is_configured: boolean
  username: string | null
  has_enable_password: boolean
  updated_at: string | null
}

export interface CredentialsUpdate {
  username: string
  password: string
  enable_password?: string
}
