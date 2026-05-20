export type SnmpVersion = 'v1' | 'v2c' | 'v3'
export type SnmpAuthProtocol = 'MD5' | 'SHA' | 'SHA224' | 'SHA256' | 'SHA384' | 'SHA512'
export type SnmpPrivProtocol = 'DES' | 'AES' | 'AES128' | 'AES192' | 'AES256'
export type SnmpSecurityLevel = 'noAuthNoPriv' | 'authNoPriv' | 'authPriv'

export interface Router {
  id: string
  hostname: string
  ip_address: string
  location: string | null
  model: string | null
  is_active: boolean
  snmp_community: string | null
  snmp_version: SnmpVersion
  snmp_v3_username: string | null
  snmp_v3_auth_protocol: SnmpAuthProtocol | null
  snmp_v3_priv_protocol: SnmpPrivProtocol | null
  snmp_v3_security_level: SnmpSecurityLevel | null
  notes: string | null
  credential_id: string | null
  wan_ip_address: string | null
  wan_ssh_port: number | null
  use_wan_ip: boolean
  wan_interface: string | null
  created_at: string
  updated_at: string
}

export interface RouterCreate {
  hostname: string
  ip_address: string
  location?: string | null
  model?: string | null
  is_active?: boolean
  snmp_community?: string | null
  snmp_version?: SnmpVersion
  snmp_v3_username?: string | null
  snmp_v3_auth_protocol?: SnmpAuthProtocol | null
  snmp_v3_auth_password?: string | null
  snmp_v3_priv_protocol?: SnmpPrivProtocol | null
  snmp_v3_priv_password?: string | null
  snmp_v3_security_level?: SnmpSecurityLevel | null
  notes?: string | null
  credential_id?: string | null
  wan_ip_address?: string | null
  wan_ssh_port?: number | null
  use_wan_ip?: boolean
  wan_interface?: string | null
}

export type RouterUpdate = Partial<RouterCreate>

export interface RouterListResponse {
  items: Router[]
  total: number
}

export interface RouterStats {
  total: number
  active: number
}

export interface ImportResult {
  created: number
  skipped_duplicate: number
  errors: string[]
}
