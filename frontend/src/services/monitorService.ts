import apiClient from '@/lib/apiClient'
import type { CommandRunResponse, TaskStatus, TestConnectionResult } from '@/types/monitor'

export const SHOW_COMMANDS = [
  'show version',
  'show interfaces',
  'show ip interface brief',
  'show ip route',
  'show running-config',
  'show logging',
  'show processes cpu',
  'show processes memory',
  'show cdp neighbors',
  'show arp',
] as const

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

export async function getTaskStatus(jobId: string): Promise<TaskStatus> {
  const { data } = await apiClient.get<TaskStatus>(`/tasks/${jobId}`)
  return data
}
