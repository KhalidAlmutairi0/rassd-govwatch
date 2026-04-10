"use client";

import { useEffect, useState } from "react";
import { Bell, CheckCheck, AlertCircle, CheckCircle2, Info, FileText } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Notification {
  id: string;
  title: string;
  body: string;
  type: string;
  read: boolean;
  createdAt: string;
}

function NotifIcon({ type }: { type: string }) {
  if (type === "incident") return <AlertCircle className="w-5 h-5 text-red-500" />;
  if (type === "recovery") return <CheckCircle2 className="w-5 h-5 text-green-500" />;
  if (type === "report") return <FileText className="w-5 h-5 text-[#2D2770]" />;
  return <Info className="w-5 h-5 text-gray-400" />;
}

export default function GovNotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = async () => {
    try {
      const res = await fetch("/api/notifications");
      const data = await res.json();
      setNotifications(data.notifications ?? []);
    } catch {}
    setLoading(false);
  };

  const markAllRead = async () => {
    await fetch("/api/notifications", { method: "PATCH" });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  useEffect(() => { fetchNotifications(); }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Bell className="w-6 h-6 text-[#2D2770]" />
            Notifications
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <CheckCheck className="w-4 h-4" /> Mark all read
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-16">
          <Bell className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400">No notifications yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`flex items-start gap-4 p-4 rounded-xl border transition-colors ${
                n.read ? "bg-white border-gray-100" : "bg-[#2D2770]/4 border-[#2D2770]/15"
              }`}
            >
              <div className="mt-0.5 shrink-0">
                <NotifIcon type={n.type} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className={`text-sm font-semibold ${n.read ? "text-gray-700" : "text-gray-900"}`}>
                    {n.title}
                    {!n.read && (
                      <span className="ml-2 inline-block w-1.5 h-1.5 bg-[#2D2770] rounded-full align-middle" />
                    )}
                  </p>
                  <span className="text-xs text-gray-400 shrink-0">
                    {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-0.5">{n.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
