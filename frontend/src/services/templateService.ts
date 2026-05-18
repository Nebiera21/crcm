import apiClient from '@/lib/apiClient'
import type {
  PreviewRequest,
  PreviewResponse,
  Template,
  TemplateCreate,
  TemplateListResponse,
  TemplatePreviewRequest,
  TemplateUpdate,
} from '@/types/template'

export async function listTemplates(params?: {
  search?: string
  category?: string
  skip?: number
  limit?: number
}): Promise<TemplateListResponse> {
  const { data } = await apiClient.get<TemplateListResponse>('/templates/', { params })
  return data
}

export async function getTemplate(id: string): Promise<Template> {
  const { data } = await apiClient.get<Template>(`/templates/${id}`)
  return data
}

export async function createTemplate(body: TemplateCreate): Promise<Template> {
  const { data } = await apiClient.post<Template>('/templates/', body)
  return data
}

export async function updateTemplate(id: string, body: TemplateUpdate): Promise<Template> {
  const { data } = await apiClient.put<Template>(`/templates/${id}`, body)
  return data
}

export async function deleteTemplate(id: string): Promise<void> {
  await apiClient.delete(`/templates/${id}`)
}

export async function previewAdhoc(body: PreviewRequest): Promise<PreviewResponse> {
  const { data } = await apiClient.post<PreviewResponse>('/templates/preview', body)
  return data
}

export async function previewTemplate(id: string, body: TemplatePreviewRequest): Promise<PreviewResponse> {
  const { data } = await apiClient.post<PreviewResponse>(`/templates/${id}/preview`, body)
  return data
}
