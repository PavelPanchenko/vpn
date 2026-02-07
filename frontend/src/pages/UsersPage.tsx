import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import { api } from '../lib/api';
import { getApiErrorMessage } from '../lib/apiError';
import { type Subscription, type VpnServer, type VpnUser, type VpnUserStatus } from '../lib/types';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { Table, Td, Th } from '../components/Table';
import { Badge, statusBadgeVariant } from '../components/Badge';
import { ResponsiveSwitch } from '../components/ResponsiveSwitch';

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

type UserDetails = VpnUser & {
  subscriptions: Subscription[];
};

export function UsersPage() {
  const qc = useQueryClient();
  const PAGE_SIZE = 50;
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

  const onlineIdsQ = useQuery({
    queryKey: ['users-online'],
    queryFn: async () => (await api.get<string[]>('/users/online')).data,
    refetchInterval: 30_000,
  });
  const onlineSet = useMemo(
    () => new Set(Array.isArray(onlineIdsQ.data) ? onlineIdsQ.data : []),
    [onlineIdsQ.data],
  );

  const qStr = useMemo(() => search.trim(), [search]);
  const usersQ = useInfiniteQuery({
    queryKey: ['users', { statusFilter, serverFilter, q: qStr }],
    queryFn: async ({ pageParam }) =>
      (await api.get<VpnUser[]>('/users', {
        params: {
          offset: Number(pageParam ?? 0),
          limit: PAGE_SIZE,
          q: qStr || undefined,
          status: statusFilter !== 'ALL' ? statusFilter : undefined,
          serverId: serverFilter !== 'ALL' ? serverFilter : undefined,
        },
      })).data,
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => (lastPage.length >= PAGE_SIZE ? allPages.length * PAGE_SIZE : undefined),
  });

  const createM = useMutation({
    mutationFn: async (payload: CreateUserPayload) => (await api.post<VpnUser>('/users', payload)).data,
    onSuccess: async () => {
      toast.success('User created');
      setCreateOpen(false);
      await qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) => toast.error(getApiErrorMessage(err, 'Failed to create user')),
  });

  const updateM = useMutation({
    mutationFn: async (payload: { id: string; status: VpnUserStatus }) =>
      (await api.patch<VpnUser>(`/users/${payload.id}`, { status: payload.status })).data,
    onSuccess: async () => {
      toast.success('User updated');
      await qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) => toast.error(getApiErrorMessage(err, 'Failed to update user')),
  });

  const editM = useMutation({
    mutationFn: async (payload: { id: string; data: { name?: string; telegramId?: string; trialDays?: number; serverId?: string } }) =>
      (await api.patch<VpnUser>(`/users/${payload.id}`, payload.data)).data,
    onSuccess: async () => {
      toast.success('User updated');
      setEditTarget(null);
      await qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) => toast.error(getApiErrorMessage(err, 'Failed to update user')),
  });

  const deleteM = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/users/${id}`)).data,
    onSuccess: async () => {
      toast.success('User deleted');
      setDeleteTarget(null);
      await qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) => toast.error(getApiErrorMessage(err, 'Failed to delete user')),
  });

  const servers = useMemo(() => serversQ.data ?? [], [serversQ.data]);
  const users = useMemo(() => usersQ.data?.pages.flatMap((p) => p) ?? [], [usersQ.data]);

  function pickActiveServer(u: VpnUser): { id: string | null; name: string | null } {
    const active = u.userServers?.find((us) => us.isActive) ?? null;
    const id = active?.serverId ?? u.serverId ?? null;
    const name = active?.server?.name ?? u.server?.name ?? null;
    return { id, name };
  }

  const filteredUsers = users;

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

  const editDetailsQ = useQuery({
    queryKey: ['user', editTarget?.id],
    queryFn: async () => (await api.get<UserDetails>(`/users/${editTarget?.id}`)).data,
    enabled: Boolean(editTarget?.id),
  });

  const activeSub = useMemo(() => {
    const subs = editDetailsQ.data?.subscriptions ?? [];
    const active = subs.filter((s) => s.active);
    if (active.length === 0) return null;
    return active
      .slice()
      .sort((a, b) => new Date(b.endsAt).getTime() - new Date(a.endsAt).getTime())[0];
  }, [editDetailsQ.data?.subscriptions]);

  function fmtDate(v?: string | null) {
    if (!v) return '—';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
  }

  function calcDaysLeft(endsAt?: string | null) {
    if (!endsAt) return null;
    const end = new Date(endsAt).getTime();
    if (Number.isNaN(end)) return null;
    const diffMs = end - Date.now();
    return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Users"
        description="Пользователи VLESS (позже будут маппиться на Telegram)."
        actions={
          <div className="flex w-full flex-col gap-2 md:flex-row md:items-center md:justify-end md:flex-nowrap">
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center md:w-auto md:flex-nowrap">
              <select
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 sm:w-auto"
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
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 sm:w-auto"
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
              <input
                className={[
                  'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none sm:w-56 md:w-60',
                  'placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200',
                ].join(' ')}
                placeholder="Search by name / TG"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-2 md:flex-nowrap">
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
        <ResponsiveSwitch
          mobile={
            <div className="grid gap-3">
              {filteredUsers.map((u) => (
                <Card key={u.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 truncate">{u.name}</div>
                      <div className="mt-1 font-mono text-xs text-slate-500 break-all">
                        <Link className="underline text-slate-900" to={`/users/${u.id}`}>
                          {u.uuid}
                        </Link>
                      </div>
                    </div>
                    <Badge variant={statusBadgeVariant(u.status) as any}>{u.status}</Badge>
                  </div>

                  <div className="mt-3 grid gap-2 text-sm text-slate-700">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-500">TG ID</span>
                      <span className="font-mono text-xs">{u.telegramId ?? '—'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-500">Server</span>
                      <span className="text-right">{pickActiveServer(u).name ?? pickActiveServer(u).id ?? '—'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-500">Онлайн</span>
                      <span
                        className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${onlineSet.has(u.id) ? 'bg-green-500' : 'bg-red-400'}`}
                        title={onlineSet.has(u.id) ? 'онлайн' : 'офлайн'}
                        aria-hidden
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-500">Expires</span>
                      <span className="text-right">{u.expiresAt ? new Date(u.expiresAt).toLocaleString() : '—'}</span>
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="text-xs text-slate-500 mb-1">Status</div>
                    <select
                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
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
                  </div>

                  <div className="mt-4 flex gap-2">
                    <Button
                      variant="secondary"
                      className="flex-1"
                      onClick={() => {
                        setEditTarget(u);
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
                    <Button variant="danger" className="flex-1" onClick={() => setDeleteTarget(u)}>
                      Delete
                    </Button>
                  </div>
                </Card>
              ))}

              {filteredUsers.length === 0 ? (
                <Card>
                  <div className="text-sm text-slate-500">No users yet</div>
                </Card>
              ) : null}

              {usersQ.hasNextPage ? (
                <div className="pt-2">
                  <Button
                    variant="secondary"
                    className="w-full"
                    disabled={usersQ.isFetchingNextPage}
                    onClick={() => usersQ.fetchNextPage()}
                  >
                    {usersQ.isFetchingNextPage ? 'Loading…' : 'Load more'}
                  </Button>
                </div>
              ) : null}
            </div>
          }
          desktop={
            <div className="grid gap-3">
              <Table
                columns={
                  <tr>
                    <Th>Name</Th>
                    <Th>UUID</Th>
                    <Th>TG ID</Th>
                    <Th>Server</Th>
                    <Th>Онлайн</Th>
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
                    <Td>{pickActiveServer(u).name ?? pickActiveServer(u).id ?? '—'}</Td>
                    <Td>
                      <span
                        className={`inline-block h-2.5 w-2.5 rounded-full ${onlineSet.has(u.id) ? 'bg-green-500' : 'bg-red-400'}`}
                        title={onlineSet.has(u.id) ? 'онлайн' : 'офлайн'}
                        aria-hidden
                      />
                    </Td>
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
                    <Td className="text-slate-500" colSpan={8}>
                      No users yet
                    </Td>
                  </tr>
                ) : null}
              </Table>

              {usersQ.hasNextPage ? (
                <div className="flex justify-center">
                  <Button
                    variant="secondary"
                    disabled={usersQ.isFetchingNextPage}
                    onClick={() => usersQ.fetchNextPage()}
                  >
                    {usersQ.isFetchingNextPage ? 'Loading…' : 'Load more'}
                  </Button>
                </div>
              ) : null}
            </div>
          }
        />
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
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
            <div className="mb-2 font-medium text-slate-900">Подписка</div>
            {editDetailsQ.isLoading ? (
              <div className="text-slate-500">Загрузка…</div>
            ) : (
              <div className="grid gap-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-500">Статус</span>
                  <span className="font-medium">{editTarget?.status ?? '—'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-500">Expires (user)</span>
                  <span className="font-mono text-xs">{fmtDate(editTarget?.expiresAt ?? null)}</span>
                </div>
                <div className="mt-2 text-xs font-medium text-slate-700">Активная подписка</div>
                {activeSub ? (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-500">Период</span>
                      <span>{activeSub.periodDays} дн.</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-500">Начало</span>
                      <span className="font-mono text-xs">{fmtDate(activeSub.startsAt)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-500">Конец</span>
                      <span className="font-mono text-xs">{fmtDate(activeSub.endsAt)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-500">Осталось</span>
                      <span>{calcDaysLeft(activeSub.endsAt) ?? '—'} дн.</span>
                    </div>
                  </>
                ) : (
                  <div className="text-slate-500">Нет активной подписки</div>
                )}
              </div>
            )}
          </div>

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

