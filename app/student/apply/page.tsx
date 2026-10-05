"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { useDemo } from "@/components/od/DemoProvider";
import type { ODCategory, Profile } from "@/types/domain";

const categories: ODCategory[] = ["Technical Event", "Non-Technical Event", "Hackathon", "Sports", "College Event", "Internship", "Club Organizer / Coordinator", "Other"];
type Candidate = Pick<Profile, "id" | "name" | "registerNumber" | "section" | "department" | "year">;

export default function ApplyPage() {
  const router = useRouter();
  const { currentUser, profiles, createApplication } = useDemo();
  const faculty = profiles.filter((profile) => profile.role === "faculty" && profile.isActive);
  const [category, setCategory] = useState<ODCategory | "">("");
  const [eventName, setEventName] = useState("");
  const [organization, setOrganization] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [venue, setVenue] = useState("");
  const [purpose, setPurpose] = useState("");
  const [remarks, setRemarks] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Candidate[]>([]);
  const [studentMode, setStudentMode] = useState<"self" | "self_and_others" | "others_only">("self");
  const [startPeriod, setStartPeriod] = useState("1");
  const [endPeriod, setEndPeriod] = useState("1");
  const [facultyIds, setFacultyIds] = useState<string[]>([""]);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const term = query.trim();
    if (!term || term.length < 2) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/students/search?q=${encodeURIComponent(term)}`, { cache: "no-store" });
        const payload = await response.json() as { students?: Candidate[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Student search failed.");
        if (!cancelled) setResults(payload.students ?? []);
      } catch (error) { if (!cancelled) setMessage(error instanceof Error ? error.message : "Student search failed."); }
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query]);

  const self: Candidate = { id: currentUser.id, name: currentUser.name, registerNumber: currentUser.registerNumber, section: currentUser.section, department: currentUser.department, year: currentUser.year };
  const participants = [...(studentMode !== "others_only" ? [self] : []), ...(studentMode !== "self" ? selected : [])].filter((person, index, list) => list.findIndex((entry) => entry.id === person.id) === index);
  function choose(student: Candidate) { setSelected((items) => items.some((item) => item.id === student.id) ? items : [...items, student]); setQuery(""); setResults([]); }
  async function submit() {
    setMessage(""); setSubmitting(true);
    try {
      if (!category) throw new Error("Please select an OD category.");
      if (!eventName.trim() || !eventDate || !startTime || !endTime || !venue.trim()) throw new Error("Complete the event, date, time, and venue fields.");
      if (endTime <= startTime) throw new Error("End time must be after start time.");
      if (!participants.length) throw new Error("Select at least one OD student.");
      if (purpose.trim().length < 5) throw new Error("Enter a purpose of at least 5 characters.");
      const reviewers = facultyIds.filter(Boolean);
      if (reviewers.length < 1 || reviewers.length > 3 || new Set(reviewers).size !== reviewers.length) throw new Error("Select 1 to 3 different faculty members.");
      const result = await createApplication({
        studentIds: participants.map((person) => person.id),
        category, eventType: category, eventName: eventName.trim(), organization: organization.trim(), eventDate,
        startPeriod: Number(startPeriod), endPeriod: Number(endPeriod), startTime, endTime, venue: venue.trim(), purpose: purpose.trim(), requesterRemarks: remarks.trim(), facultyIds: reviewers
      });
      if (!result.ok) setMessage(result.reason);
      else router.push(`/student/applications/${result.id}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to submit the request."); }
    finally { setSubmitting(false); }
  }

  return <AppShell user={currentUser}><div className="max-w-5xl">
    <h2 className="text-2xl font-bold text-navy">Apply for OD</h2>
    <div className="mt-5 grid gap-5">
      <section className="rounded-lg border border-line bg-white p-5 shadow-soft"><h3 className="font-bold text-navy">Students for OD</h3>
        <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-ink"><b>Requester profile</b><p>{currentUser.name} · {currentUser.registerNumber ?? "Register number unavailable"}</p><p>{currentUser.department} · Section {currentUser.section ?? "—"} · Year {currentUser.year ?? "—"}</p><p className="mt-1 text-xs text-muted">These details come from your profile and cannot be edited here.</p></div>
        <fieldset className="mt-4 grid gap-2 text-sm text-ink"><legend className="mb-2 font-semibold">Who is this OD for?</legend><label><input type="radio" name="studentMode" checked={studentMode === "self"} onChange={() => setStudentMode("self")} /> Only myself</label><label><input type="radio" name="studentMode" checked={studentMode === "self_and_others"} onChange={() => setStudentMode("self_and_others")} /> Myself and other students</label><label><input type="radio" name="studentMode" checked={studentMode === "others_only"} onChange={() => setStudentMode("others_only")} /> Other students only</label></fieldset>
        {studentMode !== "self" ? <label className="mt-4 block text-sm font-medium text-muted">Search by name or register number<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search student" className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label> : null}
        {studentMode !== "self" && query.trim().length >= 2 && results.length ? <ul className="mt-2 divide-y rounded-lg border border-line">{results.map((student) => <li key={student.id} className="flex items-center justify-between gap-3 p-3 text-sm"><span>{student.name} · {student.registerNumber} · {student.department} - {student.section} · Year {student.year}</span><button type="button" onClick={() => choose(student)} className="rounded bg-navy px-3 py-1.5 font-semibold text-white">Add</button></li>)}</ul> : null}
        <ul className="mt-3 flex flex-wrap gap-2">{participants.map((student) => <li key={student.id} className="rounded-full bg-slate-100 px-3 py-1.5 text-sm">{student.name} · {student.registerNumber}{student.id !== currentUser.id || studentMode === "others_only" ? <button type="button" aria-label={`Remove ${student.name}`} onClick={() => setSelected((items) => items.filter((item) => item.id !== student.id))} className="ml-2 font-bold text-red-700">×</button> : null}</li>)}</ul>
      </section>
      <section className="rounded-lg border border-line bg-white p-5 shadow-soft"><h3 className="font-bold text-navy">Event Details</h3><div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-muted">OD Category<select required value={category} onChange={(event) => setCategory(event.target.value as ODCategory | "")} className="mt-1 w-full rounded-lg border border-line px-3 py-2"><option value="">Select OD Category</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="text-sm font-medium text-muted">Event Name<input value={eventName} onChange={(event) => setEventName(event.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
        <label className="text-sm font-medium text-muted">Organization<input value={organization} onChange={(event) => setOrganization(event.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
        <label className="text-sm font-medium text-muted">Date<input type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
        <label className="text-sm font-medium text-muted">From Period<select value={startPeriod} onChange={e=>{setStartPeriod(e.target.value);if(Number(e.target.value)>Number(endPeriod))setEndPeriod(e.target.value)}} className="mt-1 w-full rounded-lg border border-line px-3 py-2">{Array.from({length:9},(_,i)=>i+1).map(n=><option key={n} value={n}>Period {n}</option>)}</select></label><label className="text-sm font-medium text-muted">To Period<select value={endPeriod} onChange={e=>setEndPeriod(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2">{Array.from({length:9},(_,i)=>i+1).filter(n=>n>=Number(startPeriod)).map(n=><option key={n} value={n}>Period {n}</option>)}</select></label><label className="text-sm font-medium text-muted">Start time<input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
        <label className="text-sm font-medium text-muted">End time<input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
        <label className="text-sm font-medium text-muted">Venue<input value={venue} onChange={(event) => setVenue(event.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
        <label className="text-sm font-medium text-muted md:col-span-2">Purpose *<textarea required minLength={5} maxLength={2000} value={purpose} onChange={(event) => setPurpose(event.target.value)} className="mt-1 min-h-24 w-full rounded-lg border border-line px-3 py-2" /></label>
        <label className="text-sm font-medium text-muted md:col-span-2">Requester remarks<textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} className="mt-1 min-h-20 w-full rounded-lg border border-line px-3 py-2" /></label>
      </div></section>
      <section className="rounded-lg border border-line bg-white p-5 shadow-soft"><h3 className="font-bold text-navy">Faculty Approval</h3><div className="mt-4 grid gap-4 md:grid-cols-3">{[0,1,2].map((index) => <label key={index} className="text-sm font-medium text-muted">Faculty {index + 1}{index === 0 ? " *" : ""}<select value={facultyIds[index] ?? ""} onChange={(event) => setFacultyIds((items) => items.map((item, i) => i === index ? event.target.value : item))} className="mt-1 w-full rounded-lg border border-line px-3 py-2"><option value="">Select Faculty</option>{faculty.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.designation}</option>)}</select></label>)}</div></section>
      {message ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{message}</div> : null}
      <button disabled={submitting} onClick={submit} className="focus-ring w-fit rounded-lg bg-navy px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{submitting ? "Submitting..." : "Submit OD"}</button>
    </div></div></AppShell>;
}
