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

type BotConfig = {
  id: string;
  active: boolean;
  useMiniApp: boolean;
  createdAt: string;
  updatedAt: string;
};

type CreateBotConfigForm = {
  token: string;
  active: boolean;
  useMiniApp: boolean;
};

type UpdateBotConfigForm = {
  token?: string;
  active?: boolean;
  useMiniApp?: boolean;
};

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
                <div className="text-xs text-slate-500">Created: {new Date(config.createdAt).toLocaleString()}</div>
                <div className="text-xs text-slate-500">Updated: {new Date(config.updatedAt).toLocaleString()}</div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                <Button
                  variant="secondary"
                  className="w-full sm:w-auto"
                  onClick={() => {
                    editForm.reset({ active: config.active, useMiniApp: config.useMiniApp });
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
