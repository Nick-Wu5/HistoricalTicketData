import { PageShell } from '../components/layout/PageShell.jsx'
import { SectionCard } from '../components/layout/SectionCard.jsx'
import { SectionHeader } from '../components/layout/SectionHeader.jsx'
import { TrackedEventsSection } from '../components/tracked-events/TrackedEventsSection.jsx'
import { TEQuerySection } from '../components/te-query/TEQuerySection.jsx'
import { TEPreviewSection } from '../components/te-preview/TEPreviewSection.jsx'

export function EventManagerPage() {
  return (
    <PageShell title="Event Manager">
      <SectionCard>
        <SectionHeader
          title="Existing Tracked Events"
          subtitle="Browse/search local Supabase events"
        />
        <TrackedEventsSection />
      </SectionCard>

      <SectionCard>
        <SectionHeader title="TicketEvolution Query" subtitle="Fetch + preview TE events" />
        <TEQuerySection />
        <TEPreviewSection />
      </SectionCard>
    </PageShell>
  )
}

