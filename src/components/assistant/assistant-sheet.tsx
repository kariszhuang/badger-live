"use client";

import { useState, type FormEvent } from "react";
import { ArrowUpRight, CalendarDays, ExternalLink, MapPin, MessageCircle, ShieldAlert, Sparkles, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getVisitorId } from "@/lib/report/visitor-id";

type Source = { id: string; kind: "event" | "hazard" | "official_record"; title: string; url?: string; date?: string; detail?: string };
type Answer = { answer: string; sources: Source[]; reportActionAvailable: boolean; date: string; dataFreshness: { eventsFetchedAt: string | null; eventSource: string; observations: string } };

const suggestions = ["What events are happening today?", "Are there unverified icy path reports?", "Where can I get official campus help?"];

function safeLink(value: string | undefined) {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === "https:" ? url.toString() : null; } catch { return null; }
}

function formatDate(value: string | undefined) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return "";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" }).format(parsed);
}

export function AssistantSheet({ open, onOpenChange, date, initialQuery = "", onPostAsReport }: { open: boolean; onOpenChange: (open: boolean) => void; date: string; initialQuery?: string; onPostAsReport: (text: string) => void }) {
  const [query, setQuery] = useState(initialQuery);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const ask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const clean = query.trim();
    if (!clean) return;
    setLoading(true);
    setError("");
    setAnswer(null);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorId: getVisitorId(), query: clean, date }),
      });
      const result = await response.json() as Answer & { error?: string };
      if (!response.ok || typeof result.answer !== "string" || !Array.isArray(result.sources)) throw new Error(result.error || "Ask Badger is temporarily unavailable.");
      setAnswer(result);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Ask Badger is temporarily unavailable."); }
    finally { setLoading(false); }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="assistant-dialog">
      <DialogHeader className="assistant-header">
        <span className="assistant-kicker"><Sparkles size={14} /> ASK BADGER</span>
        <DialogTitle>What would help today?</DialogTitle>
        <DialogDescription>Answers use the official calendar, linked campus sources, and clearly unverified community observations. Asking never posts a report.</DialogDescription>
      </DialogHeader>
      <form className="assistant-form" onSubmit={ask}>
        <label htmlFor="assistant-question" className="sr-only">Ask a campus question</label>
        <textarea id="assistant-question" rows={3} maxLength={1200} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try: Any free talks near Union South tonight?" />
        <div className="assistant-form-footer"><span>{query.length}/1,200</span><button type="submit" disabled={loading || !query.trim()}>{loading ? "Checking sources…" : "Ask"}<ArrowUpRight size={15} /></button></div>
      </form>
      <p className="assistant-privacy-note">Your question and selected campus data are sent to OpenAI for AI processing. Badger Live does not save your question.</p>
      {!answer && !error && !loading && <div className="assistant-suggestions"><span className="report-section-label">QUICK QUESTIONS</span>{suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => setQuery(suggestion)}><MessageCircle size={14} />{suggestion}</button>)}</div>}
      {loading && <div className="assistant-loading" role="status"><span className="loading-orbit" />Checking source data…</div>}
      {error && <p className="report-error" role="alert">{error}</p>}
      {answer && <section className="assistant-answer" aria-live="polite">
        <div className="assistant-answer-title"><span><MessageCircle size={15} /> ANSWER</span><small><CalendarDays size={13} /> {answer.date}</small></div>
        <p>{answer.answer}</p>
        {answer.sources.length > 0 && <div className="assistant-sources"><strong>Sources checked</strong>{answer.sources.map((source) => <article key={source.id}>
          <span className={`assistant-source-icon source-${source.kind}`}>{source.kind === "event" ? <CalendarDays size={15} /> : source.kind === "hazard" ? <MapPin size={15} /> : <ShieldAlert size={15} />}</span>
          <span><strong>{source.title}</strong><small>{source.kind === "hazard" ? `Unverified community observation · ${formatDate(source.date)}` : `${source.kind === "official_record" ? "Historical UWPD record" : "UW Today event"}${source.date ? ` · ${formatDate(source.date)}` : ""}`}</small></span>
          {safeLink(source.url) && <a href={safeLink(source.url)!} target="_blank" rel="noopener noreferrer" aria-label={`Open source for ${source.title}`}><ExternalLink size={15} /></a>}
        </article>)}</div>}
        <p className="assistant-source-note">{answer.dataFreshness.eventSource} data · Community observations are not verified and may be inaccurate.</p>
        {answer.reportActionAvailable && <button type="button" className="assistant-report-action" onClick={() => onPostAsReport(query)}><MapPin size={15} />Post this as a report</button>}
      </section>}
      <div className="assistant-disclaimer"><ShieldAlert size={14} /><span>Badger Live is not an emergency service. For immediate danger, call 911.</span></div>
      {answer && <button type="button" className="assistant-clear" onClick={() => { setAnswer(null); setQuery(""); setError(""); }}><X size={14} />Clear this conversation</button>}
    </DialogContent>
  </Dialog>;
}
