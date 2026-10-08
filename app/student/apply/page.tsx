"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { useDemo } from "@/components/od/DemoProvider";
import type { ODCategory } from "@/types/domain";
import { getSpecialODEligibilityAction, type SpecialEligibility } from "@/app/actions/special-od";

const categories: ODCategory[] = ["Non-Technical", "Technical", "Club Organizer / Volunteer"];

export default function ApplyPage() {
  const router = useRouter();
  const { currentUser, profiles, createApplication, createSpecialApplication } = useDemo();
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
  const [startPeriod, setStartPeriod] = useState("1");
  const [endPeriod, setEndPeriod] = useState("1");
  const [facultyIds, setFacultyIds] = useState<string[]>([""]);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [specialEligibility, setSpecialEligibility] = useState<SpecialEligibility | null>(null);
  const [eligibilityCategory, setEligibilityCategory] = useState<ODCategory | "">("");
  const [eligibilityError, setEligibilityError] = useState("");

  useEffect(() => {
    let active = true;
    if (!category) return () => { active = false; };
    void getSpecialODEligibilityAction(category).then((result) => {
      if (!active) return;
      setEligibilityCategory(category);
      if (result.ok) { setSpecialEligibility(result.data); setEligibilityError(""); } else { setSpecialEligibility(null); setEligibilityError(result.message); }
    });
    return () => { active = false; };
  }, [category]);

  async function submit() {
    setMessage(""); setSubmitting(true);
    try {
      if (!category) throw new Error("Please select an OD category.");
      if (!eventName.trim() || !eventDate || !startTime || !endTime || !venue.trim()) throw new Error("Complete the event, date, time, and venue fields.");
      if (endTime <= startTime) throw new Error("End time must be after start time.");
      if (purpose.trim().length < 5) throw new Error("Enter a purpose of at least 5 characters.");
      const reviewers = facultyIds.filter(Boolean);
      if (reviewers.length < 1 || reviewers.length > 3 || new Set(reviewers).size !== reviewers.length) throw new Error("Select 1 to 3 different faculty members.");
      const input = {
        category, eventType: category, eventName: eventName.trim(), organization: organization.trim(), eventDate,
        startPeriod: Number(startPeriod), endPeriod: Number(endPeriod), startTime, endTime, venue: venue.trim(), purpose: purpose.trim(), requesterRemarks: remarks.trim(), facultyIds: reviewers
      };
      const result = eligibilityCategory === category && specialEligibility?.eligible ? await createSpecialApplication(input) : await createApplication(input);
      if (!result.ok) setMessage(result.reason);
      else router.push(`/student/applications/${result.id}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to submit the request."); }
    finally { setSubmitting(false); }
  }

  return <AppShell user={currentUser}><div className="max-w-5xl">
    <h2 className="text-2xl font-bold text-navy">Apply for OD</h2>
    <div className="mt-5 grid gap-5">
      <section className="rounded-lg border border-line bg-white p-5 shadow-soft"><h3 className="font-bold text-navy">Student</h3>
        <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-ink"><b>Requester profile</b><p>{currentUser.name} · {currentUser.registerNumber ?? "Register number unavailable"}</p><p>{currentUser.department} · Section {currentUser.section ?? "—"} · Year {currentUser.year ?? "—"}</p><p className="mt-1 text-xs text-muted">These details come from your profile and cannot be edited here.</p></div>
      </section>
      <section className="rounded-lg border border-line bg-white p-5 shadow-soft"><h3 className="font-bold text-navy">Event Details</h3><div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-muted">OD Application Category<select required value={category} onChange={(event) => setCategory(event.target.value as ODCategory | "")} className="mt-1 w-full rounded-lg border border-line px-3 py-2"><option value="">Select Category</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
        {category ? <div role={eligibilityError ? "alert" : "status"} className={`rounded-lg p-3 text-sm md:col-span-2 ${eligibilityCategory === category && specialEligibility?.eligible ? "bg-purple-50 text-purple-900" : "bg-slate-50 text-muted"}`}>
          {eligibilityError || eligibilityCategory !== category || !specialEligibility ? "Checking your category limit…" : specialEligibility.eligible
            ? `${specialEligibility.used} / ${specialEligibility.limit} approved ${category} ODs used. You have reached the limit; this submission will be marked Special OD and require Faculty then HOD approval.`
            : `${specialEligibility.used} / ${specialEligibility.limit} approved ${category} ODs used. This will be submitted as a regular OD.`}
        </div> : null}
        <label className="text-sm font-medium text-muted">Event Name<input value={eventName} onChange={(event) => setEventName(event.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
        <label className="text-sm font-medium text-muted">Organization<input value={organization} onChange={(event) => setOrganization(event.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
        <label className="text-sm font-medium text-muted">Date<input type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
        <label className="text-sm font-medium text-muted">From Period<select value={startPeriod} onChange={e=>{setStartPeriod(e.target.value);if(Number(e.target.value)>Number(endPeriod))setEndPeriod(e.target.value)}} className="mt-1 w-full rounded-lg border border-line px-3 py-2">{Array.from({length:9},(_,i)=>i+1).map(n=><option key={n} value={n}>Period {n}</option>)}</select></label><label className="text-sm font-medium text-muted">To Period<select value={endPeriod} onChange={e=>setEndPeriod(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2">{Array.from({length:9},(_,i)=>i+1).filter(n=>n>=Number(startPeriod)).map(n=><option key={n} value={n}>Period {n}</option>)}</select></label><label className="text-sm font-medium text-muted">Start time<input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
        <label className="text-sm font-medium text-muted">End time<input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
        <label className="text-sm font-medium text-muted">Venue<input value={venue} onChange={(event) => setVenue(event.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
        <label className="text-sm font-medium text-muted md:col-span-2">Purpose *<textarea required minLength={5} maxLength={2000} value={purpose} onChange={(event) => setPurpose(event.target.value)} className="mt-1 min-h-24 w-full rounded-lg border border-line px-3 py-2" /></label>
        <label className="text-sm font-medium text-muted md:col-span-2">Requester remarks<textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} className="mt-1 min-h-20 w-full rounded-lg border border-line px-3 py-2" /></label>
      </div></section>
      <section className="rounded-lg border border-line bg-white p-5 shadow-soft"><h3 className="font-bold text-navy">Faculty Approval</h3><div className="mt-4 grid gap-4 md:grid-cols-3">{[0,1,2].map((index) => <label key={index} className="text-sm font-medium text-muted">Faculty {index + 1}{index === 0 ? " *" : ""}<select value={facultyIds[index] ?? ""} onChange={(event) => setFacultyIds((items) => items.map((item, i) => i === index ? event.target.value : item))} className="mt-1 w-full rounded-lg border border-line px-3 py-2"><option value="">Select Faculty</option>{faculty.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.designation}</option>)}</select></label>)}</div>{category === "Club Organizer / Volunteer" ? <p className="mt-3 text-sm font-medium text-red-700">For Club Organizer / Volunteer ODs, apply to your Class In-Charge and Club Faculty Coordinator.</p> : null}</section>
      {message ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{message}</div> : null}
      <button disabled={submitting || Boolean(category && (eligibilityCategory !== category || !specialEligibility || eligibilityError))} onClick={submit} className="focus-ring w-fit rounded-lg bg-navy px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{submitting ? "Submitting..." : eligibilityCategory === category && specialEligibility?.eligible ? "Submit Special OD" : "Submit OD"}</button>
    </div></div></AppShell>;
}
