"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { useDemo } from "@/components/od/DemoProvider";
import { getLimitState, eligibleFaculty } from "@/lib/od-rules";
import type { ODCategory } from "@/types/domain";

const categories: ODCategory[] = ["Technical Event", "Non-Technical Event", "Hackathon", "Sports", "College Event", "Internship", "Club Organizer / Coordinator", "Other"];

export default function ApplyPage() {
  const router = useRouter();
  const { currentUser, profiles, applications, limits, createApplication } = useDemo();
  const faculty = eligibleFaculty(profiles);
  const [category, setCategory] = useState<ODCategory>("Hackathon");
  const [eventName, setEventName] = useState("XYZ Hackathon");
  const [venueType, setVenueType] = useState<"Our College" | "Other College">("Other College");
  const [collegeName, setCollegeName] = useState("ABC College");
  const [startDate, setStartDate] = useState("2026-09-25");
  const [endDate, setEndDate] = useState("2026-09-25");
  const [fromPeriod, setFromPeriod] = useState(3);
  const [toPeriod, setToPeriod] = useState(7);
  const [purpose, setPurpose] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [facultyIds, setFacultyIds] = useState<string[]>(["fac-1", "fac-2", "fac-3"]);
  const [requestSpecial, setRequestSpecial] = useState(false);
  const [specialReason, setSpecialReason] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const limit = getLimitState(applications, limits, currentUser.id, category);
  const duplicateFaculty = new Set(facultyIds.filter(Boolean)).size !== facultyIds.filter(Boolean).length;

  const dates = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const values: string[] = [];
    for (let date = start; date <= end; date.setDate(date.getDate() + 1)) values.push(date.toISOString().slice(0, 10));
    return values;
  }, [startDate, endDate]);

  function updateFaculty(index: number, value: string) {
    setFacultyIds((items) => {
      const next = [...items];
      next[index] = value;
      return next;
    });
  }

  async function submit() {
    setMessage("");
    setSubmitting(true);
    try {
      if (!eventName.trim()) throw new Error("Event name is required.");
      if (category === "Other" && !purpose.trim()) throw new Error("Specify Purpose is required for Other.");
      if (venueType === "Other College" && !collegeName.trim()) throw new Error("College/Organization name is required.");
      if (fromPeriod > toPeriod) throw new Error("From period must be before To period.");
      const selected = facultyIds.filter(Boolean);
      if (selected.length < 1 || selected.length > 3) throw new Error("Select 1 to 3 faculty members.");
      if (duplicateFaculty) throw new Error("The same faculty cannot be selected more than once.");
      if (limit.exceeded && !requestSpecial) throw new Error("Regular OD limit reached. Request special permission to continue.");
      if (requestSpecial && !specialReason.trim()) throw new Error("Special permission reason is required.");

      const result = await createApplication({
        studentId: currentUser.id,
        category,
        purpose,
        eventName,
        venueType,
        collegeName,
        startDate,
        endDate,
        additionalNotes,
        periods: dates.map((date) => ({ date, fromPeriod, toPeriod })),
        facultyIds: selected,
        specialReason: requestSpecial ? specialReason : undefined
      });
      if (!result.ok) {
        setMessage(`${result.reason} ${result.existingId ? `Edit ${result.existingId} instead.` : ""}`);
      } else {
        router.push(`/student/applications/${result.id}`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell user={currentUser}>
      <div className="max-w-5xl">
        <h2 className="text-2xl font-bold text-navy">Apply for OD</h2>
        <div className="mt-5 grid gap-5">
          <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
            <h3 className="font-bold text-navy">Student Information</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-4">
              {[
                ["Name", currentUser.name],
                ["Register Number", currentUser.registerNumber],
                ["Department", currentUser.department],
                ["Class", `${currentUser.year}-${currentUser.section}`]
              ].map(([label, value]) => (
                <label key={label} className="text-sm font-medium text-muted">{label}<input readOnly value={value ?? ""} className="mt-1 w-full rounded-lg border border-line bg-slate-50 px-3 py-2 text-ink" /></label>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
            <h3 className="font-bold text-navy">OD Duration</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-4">
              <label className="text-sm font-medium text-muted">Start date<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
              <label className="text-sm font-medium text-muted">End date<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
              <label className="text-sm font-medium text-muted">From period<select value={fromPeriod} onChange={(event) => setFromPeriod(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-line px-3 py-2">{[1,2,3,4,5,6,7].map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
              <label className="text-sm font-medium text-muted">To period<select value={toPeriod} onChange={(event) => setToPeriod(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-line px-3 py-2">{[1,2,3,4,5,6,7].map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            </div>
            <p className="mt-3 text-sm text-muted">This creates period rows for each selected date. The database schema supports different ranges per date.</p>
          </section>

          <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
            <h3 className="font-bold text-navy">Event Details</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium text-muted">OD Category<select value={category} onChange={(event) => setCategory(event.target.value as ODCategory)} className="mt-1 w-full rounded-lg border border-line px-3 py-2">{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className="text-sm font-medium text-muted">Event Name<input value={eventName} onChange={(event) => setEventName(event.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
              <label className="text-sm font-medium text-muted">Venue type<select value={venueType} onChange={(event) => setVenueType(event.target.value as "Our College" | "Other College")} className="mt-1 w-full rounded-lg border border-line px-3 py-2"><option>Our College</option><option>Other College</option></select></label>
              {venueType === "Other College" ? <label className="text-sm font-medium text-muted">College/Organization Name<input value={collegeName} onChange={(event) => setCollegeName(event.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label> : null}
              {category === "Other" ? <label className="text-sm font-medium text-muted md:col-span-2">Specify Purpose<input value={purpose} onChange={(event) => setPurpose(event.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label> : null}
              <label className="text-sm font-medium text-muted md:col-span-2">Additional Information<textarea value={additionalNotes} onChange={(event) => setAdditionalNotes(event.target.value)} placeholder="Mention anything important about the event or purpose of the OD..." className="mt-1 min-h-28 w-full rounded-lg border border-line px-3 py-2" /></label>
            </div>
          </section>

          <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
            <h3 className="font-bold text-navy">Faculty Approval</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {[0, 1, 2].map((index) => (
                <label key={index} className="text-sm font-medium text-muted">Faculty {index + 1}{index === 0 ? " *" : ""}
                  <select value={facultyIds[index] ?? ""} onChange={(event) => updateFaculty(index, event.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2">
                    <option value="">Select Faculty</option>
                    {faculty.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.designation}</option>)}
                  </select>
                </label>
              ))}
            </div>
            {duplicateFaculty ? <p className="mt-3 text-sm font-semibold text-red-700">Duplicate faculty selection is not allowed.</p> : null}
          </section>

          {limit.exceeded ? (
            <section className="rounded-lg border border-purple-200 bg-purple-50 p-5">
              <p className="font-semibold text-purple-800">Regular OD limit reached.</p>
              <p className="mt-1 text-sm text-purple-800">You have used {limit.used}/{limit.allowed} ODs for this category. If this OD is necessary, request Special Permission.</p>
              <label className="mt-4 flex items-center gap-2 text-sm font-semibold text-purple-900"><input type="checkbox" checked={requestSpecial} onChange={(event) => setRequestSpecial(event.target.checked)} /> Request Special Permission</label>
              {requestSpecial ? <textarea value={specialReason} onChange={(event) => setSpecialReason(event.target.value)} placeholder="Reason special permission is required" className="mt-3 min-h-24 w-full rounded-lg border border-purple-200 px-3 py-2" /> : null}
            </section>
          ) : null}

          {message ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{message}</div> : null}
          <div className="flex flex-wrap gap-3">
            <button disabled={submitting} onClick={submit} className="focus-ring rounded-lg bg-navy px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">{submitting ? "Submitting..." : "Submit OD"}</button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
