import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../lib/api';
import { getApiErrorMessage } from '../lib/apiError';
import { type Payment, type Subscription, type VpnUser, type VpnServer, type UserServer } from '../lib/types';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';

type UserDetails = VpnUser & {
  subscriptions: Subscription[];
  payments: Payment[];
  userServers?: UserServer[];
};

export function UserDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [addServerOpen, setAddServerOpen] = useState(false);
  const [selectedServerId, setSelectedServerId] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);

  const userQ = useQuery({
    queryKey: ['user', id],
    queryFn: async () => (await api.get<UserDetails>(`/users/${id}`)).data,
    enabled: Boolean(id),
  });

  const serversQ = useQuery({
    queryKey: ['servers'],
    queryFn: async () => (await api.get<VpnServer[]>('/servers')).data,
  });

  const u = userQ.data;

  const configQ = useQuery({
    queryKey: ['user-config', id],
    queryFn: async () => (await api.get<{ configs: Array<{ url: string; serverName: string }> }>(`/users/${id}/config`)).data,
    enabled: Boolean(id),
  });

  const addServerM = useMutation({
    mutationFn: async (serverId: string) => (await api.post(`/users/${id}/servers`, { serverId })).data,
    onSuccess: async () => {
      toast.success('Server added');
      setAddServerOpen(false);
      setSelectedServerId('');
      await qc.invalidateQueries({ queryKey: ['user', id] });
      await qc.invalidateQueries({ queryKey: ['user-config', id] });
    },
    onError: (err: any) => toast.error(getApiErrorMessage(err, 'Failed to add server')),
  });

  const removeServerM = useMutation({
    mutationFn: async (serverId: string) => (await api.delete(`/users/${id}/servers/${serverId}`)).data,
    onSuccess: async () => {
      toast.success('Server removed');
      await qc.invalidateQueries({ queryKey: ['user', id] });
      await qc.invalidateQueries({ queryKey: ['user-config', id] });
    },
    onError: (err: any) => toast.error(getApiErrorMessage(err, 'Failed to remove server')),
  });

  const activateServerM = useMutation({
    mutationFn: async (serverId: string) => (await api.post(`/users/${id}/servers/${serverId}/activate`)).data,
    onSuccess: async () => {
      toast.success('Server activated');
      await qc.invalidateQueries({ queryKey: ['user', id] });
      await qc.invalidateQueries({ queryKey: ['user-config', id] });
      await qc.invalidateQueries({ queryKey: ['user-traffic', id] });
    },
    onError: (err: any) => toast.error(getApiErrorMessage(err, 'Failed to activate server')),
  });

  // Traffic отключён

  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }

  const activeServers = useMemo(() => {
    if (!u?.userServers) return [];
    return u.userServers.filter((us) => us.active).map((us) => us.server);
  }, [u?.userServers]);

  const availableServers = useMemo(() => {
    if (!serversQ.data) return [];
    const activeServerIds = new Set(activeServers.map((s) => s.id));
    return serversQ.data.filter((s) => s.active && !activeServerIds.has(s.id));
  }, [serversQ.data, activeServers]);

  return (
    <div className="grid gap-4">
      <Card title="User details">
        {userQ.isLoading ? (
          <div className="text-sm text-slate-600">Loading…</div>
        ) : !u ? (
          <div className="text-sm text-slate-600">Not found</div>
        ) : (
          <div className="grid gap-2 text-sm text-slate-800">
            <div>
              <span className="text-slate-500">Name:</span> {u.name}
            </div>
            <div>
              <span className="text-slate-500">UUID:</span> <span className="font-mono">{u.uuid}</span>
            </div>
            <div>
              <span className="text-slate-500">Status:</span> {u.status}
            </div>
            <div>
              <span className="text-slate-500">Expires:</span>{' '}
              {u.expiresAt ? new Date(u.expiresAt).toLocaleString() : '-'}
            </div>
            <div>
              <span className="text-slate-500">Servers:</span>{' '}
              {u.userServers && u.userServers.length > 0
                ? u.userServers
                    .filter((us) => us.active)
                    .map((us) => us.server.name)
                    .join(', ')
                : u.server?.name ?? u.serverId ?? '-'}
            </div>
            <div>
              <span className="text-slate-500">TG ID:</span> {u.telegramId ?? '-'}
            </div>
          </div>
        )}
      </Card>

      {/* Traffic statistics отключены */}

      <Card
        title="VPN configs"
        right={
          <Button variant="secondary" onClick={() => setAddServerOpen(true)}>
            Add server
          </Button>
        }
      >
        {configQ.isLoading ? (
          <div className="text-sm text-slate-600">Loading…</div>
        ) : configQ.data?.configs && configQ.data.configs.length > 0 ? (
          <div className="space-y-3">
            {configQ.data.configs.map((cfg, idx) => {
              const userServer = u?.userServers?.find((us) => us.server.name === cfg.serverName || us.server.host === cfg.serverName);
              return (
                <div key={idx} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium text-slate-900">{cfg.serverName}</div>
                      {userServer?.isActive && (
                        <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Active</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => setQrCodeUrl(cfg.url)}
                      >
                        Show QR
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(cfg.url);
                            toast.success(`Copied ${cfg.serverName}`);
                          } catch {
                            toast.error('Copy failed');
                          }
                        }}
                      >
                        Copy
                      </Button>
                    </div>
                  </div>
                  <div className="break-all font-mono text-xs text-slate-800">{cfg.url}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-sm text-slate-600">No configs</div>
        )}
      </Card>

      {u?.userServers && u.userServers.filter((us) => us.active).length > 0 && (
        <Card title="Available locations">
          <div className="space-y-2">
            {u.userServers
              .filter((us) => us.active)
              .map((us) => (
                <div
                  key={us.id}
                  className={`flex items-center justify-between rounded-lg border p-3 ${
                    us.isActive ? 'border-green-300 bg-green-50' : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium text-slate-900">{us.server.name}</div>
                    {us.isActive && (
                      <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Active</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {!us.isActive && (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={activateServerM.isPending}
                        onClick={() => {
                          if (confirm(`Activate location ${us.server.name}? The current active location will be deactivated.`)) {
                            activateServerM.mutate(us.serverId);
                          }
                        }}
                      >
                        Activate
                      </Button>
                    )}
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={removeServerM.isPending}
                      onClick={() => {
                        if (confirm(`Remove location ${us.server.name}?`)) {
                          removeServerM.mutate(us.serverId);
                        }
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        </Card>
      )}

      <Modal
        open={addServerOpen}
        title="Add server"
        onClose={() => {
          setAddServerOpen(false);
          setSelectedServerId('');
        }}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setAddServerOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={addServerM.isPending || !selectedServerId}
              onClick={() => selectedServerId && addServerM.mutate(selectedServerId)}
            >
              Add
            </Button>
          </div>
        }
      >
        <label className="block">
          <div className="text-sm font-medium text-slate-700">Server</div>
          <select
            className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            value={selectedServerId}
            onChange={(e) => setSelectedServerId(e.target.value)}
          >
            <option value="" disabled>
              Select server…
            </option>
            {availableServers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.host}:{s.port})
              </option>
            ))}
          </select>
          {availableServers.length === 0 && (
            <div className="mt-2 text-xs text-slate-500">All available servers are already added</div>
          )}
        </label>
      </Modal>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Subscriptions">
          {!u ? null : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th className="py-2">Starts</th>
                    <th className="py-2">Ends</th>
                    <th className="py-2">Days</th>
                    <th className="py-2">Active</th>
                  </tr>
                </thead>
                <tbody className="text-slate-800">
                  {u.subscriptions.map((s) => (
                    <tr key={s.id} className="border-t border-slate-100">
                      <td className="py-2">{new Date(s.startsAt).toLocaleString()}</td>
                      <td className="py-2">{new Date(s.endsAt).toLocaleString()}</td>
                      <td className="py-2">{s.periodDays}</td>
                      <td className="py-2">{s.active ? 'yes' : 'no'}</td>
                    </tr>
                  ))}
                  {u.subscriptions.length === 0 ? (
                    <tr>
                      <td className="py-3 text-slate-500" colSpan={4}>
                        No subscriptions
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Payments">
          {!u ? null : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th className="py-2">Created</th>
                    <th className="py-2">Amount</th>
                    <th className="py-2">Currency</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="text-slate-800">
                  {u.payments.map((p) => (
                    <tr key={p.id} className="border-t border-slate-100">
                      <td className="py-2">{new Date(p.createdAt).toLocaleString()}</td>
                      <td className="py-2">{p.amount}</td>
                      <td className="py-2">{p.currency}</td>
                      <td className="py-2">{p.status}</td>
                    </tr>
                  ))}
                  {u.payments.length === 0 ? (
                    <tr>
                      <td className="py-3 text-slate-500" colSpan={4}>
                        No payments
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Modal
        open={qrCodeUrl !== null}
        title="QR Code"
        onClose={() => setQrCodeUrl(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setQrCodeUrl(null)}>
              Close
            </Button>
            {qrCodeUrl && (
              <Button
                variant="secondary"
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(qrCodeUrl);
                    toast.success('Config copied to clipboard');
                  } catch {
                    toast.error('Copy failed');
                  }
                }}
              >
                Copy config
              </Button>
            )}
          </div>
        }
      >
        {qrCodeUrl && (
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-lg border-2 border-slate-200 bg-white p-4">
              <QRCodeSVG value={qrCodeUrl} size={256} level="M" />
            </div>
            <div className="text-center">
              <div className="text-sm font-medium text-slate-700">Scan to add VPN config</div>
              <div className="mt-1 break-all font-mono text-xs text-slate-500">{qrCodeUrl}</div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

