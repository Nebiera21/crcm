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

export interface SshCredentialItem {
  id: string
  name: string
  username: string
  has_enable_password: boolean
  router_count: number
  created_at: string
  updated_at: string
}

export interface SshCredentialList {
  items: SshCredentialItem[]
  total: number
}

export interface SshCredentialCreate {
  name: string
  username: string
  password: string
  enable_password?: string
}

export interface SshCredentialUpdate {
  name?: string
  username?: string
  password?: string
  enable_password?: string
}
