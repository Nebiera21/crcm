import apiClient from '@/lib/apiClient'
import type {
  CommandPreset,
  CommandPresetList,
  CommandRunResponse,
  TaskStatus,
  TestConnectionResult,
} from '@/types/monitor'

export async function testConnection(routerId: string): Promise<TestConnectionResult> {
  const { data } = await apiClient.post<TestConnectionResult>(
    `/inventory/routers/${routerId}/test-connection`,
  )
  return data
}

export async function runCommands(routerId: string, commands: string[]): Promise<CommandRunResponse> {
  const { data } = await apiClient.post<CommandRunResponse>('/monitor/commands', {
    router_id: routerId,
    commands,
  })
  return data
}

export async function runCommandsBulk(routerIds: string[], commands: string[]): Promise<TaskStatus> {
  const { data } = await apiClient.post<TaskStatus>('/monitor/commands/bulk', {
    router_ids: routerIds,
    commands,
  })
  return data
}

export async function snmpPollBulk(routerIds: string[]): Promise<TaskStatus> {
  const { data } = await apiClient.post<TaskStatus>('/monitor/snmp/bulk', {
    router_ids: routerIds,
  })
  return data
}

export async function getTaskStatus(jobId: string): Promise<TaskStatus> {
  const { data } = await apiClient.get<TaskStatus>(`/tasks/${jobId}`)
  return data
}

export async function listPresets(): Promise<CommandPresetList> {
  const { data } = await apiClient.get<CommandPresetList>('/monitor/presets')
  return data
}

export async function createPreset(command: string): Promise<CommandPreset> {
  const { data } = await apiClient.post<CommandPreset>('/monitor/presets', { command })
  return data
}

export async function deletePreset(id: string): Promise<void> {
  await apiClient.delete(`/monitor/presets/${id}`)
}
