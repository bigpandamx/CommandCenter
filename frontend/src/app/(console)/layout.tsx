import { requireSession } from "../../lib/session";
import { getActiveAnnouncements } from "../../lib/adminApiClient";
import { SignOutButton } from "../../components/SignOutButton";
import { AnnouncementBanner } from "../../components/AnnouncementBanner";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  // requireSession redirects to /login if there's no valid session cookie --
  // every page under this route group is gated by that single call.
  const config = await requireSession();
  const { announcements } = await getActiveAnnouncements(config);

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-border bg-surface px-4 py-6">
        <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Aegis</p>
        <p className="mt-1 text-sm font-semibold text-text-primary">Command Center</p>

        <nav className="mt-8 space-y-1">
          <a
            href="/executive-dashboard"
            className="block rounded px-2 py-1.5 text-sm text-text-primary hover:bg-surface-raised"
          >
            Executive Dashboard
          </a>
          <a
            href="/organizations"
            className="block rounded px-2 py-1.5 text-sm text-text-primary hover:bg-surface-raised"
          >
            Organizations
          </a>
          <a
            href="/services"
            className="block rounded px-2 py-1.5 text-sm text-text-primary hover:bg-surface-raised"
          >
            Services
          </a>
          <a
            href="/compliance"
            className="block rounded px-2 py-1.5 text-sm text-text-primary hover:bg-surface-raised"
          >
            Compliance
          </a>
          <a
            href="/tickets"
            className="block rounded px-2 py-1.5 text-sm text-text-primary hover:bg-surface-raised"
          >
            Tickets
          </a>
          <a
            href="/agents"
            className="block rounded px-2 py-1.5 text-sm text-text-primary hover:bg-surface-raised"
          >
            Agents
          </a>
          <a
            href="/fleet"
            className="block rounded px-2 py-1.5 text-sm text-text-primary hover:bg-surface-raised"
          >
            Fleet
          </a>
          <a
            href="/distribution"
            className="block rounded px-2 py-1.5 text-sm text-text-primary hover:bg-surface-raised"
          >
            Distribution Center
          </a>
          <a
            href="/jobs"
            className="block rounded px-2 py-1.5 text-sm text-text-primary hover:bg-surface-raised"
          >
            Jobs
          </a>
          <a
            href="/governance"
            className="block rounded px-2 py-1.5 text-sm text-text-primary hover:bg-surface-raised"
          >
            Governance
          </a>
          <a
            href="/threat-intelligence"
            className="block rounded px-2 py-1.5 text-sm text-text-primary hover:bg-surface-raised"
          >
            Threat Intelligence
          </a>
          <a
            href="/risk-intelligence"
            className="block rounded px-2 py-1.5 text-sm text-text-primary hover:bg-surface-raised"
          >
            Risk Intelligence
          </a>
          <a
            href="/announcements"
            className="block rounded px-2 py-1.5 text-sm text-text-primary hover:bg-surface-raised"
          >
            Announcements
          </a>
        </nav>
      </aside>

      <div className="flex-1">
        <header className="flex items-center justify-end border-b border-border px-6 py-3">
          <SignOutButton />
        </header>
        <AnnouncementBanner announcements={announcements} />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
