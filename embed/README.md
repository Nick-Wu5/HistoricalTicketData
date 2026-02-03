# Historical Ticket Pricing Widget

Embeddable widget for displaying historical ticket pricing charts on OnlyLocalTickets event pages.

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Development Server
```bash
npm run dev
```

Visit `http://localhost:5173` to see the widget in action with mock data.

### 3. Build for Production
```bash
npm run build
```

This creates `dist/ticket-embed.js` ready for deployment to `pricing.onlylocaltickets.com`.

## 📁 Project Structure

```
embed/
├── src/
│   ├── main.jsx              # Bootstrap script (Shadow DOM setup)
│   ├── App.jsx               # Main widget component
│   ├── components/
│   │   ├── PriceChart.jsx    # Chart component (Recharts)
│   │   └── PriceDisplay.jsx  # Current price display
│   └── styles/
│       └── embed.css         # Widget styles
├── index.html                # Development test page
├── vite.config.js            # Vite build configuration
└── package.json
```

## 🎨 Features

- **Shadow DOM Isolation**: Styles won't conflict with host page
- **Responsive Design**: Works on mobile and desktop
- **Theme Support**: Light and dark themes via `data-theme` attribute
- **Mock Data**: Development works without backend
- **Multiple Instances**: Can embed multiple widgets on same page

## 🔧 Development

The widget uses mock data during development. You can test with multiple event IDs by editing `index.html`:

```html
<div id="ticket-widget-1" data-event-id="lakers-celtics-2024-03-15"></div>
<div id="ticket-widget-2" data-event-id="warriors-nets-2024-03-20" data-theme="dark"></div>
```

## 📦 Production Build

The build process creates a single IIFE bundle that includes:
- React and ReactDOM
- Recharts
- All component code
- Styles

Output: `dist/ticket-embed.js` (~150KB gzipped)

## 🌐 Deployment

Once built, upload `dist/ticket-embed.js` to `pricing.onlylocaltickets.com`.

Embed on event pages:
```html
<div id="ticket-widget" data-event-id="YOUR-EVENT-ID"></div>
<script src="https://pricing.onlylocaltickets.com/ticket-embed.js"></script>
```

## 🔗 Next Steps

1. ✅ Local development setup (current)
2. ⏳ Connect to Supabase for real data
3. ⏳ Deploy to pricing.onlylocaltickets.com
4. ⏳ Integrate with MarketSnare CMS
