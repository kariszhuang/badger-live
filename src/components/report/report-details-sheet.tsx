"use client";

import { useEffect, useState } from "react";
import { Check, Flag, MapPin, RotateCcw, Snowflake, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { HazardReport } from "@/lib/report/types";
import { getUndoCapability, getVisitorId, removeUndoCapability } from "@/lib/report/visitor-id";

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" }).format(new Date(value));
}

export function ReportDetailsSheet({ report, open, onOpenChange, onChanged }: { report: HazardReport | null; open: boolean; onOpenChange: (open: boolean) => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [canUndo, setCanUndo] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMessage("");
      setError("");
      setCanUndo(Boolean(report && getUndoCapability(report.id)));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [report]);

  const post = async (path: string, payload: Record<string, unknown>, success: string) => {
    if (!report) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/report/${report.id}/${path}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorId: getVisitorId(), ...payload }),
      });
      const result = await response.json() as { error?: string; undone?: boolean };
      if (!response.ok) throw new Error(result.error || "That update could not be saved.");
      if (path === "undo" && result.undone) { removeUndoCapability(report.id); setCanUndo(false); }
      setMessage(success);
      onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "That update could not be saved."); }
    finally { setBusy(false); }
  };

  if (!report) return null;
  const stale = report.lifecycle === "stale";
  const possiblyCleared = report.lifecycle === "possibly_cleared";
  const locationDescription = report.locationMethod === "gps"
    ? report.locationAccuracyM === null ? "Approximate GPS location" : `Approximate GPS · about ±${Math.round(report.locationAccuracyM)} m`
    : report.locationMethod === "pin" ? "Approximate map point" : "Trusted campus place";
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="report-details-dialog">
      <DialogHeader className="report-dialog-header">
        <span className="report-kicker"><MapPin size={14} /> COMMUNITY OBSERVATION</span>
        <DialogTitle>{report.title}</DialogTitle>
        <DialogDescription>Unverified · {locationDescription}</DialogDescription>
      </DialogHeader>
      <div className="report-detail-status"><span className={`report-lifecycle-dot ${stale ? "is-stale" : possiblyCleared ? "is-cleared" : ""}`} />{stale ? "Stale observation" : possiblyCleared ? "Possibly cleared" : "Recently observed"}<span>{report.reportedSeverity !== "unknown" ? `${report.reportedSeverity} reported severity` : "Severity not specified"}</span></div>
      <div className="report-detail-stat"><div><strong>{report.observationCount}</strong><span>anonymous observation{report.observationCount === 1 ? "" : "s"}</span></div><small>Counts can be repeated or spoofed and do not prove independent confirmation.</small></div>
      <div className="report-detail-times"><p><span>First observed</span><time>{formatTime(report.observedAt)}</time></p><p><span>Last observed</span><time>{formatTime(report.lastObservedAt)}</time></p><p><span>Automatically expires</span><time>{formatTime(report.expiresAt)}</time></p></div>
      {message && <p className="report-success" role="status"><Check size={15} />{message}</p>}
      {error && <p className="report-error" role="alert">{error}</p>}
      <div className="report-detail-actions">
        <button type="button" className="report-primary-button" disabled={busy} onClick={() => void post("observe", { observation: "still_there" }, "Your Still there observation was saved.")}><Check size={15} />Still there</button>
        <button type="button" className="report-secondary-button" disabled={busy || possiblyCleared} onClick={() => void post("observe", { observation: "possibly_cleared" }, "Possibly cleared was recorded as an anonymous counter-signal.")}><Snowflake size={15} />Possibly cleared</button>
      </div>
      <div className="report-detail-quiet-actions"><button type="button" disabled={busy} onClick={() => void post("flag", { reason: "outdated" }, "Thanks. The outdated signal was recorded.")}><Sparkles size={14} />Report outdated</button><button type="button" disabled={busy} onClick={() => void post("flag", { reason: "inaccurate" }, "Thanks. The inaccurate signal was recorded.")}><Flag size={14} />Report inaccurate</button>{canUndo && <button type="button" disabled={busy} onClick={() => { const capability = getUndoCapability(report.id); if (capability) void post("undo", { capability }, "Your report was removed."); }}><RotateCcw size={14} />Undo my report</button>}</div>
      <p className="report-privacy-note">No report proves a route is safe, accessible, or free from hazards. Use verified campus channels for urgent or repair requests.</p>
    </DialogContent>
  </Dialog>;
}
