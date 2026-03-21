import { PageShell } from "../components/layout/PageShell.jsx";
import { SectionCard } from "../components/layout/SectionCard.jsx";
import { SectionHeader } from "../components/layout/SectionHeader.jsx";
import { TrackedEventsSection } from "../components/tracked-events/TrackedEventsSection.jsx";
import { TEQuerySection } from "../components/te-query/TEQuerySection.jsx";
import { Button } from "../components/shared/Button.jsx";
import { supabase } from "../lib/supabaseClient.js";

export function EventManagerPage() {
  async function onSignOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  return (
    <PageShell
      title="OLT Event Manager"
      rightActions={
        <Button type="button" variant="ghost" onClick={onSignOut}>
          Sign Out
        </Button>
      }
    >
      <SectionCard>
        <SectionHeader
          title="Tracked Events"
          subtitle="Browse and search local Supabase events"
        />
        <TrackedEventsSection />
      </SectionCard>

      <SectionCard className="em-card--add-events">
        <TEQuerySection />
      </SectionCard>
    </PageShell>
  );
}
