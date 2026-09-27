"use client";

import { ArrowUpRight, ExternalLink, MapPin, Phone, ShieldAlert, Siren } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const officialResources = [
  { eyebrow: "LIVE CAMPUS UPDATES", title: "UW Campus Alerts", description: "The university’s official source for emergency and campus-operations updates.", href: "https://alerts.wisc.edu/", icon: ShieldAlert },
  { eyebrow: "TEXT · EMAIL · PHONE", title: "Manage WiscAlerts", description: "Use UW’s own system for campus emergency notifications.", href: "https://go.wisc.edu/wiscalerts", icon: Siren },
  { eyebrow: "OFF-CAMPUS ALERTS", title: "BadgerSAFE information", description: "UW directs area-based off-campus alerts through BadgerSAFE.", href: "https://uwpd.wisc.edu/staying-safe/off-campus-alerts/", icon: MapPin },
  { eyebrow: "OFFICIAL POLICE RECORDS", title: "UWPD event and Clery logs", description: "Official historical public records; these are not live alerts or findings of guilt.", href: "https://uwpd.wisc.edu/data-policies-resources/event-log-and-clery-log/", icon: ExternalLink },
  { eyebrow: "OFFICIAL POLICE UPDATES", title: "UWPD incident report archive", description: "Read notices at their original source. Badger Live does not republish personal narratives.", href: "https://uwpd.wisc.edu/incident_report/", icon: ExternalLink },
  { eyebrow: "LOST & FOUND", title: "Lost property guidance", description: "Start with the building where the item was lost. UWPD handles significant valuables and found campus keys.", href: "https://uwpd.wisc.edu/about-us/faqs/", icon: MapPin },
  { eyebrow: "RESIDENCE HALLS", title: "Housing hall desk services", description: "University Housing accepts found items at residence hall desks and helps residents report missing items.", href: "https://www.housing.wisc.edu/undergraduate/services/desks/", icon: MapPin },
];

const contacts = [
  { title: "Emergency services", detail: "Immediate danger, injury, fire, or threat", phone: "911", href: "tel:911", urgent: true },
  { title: "UW Police non-emergency", detail: "Concerns that are not immediate emergencies", phone: "608-264-2677", href: "tel:+16082642677" },
  { title: "SAFEwalk", detail: "Request a vetted campus walking escort", phone: "608-262-5000", href: "tel:+16082625000" },
  { title: "UW Physical Plant", detail: "Facilities service requests", phone: "608-263-3333", href: "tel:+16082633333" },
];

export function SafetyCenter({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="safety-dialog official-help-dialog">
      <DialogHeader className="safety-dialog-header">
        <span className="safety-kicker"><ShieldAlert size={14} /> VERIFIED HELP & SOURCES</span>
        <DialogTitle>Get help. Stay informed.</DialogTitle>
        <DialogDescription>Badger Live is independent and is not an emergency service. Community observations are never official police information.</DialogDescription>
      </DialogHeader>
      <div className="safety-dialog-scroll">
        <a className="safety-emergency" href="tel:911">
          <span className="safety-emergency-icon"><Phone size={19} /></span>
          <span><strong>Immediate danger? Call 911.</strong><small>Badger Live is not monitored and cannot dispatch help.</small></span>
          <ArrowUpRight size={18} />
        </a>
        <section className="safety-section">
          <div className="safety-section-heading"><div><span className="safety-kicker">OFFICIAL CHANNELS</span><h3>Campus information</h3></div></div>
          <div className="safety-source-list">{officialResources.map(({ eyebrow, title, description, href, icon: Icon }) => <a key={href} className="safety-source-card" href={href} target="_blank" rel="noopener noreferrer">
            <span className="safety-source-icon"><Icon size={17} /></span><span className="safety-source-copy"><small>{eyebrow}</small><strong>{title}</strong><span>{description}</span></span><ExternalLink size={15} />
          </a>)}</div>
          <p className="safety-source-caveat">Official police blotter entries are historical records. Use UW’s linked source for current notices and the complete record.</p>
        </section>
        <section className="safety-section">
          <div className="safety-section-heading"><div><span className="safety-kicker">CALL OR TEXT</span><h3>Campus contacts</h3></div></div>
          <div className="safety-contact-grid">{contacts.map((contact) => <a key={contact.title} className={`safety-contact-card ${contact.urgent ? "is-urgent" : ""}`} href={contact.href}>
            <span><strong>{contact.title}</strong><small>{contact.detail}</small></span><b>{contact.phone}</b>
          </a>)}</div>
          <p className="safety-source-caveat">This independent app does not dispatch responders or create a UW facilities work order.</p>
        </section>
        <div className="safety-subscribe-card"><div className="safety-subscribe-icon"><Siren size={18} /></div><div><strong>Get official alerts by area</strong><p>WiscAlerts is UW’s campus alert system. Badger Live does not send emergency push or text notifications.</p><div className="safety-inline-links"><a href="https://go.wisc.edu/wiscalerts" target="_blank" rel="noopener noreferrer">WiscAlerts signup <ExternalLink size={13} /></a><a href="https://uwpd.wisc.edu/staying-safe/off-campus-alerts/" target="_blank" rel="noopener noreferrer">Off-campus alert details <ExternalLink size={13} /></a></div></div></div>
      </div>
    </DialogContent>
  </Dialog>;
}
