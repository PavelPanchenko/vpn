import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import { api } from '../lib/api';
import { getApiErrorMessage } from '../lib/apiError';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';

type PaymentMethodKey = 'TELEGRAM_STARS' | 'PLATEGA' | 'CRYPTOCLOUD';
type PaymentMethodConfig = { key: PaymentMethodKey; enabled: boolean; allowedLangs: string[] };

const ALL_PAYMENT_METHODS: Array<{
  key: PaymentMethodKey;
  title: string;
  subtitle: string;
  badge?: string;
  supportsAllowedLangs: boolean;
  defaultEnabled: boolean;
  defaultAllowedLangs: string[];
}> = [
  {
    key: 'TELEGRAM_STARS',
    title: 'Telegram Stars',
    subtitle: 'Оплата внутри Telegram (XTR). По умолчанию доступно для всех языков.',
    badge: 'XTR',
    supportsAllowedLangs: false,
    defaultEnabled: true,
    defaultAllowedLangs: [],
  },
  {
    key: 'PLATEGA',
    title: 'Карта / СБП',
    subtitle: 'Внешняя оплата (RUB). Можно ограничивать показ по языкам Telegram.',
    badge: 'RUB',
    supportsAllowedLangs: true,
    defaultEnabled: true,
    defaultAllowedLangs: ['ru'],
  },
  {
    key: 'CRYPTOCLOUD',
    title: 'CryptoCloud',
    subtitle: 'Оплата криптовалютой через CryptoCloud (внешняя страница). Можно ограничивать показ по языкам Telegram.',
    badge: 'CRYPTO',
    supportsAllowedLangs: true,
    defaultEnabled: false,
    defaultAllowedLangs: [],
  },
];

type BotConfig = {
  id: string;
  active: boolean;
  useMiniApp: boolean;
  paymentMethods: PaymentMethodConfig[];
  createdAt: string;
  updatedAt: string;
};

type CreateBotConfigForm = {
  token: string;
  active: boolean;
  useMiniApp: boolean;
  paymentMethods: PaymentMethodConfig[];
};

type UpdateBotConfigForm = {
  token?: string;
  active?: boolean;
  useMiniApp?: boolean;
  paymentMethods?: PaymentMethodConfig[];
};

function normalizePaymentMethods(methods: PaymentMethodConfig[] | null | undefined): PaymentMethodConfig[] {
  const byKey = new Map<PaymentMethodKey, PaymentMethodConfig>();
  for (const m of methods ?? []) {
    byKey.set(m.key, { key: m.key, enabled: Boolean(m.enabled), allowedLangs: Array.isArray(m.allowedLangs) ? m.allowedLangs : [] });
  }
  return ALL_PAYMENT_METHODS.map((meta) => {
    const existing = byKey.get(meta.key);
    return existing ?? { key: meta.key, enabled: meta.defaultEnabled, allowedLangs: meta.defaultAllowedLangs };
  });
}

function setPaymentMethodField(args: {
  get: (name: 'paymentMethods') => PaymentMethodConfig[] | undefined;
  set: (name: 'paymentMethods', value: PaymentMethodConfig[], opts?: { shouldDirty?: boolean }) => void;
  key: PaymentMethodKey;
  patch: Partial<PaymentMethodConfig>;
}) {
  const cur = normalizePaymentMethods(args.get('paymentMethods'));
  const next = cur.map((m) => (m.key === args.key ? { ...m, ...args.patch } : m));
  args.set('paymentMethods', next, { shouldDirty: true });
}

export function BotPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<BotConfig | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BotConfig | null>(null);

  const configQ = useQuery({
    queryKey: ['bot'],
    queryFn: async () => {
      const res = await api.get<BotConfig | null>('/bot');
      return res.data;
    },
  });

  const createForm = useForm<CreateBotConfigForm>({
    defaultValues: {
      token: '',
      active: false,
      useMiniApp: false,
      paymentMethods: normalizePaymentMethods(null),
    },
  });

  const editForm = useForm<UpdateBotConfigForm>({
    defaultValues: {},
  });

  const createM = useMutation({
    mutationFn: async (payload: CreateBotConfigForm) => (await api.post<BotConfig>('/bot', payload)).data,
    onSuccess: async () => {
      toast.success('Bot configuration created');
      setCreateOpen(false);
      createForm.reset();
      // Обновляем данные после успешного создания
      await qc.invalidateQueries({ queryKey: ['bot'] });
    },
    onError: (err: any) => {
      toast.error(getApiErrorMessage(err, 'Failed to create bot configuration'));
      console.error('Bot creation error:', err);
    },
  });

  const updateM = useMutation({
    mutationFn: async (payload: { id: string; data: UpdateBotConfigForm }) =>
      (await api.patch<BotConfig>(`/bot/${payload.id}`, payload.data)).data,
    onSuccess: async () => {
      toast.success('Bot configuration updated');
      setEditTarget(null);
      editForm.reset();
      await qc.invalidateQueries({ queryKey: ['bot'] });
    },
    onError: (err: any) => toast.error(getApiErrorMessage(err, 'Failed to update bot configuration')),
  });

  const deleteM = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/bot/${id}`)).data,
    onSuccess: async () => {
      toast.success('Bot configuration deleted');
      setDeleteTarget(null);
      await qc.invalidateQueries({ queryKey: ['bot'] });
    },
    onError: (err: any) => {
      toast.error(getApiErrorMessage(err, 'Failed to delete bot configuration'));
      console.error('Bot deletion error:', err);
    },
  });

  const config = configQ.data;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Telegram Bot"
        description="Управление токеном Telegram бота и его настройками."
        actions={
          <Button
            onClick={() => {
              createForm.reset();
              setCreateOpen(true);
            }}
          >
            Add bot token
          </Button>
        }
      />

      <Card title="Bot Configuration">
        {configQ.isLoading ? (
          <div className="text-sm text-slate-600">Loading…</div>
        ) : config ? (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-700">Status:</span>
                  <Badge variant={config.active ? 'success' : 'warning'}>
                    {config.active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-700">Mode:</span>
                  <Badge variant={config.useMiniApp ? 'info' : 'default'}>
                    {config.useMiniApp ? 'Mini App' : 'Classic'}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-700">Payments:</span>
                  <div className="grid gap-2">
                    {normalizePaymentMethods(config.paymentMethods).map((m) => {
                      const meta = ALL_PAYMENT_METHODS.find((x) => x.key === m.key)!;
                      return (
                        <div key={m.key} className="flex flex-wrap items-center gap-2">
                          <Badge variant={m.enabled ? 'success' : 'warning'}>
                            {meta.title}: {m.enabled ? 'on' : 'off'}
                          </Badge>
                          {meta.badge ? <Badge variant="default">{meta.badge}</Badge> : null}
                          {meta.supportsAllowedLangs && m.enabled ? (
                            <span className="text-xs text-slate-500">langs: {(m.allowedLangs ?? []).join(', ') || '—'}</span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="text-xs text-slate-500">Created: {new Date(config.createdAt).toLocaleString()}</div>
                <div className="text-xs text-slate-500">Updated: {new Date(config.updatedAt).toLocaleString()}</div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                <Button
                  variant="secondary"
                  className="w-full sm:w-auto"
                  onClick={() => {
                    editForm.reset({
                      active: config.active,
                      useMiniApp: config.useMiniApp,
                      paymentMethods: normalizePaymentMethods(config.paymentMethods),
                    });
                    setEditTarget(config);
                  }}
                >
                  Edit
                </Button>
                <Button
                  variant="danger"
                  className="w-full sm:w-auto"
                  onClick={() => {
                    if (confirm('Delete this bot configuration? The bot will stop working.')) {
                      setDeleteTarget(config);
                    }
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-500">No bot configuration found. Create one to start the bot.</div>
        )}
      </Card>

      <Modal
        open={createOpen}
        title="Add bot token"
        onClose={() => {
          setCreateOpen(false);
          createForm.reset();
        }}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={createM.isPending || !createForm.watch('token')}
              onClick={createForm.handleSubmit((data) => {
                createM.mutate(data);
              })}
            >
              Create
            </Button>
          </div>
        }
      >
        <form className="grid gap-4" onSubmit={(e) => e.preventDefault()}>
          <Input
            label="Bot Token *"
            type="password"
            {...createForm.register('token', { required: true })}
            placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
            hint="Get your bot token from @BotFather on Telegram"
          />

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              {...createForm.register('active')}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-700">Activate bot immediately</span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              {...createForm.register('useMiniApp')}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-700">Use Telegram Mini App mode (show WebApp button)</span>
          </label>

          <div className="pt-2 border-t border-slate-200" />

          <div className="text-sm font-medium text-slate-700">Payment methods</div>

          <div className="grid gap-3">
            {normalizePaymentMethods(createForm.watch('paymentMethods')).map((m) => {
              const meta = ALL_PAYMENT_METHODS.find((x) => x.key === m.key)!;
              return (
                <div key={m.key} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-medium text-slate-800">{meta.title}</div>
                        {meta.badge ? <Badge variant="default">{meta.badge}</Badge> : null}
                        <Badge variant={m.enabled ? 'success' : 'warning'}>{m.enabled ? 'Enabled' : 'Disabled'}</Badge>
                      </div>
                      <div className="text-xs text-slate-600">{meta.subtitle}</div>
                    </div>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={m.enabled}
                        onChange={(e) =>
                          setPaymentMethodField({
                            get: createForm.getValues,
                            set: createForm.setValue,
                            key: m.key,
                            patch: { enabled: e.target.checked },
                          })
                        }
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-slate-700">Показывать</span>
                    </label>
                  </div>

                  {meta.supportsAllowedLangs ? (
                    <div className="mt-3 grid gap-2">
                      <div className="text-xs text-slate-500">Языки (если не выбрать — будет для всех)</div>
                      <div className="flex flex-wrap gap-3">
                        {(['ru', 'uk', 'en'] as const).map((code) => (
                          <label key={code} className="flex items-center gap-2 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={(m.allowedLangs ?? []).includes(code)}
                              onChange={(e) => {
                                const cur = m.allowedLangs ?? [];
                                const next = e.target.checked ? Array.from(new Set([...cur, code])) : cur.filter((x) => x !== code);
                                setPaymentMethodField({
                                  get: createForm.getValues,
                                  set: createForm.setValue,
                                  key: m.key,
                                  patch: { allowedLangs: next },
                                });
                              }}
                            />
                            {code}
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </form>
      </Modal>

      <Modal
        open={!!editTarget}
        title="Edit bot configuration"
        onClose={() => {
          setEditTarget(null);
          editForm.reset();
        }}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={updateM.isPending}
              onClick={editForm.handleSubmit((data) => {
                if (editTarget) {
                  updateM.mutate({ id: editTarget.id, data });
                }
              })}
            >
              Update
            </Button>
          </div>
        }
      >
        <form className="grid gap-4" onSubmit={(e) => e.preventDefault()}>
          <Input
            label="Bot Token (leave empty to keep current)"
            type="password"
            {...editForm.register('token')}
            placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
            hint="Leave empty to keep the current token"
          />

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              {...editForm.register('active')}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-700">Active</span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              {...editForm.register('useMiniApp')}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-700">Use Telegram Mini App mode (show WebApp button)</span>
          </label>

          <div className="pt-2 border-t border-slate-200" />

          <div className="text-sm font-medium text-slate-700">Payment methods</div>

          <div className="grid gap-3">
            {normalizePaymentMethods(editForm.watch('paymentMethods')).map((m) => {
              const meta = ALL_PAYMENT_METHODS.find((x) => x.key === m.key)!;
              return (
                <div key={m.key} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-medium text-slate-800">{meta.title}</div>
                        {meta.badge ? <Badge variant="default">{meta.badge}</Badge> : null}
                        <Badge variant={m.enabled ? 'success' : 'warning'}>{m.enabled ? 'Enabled' : 'Disabled'}</Badge>
                      </div>
                      <div className="text-xs text-slate-600">{meta.subtitle}</div>
                    </div>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={m.enabled}
                        onChange={(e) =>
                          setPaymentMethodField({
                            get: editForm.getValues,
                            set: editForm.setValue,
                            key: m.key,
                            patch: { enabled: e.target.checked },
                          })
                        }
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-slate-700">Показывать</span>
                    </label>
                  </div>

                  {meta.supportsAllowedLangs ? (
                    <div className="mt-3 grid gap-2">
                      <div className="text-xs text-slate-500">Языки (если не выбрать — будет для всех)</div>
                      <div className="flex flex-wrap gap-3">
                        {(['ru', 'uk', 'en'] as const).map((code) => (
                          <label key={code} className="flex items-center gap-2 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={(m.allowedLangs ?? []).includes(code)}
                              onChange={(e) => {
                                const cur = m.allowedLangs ?? [];
                                const next = e.target.checked ? Array.from(new Set([...cur, code])) : cur.filter((x) => x !== code);
                                setPaymentMethodField({
                                  get: editForm.getValues,
                                  set: editForm.setValue,
                                  key: m.key,
                                  patch: { allowedLangs: next },
                                });
                              }}
                            />
                            {code}
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </form>
      </Modal>

      <Modal
        open={!!deleteTarget}
        title="Delete bot configuration"
        onClose={() => setDeleteTarget(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              type="button"
              disabled={deleteM.isPending}
              onClick={() => {
                if (deleteTarget) {
                  deleteM.mutate(deleteTarget.id);
                }
              }}
            >
              Delete
            </Button>
          </div>
        }
      >
        <p className="text-sm text-slate-600">
          Are you sure you want to delete this bot configuration? The bot will stop working and you will need to
          create a new configuration to restart it.
        </p>
      </Modal>
    </div>
  );
}
