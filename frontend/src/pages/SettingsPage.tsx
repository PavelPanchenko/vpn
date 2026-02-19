import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import { api } from '../lib/api';
import { getApiErrorMessage } from '../lib/apiError';
import { Button } from '../components/Button';
import { IconButton } from '../components/IconButton';
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
    subtitle: 'Оплата внутри Telegram (XTR). Доступно для всех языков.',
    badge: 'XTR',
    supportsAllowedLangs: false,
    defaultEnabled: true,
    defaultAllowedLangs: [],
  },
  {
    key: 'PLATEGA',
    title: 'Карта / СБП',
    subtitle: 'Внешняя оплата (RUB). Можно ограничить по языкам Telegram.',
    badge: 'RUB',
    supportsAllowedLangs: true,
    defaultEnabled: true,
    defaultAllowedLangs: ['ru'],
  },
  {
    key: 'CRYPTOCLOUD',
    title: 'CryptoCloud',
    subtitle: 'Оплата криптовалютой (внешняя страница).',
    badge: 'CRYPTO',
    supportsAllowedLangs: true,
    defaultEnabled: false,
    defaultAllowedLangs: [],
  },
];

type BotConfig = {
  id: string;
  active: boolean;
  paymentMethods: PaymentMethodConfig[];
  hasCryptocloudApiKey?: boolean;
  hasCryptocloudSecretKey?: boolean;
  cryptocloudShopId?: string | null;
  hasPlategaMerchantId?: boolean;
  hasPlategaSecret?: boolean;
  plategaPaymentMethod?: number | null;
  plategaReturnUrl?: string | null;
  plategaFailedUrl?: string | null;
  publicSiteUrl?: string | null;
  publicSupportTelegram?: string | null;
  publicSupportEmail?: string | null;
  publicCompanyName?: string | null;
  panelClientLimitIp?: number | null;
  telegramMiniAppUrl?: string | null;
  createdAt: string;
  updatedAt: string;
};

type BotTokenForm = { token: string; active: boolean };

type SettingsForm = {
  publicCompanyName: string;
  publicSiteUrl: string;
  publicSupportTelegram: string;
  publicSupportEmail: string;
  cryptocloudApiKey: string;
  cryptocloudShopId: string;
  cryptocloudSecretKey: string;
  plategaMerchantId: string;
  plategaSecret: string;
  plategaPaymentMethod: number | undefined;
  plategaReturnUrl: string;
  plategaFailedUrl: string;
  panelClientLimitIp: number | undefined;
  telegramMiniAppUrl: string;
  paymentMethods: PaymentMethodConfig[];
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

export function SettingsPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editBotOpen, setEditBotOpen] = useState(false);

  const configQ = useQuery({
    queryKey: ['bot'],
    queryFn: async () => (await api.get<BotConfig | null>('/bot')).data,
  });

  const config = configQ.data;

  // --- Bot token forms ---
  const createForm = useForm<BotTokenForm>({ defaultValues: { token: '', active: false } });
  const editBotForm = useForm<{ token?: string; active?: boolean }>({ defaultValues: {} });

  const createM = useMutation({
    mutationFn: async (payload: BotTokenForm) => (await api.post<BotConfig>('/bot', payload)).data,
    onSuccess: async () => {
      toast.success('Конфигурация бота создана');
      setCreateOpen(false);
      createForm.reset();
      await qc.invalidateQueries({ queryKey: ['bot'] });
    },
    onError: (err: any) => toast.error(getApiErrorMessage(err, 'Ошибка создания конфигурации')),
  });

  const deleteBotM = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/bot/${id}`)).data,
    onSuccess: async () => {
      toast.success('Конфигурация удалена');
      await qc.invalidateQueries({ queryKey: ['bot'] });
    },
    onError: (err: any) => toast.error(getApiErrorMessage(err, 'Ошибка удаления')),
  });

  const updateBotM = useMutation({
    mutationFn: async (payload: { id: string; data: Record<string, unknown> }) =>
      (await api.patch<BotConfig>(`/bot/${payload.id}`, payload.data)).data,
    onSuccess: async () => {
      toast.success('Конфигурация обновлена');
      setEditBotOpen(false);
      editBotForm.reset();
      await qc.invalidateQueries({ queryKey: ['bot'] });
    },
    onError: (err: any) => toast.error(getApiErrorMessage(err, 'Ошибка обновления')),
  });

  // --- Settings form ---
  const form = useForm<SettingsForm>({
    defaultValues: {
      publicCompanyName: '',
      publicSiteUrl: '',
      publicSupportTelegram: '',
      publicSupportEmail: '',
      cryptocloudApiKey: '',
      cryptocloudShopId: '',
      cryptocloudSecretKey: '',
      plategaMerchantId: '',
      plategaSecret: '',
      plategaPaymentMethod: undefined,
      plategaReturnUrl: '',
      plategaFailedUrl: '',
      panelClientLimitIp: undefined,
      telegramMiniAppUrl: '',
      paymentMethods: normalizePaymentMethods(null),
    },
  });

  useEffect(() => {
    if (!config) return;
    form.reset({
      publicCompanyName: config.publicCompanyName || '',
      publicSiteUrl: config.publicSiteUrl || '',
      publicSupportTelegram: config.publicSupportTelegram || '',
      publicSupportEmail: config.publicSupportEmail || '',
      cryptocloudApiKey: '',
      cryptocloudShopId: config.cryptocloudShopId || '',
      cryptocloudSecretKey: '',
      plategaMerchantId: '',
      plategaSecret: '',
      plategaPaymentMethod: config.plategaPaymentMethod ?? undefined,
      plategaReturnUrl: config.plategaReturnUrl || '',
      plategaFailedUrl: config.plategaFailedUrl || '',
      panelClientLimitIp: config.panelClientLimitIp ?? undefined,
      telegramMiniAppUrl: config.telegramMiniAppUrl || '',
      paymentMethods: normalizePaymentMethods(config.paymentMethods),
    });
  }, [config]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateSettingsM = useMutation({
    mutationFn: async (data: Partial<SettingsForm>) => {
      if (!config) throw new Error('No bot config');
      return (await api.patch(`/bot/${config.id}`, data)).data;
    },
    onSuccess: async () => {
      toast.success('Настройки сохранены');
      await qc.invalidateQueries({ queryKey: ['bot'] });
    },
    onError: (err: any) => toast.error(getApiErrorMessage(err, 'Не удалось сохранить')),
  });

  function onSubmitSettings(data: SettingsForm) {
    const payload: Record<string, unknown> = { ...data };
    if (!data.cryptocloudApiKey) delete payload.cryptocloudApiKey;
    if (!data.cryptocloudSecretKey) delete payload.cryptocloudSecretKey;
    if (!data.plategaMerchantId) delete payload.plategaMerchantId;
    if (!data.plategaSecret) delete payload.plategaSecret;
    updateSettingsM.mutate(payload as Partial<SettingsForm>);
  }

  function setPaymentMethodField(key: PaymentMethodKey, patch: Partial<PaymentMethodConfig>) {
    const cur = normalizePaymentMethods(form.getValues('paymentMethods'));
    const next = cur.map((m) => (m.key === key ? { ...m, ...patch } : m));
    form.setValue('paymentMethods', next, { shouldDirty: true });
  }

  if (configQ.isLoading) {
    return (
      <div className="grid gap-6">
        <PageHeader title="Настройки" description="Управление ботом и настройками приложения." />
        <Card><div className="text-sm text-slate-600">Загрузка...</div></Card>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Настройки"
        description="Управление ботом и настройками приложения."
        actions={
          config ? (
            <Button
              disabled={updateSettingsM.isPending || !form.formState.isDirty}
              onClick={form.handleSubmit(onSubmitSettings)}
            >
              {updateSettingsM.isPending ? 'Сохранение...' : 'Сохранить'}
            </Button>
          ) : undefined
        }
      />

      {/* ====== Telegram Bot ====== */}
      <Card title="Telegram Bot" collapsible>
        {config ? (
          <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-700">Статус:</span>
                <Badge variant={config.active ? 'success' : 'warning'}>
                  {config.active ? 'Активен' : 'Неактивен'}
                </Badge>
              </div>
              <div className="text-xs text-slate-500">Создан: {new Date(config.createdAt).toLocaleString()}</div>
              <div className="text-xs text-slate-500">Обновлён: {new Date(config.updatedAt).toLocaleString()}</div>
            </div>
            <div className="flex gap-2 justify-end">
              <IconButton
                icon="edit"
                variant="secondary"
                title="Изменить"
                onClick={() => {
                  editBotForm.reset({ active: config.active });
                  setEditBotOpen(true);
                }}
              />
              <IconButton
                icon="delete"
                variant="danger"
                title="Удалить"
                onClick={() => {
                  if (confirm('Удалить конфигурацию? Бот перестанет работать.')) {
                    deleteBotM.mutate(config.id);
                  }
                }}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-500">Бот не настроен. Добавьте токен, чтобы запустить.</div>
            <IconButton
              icon="add"
              variant="primary"
              title="Добавить токен"
              onClick={() => { createForm.reset(); setCreateOpen(true); }}
            />
          </div>
        )}
      </Card>

      {/* Остальные настройки доступны только если бот создан */}
      {config && (
        <form className="grid gap-6" onSubmit={(e) => e.preventDefault()}>
          {/* Контакты */}
          <Card title="Контакты" collapsible defaultOpen={false}>
            <div className="grid gap-4">
              <Input label="Название компании" {...form.register('publicCompanyName')} placeholder="из .env" />
              <Input label="URL сайта" {...form.register('publicSiteUrl')} placeholder="https://..." />
              <Input label="Telegram поддержки" {...form.register('publicSupportTelegram')} placeholder="@username" />
              <Input label="Email поддержки" {...form.register('publicSupportEmail')} placeholder="support@..." />
            </div>
          </Card>

          {/* Платежные провайдеры */}
          <Card title="Платежные провайдеры" collapsible defaultOpen={false}>
            <div className="grid gap-5">
              {/* Видимость методов */}
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Видимость методов</div>
                <div className="grid gap-3">
                  {normalizePaymentMethods(form.watch('paymentMethods')).map((m) => {
                    const meta = ALL_PAYMENT_METHODS.find((x) => x.key === m.key)!;
                    return (
                      <div key={m.key} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-sm font-medium text-slate-800">{meta.title}</div>
                              {meta.badge && <Badge variant="default">{meta.badge}</Badge>}
                              <Badge variant={m.enabled ? 'success' : 'warning'}>{m.enabled ? 'Включен' : 'Выключен'}</Badge>
                            </div>
                            <div className="text-xs text-slate-600">{meta.subtitle}</div>
                          </div>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={m.enabled}
                              onChange={(e) => setPaymentMethodField(m.key, { enabled: e.target.checked })}
                              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-slate-700">Вкл.</span>
                          </label>
                        </div>

                        {meta.supportsAllowedLangs && (
                          <div className="mt-3 grid gap-2">
                            <div className="text-xs text-slate-500">Языки (пусто = для всех)</div>
                            <div className="flex flex-wrap gap-3">
                              {(['ru', 'uk', 'en'] as const).map((code) => (
                                <label key={code} className="flex items-center gap-2 text-sm text-slate-700">
                                  <input
                                    type="checkbox"
                                    checked={(m.allowedLangs ?? []).includes(code)}
                                    onChange={(e) => {
                                      const cur = m.allowedLangs ?? [];
                                      const next = e.target.checked
                                        ? Array.from(new Set([...cur, code]))
                                        : cur.filter((x) => x !== code);
                                      setPaymentMethodField(m.key, { allowedLangs: next });
                                    }}
                                  />
                                  {code}
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Platega */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 text-sm font-semibold text-slate-800">Platega (Карта / СБП)</div>
                <div className="grid gap-3">
                  <Input
                    label="Merchant ID"
                    type="password"
                    {...form.register('plategaMerchantId')}
                    placeholder={config.hasPlategaMerchantId ? '••• задан (оставить пустым = не менять)' : 'из .env'}
                  />
                  <Input
                    label="Secret"
                    type="password"
                    {...form.register('plategaSecret')}
                    placeholder={config.hasPlategaSecret ? '••• задан (оставить пустым = не менять)' : 'из .env'}
                  />
                  <Input
                    label="Способ оплаты (Platega)"
                    type="number"
                    {...form.register('plategaPaymentMethod', { valueAsNumber: true })}
                    placeholder="из .env (по умолч. 2)"
                  />
                  <Input label="Return URL (успешная оплата)" {...form.register('plategaReturnUrl')} placeholder="из .env" />
                  <Input label="Failed URL (неудачная оплата)" {...form.register('plategaFailedUrl')} placeholder="из .env" />
                </div>
              </div>

              {/* CryptoCloud */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 text-sm font-semibold text-slate-800">CryptoCloud</div>
                <div className="grid gap-3">
                  <Input
                    label="API Key"
                    type="password"
                    {...form.register('cryptocloudApiKey')}
                    placeholder={config.hasCryptocloudApiKey ? '••• задан (оставить пустым = не менять)' : 'из .env'}
                  />
                  <Input label="Shop ID" {...form.register('cryptocloudShopId')} placeholder="из .env" />
                  <Input
                    label="Secret Key"
                    type="password"
                    {...form.register('cryptocloudSecretKey')}
                    placeholder={config.hasCryptocloudSecretKey ? '••• задан (оставить пустым = не менять)' : 'из .env'}
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* Общие настройки */}
          <Card title="Общие настройки" collapsible defaultOpen={false}>
            <div className="grid gap-4">
              <Input
                label="Лимит устройств (IP)"
                type="number"
                {...form.register('panelClientLimitIp', { valueAsNumber: true })}
                placeholder="из .env (по умолч. 2)"
              />
              <Input label="Telegram Mini App URL" {...form.register('telegramMiniAppUrl')} placeholder="из .env" />
            </div>
          </Card>
        </form>
      )}

      {/* ====== Modals ====== */}
      <Modal
        open={createOpen}
        title="Добавить токен бота"
        onClose={() => { setCreateOpen(false); createForm.reset(); }}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setCreateOpen(false)}>Отмена</Button>
            <Button
              type="button"
              disabled={createM.isPending || !createForm.watch('token')}
              onClick={createForm.handleSubmit((data) => createM.mutate(data))}
            >
              Создать
            </Button>
          </div>
        }
      >
        <form className="grid gap-4" onSubmit={(e) => e.preventDefault()}>
          <Input
            label="Токен бота *"
            type="password"
            {...createForm.register('token', { required: true })}
            placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
            hint="Получить токен можно у @BotFather в Telegram"
          />
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              {...createForm.register('active')}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-700">Активировать сразу</span>
          </label>
        </form>
      </Modal>

      <Modal
        open={editBotOpen}
        title="Редактировать бот"
        onClose={() => { setEditBotOpen(false); editBotForm.reset(); }}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setEditBotOpen(false)}>Отмена</Button>
            <Button
              type="button"
              disabled={updateBotM.isPending}
              onClick={editBotForm.handleSubmit((data) => {
                if (config) updateBotM.mutate({ id: config.id, data });
              })}
            >
              Сохранить
            </Button>
          </div>
        }
      >
        <form className="grid gap-4" onSubmit={(e) => e.preventDefault()}>
          <Input
            label="Токен бота (пусто = не менять)"
            type="password"
            {...editBotForm.register('token')}
            placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
            hint="Оставьте пустым, чтобы сохранить текущий токен"
          />
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              {...editBotForm.register('active')}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-700">Активен</span>
          </label>
        </form>
      </Modal>
    </div>
  );
}
