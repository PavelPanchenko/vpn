import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import { api } from '../lib/api';
import { type VpnServer, type VpnUser, type VpnUserStatus } from '../lib/types';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { Table, Td, Th } from '../components/Table';
import { Badge, statusBadgeVariant } from '../components/Badge';

type CreateUserPayload = {
  serverId: string;
  name: string;
  telegramId?: string;
  trialDays?: number;
};

type CreateUserForm = {
  serverId: string;
  name: string;
  telegramId?: string;
  trialDays: number;
};

export function UsersPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<VpnUser | null>(null);
  const [editTarget, setEditTarget] = useState<VpnUser | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | VpnUserStatus>('ALL');
  const [serverFilter, setServerFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');

  const serversQ = useQuery({
    queryKey: ['servers'],
    queryFn: async () => (await api.get<VpnServer[]>('/servers')).data,
  });

  const usersQ = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get<VpnUser[]>('/users')).data,
  });

  const createM = useMutation({
    mutationFn: async (payload: CreateUserPayload) => (await api.post<VpnUser>('/users', payload)).data,
    onSuccess: async () => {
      toast.success('User created');
      setCreateOpen(false);
      await qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Failed to create user'),
  });

  const updateM = useMutation({
    mutationFn: async (payload: { id: string; status: VpnUserStatus }) =>
      (await api.patch<VpnUser>(`/users/${payload.id}`, { status: payload.status })).data,
    onSuccess: async () => {
      toast.success('User updated');
      await qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Failed to update user'),
  });

  const editM = useMutation({
    mutationFn: async (payload: { id: string; data: { name?: string; telegramId?: string; trialDays?: number; serverId?: string } }) =>
      (await api.patch<VpnUser>(`/users/${payload.id}`, payload.data)).data,
    onSuccess: async () => {
      toast.success('User updated');
      setEditTarget(null);
      await qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Failed to update user'),
  });

  const deleteM = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/users/${id}`)).data,
    onSuccess: async () => {
      toast.success('User deleted');
      setDeleteTarget(null);
      await qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Failed to delete user'),
  });

  const servers = useMemo(() => serversQ.data ?? [], [serversQ.data]);
  const users = useMemo(() => usersQ.data ?? [], [usersQ.data]);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((u) => {
      if (statusFilter !== 'ALL' && u.status !== statusFilter) return false;
      if (serverFilter !== 'ALL') {
        if (serverFilter === 'NO_SERVER') {
          // Фильтр "Без сервера" - показываем только пользователей без serverId
          if (u.serverId !== null) return false;
        } else {
          // Фильтр по конкретному серверу
          if (u.serverId !== serverFilter) return false;
        }
      }
      if (!term) return true;
      const name = u.name?.toLowerCase() ?? '';
      const tg = u.telegramId?.toLowerCase() ?? '';
      return name.includes(term) || tg.includes(term);
    });
  }, [users, statusFilter, serverFilter, search]);

  const createForm = useForm<CreateUserForm>({
    defaultValues: { serverId: '', name: '', telegramId: '', trialDays: 3 },
  });

  type EditUserForm = {
    serverId: string;
    name: string;
    telegramId: string;
    trialDays?: number;
  };
  const editForm = useForm<EditUserForm>({
    defaultValues: { serverId: '', name: '', telegramId: '', trialDays: undefined },
  });

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Users"
        description="Пользователи VLESS (позже будут маппиться на Telegram)."
        actions={
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="flex flex-wrap gap-2">
              <select
                className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'ALL' | VpnUserStatus)}
              >
                <option value="ALL">All statuses</option>
                <option value="NEW">NEW</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="BLOCKED">BLOCKED</option>
                <option value="EXPIRED">EXPIRED</option>
              </select>
              <select
                className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                value={serverFilter}
                onChange={(e) => setServerFilter(e.target.value)}
              >
                <option value="ALL">All servers</option>
                <option value="NO_SERVER">Без сервера</option>
                {servers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <Input
                label=""
                placeholder="Search by name / TG"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => usersQ.refetch()}>
                Refresh
              </Button>
              <Button
                onClick={() => {
                  createForm.reset({ serverId: '', name: '', telegramId: '' });
                  setCreateOpen(true);
                }}
              >
                Add user
              </Button>
            </div>
          </div>
        }
      />

      {usersQ.isLoading ? (
        <div className="text-sm text-slate-600">Loading…</div>
      ) : (
        <Table
          columns={
            <tr>
              <Th>Name</Th>
              <Th>UUID</Th>
              <Th>TG ID</Th>
              <Th>Server</Th>
              <Th>Status</Th>
              <Th>Expires</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          }
        >
          {filteredUsers.map((u) => (
            <tr key={u.id} className="border-t border-slate-100">
              <Td className="font-medium">{u.name}</Td>
              <Td className="font-mono text-xs">
                <Link className="text-slate-900 underline" to={`/users/${u.id}`}>
                  {u.uuid}
                </Link>
              </Td>
              <Td className="font-mono text-xs">{u.telegramId ?? '-'}</Td>
              <Td>{u.server?.name ?? u.serverId}</Td>
              <Td>
                <select
                  className="mt-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                  value={u.status}
                  onChange={(e) =>
                    updateM.mutate({
                      id: u.id,
                      status: e.target.value as VpnUserStatus,
                    })
                  }
                >
                  <option value="NEW">NEW</option>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="BLOCKED">BLOCKED</option>
                  <option value="EXPIRED">EXPIRED</option>
                </select>
              </Td>
              <Td>{u.expiresAt ? new Date(u.expiresAt).toLocaleString() : '-'}</Td>
              <Td className="text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setEditTarget(u);
                      // default trialDays empty = keep current
                      editForm.reset({
                        serverId: u.serverId ?? undefined,
                        name: u.name,
                        telegramId: u.telegramId ?? '',
                        trialDays: undefined,
                      });
                    }}
                  >
                    Edit
                  </Button>
                  <Button variant="danger" onClick={() => setDeleteTarget(u)}>
                    Delete
                  </Button>
                </div>
              </Td>
            </tr>
          ))}
          {filteredUsers.length === 0 ? (
            <tr className="border-t border-slate-100">
              <Td className="text-slate-500" colSpan={7}>
                No users yet
              </Td>
            </tr>
          ) : null}
        </Table>
      )}

      <Modal
        open={createOpen}
        title="Add user"
        onClose={() => setCreateOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={createM.isPending}
              onClick={createForm.handleSubmit((v) => {
                createM.mutate({
                  serverId: v.serverId,
                  name: v.name.trim(),
                  telegramId: v.telegramId?.trim() || undefined,
                  trialDays: v.trialDays ? Number(v.trialDays) : undefined,
                });
              })}
            >
              Create
            </Button>
          </div>
        }
      >
        <form className="grid gap-3" onSubmit={(e) => e.preventDefault()}>
          <Input
            label="Name"
            placeholder="e.g. Pavel"
            {...createForm.register('name', { required: 'Enter name', minLength: { value: 2, message: 'Too short' } })}
            error={createForm.formState.errors.name?.message}
          />

          <label className="block">
            <div className="text-sm font-medium text-slate-700">Server</div>
            <select
              className={[
                'mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none',
                'focus:border-slate-400 focus:ring-2 focus:ring-slate-200',
                createForm.formState.errors.serverId ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : null,
              ]
                .filter(Boolean)
                .join(' ')}
              {...createForm.register('serverId', { required: 'Select server' })}
              defaultValue=""
            >
              <option value="" disabled>
                Select server…
              </option>
              {servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.host}:{s.port})
                </option>
              ))}
            </select>
            {createForm.formState.errors.serverId ? (
              <div className="mt-1 text-xs text-red-600">{createForm.formState.errors.serverId.message}</div>
            ) : null}
          </label>

          <Input label="TG ID" placeholder="e.g. 123456789" {...createForm.register('telegramId')} />
          <Input
            label="Trial days"
            type="number"
            {...createForm.register('trialDays', { valueAsNumber: true, min: 1, max: 365 })}
            hint="По умолчанию 3. При создании выставит expiresAt и в панели."
          />
          <div className="text-xs text-slate-500">UUID генерируется автоматически на backend.</div>
        </form>
      </Modal>

      <Modal
        open={Boolean(editTarget)}
        title="Edit user"
        onClose={() => setEditTarget(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={editM.isPending || !editTarget}
              onClick={editForm.handleSubmit((v) => {
                if (!editTarget) return;
                const trialDays = v.trialDays && Number.isFinite(v.trialDays) ? Number(v.trialDays) : undefined;
                editM.mutate({
                  id: editTarget.id,
                  data: {
                    serverId: v.serverId !== editTarget.serverId ? v.serverId : undefined,
                    name: v.name.trim(),
                    telegramId: v.telegramId.trim() || undefined,
                    trialDays,
                  },
                });
              })}
            >
              Save
            </Button>
          </div>
        }
      >
        <form className="grid gap-3" onSubmit={(e) => e.preventDefault()}>
          <label className="block">
            <div className="text-sm font-medium text-slate-700">Server</div>
            <select
              className={[
                'mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none',
                'focus:border-slate-400 focus:ring-2 focus:ring-slate-200',
                editForm.formState.errors.serverId ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : null,
              ]
                .filter(Boolean)
                .join(' ')}
              {...editForm.register('serverId', { required: 'Select server' })}
            >
              <option value="" disabled>
                Select server…
              </option>
              {servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.host}:{s.port})
                </option>
              ))}
            </select>
            {editForm.formState.errors.serverId ? (
              <div className="mt-1 text-xs text-red-600">{editForm.formState.errors.serverId.message}</div>
            ) : null}
          </label>
          <Input
            label="Name"
            {...editForm.register('name', { required: 'Enter name', minLength: { value: 2, message: 'Too short' } })}
            error={editForm.formState.errors.name?.message}
          />
          <Input label="TG ID" {...editForm.register('telegramId')} />
          <Input
            label="Trial days (set from now)"
            type="number"
            {...editForm.register('trialDays', { valueAsNumber: true, min: 1, max: 365 })}
            hint="Оставь пустым — срок не меняем. Если указать — создадим новую активную подписку и обновим expiry в панели."
          />
        </form>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        title="Delete user"
        onClose={() => setDeleteTarget(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              type="button"
              disabled={deleteM.isPending || !deleteTarget}
              onClick={() => deleteTarget && deleteM.mutate(deleteTarget.id)}
            >
              Delete
            </Button>
          </div>
        }
      >
        <div className="text-sm text-slate-700">
          Удалить пользователя <span className="font-semibold">{deleteTarget?.name}</span>? Это также удалит клиента в панели
          сервера (если он уже был создан).
        </div>
      </Modal>
    </div>
  );
}

