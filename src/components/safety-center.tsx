"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, ArrowUpRight, Check, ExternalLink, MapPin, Phone, ShieldAlert, ShieldCheck, Siren } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { communityReportCategoryInfo, observedWindowLabels, observedWindows, type CommunityReportCategory, type CommunitySafetyReport, type SafetyModerationItem, type SafetyVerificationStatus, type ObservedWindow } from "@/lib/safety";
import type { CampusBuildings } from "@/lib/campus-buildings";
import { SafetyCategoryIcon } from "./category-icons";

type SafetyView = "official" | "community" | "report" | "review";
type ModeratorStatus = { configured: boolean; authenticated: boolean; reason?: string };

const officialResources = [
  { eyebrow: "LIVE CAMPUS UPDATES", title: "UW Campus Alerts", description: "The university’s official source for emergency and campus-operations updates.", href: "https://alerts.wisc.edu/", icon: ShieldAlert },
  { eyebrow: "TEXT · EMAIL · PHONE", title: "Manage WiscAlerts", description: "Use UW’s own system for campus emergency notifications.", href: "https://go.wisc.edu/wiscalerts", icon: Siren },
  { eyebrow: "AREA-BASED OFF-CAMPUS ALERTS", title: "BadgerSAFE information", description: "UW directs area-based off-campus alerts through its BadgerSAFE safety app.", href: "https://uwpd.wisc.edu/staying-safe/off-campus-alerts/", icon: MapPin },
  { eyebrow: "OFFICIAL POLICE RECORDS", title: "UWPD event and Clery logs", description: "Official public records. These are not a live danger feed and can contain sensitive reports.", href: "https://uwpd.wisc.edu/data-policies-resources/event-log-and-clery-log/", icon: ExternalLink, status: "official-police-information" as const },
  { eyebrow: "OFFICIAL POLICE UPDATES", title: "UWPD incident report archive", description: "Read notices at their source; Badger Live does not republish person-specific narratives.", href: "https://uwpd.wisc.edu/incident_report/", icon: ExternalLink, status: "official-police-information" as const },
];

const contacts = [
  { title: "Emergency services", detail: "Immediate danger, injury, fire, or threat", phone: "911", href: "tel:911", urgent: true },
  { title: "UW Police non-emergency", detail: "Safety concerns that are not immediate emergencies", phone: "608-264-2677", href: "tel:+16082642677" },
  { title: "SAFEwalk", detail: "Request a vetted campus walking escort", phone: "608-262-5000", href: "tel:+16082625000" },
  { title: "Physical Plant", detail: "Building, lighting, and facilities service requests", phone: "608-263-3333", href: "tel:+16082633333" },
];

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" }).format(new Date(value));
}

function reportStatusLabel(report: CommunitySafetyReport) {
  if (report.status === "community-confirmed-environmental-hazard") return "Community-confirmed environmental hazard";
  if (report.status === "outdated-resolved") return "Outdated / resolved";
  return "Unverified community report";
}

function verificationLabel(status?: SafetyVerificationStatus) {
  return status === "official-police-information" ? "Official Police Information" : null;
}

function moderationKey(item: Pick<SafetyModerationItem, "category" | "buildingId">) {
  return `${item.category}:${item.buildingId}`;
}

function PublicReportCard({ report, selected, onSelect }: { report: CommunitySafetyReport; selected: boolean; onSelect: (report: CommunitySafetyReport) => void }) {
  const info = communityReportCategoryInfo[report.category];
  return <article className={`safety-report-card ${report.status} ${selected ? "is-selected" : ""}`}>
    <button className="safety-report-select" onClick={() => onSelect(report)} aria-pressed={selected}>
      <span className="safety-report-symbol" aria-hidden="true"><SafetyCategoryIcon category={report.category} size={17} /></span>
      <span className="safety-report-copy">
        <strong>{info.label}</strong>
        <span><MapPin size={13} /> {report.buildingName}</span>
        <small>{reportStatusLabel(report)} · {report.reportCount} {report.reportCount === 1 ? "report" : "reports"} · last seen {observedWindowLabels[report.observedWindow].toLocaleLowerCase()} · reported {formatTime(report.reportedAt)}</small>
      </span>
    </button>
    <p className="safety-report-description">{report.description}</p>
  </article>;
}

export function SafetyCenter({
  open,
  onOpenChange,
  initialView,
  buildings,
  reports,
  reportsLoading,
  reportsUnavailable,
  selectedReportId,
  onSelectReport,
  onReportsChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialView: SafetyView;
  buildings: CampusBuildings | null;
  reports: CommunitySafetyReport[];
  reportsLoading: boolean;
  reportsUnavailable: boolean;
  selectedReportId: string | null;
  onSelectReport: (report: CommunitySafetyReport) => void;
  onReportsChanged: () => void;
}) {
  const [view, setView] = useState<SafetyView>(initialView);
  const [category, setCategory] = useState<CommunityReportCategory>("lighting");
  const [buildingId, setBuildingId] = useState("");
  const [observedWindow, setObservedWindow] = useState<ObservedWindow>("just-now");
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionMessage, setSubmissionMessage] = useState("");
  const [submissionError, setSubmissionError] = useState("");
  const [moderatorStatus, setModeratorStatus] = useState<ModeratorStatus | null>(null);
  const [moderationItems, setModerationItems] = useState<SafetyModerationItem[]>([]);
  const [moderationQueueLoaded, setModerationQueueLoaded] = useState(false);
  const [moderationMessage, setModerationMessage] = useState("");
  const [moderationError, setModerationError] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [reviewing, setReviewing] = useState("");
  const [confirmationKeys, setConfirmationKeys] = useState<Set<string>>(() => new Set());
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const sortedBuildings = useMemo(() => [...(buildings?.features || [])].sort((a, b) => a.properties.name.localeCompare(b.properties.name)), [buildings]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch("/api/safety/moderation/status", { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.json() as Promise<ModeratorStatus>)
      .then(setModeratorStatus)
      .catch(() => { if (!controller.signal.aborted) setModeratorStatus({ configured: false, authenticated: false, reason: "unavailable" }); });
    return () => controller.abort();
  }, [open]);

  useEffect(() => {
    if (!open || view !== "review" || !moderatorStatus?.configured || !moderatorStatus.authenticated) return;
    const controller = new AbortController();
    fetch("/api/safety/moderation", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as { items?: SafetyModerationItem[]; error?: string };
        if (!response.ok) throw new Error(body.error || "The private queue is unavailable.");
        setModerationItems(body.items || []);
        setModerationQueueLoaded(true);
        setModerationError("");
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setModerationError(error instanceof Error ? error.message : "The private queue is unavailable.");
          setModerationQueueLoaded(true);
        }
      })
    return () => controller.abort();
  }, [open, view, moderatorStatus]);

  const submitReport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmissionError("");
    setSubmissionMessage("");
    if (!acknowledged || !buildingId) {
      setSubmissionError("Choose a campus building and acknowledge how this private queue works.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/safety/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, buildingId, observedWindow }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "The report could not be submitted.");
      setSubmissionMessage(moderatorStatus?.configured
        ? "Saved privately for human review. It is not public, and it has not been sent to UW."
        : "Saved privately, but no human reviewer is assigned. It is not monitored, is not public, and has not been sent to UW.");
      setAcknowledged(false);
      onReportsChanged();
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : "The report could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  };

  const refreshModeration = async () => {
    const response = await fetch("/api/safety/moderation/status", { cache: "no-store" });
    const status = await response.json() as ModeratorStatus;
    setModeratorStatus(status);
    if (!status.authenticated) return;
    const queueResponse = await fetch("/api/safety/moderation", { cache: "no-store" });
    const body = await queueResponse.json() as { items?: SafetyModerationItem[]; error?: string };
    if (!queueResponse.ok) throw new Error(body.error || "The private queue is unavailable.");
    setModerationItems(body.items || []);
    setModerationQueueLoaded(true);
  };

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setModerationError("");
    if (!supabase) {
      setModerationError("Moderator sign-in is not configured in this local environment.");
      return;
    }
    const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
    if (!window.isSecureContext && !isLocalhost) {
      setModerationError("Reviewer sign-in requires HTTPS. Use localhost locally or a trusted HTTPS deployment.");
      return;
    }
    setLoggingIn(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPassword });
      if (error) throw new Error("Sign-in failed. Use an existing assigned reviewer account.");
      await refreshModeration();
      setLoginPassword("");
      setModerationError("");
    } catch (error) {
      await supabase.auth.signOut();
      setModerationError(error instanceof Error ? error.message : "Sign-in failed. Use an existing assigned reviewer account.");
      setModeratorStatus((current) => current ? { ...current, authenticated: false } : current);
    } finally {
      setLoggingIn(false);
    }
  };

  const signOut = async () => {
    await supabase?.auth.signOut();
    setModeratorStatus((current) => current ? { ...current, authenticated: false } : current);
    setModerationItems([]);
    setModerationQueueLoaded(false);
  };

  const review = async (item: SafetyModerationItem, action: "publish-unverified" | "confirm-environmental" | "resolve" | "reject") => {
    const key = moderationKey(item);
    setReviewing(key);
    setModerationError("");
    setModerationMessage("");
    try {
      const response = await fetch("/api/safety/moderation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: item.category, buildingId: item.buildingId, action, confirmationReviewed: confirmationKeys.has(key) }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "The review action could not be saved.");
      setModerationMessage("Review decision saved.");
      setConfirmationKeys((current) => { const next = new Set(current); next.delete(key); return next; });
      onReportsChanged();
      await refreshModeration();
    } catch (error) {
      setModerationError(error instanceof Error ? error.message : "The review action could not be saved.");
    } finally {
      setReviewing("");
    }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="safety-dialog">
      <DialogHeader className="safety-dialog-header">
        <span className="safety-kicker"><ShieldCheck size={14} /> CAMPUS SAFETY TOOLBOX</span>
        <DialogTitle>Get help. Stay informed.</DialogTitle>
        <DialogDescription>Official channels first. Community condition reports are clearly labeled and never treated as police findings.</DialogDescription>
      </DialogHeader>

      <nav className="safety-tabs" aria-label="Safety information">
        {(["official", "community", "report", "review"] as const).map((tab) => <button key={tab} type="button" aria-pressed={view === tab} onClick={() => { setView(tab); setSubmissionError(""); setModerationError(""); }}>
          {tab === "official" ? "Official help" : tab === "community" ? `Community reports${reports.length ? ` · ${reports.length}` : ""}` : tab === "report" ? "Report a condition" : "Human review"}
        </button>)}
      </nav>

      <div className="safety-dialog-scroll">
        {view === "official" && <div className="safety-official-view">
          <a className="safety-emergency" href="tel:911"><span className="safety-emergency-icon"><Phone size={19} /></span><span><strong>Immediate danger? Call 911.</strong><small>Badger Live is not an emergency service and is not monitored.</small></span><ArrowUpRight size={18} /></a>

          <section className="safety-section">
            <div className="safety-section-heading"><div><span className="safety-kicker">OFFICIAL CHANNELS</span><h3>Real-time information</h3></div></div>
            <div className="safety-source-list">{officialResources.map(({ eyebrow, title, description, href, icon: Icon, status }) => <a key={href} className="safety-source-card" href={href} target="_blank" rel="noopener noreferrer">
              <span className="safety-source-icon"><Icon size={17} /></span><span className="safety-source-copy"><small>{eyebrow}</small><strong>{title}</strong>{status && <em className="safety-official-status">{verificationLabel(status)}</em>}<span>{description}</span></span><ExternalLink size={15} />
            </a>)}</div>
            <p className="safety-source-caveat">UW’s public incident logs and report archive are linked at their original sources, not copied into this map. The alert site does not expose a stable location-bearing feed for third-party mapping. Check UW’s live page for the latest official notice.</p>
          </section>

          <section className="safety-section">
            <div className="safety-section-heading"><div><span className="safety-kicker">CALL OR TEXT</span><h3>Campus contacts</h3></div></div>
            <div className="safety-contact-grid">{contacts.map((contact) => <a key={contact.title} className={`safety-contact-card ${contact.urgent ? "is-urgent" : ""}`} href={contact.href}>
              <span><strong>{contact.title}</strong><small>{contact.detail}</small></span><b>{contact.phone}</b>
            </a>)}</div>
            <p className="safety-source-caveat">A broken light or blocked exit should also be reported to UW’s facilities service desk. This app does not dispatch responders or create a UW work order.</p>
          </section>

          <div className="safety-subscribe-card"><div className="safety-subscribe-icon"><Siren size={18} /></div><div><strong>Get official alerts by area</strong><p>WiscAlerts is UW’s campus alert system. For area-based off-campus alerts, UW directs students to BadgerSAFE. Badger Live does not send emergency push or text notifications.</p><div className="safety-inline-links"><a href="https://go.wisc.edu/wiscalerts" target="_blank" rel="noopener noreferrer">WiscAlerts signup <ExternalLink size={13} /></a><a href="https://uwpd.wisc.edu/staying-safe/off-campus-alerts/" target="_blank" rel="noopener noreferrer">Off-campus alert details <ExternalLink size={13} /></a></div></div></div>
        </div>}

        {view === "community" && <section className="safety-section safety-community-view">
          <div className="safety-community-note"><AlertTriangle size={17} /><p><strong>Community reports are not official police information.</strong> Environmental confirmation means a condition was corroborated; it never means that a crime occurred.</p></div>
          {reportsUnavailable && <p className="safety-inline-error" role="status">Community reports are temporarily unavailable. Official contacts remain available in the first tab.</p>}
          {reportsLoading && <p className="safety-empty">Checking for reviewed reports…</p>}
          {!reportsLoading && !reportsUnavailable && reports.length === 0 && <div className="safety-empty"><ShieldCheck size={23} /><strong>No reviewed community conditions are shared right now.</strong><span>Private submissions are hidden until a human reviewer approves them.</span></div>}
          {!reportsLoading && reports.map((report) => <PublicReportCard key={report.id} report={report} selected={report.id === selectedReportId} onSelect={onSelectReport} />)}
          <p className="safety-source-caveat">Active map markers are approximate building locations. Reports older than a day are labeled outdated and are not shown as active map pins.</p>
        </section>}

        {view === "report" && <section className="safety-section safety-report-view">
          <div className="safety-report-intro"><span className="safety-kicker">ENVIRONMENT ONLY</span><h3>Report a campus condition</h3><p>Choose an observable facilities condition. This form does not accept reports about people, suspected crimes, or emergencies.</p></div>
          <div className="safety-review-warning"><ShieldAlert size={17} /><p><strong>{moderatorStatus?.configured ? "A human reviewer must approve every report." : "No human reviewers are assigned yet."}</strong> Reports are held privately and are never sent to UW. {moderatorStatus?.configured ? "They cannot appear on the map before review." : "They are not monitored until a reviewer is assigned."} Use the official contacts if someone needs help or a repair is needed.</p></div>
          <form className="safety-report-form" onSubmit={submitReport}>
            <fieldset><legend>What did you observe?</legend><div className="safety-category-grid">{(Object.keys(communityReportCategoryInfo) as CommunityReportCategory[]).map((key) => <label key={key} className={`safety-category-option ${category === key ? "is-chosen" : ""}`}>
              <input type="radio" name="category" value={key} checked={category === key} onChange={() => setCategory(key)} /><span className="safety-category-symbol"><SafetyCategoryIcon category={key} size={17} /></span><span>{communityReportCategoryInfo[key].label}</span>
            </label>)}</div></fieldset>
            <label className="safety-field">Campus building or place<select value={buildingId} onChange={(event) => setBuildingId(event.target.value)} required>
              <option value="">Choose a verified campus place</option>
              {sortedBuildings.map(({ properties }) => <option key={properties.mapObjectId} value={properties.mapObjectId}>{properties.name}{properties.buildingNumber ? ` · ${properties.buildingNumber}` : ""}</option>)}
            </select><small>The map marks the building area, not your location. No GPS is requested.</small></label>
            <label className="safety-field">When did you last see it?<select value={observedWindow} onChange={(event) => setObservedWindow(event.target.value as ObservedWindow)}>{observedWindows.map((window) => <option key={window} value={window}>{observedWindowLabels[window]}</option>)}</select></label>
            <label className="safety-acknowledge"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span>I understand this is not monitored or sent to UW and is not for emergencies, crime reports, or allegations about people.</span></label>
            {submissionError && <p className="safety-inline-error" role="alert">{submissionError}</p>}
            {submissionMessage && <p className="safety-success" role="status"><Check size={16} />{submissionMessage}</p>}
            <button className="safety-submit" type="submit" disabled={submitting || !buildings || !buildingId || !acknowledged}>{submitting ? "Saving privately…" : "Submit private report"}</button>
          </form>
          <p className="safety-source-caveat">No free-text, images, names, or reporter location are collected. Private entries expire after 14 days. Only an assigned human can approve a neutral, structured summary for the map.</p>
        </section>}

        {view === "review" && <section className="safety-section safety-review-view">
          <div className="safety-report-intro"><span className="safety-kicker">PRIVATE · HUMAN-ONLY</span><h3>Moderation queue</h3><p>Unreviewed reports never appear publicly. Approval only publishes a fixed environmental summary—never the raw report, a person’s identity, or a crime allegation.</p></div>
          {moderatorStatus?.configured === false && <div className="safety-review-warning"><ShieldAlert size={17} /><p><strong>Reviewers are unassigned.</strong> The queue is private and no community report can be published. A reviewer must be explicitly allowlisted before sign-in is enabled.</p></div>}
          {moderatorStatus?.configured && !moderatorStatus.authenticated && <form className="safety-login-form" onSubmit={signIn}>
            <label className="safety-field">Assigned reviewer email<input autoComplete="username" type="email" value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} required /></label>
            <label className="safety-field">Password<input autoComplete="current-password" type="password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} required /></label>
            {moderationError && <p className="safety-inline-error" role="alert">{moderationError}</p>}
            <button className="safety-submit" type="submit" disabled={loggingIn}>{loggingIn ? "Signing in…" : "Sign in as reviewer"}</button>
          </form>}
          {moderatorStatus?.configured && moderatorStatus.authenticated && <>
            <div className="safety-queue-heading"><span>Private review queue</span><button type="button" onClick={signOut}>Sign out</button></div>
            {!moderationQueueLoaded && !moderationError && <p className="safety-empty">Loading private reports…</p>}
            {moderationQueueLoaded && moderationItems.length === 0 && <div className="safety-empty"><Check size={22} /><strong>The review queue is clear.</strong></div>}
            {moderationItems.map((item) => {
              const key = moderationKey(item);
              const info = communityReportCategoryInfo[item.category];
              const pending = item.status === "pending";
              const confirmed = item.distinctReporters >= 2;
              return <article key={key} className="safety-review-card">
                <div className="safety-review-card-title"><span className="safety-report-symbol"><SafetyCategoryIcon category={item.category} size={17} /></span><span><strong>{info.label} · {item.buildingName}</strong><small>{item.reportCount} reports from {item.distinctReporters} distinct connections · last seen {observedWindowLabels[item.lastObservedWindow].toLocaleLowerCase()} · latest {formatTime(item.lastReportedAt)}</small></span></div>
                {pending ? <>
                  <button className="safety-review-action" type="button" disabled={reviewing === key} onClick={() => void review(item, "publish-unverified")}>Approve as unverified community report</button>
                  {confirmed && <label className="safety-acknowledge"><input type="checkbox" checked={confirmationKeys.has(key)} onChange={(event) => setConfirmationKeys((current) => { const next = new Set(current); if (event.target.checked) next.add(key); else next.delete(key); return next; })} /><span>I independently reviewed evidence for this environmental condition. This does not confirm a crime.</span></label>}
                  <button className="safety-review-action is-confirm" type="button" disabled={reviewing === key || !confirmed || !confirmationKeys.has(key)} onClick={() => void review(item, "confirm-environmental")}>{confirmed ? "Confirm environmental hazard" : "Needs 2 distinct reports to confirm"}</button>
                  <button className="safety-review-reject" type="button" disabled={reviewing === key} onClick={() => void review(item, "reject")}>Reject and keep private</button>
                </> : <div className="safety-review-published"><span>{item.status === "confirmed" ? "Community-confirmed environmental hazard" : "Unverified community report"}</span><button className="safety-review-action" type="button" disabled={reviewing === key} onClick={() => void review(item, "resolve")}>Mark resolved / outdated</button></div>}
              </article>;
            })}
            {moderationMessage && <p className="safety-success" role="status"><Check size={16} />{moderationMessage}</p>}
            {moderationError && <p className="safety-inline-error" role="alert">{moderationError}</p>}
          </>}
          {moderatorStatus?.reason === "unavailable" && <p className="safety-inline-error" role="status">Reviewer configuration could not be checked. Reports remain private.</p>}
          {!moderatorStatus && <p className="safety-empty">Checking reviewer configuration…</p>}
        </section>}
      </div>
      <p className="safety-independent-note">BADGER LIVE IS AN INDEPENDENT STUDENT PROJECT · NOT A UW EMERGENCY SERVICE</p>
    </DialogContent>
  </Dialog>;
}
