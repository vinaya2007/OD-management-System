"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, LogOut, Menu } from "lucide-react";
import { useState } from "react";
import { useDemo } from "@/components/od/DemoProvider";
import type { Profile, Role } from "@/types/domain";

const nav: Record<Role, { label: string; href: string }[]> = {
  student: [
    { label: "Dashboard", href: "/student/dashboard" },
    { label: "Apply for OD", href: "/student/apply" },
    { label: "My Applications", href: "/student/applications" },
    { label: "OD Limits", href: "/student/limits" },
    { label: "Special Permission", href: "/student/special-permission" },
    { label: "Profile", href: "/student/profile" },
    { label: "Notifications", href: "/student/notifications" }
  ],
  faculty: [
    { label: "Dashboard", href: "/faculty/dashboard" },
    { label: "Pending Approvals", href: "/faculty/approvals" },
    { label: "Approved ODs", href: "/faculty/approved" },
    { label: "Rejected ODs", href: "/faculty/rejected" },
    { label: "Consolidated OD", href: "/faculty/consolidated" },
    { label: "Notifications", href: "/faculty/notifications" },
    { label: "Profile", href: "/faculty/profile" }
  ],
  hod: [
    { label: "Dashboard", href: "/hod/dashboard" },
    { label: "Pending Approvals", href: "/hod/approvals" },
    { label: "All ODs", href: "/hod/all" },
    { label: "Special ODs", href: "/hod/special" },
    { label: "Consolidated OD", href: "/hod/consolidated" },
    { label: "Reports", href: "/hod/reports" },
    { label: "Profile", href: "/hod/profile" }
  ],
  admin: [
    { label: "Dashboard", href: "/admin/dashboard" },
    { label: "Users", href: "/admin/users" },
    { label: "Students", href: "/admin/students" },
    { label: "Faculty", href: "/admin/faculty" },
    { label: "HODs", href: "/admin/hods" },
    { label: "Departments", href: "/admin/departments" },
    { label: "OD Limits", href: "/admin/limits" },
    { label: "Settings", href: "/admin/settings" }
  ]
};

export function AppShell({ user, children }: { user: Profile; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { notifications, markNotificationsRead, isLive } = useDemo();
  const [open, setOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationError, setNotificationError] = useState("");
  const unreadCount = notifications.filter((item) => !item.isRead).length;

  async function logout() {
    localStorage.removeItem("demoRole");
    if (isLive) await fetch("/auth/signout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  async function markRead(id?: string) {
    setNotificationError("");
    try { await markNotificationsRead(id); } catch { setNotificationError("Could not update notifications."); }
  }

  return (
    <div className="min-h-screen bg-canvas lg:flex">
      <aside className={`${open ? "block" : "hidden"} fixed inset-y-0 left-0 z-40 w-72 border-r border-line bg-white p-5 lg:block`}>
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">ECE Department</p>
          <h1 className="mt-1 text-xl font-bold text-navy">OD Management</h1>
        </div>
        <nav className="space-y-1">
          {nav[user.role].map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-lg px-3 py-2 text-sm font-medium ${active ? "bg-navy text-white" : "text-slate-700 hover:bg-slate-100"}`}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <button onClick={logout} className="focus-ring mt-8 flex w-full items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-slate-700">
          <LogOut size={16} /> Logout
        </button>
      </aside>

      {open ? <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-black/20 lg:hidden" onClick={() => setOpen(false)} /> : null}

      <main className="min-w-0 flex-1 lg:pl-72">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-white/95 px-4 py-3 backdrop-blur lg:px-8">
          <div className="flex items-center gap-3">
            <button className="focus-ring rounded-lg border border-line p-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation">
              <Menu size={18} />
            </button>
            <div>
              <p className="text-sm font-semibold text-navy">{user.name}</p>
              <p className="text-xs text-muted">{user.designation ?? [user.registerNumber, user.year && `${user.year}-${user.section}`].filter(Boolean).join(" · ")}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase text-accent">{user.role}</span>
            <div className="relative">
              <button aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`} aria-expanded={showNotifications} onClick={() => setShowNotifications((value) => !value)} className="focus-ring relative rounded-lg p-2 text-slate-600 hover:bg-slate-100">
                <Bell size={18} />
                {unreadCount > 0 ? <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] font-bold text-white">{unreadCount}</span> : null}
              </button>
              {showNotifications ? <section aria-label="Notifications" className="absolute right-0 z-30 mt-2 max-h-96 w-80 overflow-y-auto rounded-lg border border-line bg-white p-3 shadow-soft sm:w-96">
                <div className="flex items-center justify-between gap-2"><h2 className="font-semibold text-navy">Notifications</h2><button onClick={() => markRead()} disabled={!unreadCount} className="text-xs font-semibold text-accent disabled:opacity-50">Mark all read</button></div>
                {notificationError ? <p role="alert" className="mt-2 text-xs text-red-700">{notificationError}</p> : null}
                {notifications.length ? <ul className="mt-2 divide-y divide-line">{notifications.map((item) => <li key={item.id} className="py-2"><button onClick={() => !item.isRead && markRead(item.id)} className="w-full text-left"><span className="flex items-start gap-2"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.isRead ? "bg-slate-200" : "bg-accent"}`} /><span><span className="block text-sm font-semibold text-navy">{item.title}</span><span className="block text-xs text-muted">{item.message}</span></span></span></button></li>)}</ul> : <p className="py-6 text-center text-sm text-muted">No notifications.</p>}
              </section> : null}
            </div>
          </div>
        </header>
        <div className="px-4 py-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
