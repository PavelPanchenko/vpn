import { useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { api } from '../lib/api';
import { toast } from 'react-toastify';

const AUDIENCES = [
  { value: 'ALL', label: 'All users' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'NEW', label: 'New (never connected)' },
  { value: 'BLOCKED', label: 'Blocked' },
  { value: 'EXPIRING_SOON', label: 'Expiring soon (3 days)' },
] as const;

const TEMPLATES = [
  {
    label: '🔄 Expired — renew',
    audience: 'EXPIRED',
    text:
      '👋 Привет!\n\n' +
      'Ваша подписка на <b>FreeRoam VPN</b> истекла.\n\n' +
      '🔓 Продлите сейчас — и получите доступ ко всем серверам без ограничений:\n' +
      '👉 /pay\n\n' +
      'Если возникнут вопросы — /support',
  },
  {
    label: '🆕 New — get started',
    audience: 'NEW',
    text:
      '👋 Привет!\n\n' +
      'Вы зарегистрировались в <b>FreeRoam VPN</b>, но ещё не подключились.\n\n' +
      '🚀 Начните прямо сейчас:\n' +
      '1. Выберите локацию — /start\n' +
      '2. Получите конфиг — /config\n' +
      '3. Импортируйте в приложение и включите VPN\n\n' +
      'Нужна помощь? /help',
  },
  {
    label: '⏰ Expiring — remind',
    audience: 'EXPIRING_SOON',
    text:
      '⏰ Внимание!\n\n' +
      'Ваша подписка на <b>FreeRoam VPN</b> скоро истекает.\n\n' +
      'Продлите заранее, чтобы не потерять доступ:\n' +
      '👉 /pay\n\n' +
      'Спасибо, что с нами! 💙',
  },
  {
    label: '📢 Active — news/promo',
    audience: 'ACTIVE',
    text:
      '👋 Привет!\n\n' +
      '🎉 У нас отличные новости!\n\n' +
      '[Ваш текст здесь]\n\n' +
      'Подробнее: /info\n' +
      'Вопросы: /support',
  },
  {
    label: '🌍 All — announcement',
    audience: 'ALL',
    text:
      '📢 <b>Важное объявление</b>\n\n' +
      '[Ваш текст здесь]\n\n' +
      'По всем вопросам — /support',
  },
] as const;

interface BroadcastResult {
  total: number;
  sent: number;
  failed: number;
  blocked: number;
}

export function BroadcastPage() {
  const [audience, setAudience] = useState('ALL');
  const [message, setMessage] = useState('');
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<BroadcastResult | null>(null);

  const handlePreview = async () => {
    setPreviewLoading(true);
    setPreviewCount(null);
    try {
      const res = await api.post('/broadcast/preview', { audience });
      setPreviewCount(res.data.count);
    } catch {
      toast.error('Failed to load preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSend = async () => {
    setConfirmOpen(false);
    setSending(true);
    setResult(null);
    try {
      const res = await api.post('/broadcast/send', { audience, message });
      setResult(res.data);
      toast.success(`Broadcast sent: ${res.data.sent} delivered`);
    } catch {
      toast.error('Broadcast failed');
    } finally {
      setSending(false);
    }
  };

  const canSend = message.trim().length > 0 && previewCount !== null && previewCount > 0;

  return (
    <div className="space-y-6 px-2 py-4 sm:px-6 sm:py-6">
      <PageHeader title="Broadcast" description="Send a message to a segment of users via Telegram" />

      <Card title="Audience">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Segment</label>
            <select
              value={audience}
              onChange={(e) => {
                setAudience(e.target.value);
                setPreviewCount(null);
                setResult(null);
              }}
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            >
              {AUDIENCES.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="secondary" size="sm" onClick={handlePreview} disabled={previewLoading}>
              {previewLoading ? 'Loading...' : 'Preview recipients'}
            </Button>
            {previewCount !== null && (
              <span className="text-sm text-slate-600">
                <span className="font-semibold text-slate-900">{previewCount}</span> recipients
              </span>
            )}
          </div>
        </div>
      </Card>

      <Card title="Templates">
        <div className="flex flex-wrap gap-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.label}
              type="button"
              onClick={() => {
                setMessage(t.text);
                setAudience(t.audience);
                setPreviewCount(null);
                setResult(null);
              }}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Click a template to load it. You can edit the text before sending.
        </p>
      </Card>

      <Card title="Message">
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-slate-700">Text (HTML supported)</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              placeholder={'Hello!\n\nYour message here...\n\nSupported: <b>bold</b>, <i>italic</i>, <code>code</code>, <a href="...">link</a>'}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            />
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={!canSend || sending}
            >
              {sending ? 'Sending...' : 'Send broadcast'}
            </Button>
            {!message.trim() && (
              <span className="text-xs text-slate-500">Write a message first</span>
            )}
          </div>
        </div>
      </Card>

      {result && (
        <Card title="Result">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Total" value={result.total} />
            <Stat label="Sent" value={result.sent} className="text-green-600" />
            <Stat label="Blocked" value={result.blocked} className="text-amber-600" />
            <Stat label="Failed" value={result.failed} className="text-red-600" />
          </div>
        </Card>
      )}

      <Modal
        open={confirmOpen}
        title="Confirm broadcast"
        onClose={() => setConfirmOpen(false)}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSend}>
              Send to {previewCount ?? 0} users
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-sm text-slate-700">
          <p>
            You are about to send a message to{' '}
            <span className="font-semibold text-slate-900">{previewCount}</span> users in the{' '}
            <span className="font-semibold text-slate-900">
              {AUDIENCES.find((a) => a.value === audience)?.label}
            </span>{' '}
            segment.
          </p>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-medium text-slate-500">Preview</div>
            <div className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">{message}</div>
          </div>
          <p className="text-xs text-slate-500">This action cannot be undone.</p>
        </div>
      </Modal>
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-2xl font-bold ${className ?? 'text-slate-900'}`}>{value}</div>
    </div>
  );
}
