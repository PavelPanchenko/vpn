import { api } from './api';
import type { MiniConfigResponse, MiniPayResponse, MiniPlan, MiniServer, MiniStatus } from './miniTypes';

export async function fetchMiniStatus(initData: string): Promise<MiniStatus> {
  const res = await api.post<MiniStatus>('/mini/status', { initData });
  return res.data;
}

export async function fetchMiniServers(initData: string): Promise<MiniServer[]> {
  const res = await api.post<MiniServer[]>('/mini/servers', { initData });
  return res.data ?? [];
}

export async function fetchMiniPlans(initData: string): Promise<MiniPlan[]> {
  const res = await api.post<MiniPlan[]>('/mini/plans', { initData });
  return res.data ?? [];
}

export async function fetchMiniConfig(initData: string): Promise<MiniConfigResponse> {
  const res = await api.post<MiniConfigResponse>('/mini/config', { initData });
  return res.data;
}

export async function activateMiniServer(initData: string, serverId: string): Promise<MiniStatus> {
  const res = await api.post<MiniStatus>('/mini/activate', { initData, serverId });
  return res.data;
}

export async function payMiniPlan(initData: string, planId: string): Promise<MiniPayResponse> {
  const res = await api.post<MiniPayResponse>('/mini/pay', { initData, planId });
  return res.data;
}

