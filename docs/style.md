# Historical Ticket Pricing Embed — Styling Guide (OnlyLocalTickets)

This document defines **visual + UX styling conventions** for the embeddable “Historical Ticket Pricing” widget so it feels native on OnlyLocalTickets (OLT) pages while staying safe to embed (no global CSS collisions).

---

## Goals

1. **Blend in with OLT**: clean white surfaces, subtle borders, bold headings, “price green” for key numbers.
2. **Embed-safe**: styles should not leak to the host page and host page styles should not break the embed.
3. **Readable + fast**: system font stack, minimal layout shifts, responsive.

---

## Brand / UI Tokens

Use these as CSS variables inside the widget root.

```css
:root {
  /* Typography */
  --olt-font-sans:
    system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial,
    "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
  --olt-font-mono:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
    "Courier New", monospace;

  /* Core colors (sampled from OLT screenshots) */
  --olt-navy-900: #203040; /* primary header/nav vibe */
  --olt-navy-800: #203060; /* darker accent */
  --olt-blue-500: #50a0d0; /* logo/brand blue */
  --olt-green-500: #70b060; /* price button/primary positive */
  --olt-bg: #ffffff;
  --olt-surface: #ffffff;
  --olt-surface-2: #f7f8fa; /* soft gray panel */
  --olt-border: #e6e8ee;
  --olt-text: #111827;
  --olt-text-2: #4b5563;
  --olt-muted: #6b7280;

  /* States */
  --olt-danger: #dc2626;
  --olt-warning: #f59e0b;
  --olt-success: #16a34a;
  --olt-link: #1f4fd6;

  /* Radii + shadows (OLT is mostly squared-soft) */
  --olt-radius-sm: 6px;
  --olt-radius-md: 10px;
  --olt-radius-lg: 14px;
  --olt-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.06);
  --olt-shadow-md: 0 2px 10px rgba(0, 0, 0, 0.08);

  /* Spacing */
  --olt-1: 4px;
  --olt-2: 8px;
  --olt-3: 12px;
  --olt-4: 16px;
  --olt-5: 20px;
  --olt-6: 24px;

  /* Chart */
  --olt-gridline: rgba(17, 24, 39, 0.08);
  --olt-tooltip-bg: #111827;
  --olt-tooltip-text: #ffffff;
}
```

> Notes:
>
> - The **nav/header** in the screenshot is a deep navy (`#203040`).
> - The listing “price” pill/button is a **soft green** (`#70B060`).
> - The logo’s main blue is around `#50A0D0`.

---

## Embed Safety (don’t break the host page)

### Strongly recommended: Shadow DOM

If your embed runtime is under your control, mount the widget in a ShadowRoot:

- prevents host CSS from accidentally restyling your components
- prevents your CSS from leaking into the host page

If not using Shadow DOM, **scope everything** under a root class like `.olt-pricing-embed`.

### Reset locally (not globally)

Avoid global resets (`* {}` at document level). If you need consistent defaults, scope them:

```css
.olt-pricing-embed,
.olt-pricing-embed * {
  box-sizing: border-box;
  font-family: var(--olt-font-sans);
}
```

---

## Layout & Component Standards

### Container

- White surface with subtle border
- Slight shadow only if placed on white page (optional)

```css
.olt-pricing-embed {
  color: var(--olt-text);
  background: var(--olt-surface);
  border: 1px solid var(--olt-border);
  border-radius: var(--olt-radius-md);
  box-shadow: var(--olt-shadow-sm);
  padding: var(--olt-5);
}
```

### Header block

- Title: bold, slightly condensed feel (OLT tends to strong headings)
- Subtitle: muted text

```css
.olt-embed-title {
  font-size: 18px;
  font-weight: 800;
  letter-spacing: 0.2px;
  margin: 0 0 var(--olt-2) 0;
}

.olt-embed-subtitle {
  font-size: 13px;
  color: var(--olt-text-2);
  margin: 0 0 var(--olt-4) 0;
}
```

### KPI row (Min / Avg / Max / 24h change)

- Use “chips/cards” with light gray background

```css
.olt-kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--olt-3);
  margin-bottom: var(--olt-5);
}

.olt-kpi {
  background: var(--olt-surface-2);
  border: 1px solid var(--olt-border);
  border-radius: var(--olt-radius-sm);
  padding: var(--olt-3);
}

.olt-kpi-label {
  font-size: 11px;
  color: var(--olt-muted);
  margin-bottom: var(--olt-1);
  text-transform: uppercase;
  letter-spacing: 0.6px;
}

.olt-kpi-value {
  font-size: 18px;
  font-weight: 800;
}

.olt-kpi-value--price {
  color: var(--olt-green-500);
}

.olt-kpi-value--down {
  color: var(--olt-danger);
}
.olt-kpi-value--up {
  color: var(--olt-success);
}
```

Responsive behavior:

- ≤ 860px: 2 columns
- ≤ 480px: 1 column

```css
@media (max-width: 860px) {
  .olt-kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 480px) {
  .olt-kpis {
    grid-template-columns: 1fr;
  }
}
```

### Tabs / Range selector (24h / 3d / All-time)

OLT uses clean controls; go for pill buttons with borders.

```css
.olt-tabs {
  display: inline-flex;
  border: 1px solid var(--olt-border);
  border-radius: var(--olt-radius-sm);
  overflow: hidden;
  background: var(--olt-bg);
}

.olt-tab {
  appearance: none;
  border: 0;
  background: transparent;
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--olt-text-2);
  cursor: pointer;
}

.olt-tab[aria-selected="true"] {
  background: var(--olt-navy-900);
  color: #fff;
}
```

### Primary CTA button (optional)

If you include a “View Tickets” button, match the site vibe:

- navy button, white text
- hover slightly darker

```css
.olt-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 14px;
  border-radius: var(--olt-radius-sm);
  border: 1px solid transparent;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  text-decoration: none;
}

.olt-btn--navy {
  background: var(--olt-navy-900);
  color: #fff;
}
.olt-btn--navy:hover {
  filter: brightness(0.95);
}

.olt-btn--outline {
  background: transparent;
  border-color: var(--olt-border);
  color: var(--olt-text);
}
```

### Chart frame

- keep the chart on a white surface
- add a soft border around the plot area

```css
.olt-chart {
  margin-top: var(--olt-4);
  padding: var(--olt-4);
  border: 1px solid var(--olt-border);
  border-radius: var(--olt-radius-sm);
  background: var(--olt-bg);
}
```

### Tooltip

Dark tooltip with white text, small and readable.

```css
.olt-tooltip {
  background: var(--olt-tooltip-bg);
  color: var(--olt-tooltip-text);
  border-radius: 8px;
  padding: 10px 12px;
  box-shadow: var(--olt-shadow-md);
  font-size: 12px;
}
```

---

## Data Formatting Rules (visual)

- Currency: `"$1,234"` or `"$1,234.56"` (pick one; OLT listing UI uses cents).
- Always label prices **“Per Ticket”** if that’s what you’re showing.
- Listing count: show as `27 listings` (lowercase “listings” like site panels).

---

## Loading / Empty / Error States

### Loading skeleton

Prefer skeleton blocks to avoid layout jump.

- KPIs: gray rectangles where values will go
- Chart: a 160–220px gray panel

### No data

When there are zero eligible listings:

- keep the widget visible
- show: “No eligible listings found for this event.”

### Error

- small red label + optional “Try again”
- do not dump stack traces into the UI

---

## Accessibility

- All buttons must be keyboard focusable.
- `aria-selected` for tabs.
- Color is not the only indicator for up/down change (include ▲/▼ or text).

---

## Recommended DOM Structure (for consistent styling)

```html
<div class="olt-pricing-embed">
  <header>
    <h3 class="olt-embed-title">Ticket Price History</h3>
    <p class="olt-embed-subtitle">Updates hourly • Based on current listings</p>
  </header>

  <section class="olt-kpis">
    <div class="olt-kpi">
      <div class="olt-kpi-label">Min</div>
      <div class="olt-kpi-value olt-kpi-value--price">$1,234.56</div>
    </div>
    <!-- Avg / Max / 24h -->
  </section>

  <div class="olt-tabs" role="tablist" aria-label="Price range">
    <button class="olt-tab" aria-selected="true">24h</button>
    <button class="olt-tab" aria-selected="false">3d</button>
    <button class="olt-tab" aria-selected="false">All</button>
  </div>

  <section class="olt-chart">
    <!-- Recharts canvas -->
  </section>

  <footer style="margin-top: 12px; display:flex; gap:12px; align-items:center;">
    <a class="olt-btn olt-btn--navy" href="#">View Tickets</a>
    <span style="font-size:12px; color: var(--olt-muted);"
      >Last updated: 2:00 PM</span
    >
  </footer>
</div>
```

---

## Implementation Notes (Vite + embed script)

- Prefer emitting **one CSS string** injected into the ShadowRoot (or scoped root) at runtime.
- Avoid relying on host Tailwind. Your widget should be self-contained.
- Keep class names stable; treat them as part of your embed API.

---

## “Close Enough” Visual Checklist

- [ ] White card with thin border
- [ ] Bold title + muted subtitle
- [ ] KPI tiles on light gray background
- [ ] Navy tab highlight + navy CTA button
- [ ] No global CSS leakage
