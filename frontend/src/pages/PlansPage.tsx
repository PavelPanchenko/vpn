import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import { api } from '../lib/api';
import { getApiErrorMessage } from '../lib/apiError';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { Table, Td, Th } from '../components/Table';
import { Badge } from '../components/Badge';
import { CURRENCY_CODES } from '../lib/currencies';
import { formatPrice } from '../lib/formatters';

type Plan = {
  id: string;
  code: string;
  name: string;
  description?: string;
  periodDays: number;
  isTrial: boolean;
  active: boolean;
  legacy: boolean;
  availableFor: 'ALL' | 'NEW_USERS' | 'EXISTING_USERS';
  isTop: boolean;
  variants?: Array<{
    id: string;
    planId: string;
    code: string;
    currency: string;
    price: number;
    provider: string;
    active: boolean;
  }>;
};

type CreatePlanForm = {
  code: string;
  name: string;
  description?: string;
  periodDays: number;
  isTrial: boolean;
  active: boolean;
  legacy?: boolean;
  availableFor?: 'ALL' | 'NEW_USERS' | 'EXISTING_USERS';
  isTop?: boolean;
  variants: Array<{
    code: string;
    currency: string;
    price: number;
    provider?: string;
    active?: boolean;
  }>;
};

type PlanVariant = NonNullable<Plan['variants']>[number];

function defaultVariantCode(planCode: string, currency: string) {
  const c = currency.toUpperCase();
  if (c === 'XTR') return `${planCode}_stars`;
  return `${planCode}_${c.toLowerCase()}`;
}

function formatVariantsPrice(variants: Plan['variants'] | undefined) {
  const v = variants ?? [];
  if (v.length === 0) return '—';
  return v
    .slice()
    .sort((a, b) => a.price - b.price)
    .map((x) => formatPrice(x.price, x.currency))
    .join(' | ');
}

export function PlansPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Plan | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Plan | null>(null);
  const [editVariantTarget, setEditVariantTarget] = useState<PlanVariant | null>(null);
  const [deleteVariantTarget, setDeleteVariantTarget] = useState<PlanVariant | null>(null);
  const [addVariantTarget, setAddVariantTarget] = useState<Plan | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const plansQ = useQuery({
    queryKey: ['plans'],
    queryFn: async () => (await api.get<Plan[]>('/plans')).data,
  });

  const createM = useMutation({
    mutationFn: async (payload: CreatePlanForm) => (await api.post<Plan>('/plans', payload)).data,
    onSuccess: async () => {
      toast.success('Plan created');
      setCreateOpen(false);
      await qc.invalidateQueries({ queryKey: ['plans'] });
    },
    onError: (err: any) => toast.error(getApiErrorMessage(err, 'Failed to create plan')),
  });

  const updateM = useMutation({
    mutationFn: async (payload: { id: string; data: Partial<CreatePlanForm> }) =>
      (await api.patch<Plan>(`/plans/${payload.id}`, payload.data)).data,
    onSuccess: async () => {
      toast.success('Plan updated');
      setEditTarget(null);
      await qc.invalidateQueries({ queryKey: ['plans'] });
    },
    onError: (err: any) => toast.error(getApiErrorMessage(err, 'Failed to update plan')),
  });

  const deleteM = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/plans/${id}`)).data,
    onSuccess: async () => {
      toast.success('Plan deleted');
      setDeleteTarget(null);
      await qc.invalidateQueries({ queryKey: ['plans'] });
    },
    onError: (err: any) => toast.error(getApiErrorMessage(err, 'Failed to delete plan')),
  });

  const plans = useMemo(() => plansQ.data ?? [], [plansQ.data]);

  function toggleExpanded(key: string) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const createVariantM = useMutation({
    mutationFn: async (payload: { planId: string; data: any }) =>
      (await api.post(`/plans/${payload.planId}/variants`, payload.data)).data,
    onSuccess: async () => {
      toast.success('Variant created');
      setAddVariantTarget(null);
      await qc.invalidateQueries({ queryKey: ['plans'] });
    },
    onError: (err: any) => toast.error(getApiErrorMessage(err, 'Failed to create variant')),
  });

  const updateVariantM = useMutation({
    mutationFn: async (payload: { id: string; data: any }) =>
      (await api.patch(`/plans/variants/${payload.id}`, payload.data)).data,
    onSuccess: async () => {
      toast.success('Variant updated');
      setEditVariantTarget(null);
      await qc.invalidateQueries({ queryKey: ['plans'] });
    },
    onError: (err: any) => toast.error(getApiErrorMessage(err, 'Failed to update variant')),
  });

  const deleteVariantM = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/plans/variants/${id}`)).data,
    onSuccess: async () => {
      toast.success('Variant deleted');
      setDeleteVariantTarget(null);
      await qc.invalidateQueries({ queryKey: ['plans'] });
    },
    onError: (err: any) => toast.error(getApiErrorMessage(err, 'Failed to delete variant')),
  });

  const createForm = useForm<CreatePlanForm>({
    defaultValues: {
      code: '',
      name: '',
      description: '',
      periodDays: 30,
      isTrial: false,
      active: true,
      legacy: false,
      availableFor: 'NEW_USERS',
      isTop: false,
      variants: [
        {
          code: '',
          currency: 'RUB',
          price: 0,
          provider: 'EXTERNAL_URL',
          active: true,
        },
      ],
    },
  });

  const editForm = useForm<CreatePlanForm>({
    defaultValues: {
      code: '',
      name: '',
      description: '',
      periodDays: 30,
      isTrial: false,
      active: true,
      legacy: false,
      availableFor: 'ALL',
      isTop: false,
      variants: [],
    },
  });

  const addVariantForm = useForm<{
    code: string;
    currency: string;
    price: number;
    provider?: string;
    active: boolean;
  }>({
    defaultValues: { code: '', currency: 'RUB', price: 0, provider: 'EXTERNAL_URL', active: true },
  });

  const editVariantForm = useForm<{
    code: string;
    currency: string;
    price: number;
    provider?: string;
    active: boolean;
  }>({
    defaultValues: { code: '', currency: 'RUB', price: 0, provider: 'EXTERNAL_URL', active: true },
  });

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Plans"
        description="Тарифные планы для подписок."
        actions={
          <>
            <Button variant="secondary" onClick={() => plansQ.refetch()}>
              Refresh
            </Button>
            <Button
              onClick={() => {
                createForm.reset({
                  code: '',
                  name: '',
                  description: '',
                  periodDays: 30,
                  isTrial: false,
                  active: true,
                  legacy: false,
                  availableFor: 'NEW_USERS',
                  isTop: false,
                  variants: [
                    {
                      code: '',
                      currency: 'RUB',
                      price: 0,
                      provider: 'EXTERNAL_URL',
                      active: true,
                    },
                  ],
                });
                setCreateOpen(true);
              }}
            >
              Add plan
            </Button>
          </>
        }
      />

      {plansQ.isLoading ? (
        <div className="text-sm text-slate-600">Loading…</div>
      ) : (
        <Table
          columns={
            <tr>
              <Th>Code</Th>
              <Th>Name</Th>
              <Th>Period</Th>
              <Th>Price</Th>
              <Th>Status</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          }
        >
          {plans.map((p) => {
            const isOpen = Boolean(expanded[p.id]);
            const variants = p.variants ?? [];
            const anyInactive = variants.some((v) => !v.active);
            const activeLabel = p.active ? (anyInactive ? 'ACTIVE (MIXED VARIANTS)' : 'ACTIVE') : 'INACTIVE';
            const activeVariant = p.active ? (anyInactive ? 'warning' : 'success') : 'warning';

            return (
              <>
                <tr key={p.id} className="border-t border-slate-100">
                  <Td className="font-mono text-xs">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] hover:bg-slate-50"
                        onClick={() => toggleExpanded(p.id)}
                        title={isOpen ? 'Скрыть варианты' : 'Показать варианты'}
                      >
                        {isOpen ? '−' : '+'}
                      </button>
                      <span>{p.code}</span>
                    </div>
                  </Td>
                  <Td className="font-medium">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span>{p.name}</span>
                      {p.isTrial ? <Badge variant="info">Trial</Badge> : null}
                      {p.isTop ? <Badge variant="info">Топ</Badge> : null}
                      {p.legacy ? <Badge variant="warning">Legacy</Badge> : null}
                    </div>
                    {p.description ? <div className="text-xs text-slate-500">{p.description}</div> : null}
                  </Td>
                  <Td>{p.periodDays} дн.</Td>
                  <Td>{formatVariantsPrice(p.variants)}</Td>
                  <Td>
                    <Badge variant={activeVariant as any}>{activeLabel}</Badge>
                  </Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setEditTarget(p as any);
                          editForm.reset({
                            code: p.code,
                            name: p.name,
                            description: p.description ?? '',
                            periodDays: p.periodDays,
                            isTrial: p.isTrial,
                            active: p.active,
                            legacy: p.legacy,
                            availableFor: p.availableFor,
                            isTop: p.isTop,
                            variants: [],
                          });
                        }}
                      >
                        Edit
                      </Button>
                      <Button variant="danger" onClick={() => setDeleteTarget(p as any)}>
                        Delete
                      </Button>
                    </div>
                  </Td>
                </tr>

                {isOpen
                  ? (
                      <>
                        {variants.map((v) => (
                          <tr key={v.id} className="border-t border-slate-100 bg-slate-50/40">
                            <Td className="font-mono text-xs pl-10">{v.code}</Td>
                            <Td className="font-medium">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-slate-900">{v.currency}</span>
                                <Badge variant="info">{v.provider}</Badge>
                              </div>
                            </Td>
                            <Td>{p.periodDays} дн.</Td>
                            <Td>{formatPrice(v.price, v.currency)}</Td>
                            <Td>
                              <Badge variant={v.active ? 'success' : 'warning'}>{v.active ? 'ACTIVE' : 'INACTIVE'}</Badge>
                            </Td>
                            <Td className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="secondary"
                                  onClick={() => {
                                    setEditVariantTarget(v);
                                    editVariantForm.reset({
                                      code: v.code,
                                      currency: v.currency,
                                      price: v.price,
                                      provider: v.provider,
                                      active: v.active,
                                    });
                                  }}
                                >
                                  Edit variant
                                </Button>
                                <Button variant="danger" onClick={() => setDeleteVariantTarget(v)}>
                                  Delete variant
                                </Button>
                              </div>
                            </Td>
                          </tr>
                        ))}

                        <tr className="border-t border-slate-100 bg-slate-50/40">
                          <Td className="pl-10" colSpan={6}>
                            <Button
                              variant="secondary"
                              onClick={() => {
                                setAddVariantTarget(p);
                                addVariantForm.reset({
                                  currency: 'RUB',
                                  price: 0,
                                  code: defaultVariantCode(p.code, 'RUB'),
                                  provider: 'EXTERNAL_URL',
                                  active: true,
                                });
                              }}
                            >
                              Add variant
                            </Button>
                          </Td>
                        </tr>
                      </>
                    )
                  : null}
              </>
            );
          })}

          {plans.length === 0 ? (
            <tr className="border-t border-slate-100">
              <Td className="text-slate-500" colSpan={6}>
                No plans yet
              </Td>
            </tr>
          ) : null}
        </Table>
      )}

      <Modal
        open={createOpen}
        title="Add plan"
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
                const planCode = (v.code ?? '').trim();
                const variants = (v.variants ?? []).map((x) => ({
                  ...x,
                  code: (x.code ?? '').trim() || defaultVariantCode(planCode, x.currency),
                  provider: (x.provider ?? '').trim() || undefined,
                  active: x.active ?? true,
                }));
                const uniqByCurrency = new Set(variants.map((x) => x.currency));
                if (uniqByCurrency.size !== variants.length) {
                  toast.error('Варианты должны быть уникальны по валюте');
                  return;
                }
                createM.mutate({
                  ...v,
                  description: v.description?.trim() || undefined,
                  variants,
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
            label="Code (unique)"
            placeholder="e.g. 1m_99"
            {...createForm.register('code', { required: 'Required', minLength: { value: 2, message: 'Too short' } })}
            error={createForm.formState.errors.code?.message}
          />
          <Input
            label="Name"
            placeholder="e.g. 1 месяц"
            {...createForm.register('name', { required: 'Required', minLength: { value: 2, message: 'Too short' } })}
            error={createForm.formState.errors.name?.message}
          />
          <Input label="Description (optional)" {...createForm.register('description')} />
          <Input
            label="Period days"
            type="number"
            {...createForm.register('periodDays', { valueAsNumber: true, required: 'Required', min: 1, max: 3650 })}
            error={createForm.formState.errors.periodDays?.message}
          />

          <div className="grid gap-2">
            <div className="text-sm font-medium text-slate-700">Variants</div>
            {(createForm.watch('variants') ?? []).map((_, idx) => (
              <div key={idx} className="grid grid-cols-5 gap-3 items-end">
                <Input
                  label="Variant code"
                  placeholder="e.g. 1m_rub / 1m_stars"
                  {...createForm.register(`variants.${idx}.code` as const, { required: 'Required' })}
                />
                <label className="block">
                  <div className="text-sm font-medium text-slate-700">Currency</div>
                  <select
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                    {...createForm.register(`variants.${idx}.currency` as const, { required: 'Required' })}
                  >
                    {CURRENCY_CODES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <Input
                  label="Price"
                  type="number"
                  {...createForm.register(`variants.${idx}.price` as const, { valueAsNumber: true, required: 'Required', min: 0 })}
                />
                <Input label="Provider (optional)" placeholder="EXTERNAL_URL / TELEGRAM_STARS" {...createForm.register(`variants.${idx}.provider` as const)} />
                <label className="flex items-center gap-2 text-sm text-slate-700 pb-2">
                  <input type="checkbox" {...createForm.register(`variants.${idx}.active` as const)} defaultChecked />
                  Active
                </label>

                <div className="col-span-5 flex justify-end">
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => {
                      const cur = createForm.getValues('variants') ?? [];
                      createForm.setValue(
                        'variants',
                        cur.filter((_, i) => i !== idx),
                        { shouldDirty: true },
                      );
                    }}
                    disabled={(createForm.watch('variants') ?? []).length <= 1}
                  >
                    Remove variant
                  </Button>
                </div>
              </div>
            ))}

            <div>
              <Button
                variant="secondary"
                type="button"
                onClick={() => {
                  const cur = createForm.getValues('variants') ?? [];
                  createForm.setValue(
                    'variants',
                    [
                      ...cur,
                      {
                        code: '',
                        currency: 'RUB',
                        price: 0,
                        provider: 'EXTERNAL_URL',
                        active: true,
                      },
                    ],
                    { shouldDirty: true },
                  );
                }}
              >
                Add variant row
              </Button>
            </div>
          </div>
          <label className="block">
            <div className="text-sm font-medium text-slate-700">Available for</div>
            <select
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              {...createForm.register('availableFor', { required: 'Required' })}
            >
              <option value="ALL">All users</option>
              <option value="NEW_USERS">New users only</option>
              <option value="EXISTING_USERS">Existing users only</option>
            </select>
          </label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" {...createForm.register('isTrial')} />
              Is trial
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" {...createForm.register('legacy')} />
              Legacy (for existing users)
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" {...createForm.register('isTop')} />
              Топ тариф (в Mini App)
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" {...createForm.register('active')} defaultChecked />
              Active
            </label>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(editTarget)}
        title="Edit plan"
        onClose={() => setEditTarget(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={updateM.isPending || !editTarget}
              onClick={editForm.handleSubmit((v) => {
                if (!editTarget) return;
                updateM.mutate({
                  id: editTarget.id,
                  data: {
                    name: v.name,
                    description: v.description?.trim() || undefined,
                    periodDays: Number(v.periodDays),
                    isTrial: Boolean(v.isTrial),
                    active: Boolean(v.active),
                    legacy: Boolean(v.legacy),
                    availableFor: v.availableFor,
                    isTop: Boolean(v.isTop),
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
          <Input label="Code" value={editTarget?.code ?? ''} disabled />
          <Input
            label="Name"
            {...editForm.register('name', { required: 'Required', minLength: { value: 2, message: 'Too short' } })}
            error={editForm.formState.errors.name?.message}
          />
          <Input label="Description (optional)" {...editForm.register('description')} />
          <Input
            label="Period days"
            type="number"
            {...editForm.register('periodDays', { valueAsNumber: true, required: 'Required', min: 1, max: 3650 })}
            error={editForm.formState.errors.periodDays?.message}
          />
          <label className="block">
            <div className="text-sm font-medium text-slate-700">Available for</div>
            <select
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              {...editForm.register('availableFor', { required: 'Required' })}
            >
              <option value="ALL">All users</option>
              <option value="NEW_USERS">New users only</option>
              <option value="EXISTING_USERS">Existing users only</option>
            </select>
          </label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" {...editForm.register('isTrial')} />
              Is trial
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" {...editForm.register('legacy')} />
              Legacy (for existing users)
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" {...editForm.register('isTop')} />
              Топ тариф (в Mini App)
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" {...editForm.register('active')} />
              Active
            </label>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(addVariantTarget)}
        title={`Add variant${addVariantTarget ? ` — ${addVariantTarget.name}` : ''}`}
        onClose={() => setAddVariantTarget(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setAddVariantTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={createVariantM.isPending || !addVariantTarget}
              onClick={addVariantForm.handleSubmit((v) => {
                if (!addVariantTarget) return;
                createVariantM.mutate({ planId: addVariantTarget.id, data: v });
              })}
            >
              Create variant
            </Button>
          </div>
        }
      >
        <form className="grid gap-3" onSubmit={(e) => e.preventDefault()}>
          <Input label="Variant code" {...addVariantForm.register('code', { required: 'Required' })} />
          <label className="block">
            <div className="text-sm font-medium text-slate-700">Currency</div>
            <select
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              {...addVariantForm.register('currency', { required: 'Required' })}
            >
              {CURRENCY_CODES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <Input label="Price" type="number" {...addVariantForm.register('price', { valueAsNumber: true, required: 'Required', min: 0 })} />
          <Input label="Provider (optional)" {...addVariantForm.register('provider')} />
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" {...addVariantForm.register('active')} />
            Active
          </label>
        </form>
      </Modal>

      <Modal
        open={Boolean(editVariantTarget)}
        title="Edit variant"
        onClose={() => setEditVariantTarget(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setEditVariantTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={updateVariantM.isPending || !editVariantTarget}
              onClick={editVariantForm.handleSubmit((v) => {
                if (!editVariantTarget) return;
                updateVariantM.mutate({ id: editVariantTarget.id, data: v });
              })}
            >
              Save
            </Button>
          </div>
        }
      >
        <form className="grid gap-3" onSubmit={(e) => e.preventDefault()}>
          <Input label="Variant code" {...editVariantForm.register('code', { required: 'Required' })} />
          <label className="block">
            <div className="text-sm font-medium text-slate-700">Currency</div>
            <select
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              {...editVariantForm.register('currency', { required: 'Required' })}
            >
              {CURRENCY_CODES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <Input label="Price" type="number" {...editVariantForm.register('price', { valueAsNumber: true, required: 'Required', min: 0 })} />
          <Input label="Provider (optional)" {...editVariantForm.register('provider')} />
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" {...editVariantForm.register('active')} />
            Active
          </label>
        </form>
      </Modal>

      <Modal
        open={Boolean(deleteVariantTarget)}
        title="Delete variant"
        onClose={() => setDeleteVariantTarget(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setDeleteVariantTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              type="button"
              disabled={deleteVariantM.isPending || !deleteVariantTarget}
              onClick={() => deleteVariantTarget && deleteVariantM.mutate(deleteVariantTarget.id)}
            >
              Delete
            </Button>
          </div>
        }
      >
        <div className="text-sm text-slate-700">
          Удалить вариант <span className="font-semibold">{deleteVariantTarget?.code}</span>? Это действие нельзя отменить.
        </div>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        title="Delete plan"
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
          Удалить тариф <span className="font-semibold">{deleteTarget?.name}</span>? Это действие нельзя отменить.
        </div>
      </Modal>
    </div>
  );
}
