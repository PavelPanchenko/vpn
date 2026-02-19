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
import { IconButton } from '../components/IconButton';
import { ResponsiveSwitch } from '../components/ResponsiveSwitch';
import { UserAvatar } from '../components/UserAvatar';
import { BotOff } from 'lucide-react';

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
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | VpnUserStatus>('ALL');
  const [serverFilter, setServerFilter] = useState<string>('ALL');
  const [onlineFilter, setOnlineFilter] = useState<'ALL' | 'ONLINE'>('ALL');
  const [showBlocked, setShowBlocked] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'expiresAt' | 'status' | 'lastOnlineAt' | 'createdAt' | 'serverName'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const serversQ = useQuery({
    queryKey: ['servers'],
    queryFn: async () => (await api.get<VpnServer[]>('/servers')).data,
  });

  const qStr = useMemo(() => search.trim(), [search]);

  const onlineIdsQ = useQuery({
    queryKey: ['users-online'],
    queryFn: async () => (await api.get<string[]>('/users/online')).data,
    refetchInterval: 30_000,
  });
  const usersCountQ = useQuery({
    queryKey: ['users-count', qStr, statusFilter, serverFilter, showBlocked],
    queryFn: async () =>
      (
        await api.get<{ count: number }>('/users', {
          params: {
            countOnly: '1',
            ...(qStr ? { q: qStr } : {}),
            ...(statusFilter !== 'ALL' ? { status: statusFilter } : {}),
            ...(serverFilter !== 'ALL' ? { serverId: serverFilter } : {}),
            hideBlocked: showBlocked ? '0' : '1',
          },
        })
      ).data.count,
    retry: false,
    staleTime: 30_000,
  });
  const onlineSet = useMemo(
    () => new Set(Array.isArray(onlineIdsQ.data) ? onlineIdsQ.data : []),
    [onlineIdsQ.data],
  );

  const usersQ = useInfiniteQuery({
    queryKey: ['users', { q: qStr, statusFilter, serverFilter, showBlocked, sortBy, sortOrder }],
    queryFn: async ({ pageParam }) =>
      (await api.get<VpnUser[]>('/users', {
        params: {
          offset: Number(pageParam ?? 0),
          limit: PAGE_SIZE,
          q: qStr || undefined,
          status: statusFilter !== 'ALL' ? statusFilter : undefined,
          serverId: serverFilter !== 'ALL' ? serverFilter : undefined,
          hideBlocked: showBlocked ? '0' : '1',
          sortBy,
          sortOrder,
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
    mutationFn: async (payload: { id: string; data: { name?: string; telegramId?: string; serverId?: string } }) =>
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

  const filteredUsers = useMemo(() => {
    const list = users;
    if (onlineFilter !== 'ONLINE') return list;
    return list.filter((u) => onlineSet.has(u.id));
  }, [users, onlineFilter, onlineSet]);

  const createForm = useForm<CreateUserForm>({
    defaultValues: { serverId: '', name: '', telegramId: '', trialDays: 3 },
  });

  type EditUserForm = {
    serverId: string;
    name: string;
    telegramId: string;
  };
  const editForm = useForm<EditUserForm>({
    defaultValues: { serverId: '', name: '', telegramId: '' },
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

  function fmtLastOnline(v?: string | null) {
    if (!v) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    const diffMs = Date.now() - d.getTime();
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 1) return 'только что';
    if (mins < 60) return `${mins} мин назад`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} ч назад`;
    const days = Math.floor(hours / 24);
    return `${days} д назад`;
  }

  function calcDaysLeft(endsAt?: string | null) {
    if (!endsAt) return null;
    const end = new Date(endsAt).getTime();
    if (Number.isNaN(end)) return null;
    const diffMs = end - Date.now();
    return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  }

  type SortField = 'name' | 'expiresAt' | 'status' | 'lastOnlineAt' | 'createdAt' | 'serverName';
  function handleSort(field: SortField) {
    if (sortBy === field) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder(field === 'name' || field === 'status' || field === 'serverName' ? 'asc' : 'desc');
    }
  }
  function SortTh({ field, children }: { field: SortField; children: React.ReactNode }) {
    const active = sortBy === field;
    return (
      <Th>
        <button
          type="button"
          onClick={() => handleSort(field)}
          className="inline-flex items-center gap-1 font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700"
        >
          {children}
          {active && <span className="text-slate-700">{sortOrder === 'asc' ? ' ↑' : ' ↓'}</span>}
        </button>
      </Th>
    );
  }

  const totalCount = usersCountQ.data;
  const countReady = usersCountQ.isSuccess && typeof totalCount === 'number';

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Пользователи"
        description={
          countReady
            ? (onlineFilter === 'ONLINE'
                ? `Показано: ${filteredUsers.length} из ${totalCount} (онлайн)`
                : `Пользователей: ${totalCount}${qStr ? ` (по запросу «${qStr}»)` : ''}`)
            : 'Пользователи VLESS.'
        }
        actions={
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <select
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'ALL' | VpnUserStatus)}
            >
              <option value="ALL">Все статусы</option>
              <option value="NEW">NEW</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="BLOCKED">BLOCKED</option>
              <option value="EXPIRED">EXPIRED</option>
            </select>
            <select
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              value={serverFilter}
              onChange={(e) => setServerFilter(e.target.value)}
            >
              <option value="ALL">Все серверы</option>
              {servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              value={onlineFilter}
              onChange={(e) => setOnlineFilter(e.target.value as 'ALL' | 'ONLINE')}
            >
              <option value="ALL">Все</option>
              <option value="ONLINE">Онлайн</option>
            </select>
            <label className="flex h-10 cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={showBlocked}
                onChange={(e) => setShowBlocked(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-slate-700 focus:ring-slate-400"
              />
              Показать заблокировавших бота
            </label>
            <input
              className={[
                'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none sm:w-56 md:w-60',
                'placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200',
              ].join(' ')}
              placeholder="Поиск по имени / TG"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="flex gap-2">
              <IconButton
                icon="add"
                variant="primary"
                title="Добавить пользователя"
                onClick={() => {
                  createForm.reset({ serverId: '', name: '', telegramId: '' });
                  setCreateOpen(true);
                }}
              />
            </div>
          </div>
        }
      />

      {usersQ.isLoading ? (
        <div className="text-sm text-slate-600">Загрузка…</div>
      ) : (
        <ResponsiveSwitch
          mobile={
            <div className="grid gap-3">
              {filteredUsers.map((u) => (
                <div
                  key={u.id}
                  className={u.botBlockedAt ? 'rounded-lg bg-slate-100/80 opacity-75' : ''}
                  title={u.botBlockedAt ? `Бот заблокирован: ${new Date(u.botBlockedAt).toLocaleString()}` : undefined}
                >
                  <Card>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <UserAvatar userId={u.id} name={u.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 font-semibold text-slate-900 truncate">
                          {u.name}
                          {u.botBlockedAt ? (
                            <span title="Бот заблокирован" className="inline-flex">
                              <BotOff size={14} className="shrink-0 text-slate-500" />
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 font-mono text-xs text-slate-500 break-all">
                          <Link className="underline text-slate-900" to={`/users/${u.id}`}>
                            {u.uuid}
                          </Link>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={statusBadgeVariant(u.status) as any}>{u.status}</Badge>
                    </div>
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
                      <span className="flex items-center gap-1.5">
                        <span
                          className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${onlineSet.has(u.id) ? 'bg-green-500' : 'bg-red-400'}`}
                          title={onlineSet.has(u.id) ? 'онлайн' : 'офлайн'}
                          aria-hidden
                        />
                        {!onlineSet.has(u.id) && fmtLastOnline(u.lastOnlineAt) && (
                          <span className="text-xs text-slate-400">{fmtLastOnline(u.lastOnlineAt)}</span>
                        )}
                      </span>
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
                    <IconButton
                      icon="edit"
                      variant="secondary"
                      title="Изменить"
                      onClick={() => {
                        setEditTarget(u);
                        editForm.reset({
                          serverId: u.serverId ?? undefined,
                          name: u.name,
                          telegramId: u.telegramId ?? '',
                        });
                      }}
                    />
                    <IconButton icon="delete" variant="danger" title="Удалить" onClick={() => setDeleteTarget(u)} />
                  </div>
                </Card>
                </div>
              ))}

              {filteredUsers.length === 0 ? (
                <Card>
                  <div className="text-sm text-slate-500">Пользователей пока нет</div>
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
                    {usersQ.isFetchingNextPage ? 'Загрузка…' : 'Ещё'}
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
                    <SortTh field="name">Имя</SortTh>
                    <Th>UUID</Th>
                    <Th>TG ID</Th>
                    <SortTh field="serverName">Сервер</SortTh>
                    <SortTh field="lastOnlineAt">Онлайн</SortTh>
                    <SortTh field="status">Статус</SortTh>
                    <SortTh field="expiresAt">Истекает</SortTh>
                    <Th className="text-right">Действия</Th>
                  </tr>
                }
              >
                {filteredUsers.map((u) => (
                  <tr
                    key={u.id}
                    className={`border-t border-slate-100 ${u.botBlockedAt ? 'bg-slate-100/70 text-slate-600' : ''}`}
                    title={u.botBlockedAt ? `Бот заблокирован: ${new Date(u.botBlockedAt).toLocaleString()}` : undefined}
                  >
                    <Td>
                      <div className="flex items-center gap-2">
                        <UserAvatar userId={u.id} name={u.name} size="sm" />
                        <span className="font-medium">{u.name}</span>
                        {u.botBlockedAt ? (
                          <span title="Бот заблокирован" className="inline-flex">
                            <BotOff size={14} className="shrink-0 text-slate-500" />
                          </span>
                        ) : null}
                      </div>
                    </Td>
                    <Td className="font-mono text-xs">
                      <Link className="text-slate-900 underline" to={`/users/${u.id}`}>
                        {u.uuid}
                      </Link>
                    </Td>
                    <Td className="font-mono text-xs">{u.telegramId ?? '-'}</Td>
                    <Td>{pickActiveServer(u).name ?? pickActiveServer(u).id ?? '—'}</Td>
                    <Td>
                      <span className="flex items-center gap-1.5">
                        <span
                          className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${onlineSet.has(u.id) ? 'bg-green-500' : 'bg-red-400'}`}
                          title={onlineSet.has(u.id) ? 'онлайн' : 'офлайн'}
                          aria-hidden
                        />
                        {!onlineSet.has(u.id) && fmtLastOnline(u.lastOnlineAt) && (
                          <span className="text-xs text-slate-400">{fmtLastOnline(u.lastOnlineAt)}</span>
                        )}
                      </span>
                    </Td>
                    <Td>
                      <select
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
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
                        <IconButton
                          icon="edit"
                          variant="secondary"
                          title="Изменить"
                          onClick={() => {
                            setEditTarget(u);
                            editForm.reset({
                              serverId: u.serverId ?? undefined,
                              name: u.name,
                              telegramId: u.telegramId ?? '',
                            });
                          }}
                        />
                        <IconButton icon="delete" variant="danger" title="Удалить" onClick={() => setDeleteTarget(u)} />
                      </div>
                    </Td>
                  </tr>
                ))}
                {filteredUsers.length === 0 ? (
                  <tr className="border-t border-slate-100">
                    <Td className="text-slate-500" colSpan={8}>
                      Пользователей пока нет
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
                    {usersQ.isFetchingNextPage ? 'Загрузка…' : 'Ещё'}
                  </Button>
                </div>
              ) : null}
            </div>
          }
        />
      )}

      <Modal
        open={createOpen}
        title="Добавить пользователя"
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
            label="Имя"
            placeholder="например, Павел"
            {...createForm.register('name', { required: 'Введите имя', minLength: { value: 2, message: 'Слишком коротко' } })}
            error={createForm.formState.errors.name?.message}
          />

          <label className="block">
            <div className="text-sm font-medium text-slate-700">Сервер</div>
            <select
              className={[
                'mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none',
                'focus:border-slate-400 focus:ring-2 focus:ring-slate-200',
                createForm.formState.errors.serverId ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : null,
              ]
                .filter(Boolean)
                .join(' ')}
              {...createForm.register('serverId', { required: 'Выберите сервер' })}
              defaultValue=""
            >
              <option value="" disabled>
                Выберите сервер…
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

          <Input label="TG ID" placeholder="например, 123456789" {...createForm.register('telegramId')} />
          <Input
            label="Пробный период (дней)"
            type="number"
            {...createForm.register('trialDays', { valueAsNumber: true, min: 1, max: 365 })}
            hint="По умолчанию 3. При создании выставит expiresAt и в панели."
          />
          <div className="text-xs text-slate-500">UUID генерируется автоматически на backend.</div>
        </form>
      </Modal>

      <Modal
        open={Boolean(editTarget)}
        title="Редактировать пользователя"
        onClose={() => setEditTarget(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setEditTarget(null)}>
              Отмена
            </Button>
            <Button
              type="button"
              disabled={editM.isPending || !editTarget}
              onClick={editForm.handleSubmit((v) => {
                if (!editTarget) return;
                editM.mutate({
                  id: editTarget.id,
                  data: {
                    serverId: v.serverId !== editTarget.serverId ? v.serverId : undefined,
                    name: v.name.trim(),
                    telegramId: v.telegramId.trim() || undefined,
                  },
                });
              })}
            >
              Сохранить
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
                  <span className="text-slate-500">Истекает (пользователь)</span>
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
            <div className="text-sm font-medium text-slate-700">Сервер</div>
            <select
              className={[
                'mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none',
                'focus:border-slate-400 focus:ring-2 focus:ring-slate-200',
                editForm.formState.errors.serverId ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : null,
              ]
                .filter(Boolean)
                .join(' ')}
              {...editForm.register('serverId', { required: 'Выберите сервер' })}
            >
              <option value="" disabled>
                Выберите сервер…
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
            label="Имя"
            {...editForm.register('name', { required: 'Введите имя', minLength: { value: 2, message: 'Слишком коротко' } })}
            error={editForm.formState.errors.name?.message}
          />
          <Input label="TG ID" {...editForm.register('telegramId')} />
        </form>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        title="Удалить пользователя"
        onClose={() => setDeleteTarget(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setDeleteTarget(null)}>
              Отмена
            </Button>
            <Button
              variant="danger"
              type="button"
              disabled={deleteM.isPending || !deleteTarget}
              onClick={() => deleteTarget && deleteM.mutate(deleteTarget.id)}
            >
              Удалить
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

