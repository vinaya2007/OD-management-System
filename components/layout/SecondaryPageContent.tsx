"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { FacultyActionHistory } from "@/components/faculty/FacultyActionHistory";
import { HodSecondarySection } from "@/components/hod/HodSecondarySection";
import { SpecialODQueue } from "@/components/od/SpecialODQueue";
import { useDemo } from "@/components/od/DemoProvider";

export function SecondaryPageContent({ section }: { section: string }) {
  const { currentUser, notifications, markNotificationsRead } = useDemo();
  const [notificationError, setNotificationError] = useState("");
  const [marking, setMarking] = useState(false);
  const title = section.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
  const isStudentSection = currentUser.role === "student" && (section === "profile" || section === "notifications");
  const isFacultySection = currentUser.role === "faculty" && ["approved", "rejected", "special", "profile", "notifications"].includes(section);
  const isHodProfile = currentUser.role === "hod" && section === "profile";
  const isHodDataSection = currentUser.role === "hod" && ["all", "special", "reports"].includes(section);

  async function markRead(notificationId?: string) {
    setNotificationError("");
    setMarking(true);
    try {
      await markNotificationsRead(notificationId);
    } catch (error) {
      setNotificationError(error instanceof Error ? error.message : "Could not update notifications.");
    } finally {
      setMarking(false);
    }
  }

  return (
    <AppShell user={currentUser}>
      {isStudentSection && section === "profile" ? <section className="max-w-3xl rounded-lg border border-line bg-white p-6 shadow-soft">
        <h2 className="text-2xl font-bold text-navy">Profile</h2>
        <p className="mt-1 text-sm text-muted">Your account information from your authenticated college profile.</p>
        <dl className="mt-6 divide-y divide-line">
          <ProfileDetail label="Full Name" value={currentUser.name} />
          <ProfileDetail label="Register Number" value={currentUser.registerNumber} />
          <ProfileDetail label="Department" value={currentUser.departmentName ?? currentUser.department} />
          <ProfileDetail label="Section" value={currentUser.section} />
          <ProfileDetail label="Year" value={currentUser.year} />
          <ProfileDetail label="College Email" value={currentUser.email} />
          <ProfileDetail label="Role" value={`${currentUser.role.charAt(0).toUpperCase()}${currentUser.role.slice(1)}`} />
          <ProfileDetail label="Account Status" value={currentUser.isActive ? "Active" : "Inactive"} />
        </dl>
      </section> : null}

      {isFacultySection && section === "approved" ? <FacultyActionHistory kind="approved" /> : null}
      {isFacultySection && section === "rejected" ? <FacultyActionHistory kind="rejected" /> : null}
      {isFacultySection && section === "special" ? <SpecialODQueue role="faculty" /> : null}

      {isFacultySection && section === "profile" ? <section className="max-w-3xl rounded-lg border border-line bg-white p-6 shadow-soft">
        <h2 className="text-2xl font-bold text-navy">Profile</h2>
        <p className="mt-1 text-sm text-muted">Your account information from your authenticated college profile.</p>
        <dl className="mt-6 divide-y divide-line">
          <ProfileDetail label="Full Name" value={currentUser.name} />
          <ProfileDetail label="Faculty ID" value={currentUser.registerNumber} />
          <ProfileDetail label="Department" value={currentUser.departmentName ?? currentUser.department} />
          <ProfileDetail label="College Email" value={currentUser.email} />
          <ProfileDetail label="Role" value={`${currentUser.role.charAt(0).toUpperCase()}${currentUser.role.slice(1)}`} />
          <ProfileDetail label="Account Status" value={currentUser.isActive ? "Active" : "Inactive"} />
        </dl>
      </section> : null}

      {isHodProfile ? <section className="max-w-3xl rounded-lg border border-line bg-white p-6 shadow-soft">
        <h2 className="text-2xl font-bold text-navy">Profile</h2>
        <p className="mt-1 text-sm text-muted">Your information from the authenticated HOD profile.</p>
        <dl className="mt-6 divide-y divide-line">
          <ProfileDetail label="Full Name" value={currentUser.name} />
          <ProfileDetail label="Faculty / HOD ID" value={currentUser.registerNumber} />
          <ProfileDetail label="Department" value={currentUser.departmentName ?? currentUser.department} />
          <ProfileDetail label="College Email" value={currentUser.email} />
          <ProfileDetail label="Role" value="HOD" />
          <ProfileDetail label="Account Status" value={currentUser.isActive ? "Active" : "Inactive"} />
        </dl>
      </section> : null}

      {isHodDataSection && section === "special" ? <SpecialODQueue role="hod" /> : null}
      {isHodDataSection && section !== "special" ? <HodSecondarySection section={section as "all" | "reports"} /> : null}

      {(isStudentSection || isFacultySection) && section === "notifications" ? <section className="max-w-4xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-2xl font-bold text-navy">Notifications</h2><p className="mt-1 text-sm text-muted">OD updates and account notifications.</p></div>
          <button type="button" onClick={() => void markRead()} disabled={marking || notifications.every((item) => item.isRead)} className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-accent disabled:opacity-50">Mark all read</button>
        </div>
        {notificationError ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{notificationError}</p> : null}
        {notifications.length ? <ul className="mt-5 space-y-3">{notifications.map((item) => <li key={item.id} className="rounded-lg border border-line bg-white p-4 shadow-soft">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 gap-3">
              <span aria-label={item.isRead ? "Read" : "Unread"} className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${item.isRead ? "bg-slate-300" : "bg-accent"}`} />
              <div><h3 className="font-semibold text-navy">{item.title}</h3><p className="mt-1 text-sm leading-6 text-ink">{item.message}</p><p className="mt-2 text-xs text-muted">{item.type} · {new Date(item.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p></div>
            </div>
            {item.isRead ? <span className="shrink-0 text-xs text-muted">Read</span> : <button type="button" onClick={() => void markRead(item.id)} disabled={marking} className="shrink-0 text-xs font-semibold text-accent disabled:opacity-50">Mark read</button>}
          </div>
        </li>)}</ul> : <div className="mt-5 rounded-lg border border-line bg-white p-8 text-center shadow-soft"><h3 className="font-semibold text-navy">No notifications yet.</h3><p className="mt-1 text-sm text-muted">You&apos;ll see OD updates and other important notifications here.</p></div>}
      </section> : null}

      {!isStudentSection && !isFacultySection && !isHodProfile && !isHodDataSection ? <div className="rounded-lg border border-line bg-white p-8 shadow-soft">
        <h2 className="text-2xl font-bold text-navy">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          This management screen is reserved in the navigation and route structure. Connect it to Supabase records and college-specific policy once the deployment profile, official users, and administration permissions are finalized.
        </p>
      </div> : null}
    </AppShell>
  );
}

function ProfileDetail({ label, value }: { label: string; value?: string | null }) {
  return <div className="grid gap-1 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4"><dt className="text-sm font-medium text-muted">{label}</dt><dd className="break-words text-sm font-semibold text-navy">{value || "Not available"}</dd></div>;
}
