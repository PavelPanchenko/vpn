import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import { api } from '../lib/api';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { Table, Td, Th } from '../components/Table';
import { Badge } from '../components/Badge';

type Plan = {
  id: string;
  code: string;
  name: string;
  description?: string;
  periodDays: number;
  price: number;
  currency: string;
  isTrial: boolean;
  active: boolean;
  legacy: boolean;
  availableFor: 'ALL' | 'NEW_USERS' | 'EXISTING_USERS';
};

type CreatePlanForm = {
  code: string;
  name: string;
  description?: string;
  periodDays: number;
  price: number;
  currency: string;
  isTrial: boolean;
  active: boolean;
  legacy?: boolean;
  availableFor?: 'ALL' | 'NEW_USERS' | 'EXISTING_USERS';
};

export function PlansPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Plan | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Plan | null>(null);

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
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Failed to create plan'),
  });

  const updateM = useMutation({
    mutationFn: async (payload: { id: string; data: Partial<CreatePlanForm> }) =>
      (await api.patch<Plan>(`/plans/${payload.id}`, payload.data)).data,
    onSuccess: async () => {
      toast.success('Plan updated');
      setEditTarget(null);
      await qc.invalidateQueries({ queryKey: ['plans'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Failed to update plan'),
  });

  const deleteM = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/plans/${id}`)).data,
    onSuccess: async () => {
      toast.success('Plan deleted');
      setDeleteTarget(null);
      await qc.invalidateQueries({ queryKey: ['plans'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Failed to delete plan'),
  });

  const plans = useMemo(() => plansQ.data ?? [], [plansQ.data]);

  const createForm = useForm<CreatePlanForm>({
    defaultValues: {
      code: '',
      name: '',
      description: '',
      periodDays: 30,
      price: 0,
      currency: 'RUB',
      isTrial: false,
      active: true,
      legacy: false,
      availableFor: 'NEW_USERS',
    },
  });

  const editForm = useForm<CreatePlanForm>({
    defaultValues: {
      code: '',
      name: '',
      description: '',
      periodDays: 30,
      price: 0,
      currency: 'RUB',
      isTrial: false,
      active: true,
      legacy: false,
      availableFor: 'ALL',
    },
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
                  price: 0,
                  currency: 'RUB',
                  isTrial: false,
                  active: true,
                  legacy: false,
                  availableFor: 'NEW_USERS',
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
          {plans.map((p) => (
            <tr key={p.id} className="border-t border-slate-100">
              <Td className="font-mono text-xs">{p.code}</Td>
              <Td className="font-medium">
                <div>{p.name}</div>
                {p.description ? <div className="text-xs text-slate-500">{p.description}</div> : null}
              </Td>
              <Td>{p.periodDays} дн.</Td>
              <Td>
                {p.price} {p.currency}
                {p.isTrial ? <Badge variant="info" className="ml-2">Trial</Badge> : null}
              </Td>
              <Td>
                <div className="space-y-1">
                  <Badge variant={p.active ? 'success' : 'warning'}>{p.active ? 'ACTIVE' : 'INACTIVE'}</Badge>
                  {p.legacy && <Badge variant="warning" className="ml-1">Legacy</Badge>}
                  <div className="text-xs text-slate-500">
                    {p.availableFor === 'ALL' ? 'All users' : p.availableFor === 'NEW_USERS' ? 'New users' : 'Existing users'}
                  </div>
                </div>
              </Td>
              <Td className="text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setEditTarget(p);
                      editForm.reset({
                        code: p.code,
                        name: p.name,
                        description: p.description ?? '',
                        periodDays: p.periodDays,
                        price: p.price,
                        currency: p.currency,
                        isTrial: p.isTrial,
                        active: p.active,
                        legacy: p.legacy,
                        availableFor: p.availableFor,
                      });
                    }}
                  >
                    Edit
                  </Button>
                  <Button variant="danger" onClick={() => setDeleteTarget(p)}>
                    Delete
                  </Button>
                </div>
              </Td>
            </tr>
          ))}
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
                createM.mutate({
                  ...v,
                  description: v.description?.trim() || undefined,
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
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Period days"
              type="number"
              {...createForm.register('periodDays', { valueAsNumber: true, required: 'Required', min: 1, max: 3650 })}
              error={createForm.formState.errors.periodDays?.message}
            />
            <Input
              label="Price"
              type="number"
              {...createForm.register('price', { valueAsNumber: true, required: 'Required', min: 0 })}
              error={createForm.formState.errors.price?.message}
            />
          </div>
          <label className="block">
            <div className="text-sm font-medium text-slate-700">Currency</div>
            <select
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              {...createForm.register('currency', { required: 'Required' })}
            >
              <option value="RUB">RUB</option>
              <option value="USD">USD</option>
            </select>
          </label>
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
                    price: Number(v.price),
                    currency: v.currency,
                    isTrial: Boolean(v.isTrial),
                    active: Boolean(v.active),
                    legacy: Boolean(v.legacy),
                    availableFor: v.availableFor,
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
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Period days"
              type="number"
              {...editForm.register('periodDays', { valueAsNumber: true, required: 'Required', min: 1, max: 3650 })}
              error={editForm.formState.errors.periodDays?.message}
            />
            <Input
              label="Price"
              type="number"
              {...editForm.register('price', { valueAsNumber: true, required: 'Required', min: 0 })}
              error={editForm.formState.errors.price?.message}
            />
          </div>
          <label className="block">
            <div className="text-sm font-medium text-slate-700">Currency</div>
            <select
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              {...editForm.register('currency', { required: 'Required' })}
            >
              <option value="RUB">RUB</option>
              <option value="USD">USD</option>
            </select>
          </label>
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
              <input type="checkbox" {...editForm.register('active')} />
              Active
            </label>
          </div>
        </form>
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
