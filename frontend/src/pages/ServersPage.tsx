import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import { api } from '../lib/api';
import { getApiErrorMessage } from '../lib/apiError';
import { type VpnServer } from '../lib/types';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { PageHeader } from '../components/PageHeader';
import { Table, Td, Th } from '../components/Table';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { ResponsiveSwitch } from '../components/ResponsiveSwitch';

type ServerForm = Omit<VpnServer, 'id' | 'protocol' | 'createdAt'>;

type PanelInbound = {
  id: number;
  remark: string;
  protocol: string;
  port: number;
  enable: boolean;
  tag: string;
};

const empty: ServerForm = {
  name: '',
  host: '',
  port: 443,
  transport: 'WS',
  tls: true,
  security: 'NONE',
  sni: null,
  path: '/ws',
  publicKey: '',
  shortId: '',
  panelBaseUrl: null,
  panelUsername: null,
  panelInboundId: null,
  maxUsers: 0,
  isRecommended: false,
  active: true,
};

type ServerConnectForm = {
  name: string;
  panelBaseUrl: string;
  panelUsername: string;
  panelPassword: string;
  inboundId: number;
  maxUsers: number;
  active: boolean;
};

export function ServersPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<VpnServer | null>(null);
  const [panelInbounds, setPanelInbounds] = useState<PanelInbound[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const serversQ = useQuery({
    queryKey: ['servers'],
    queryFn: async () => (await api.get<VpnServer[]>('/servers')).data,
  });

  const createM = useMutation({
    mutationFn: async (payload: {
      name: string;
      panelBaseUrl: string;
      panelUsername: string;
      panelPassword: string;
      inboundId: number;
      maxUsers?: number;
      active?: boolean;
    }) => (await api.post<VpnServer>('/servers/from-panel', payload)).data,
    onSuccess: async () => {
      toast.success('Server connected');
      setCreateOpen(false);
      setPanelInbounds(null);
      await qc.invalidateQueries({ queryKey: ['servers'] });
    },
    onError: (err: any) => toast.error(getApiErrorMessage(err, 'Failed to connect server')),
  });

  const updateM = useMutation({
    mutationFn: async (payload: { id: string; data: Partial<ServerForm> }) =>
      (await api.patch<VpnServer>(`/servers/${payload.id}`, payload.data)).data,
    onSuccess: async () => {
      toast.success('Server updated');
      setEditing(null);
      setEditOpen(false);
      await qc.invalidateQueries({ queryKey: ['servers'] });
    },
    onError: (err: any) => toast.error(getApiErrorMessage(err, 'Failed to update server')),
  });

  const removeM = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/servers/${id}`)).data,
    onSuccess: async () => {
      toast.success('Server deleted');
      await qc.invalidateQueries({ queryKey: ['servers'] });
    },
    onError: (err: any) => toast.error(getApiErrorMessage(err, 'Failed to delete server')),
  });

  const panelTestM = useMutation({
    mutationFn: async (payload: { panelBaseUrl: string; panelUsername: string; panelPassword: string }) =>
      (await api.post<{ ok: boolean; inboundsCount: number }>('/servers/panel/test', payload)).data,
    onSuccess: (res) => toast.success(`Panel OK. Inbounds: ${res.inboundsCount}`),
    onError: (err: any) => toast.error(getApiErrorMessage(err, 'Panel test failed')),
  });

  const panelInboundsM = useMutation({
    mutationFn: async (payload: { panelBaseUrl: string; panelUsername: string; panelPassword: string }) =>
      (await api.post<PanelInbound[]>('/servers/panel/inbounds', payload)).data,
    onSuccess: (res) => {
      setPanelInbounds(res);
      toast.success(`Loaded ${res.length} inbounds`);
    },
    onError: (err: any) => toast.error(getApiErrorMessage(err, 'Failed to load inbounds')),
  });

  const syncM = useMutation({
    mutationFn: async (payload: { id: string; inboundId?: number }) =>
      (await api.post<VpnServer>(`/servers/${payload.id}/panel/sync`, { inboundId: payload.inboundId })).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['servers'] });
      toast.success('Synced from panel');
    },
    onError: (err: any) => toast.error(getApiErrorMessage(err, 'Sync failed')),
  });

  const rows = useMemo(() => serversQ.data ?? [], [serversQ.data]);

  const connectForm = useForm<ServerConnectForm>({
    defaultValues: {
      name: '',
      panelBaseUrl: '',
      panelUsername: '',
      panelPassword: '',
      inboundId: undefined as any,
      maxUsers: 0,
      active: true,
    },
  });

  const editForm = useForm<ServerForm>({ defaultValues: empty });

  function openCreate() {
    connectForm.reset({
      name: '',
      panelBaseUrl: '',
      panelUsername: '',
      panelPassword: '',
      inboundId: undefined as any,
      maxUsers: 0,
      active: true,
    });
    setPanelInbounds(null);
    setCreateOpen(true);
  }

  function startEdit(s: VpnServer) {
    setEditing(s);
    editForm.reset({
      name: s.name,
      host: s.host,
      port: s.port,
      transport: s.transport,
      tls: s.tls,
      security: s.security ?? (s.tls ? 'TLS' : 'NONE'),
      sni: s.sni ?? null,
      path: s.path,
      publicKey: s.publicKey,
      shortId: s.shortId,
      panelBaseUrl: s.panelBaseUrl ?? null,
      panelUsername: s.panelUsername ?? null,
      panelInboundId: s.panelInboundId ?? null,
      maxUsers: s.maxUsers,
      isRecommended: s.isRecommended ?? false,
      active: s.active,
    });
    setEditOpen(true);
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Servers"
        description="Управление VLESS/Xray серверами и лимитами пользователей."
        actions={
          <>
            <Button variant="secondary" onClick={() => serversQ.refetch()}>
              Refresh
            </Button>
            <Button onClick={openCreate}>Connect server</Button>
          </>
        }
      />

      {serversQ.isLoading ? (
        <div className="text-sm text-slate-600">Loading…</div>
      ) : (
        <ResponsiveSwitch
          mobile={
            <div className="grid gap-3">
              {rows.map((s) => (
                <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-semibold text-slate-900">{s.name}</div>
                        <Badge variant={s.active ? 'success' : 'warning'}>{s.active ? 'ACTIVE' : 'INACTIVE'}</Badge>
                        {s.isRecommended ? <Badge variant="info">Рекомендуем</Badge> : null}
                      </div>
                      <div className="mt-1 font-mono text-xs text-slate-600 break-all">
                        {s.host}:{s.port}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant="info">{s.transport}</Badge>
                        <Badge variant={s.security === 'REALITY' ? 'info' : s.tls ? 'success' : 'default'}>
                          {s.security ?? (s.tls ? 'TLS' : 'NONE')}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-1 text-sm text-slate-700">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-500">Users</span>
                      <span className="text-right">
                        total {s.usersCount ?? '—'} · active {s.activeUsersCount ?? '—'} · free {s.freeSlots ?? '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-500">Panel</span>
                      <span className="text-right text-slate-600">
                        {s.panelBaseUrl ? 'connected' : '—'} {s.panelInboundId ? `(#${s.panelInboundId})` : ''}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <Button variant="secondary" className="w-full" onClick={() => startEdit(s)}>
                      Edit
                    </Button>
                    <Button variant="danger" className="w-full" onClick={() => removeM.mutate(s.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}

              {rows.length === 0 ? <div className="text-sm text-slate-500">No servers yet</div> : null}
            </div>
          }
          desktop={
            <Table
              columns={
                <tr>
                  <Th>Name</Th>
                  <Th>Endpoint</Th>
                  <Th>Mode</Th>
                  <Th>Users</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              }
            >
              {rows.map((s) => (
                <tr key={s.id} className="border-t border-slate-100">
                  <Td className="font-medium">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span>{s.name}</span>
                      <Badge variant={s.active ? 'success' : 'warning'}>{s.active ? 'ACTIVE' : 'INACTIVE'}</Badge>
                      {s.isRecommended && <Badge variant="info">Рекомендуем</Badge>}
                    </div>
                  </Td>
                  <Td className="font-mono text-xs">
                    {s.host}:{s.port}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="info">{s.transport}</Badge>
                      <Badge variant={s.security === 'REALITY' ? 'info' : s.tls ? 'success' : 'default'}>
                        {s.security ?? (s.tls ? 'TLS' : 'NONE')}
                      </Badge>
                    </div>
                  </Td>
                  <Td>
                    <div className="text-xs text-slate-600">
                      <div>Total: {s.usersCount ?? '-'}</div>
                      <div>Active: {s.activeUsersCount ?? '-'}</div>
                      <div>Free: {s.freeSlots ?? '-'}</div>
                      <div className="mt-1 text-slate-500">
                        Panel: {s.panelBaseUrl ? 'connected' : '—'} {s.panelInboundId ? `(#${s.panelInboundId})` : ''}
                      </div>
                    </div>
                  </Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" onClick={() => startEdit(s)}>
                        Edit
                      </Button>
                      <Button variant="danger" onClick={() => removeM.mutate(s.id)}>
                        Delete
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr className="border-t border-slate-100">
                  <Td className="text-slate-500" colSpan={5}>
                    No servers yet
                  </Td>
                </tr>
              ) : null}
            </Table>
          }
        />
      )}

      <Modal
        open={createOpen}
        title="Connect new server (x-ui-pro panel)"
        onClose={() => setCreateOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={createM.isPending}
              onClick={connectForm.handleSubmit((v) => {
                createM.mutate({
                  name: v.name,
                  panelBaseUrl: v.panelBaseUrl,
                  panelUsername: v.panelUsername,
                  panelPassword: v.panelPassword,
                  inboundId: Number(v.inboundId),
                  maxUsers: Number(v.maxUsers),
                  active: Boolean(v.active),
                });
              })}
            >
              Connect
            </Button>
          </div>
        }
      >
        <form className="grid gap-3" onSubmit={(e) => e.preventDefault()}>
          <Input
            label="Name"
            placeholder="e.g. DE-FRA-1"
            {...connectForm.register('name', { required: 'Required' })}
            error={connectForm.formState.errors.name?.message}
          />
          <Input
            label="Panel base URL"
            placeholder="https://germanyvpn.mooo.com/xxxx"
            {...connectForm.register('panelBaseUrl', { required: 'Required' })}
            error={connectForm.formState.errors.panelBaseUrl?.message}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Panel username"
              {...connectForm.register('panelUsername', { required: 'Required' })}
              error={connectForm.formState.errors.panelUsername?.message}
            />
            <Input
              label="Panel password"
              type="password"
              {...connectForm.register('panelPassword', { required: 'Required' })}
              error={connectForm.formState.errors.panelPassword?.message}
            />
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={panelTestM.isPending}
              onClick={() => {
                const v = connectForm.getValues();
                if (!v.panelBaseUrl || !v.panelUsername || !v.panelPassword) return;
                panelTestM.mutate({ panelBaseUrl: v.panelBaseUrl, panelUsername: v.panelUsername, panelPassword: v.panelPassword });
              }}
            >
              Test connection
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={panelInboundsM.isPending}
              onClick={() => {
                const v = connectForm.getValues();
                if (!v.panelBaseUrl || !v.panelUsername || !v.panelPassword) return;
                panelInboundsM.mutate({ panelBaseUrl: v.panelBaseUrl, panelUsername: v.panelUsername, panelPassword: v.panelPassword });
              }}
            >
              Load inbounds
            </Button>
          </div>

          <label className="block">
            <div className="text-sm font-medium text-slate-700">Inbound</div>
            <select
              className={[
                'mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none',
                'focus:border-slate-400 focus:ring-2 focus:ring-slate-200',
                connectForm.formState.errors.inboundId ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : null,
              ]
                .filter(Boolean)
                .join(' ')}
              disabled={!panelInbounds || panelInbounds.length === 0}
              {...connectForm.register('inboundId', {
                required: 'Select inbound',
                valueAsNumber: true,
              })}
              defaultValue=""
              onChange={(e) => connectForm.setValue('inboundId', Number(e.target.value), { shouldValidate: true })}
            >
              <option value="" disabled>
                {panelInbounds ? 'Select inbound…' : 'Load inbounds first…'}
              </option>
              {(panelInbounds ?? []).map((i) => (
                <option key={i.id} value={i.id}>
                  #{i.id} • {i.protocol} • {i.port} • {i.enable ? 'enabled' : 'disabled'} • {i.remark || i.tag}
                </option>
              ))}
            </select>
            {connectForm.formState.errors.inboundId ? (
              <div className="mt-1 text-xs text-red-600">{connectForm.formState.errors.inboundId.message as any}</div>
            ) : null}
          </label>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Max users (0 = unlimited)"
              type="number"
              {...connectForm.register('maxUsers', { valueAsNumber: true })}
            />
            <label className="flex items-end gap-2 pb-1 text-sm text-slate-700">
              <input type="checkbox" {...connectForm.register('active')} defaultChecked />
              Active
            </label>
          </div>
        </form>
      </Modal>

      <Modal
        open={editOpen}
        title="Edit server"
        onClose={() => {
          setEditOpen(false);
          setEditing(null);
        }}
        footer={
          <div className="flex justify-between gap-2">
            <div>
              {editing ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={syncM.isPending}
                  onClick={() => syncM.mutate({ id: editing.id, inboundId: editForm.getValues().panelInboundId ?? undefined })}
                >
                  Sync from panel
                </Button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                type="button"
                onClick={() => {
                  setEditOpen(false);
                  setEditing(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={updateM.isPending || !editing}
                onClick={editForm.handleSubmit((v) => {
                  if (!editing) return;
                  // Отправляем на backend только те поля, которые он ожидает в UpdateServerDto,
                  // чтобы не ловить 400 из-за лишних свойств (security/panel*).
                  updateM.mutate({
                    id: editing.id,
                    data: {
                      name: v.name,
                      host: v.host,
                      port: Number(v.port),
                      transport: v.transport,
                      tls: Boolean(v.tls),
                      security: v.security,
                      path: v.path ?? undefined,
                      sni: v.sni ?? undefined,
                      publicKey: v.publicKey,
                      shortId: v.shortId,
                      maxUsers: Number(v.maxUsers ?? 0),
                      isRecommended: Boolean(v.isRecommended),
                      active: Boolean(v.active),
                    },
                  });
                })}
              >
                Save
              </Button>
            </div>
          </div>
        }
      >
        <form className="grid gap-3" onSubmit={(e) => e.preventDefault()}>
          <Input label="Name" {...editForm.register('name', { required: 'Required' })} error={editForm.formState.errors.name?.message} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Host" {...editForm.register('host', { required: 'Required' })} error={editForm.formState.errors.host?.message} />
            <Input label="Port" type="number" {...editForm.register('port', { valueAsNumber: true, required: 'Required' })} error={editForm.formState.errors.port?.message as any} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <div className="text-sm font-medium text-slate-700">Transport</div>
              <select
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                {...editForm.register('transport')}
              >
                <option value="WS">WS</option>
                <option value="TCP">TCP</option>
              </select>
            </label>

            <label className="block">
              <div className="text-sm font-medium text-slate-700">Security</div>
              <select
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                {...editForm.register('security')}
              >
                <option value="NONE">NONE</option>
                <option value="TLS">TLS</option>
                <option value="REALITY">REALITY</option>
              </select>
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" {...editForm.register('tls')} />
            TLS (legacy, для обратной совместимости)
          </label>

          <Input label="Path (optional)" {...editForm.register('path')} placeholder="/ws" />
          <Input label="SNI (optional, для TLS/REALITY)" {...editForm.register('sni')} placeholder="sub.example.com" />
          <Input label="Public key" {...editForm.register('publicKey', { required: 'Required' })} error={editForm.formState.errors.publicKey?.message} />
          <Input label="Short ID" {...editForm.register('shortId', { required: 'Required' })} error={editForm.formState.errors.shortId?.message} />

          <div className="grid grid-cols-2 gap-3">
            <Input label="Max users (0 = unlimited)" type="number" {...editForm.register('maxUsers', { valueAsNumber: true })} />
            <label className="flex items-end gap-2 pb-1 text-sm text-slate-700">
              <input type="checkbox" {...editForm.register('active')} />
              Active
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" {...editForm.register('isRecommended')} />
            Рекомендуем (в Mini App; иначе — локация с большим свободным местом)
          </label>
        </form>
      </Modal>
    </div>
  );
}

