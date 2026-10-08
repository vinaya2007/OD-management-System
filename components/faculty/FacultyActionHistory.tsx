"use client";

import { useEffect, useState } from "react";
import { getFacultyActionHistoryAction, type FacultyHistoryEntry, type FacultyHistoryKind } from "@/app/actions/faculty-history";

export function FacultyActionHistory({ kind }: { kind: FacultyHistoryKind }) {
  const [entries, setEntries] = useState<FacultyHistoryEntry[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void getFacultyActionHistoryAction(kind).then((result) => {
      if (!active) return;
      if (!result.ok) { setError(result.message); return; }
      setEntries(result.data);
      setHasMore(result.data.length === 50);
    }).catch(() => {
      if (active) setError("Could not load your Faculty action history.");
    }).finally(() => {
      if (active) setBusy(false);
    });
    return () => { active = false; };
  }, [kind]);

  async function loadMore() {
    const nextPage = page + 1;
    setLoadingMore(true);
    setError("");
    try {
      const result = await getFacultyActionHistoryAction(kind, nextPage);
      if (!result.ok) { setError(result.message); return; }
      setEntries((current) => [...current, ...result.data]);
      setPage(nextPage);
      setHasMore(result.data.length === 50);
    } catch {
      setError("Could not load more Faculty action history.");
    } finally {
      setLoadingMore(false);
    }
  }

  const isApproved = kind === "approved";
  const heading = isApproved ? "Approved ODs" : "Rejected ODs";
  const empty = isApproved ? "No ODs approved by you yet." : "No ODs rejected by you yet.";

  return <section className="max-w-5xl">
    <h2 className="text-2xl font-bold text-navy">{heading}</h2>
    <p className="mt-1 text-sm text-muted">OD requests where you personally {isApproved ? "approved" : "rejected"} a Faculty review.</p>
    {error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
    {busy ? <p className="mt-5 rounded-lg border border-line bg-white p-6 text-sm text-muted">Loading your action history…</p>
      : entries.length ? <div className="mt-5 space-y-4">{entries.map((entry) => <article key={entry.id} className="rounded-lg border border-line bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-accent">{entry.isSpecial ? "Special OD" : "OD"} {entry.reference}</p><h3 className="mt-1 text-lg font-bold text-navy">{entry.eventName}</h3></div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-ink">{entry.status.replaceAll("_", " ")}</span>
        </div>
        <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <HistoryDetail label="OD Students" value={entry.students.map((student) => `${student.name} · ${student.registerNumber}`).join("; ") || "No student details available"} />
          <HistoryDetail label="Category" value={entry.category} />
          <HistoryDetail label="OD Date" value={formatDate(entry.eventDate)} />
          <HistoryDetail label={isApproved ? "Your approval" : "Your rejection"} value={formatDateTime(entry.actionAt)} />
          <HistoryDetail label="Reason / Purpose" value={entry.reason || "Not available"} />
          {!isApproved && entry.remarks ? <HistoryDetail label="Rejection reason" value={entry.remarks} /> : null}
        </dl>
      </article>)}</div> : <div className="mt-5 rounded-lg border border-line bg-white p-8 text-center shadow-soft"><h3 className="font-semibold text-navy">{empty}</h3></div>}
    {!busy && hasMore ? <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="mt-4 rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold text-accent disabled:opacity-50">{loadingMore ? "Loading…" : "Load more"}</button> : null}
  </section>;
}

function HistoryDetail({ label, value }: { label: string; value: string }) {
  return <div><dt className="font-medium text-muted">{label}</dt><dd className="mt-1 break-words text-ink">{value}</dd></div>;
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", { dateStyle: "medium" });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}
