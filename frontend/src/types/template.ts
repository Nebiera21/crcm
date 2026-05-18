export type TemplateCategory = 'vlan' | 'interface' | 'acl' | 'ntp' | 'snmp' | 'custom'

export interface VariableDefinition {
  name: string
  type: 'string' | 'number' | 'boolean' | 'list'
  required: boolean
  default: string | null
  description: string | null
}

export interface Template {
  id: string
  name: string
  category: TemplateCategory
  description: string | null
  content: string
  variables: VariableDefinition[]
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface TemplateCreate {
  name: string
  category: TemplateCategory
  description?: string | null
  content: string
  variables: VariableDefinition[]
}

export interface TemplateUpdate {
  name?: string
  category?: TemplateCategory
  description?: string | null
  content?: string
  variables?: VariableDefinition[]
}

export interface TemplateListResponse {
  items: Template[]
  total: number
}

export interface PreviewRequest {
  content: string
  variable_values: Record<string, string>
}

export interface TemplatePreviewRequest {
  variable_values: Record<string, string>
}

export interface PreviewResponse {
  rendered: string
  errors: string[]
  variables_found: string[]
}
