# Historical Ticket Pricing Widget

Embeddable widget for displaying historical ticket pricing charts on OnlyLocalTickets event pages.

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Development Server

```bash
npm run dev
```

Visit `http://localhost:5173` to see the widget with mock data.

### 3. Build for Production

```bash
npm run build
```

Creates `dist/ticket-embed.js` and `dist/index.html` (test page).

## Project Structure

```
embed/
├── src/
│   ├── main.jsx              # Entry; delegates to bootstrap
│   ├── App.jsx               # Root component
│   ├── bootstrap/
│   │   ├── index.jsx         # Mount logic, Shadow DOM, config parsing
│   │   └── styles.js         # Injects tokens + components CSS
│   ├── api/
│   │   └── client.js         # Supabase + mock data
│   ├── components/
│   │   ├── PriceChart.jsx    # Recharts area chart
│   │   ├── PriceStats.jsx    # Min/avg/max stats
│   │   └── ChangeBadge.jsx   # 24h change indicator
│   └── styles/
│       ├── tokens.css        # Design tokens (CSS vars)
│       └── components.css    # Component styles
├── index.html                # Dev entry
├── index.production.html     # Production test page (copied to dist/)
├── vite.config.js
└── scripts/postbuild.js      # Copies index.production.html → dist/
```

## Embed Usage

Add a mount element with `te-event-id` (or `data-event-id` for backwards compatibility):

```html
<div te-event-id="2795412"></div>
<script src="https://pricing.onlylocaltickets.com/ticket-embed.js"></script>
```

**Attributes:**

| Attribute       | Required | Description                         |
| --------------- | -------- | ----------------------------------- |
| `te-event-id`   | Yes      | Ticket Evolution event ID (numeric) |
| `data-event-id` | Fallback | Same as above                       |
| `data-theme`    | No       | `light` or `dark` (default: light)  |
| `data-mode`     | No       | `real` or `mock` (default: real)    |

**Programmatic API:**

```js
// Auto-init on load (default)
// Or manually:
TicketWidget.initializeWidgets({ selector: "[te-event-id]" });

// Manual mount
TicketWidget.mount(element, { eventId: "2795412", theme: "light" });

// Unmount all
TicketWidget.unmountAll();
```

## Features

- **Shadow DOM**: Styles isolated from host page
- **Responsive**: Mobile and desktop layouts
- **Mock mode**: Works without Supabase when `VITE_SUPABASE_ANON_KEY` is unset or `data-mode="mock"`
- **Multiple instances**: Several widgets per page supported

## Build Output

- `dist/ticket-embed.js` — Single IIFE bundle (~150KB gzipped)
- `dist/index.html` — Test page for production build
