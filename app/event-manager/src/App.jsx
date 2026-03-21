import { AuthGate } from './app/AuthGate.jsx'
import { EventManagerPage } from './app/EventManagerPage.jsx'

export default function App() {
  return (
    <AuthGate>
      <EventManagerPage />
    </AuthGate>
  )
}

