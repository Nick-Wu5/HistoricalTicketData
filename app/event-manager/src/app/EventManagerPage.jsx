import { useState } from "react";
import { PageShell } from "../components/layout/PageShell.jsx";
import { TrackedEventsSection } from "../components/tracked-events/TrackedEventsSection.jsx";
import { TEQuerySection } from "../components/te-query/TEQuerySection.jsx";
import { Button } from "../components/shared/Button.jsx";
import { supabase } from "../lib/supabaseClient.js";

const TABS = [
  { id: "tracked", label: "Tracked Events" },
  { id: "add", label: "Add Events" },
];

export function EventManagerPage() {
  const [activeTab, setActiveTab] = useState("tracked");

  async function onSignOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  return (
    <PageShell
      title="OLT Event Manager"
      rightActions={
        <>
          <nav className="em-tab-bar" aria-label="Workflow">
            <div
              className="olt-toggle-group olt-toggle-group--dual olt-toggle-group--nav"
              role="tablist"
              aria-label="Event manager mode"
              data-active-index={TABS.findIndex((t) => t.id === activeTab)}
            >
              <span className="olt-toggle-pill" aria-hidden="true" />
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  className="olt-toggle"
                  onClick={() => setActiveTab(tab.id)}
                  aria-selected={activeTab === tab.id}
                  aria-controls={`panel-${tab.id}`}
                  id={`tab-${tab.id}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </nav>
          <Button type="button" variant="ghost" onClick={onSignOut}>
            Sign Out
          </Button>
        </>
      }
    >
      <div
        id="panel-tracked"
        role="tabpanel"
        aria-labelledby="tab-tracked"
        className={activeTab !== "tracked" ? "em-tab-panel--hidden" : undefined}
      >
        <p className="em-tab-hint">Browse and search local Supabase events</p>
        <TrackedEventsSection />
      </div>

      <div
        id="panel-add"
        role="tabpanel"
        aria-labelledby="tab-add"
        className={activeTab !== "add" ? "em-tab-panel--hidden" : undefined}
      >
        <TEQuerySection />
      </div>
    </PageShell>
  );
}
