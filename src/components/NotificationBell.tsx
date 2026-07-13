import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCheck } from 'lucide-react';

/**
 * Notification center with a toolbar bell, unread badge, and dropdown.
 * Backend contract (Codex):
 *   GET  /api/notifications                 -> [{ id, title, body?, createdAt, read, link? }]
 *   POST /api/notifications/:id/read        -> mark one notification as read
 *   POST /api/notifications/read-all        -> mark all notifications as read
 * Falls back to an empty list when the backend is unavailable.
 */
const API_BASE =
  import.meta.env.VITE_API_BASE ||
  `${import.meta.env.BASE_URL}api`.replace(/\/{2,}/g, '/');

interface Notice {
  id: string;
  title: string;
  body?: string;
  createdAt?: string;
  read?: boolean;
  link?: string;
}

export default function NotificationBell() {
  const nav = useNavigate();
  const [list, setList] = useState<Notice[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const load = () => {
    fetch(`${API_BASE}/notifications`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => Array.isArray(d) && setList(d))
      .catch(() => {});
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 60000); // Lightweight refresh every minute.
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const unread = list.filter((n) => !n.read).length;

  const post = (path: string) =>
    fetch(`${API_BASE}${path}`, { method: 'POST', credentials: 'same-origin' }).catch(() => {});

  const openItem = async (n: Notice) => {
    if (!n.read) {
      setList((l) => l.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      post(`/notifications/${n.id}/read`);
    }
    if (n.link) {
      setOpen(false);
      nav(n.link);
    }
  };
  const readAll = () => {
    setList((l) => l.map((x) => ({ ...x, read: true })));
    post('/notifications/read-all');
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl2 border border-white/10 bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white"
      >
        <Bell size={15} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-40 w-80 max-w-[92vw] overflow-hidden rounded-xl2 border border-white/12 bg-[#0a0c10] shadow-[0_18px_50px_rgba(0,0,0,0.6)]">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
            <span className="text-sm font-semibold text-white">Notifications</span>
            {unread > 0 && (
              <button onClick={readAll} className="inline-flex items-center gap-1 text-xs text-cyan-200 hover:text-white">
                <CheckCheck size={13} /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {list.length === 0 ? (
              <div className="py-10 text-center text-sm text-white/30">No notifications</div>
            ) : (
              list.map((n) => (
                <button
                  key={n.id}
                  onClick={() => openItem(n)}
                  className={`flex w-full items-start gap-2.5 border-b border-white/[0.06] px-4 py-3 text-left transition hover:bg-white/[0.04] ${n.read ? '' : 'bg-cyan-300/[0.04]'}`}
                >
                  <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-cyan-400'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-white/90">{n.title}</div>
                    {n.body && <div className="mt-0.5 text-xs text-white/50">{n.body}</div>}
                    {n.createdAt && <div className="mt-1 text-[11px] text-white/30">{new Date(n.createdAt).toLocaleString('en-US')}</div>}
                  </div>
                  {n.read && <Check size={13} className="mt-0.5 shrink-0 text-white/20" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
