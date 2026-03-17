import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/event-manager.css'
import { EventManagerPage } from './app/EventManagerPage.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <EventManagerPage />
  </StrictMode>,
)
