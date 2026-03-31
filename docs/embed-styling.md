# Historical Ticket Pricing Embed — Styling Guide (Source of Truth)

This document is the **source of truth** for the embeddable Historical Ticket Pricing widget. It reflects the live implementation in:

- **`app/embed/src/styles/tokens.css`** — design tokens (CSS custom properties)
- **`app/embed/src/styles/components.css`** — component styles

When in doubt, the CSS files in `app/embed/src/styles/` are authoritative; this doc summarizes them for maintainers and design reference.

---

## Goals

1. **Blend in with OLT**: Clean white surfaces, subtle borders, bold headings, brand blue/navy for emphasis.
2. **Embed-safe**: Styles must not leak to the host page; host styles must not break the embed. Use Shadow DOM and scoped selectors.
3. **Readable + fast**: System font stack, minimal layout shifts, responsive.

---

## Design Tokens

Tokens are defined on **`:host`** (Shadow DOM root) in `tokens.css`. Naming: `--olt-[category]-[variant]`.

### Typography

- **`--olt-font-sans`**: system-ui, -apple-system, "Segoe UI", "Roboto", "Helvetica Neue", "Arial", emoji stacks, sans-serif

### Brand Colors

- **`--olt-brand-blue`**: #24a8df (Accent: focus rings, chart hover, interactions)
- **`--olt-brand-navy`**: #2c356d (Chart line, active toggles, emphasis)
- **`--olt-brand-green`**: #4fce63 (CTA gradient end)

### Surfaces & Backgrounds

- **`--olt-surface`**: #ffffff
- **`--olt-surface-2`**: #f7f8fa
- **`--olt-white`**: #ffffff

### Text

- **`--olt-text`**: #111827
- **`--olt-text-2`**: #4b5563
- **`--olt-muted`**: #6b7280

### Borders

- **`--olt-border`**: #e6e8ee

### Semantic (status)

- **`--olt-success`**: #16a34a
- **`--olt-success-bg`**: rgba(22, 163, 74, 0.1)
- **`--olt-danger`**: #dc2626
- **`--olt-danger-bg`**: rgba(220, 38, 38, 0.1)

### Radii

- **`--olt-radius-sm`**: 6px
- **`--olt-radius-md`**: 10px
- **`--olt-radius-pill`**: 999px

### Shadows

- **`--olt-shadow-sm`**: 0 1px 2px rgba(0, 0, 0, 0.06)
- **`--olt-shadow-md`**: 0 2px 10px rgba(0, 0, 0, 0.08)
- **`--olt-shadow-pill`**: 0 1px 3px rgba(0, 0, 0, 0.1)

### Spacing (4px base)

- **`--olt-space-1` … `--olt-space-5`**: 4px, 8px, 12px, 16px, 20px

### Transitions

- **`--olt-transition-fast`**: 150ms ease
- **`--olt-transition-base`**: 200ms ease
- **`--olt-transition-smooth`**: 250ms cubic-bezier(0.4, 0, 0.2, 1)

### Chart Tokens

- **`--olt-tooltip-bg`**: #111827
- **`--olt-tooltip-text`**: #ffffff

### CTA Tokens

- **`--olt-cta-gradient`**: linear-gradient(to right, var(--olt-brand-blue), var(--olt-brand-green))
- **`--olt-cta-shadow`**: 0 2px 8px rgba(36, 168, 224, 0.2)
- **`--olt-cta-shadow-hover`**: 0 4px 16px rgba(36, 168, 224, 0.35)

---

## Embed Safety

- **Shadow DOM**: The widget is mounted inside a ShadowRoot. Tokens are on `:host`; all component styles are scoped under `.olt-pricing-embed`. No global resets; box-sizing and font are applied only within the embed.
- **Class prefix**: All embed classes use the `.olt-` prefix to avoid collisions with host page CSS.

---

## Component Structure & Classes

### Root

- **`.olt-pricing-embed`** — Root container. Flex column, gap, border, radius, shadow, padding. Max-width 800px. Theme modifier: `.theme-light` / `.theme-dark` (class on root).

### Header

- **`.olt-header`** — Flex row, space-between, wrap; border-bottom.
- **`.olt-header-left`** — Column for title + subtitle.
- **`.olt-title-row`** — Row for title + mobile range-change badge.
- **`.olt-header-right`** — CTA + desktop range-change badge.
- **`.olt-title`** — Event title (18px, bold). Links use brand navy.
- **`.olt-subtitle`** — Event date/time (13px, muted).

### Range Change Badge

- **`.olt-change`** — Badge container (inline-flex, padding, radius).
- **`.olt-change--up`** — Green background (success).
- **`.olt-change--down`** — Red background (danger).
- **`.olt-change--mobile`** — Shown only on mobile (≤480px).
- **`.olt-change--desktop`** — Shown only on desktop; hidden on mobile.
- **`.olt-change-label`** — Range label (`24h`, `3d`, `All`) or `N/A`.

### Status Bar (stat selector + timeline)

- **`.olt-status-bar`** — Flex row; left = stat selector, right = timeline toggle.
- **Stat selector** — The stat bar doubles as the metric selector: same pill/toggle style as timeline, sized for price + label. Uses **`.olt-toggle-group--stat`** (3 columns), **`.olt-toggle-pill`**, and **`.olt-toggle--stat`** buttons. Each button shows **`.olt-toggle-stat-price`** and **`.olt-toggle-stat-label`** (MIN/AVG/MAX). Clicking a stat switches the chart metric; `data-active-index` and `aria-pressed` indicate the active metric.

### Toggle Controls

- **`.olt-controls`** — Wrapper for toggle groups (timeline only; metric selector lives in status-left).
- **`.olt-toggle-group`** — Pill container (border, radius-pill, surface-2). Uses `data-active-index="0"|"1"|"2"` for sliding pill position.
- **`.olt-toggle-group--stat`** — Stat selector: 3 columns, price + label per segment.
- **`.olt-toggle-group--range`** — 3 columns (24 HR / 3 DAY / ALL).
- **`.olt-toggle-pill`** — Sliding white pill (shadow, transition). Position driven by `data-active-index`.
- **`.olt-toggle`** — Button: transparent bg, muted text; `aria-pressed="true"` → brand navy. Focus-visible: brand blue outline.
- **`.olt-toggle--stat`** — Stat segment: flex column, **`.olt-toggle-stat-price`** (bold) + **`.olt-toggle-stat-label`** (uppercase).

### Chart

- **`.olt-chart`** — Chart section (min-height 280px; 200px on mobile).
- **`.olt-chart-wrapper`** — Wrapper for Recharts (height 280px / 200px).
- **Timeline formatting**:
  - **24 HR**: intraday time-of-day labels on X-axis (e.g. `12 AM`, `3 AM`, `6 AM`), with tick density reduced on mobile.
  - **3 DAY**: hour-only labels on X-axis (unchanged).
  - **ALL**: date labels on X-axis (unchanged).
- **`.olt-chart-tooltip`** — Custom tooltip (dark bg, light text, radius, shadow).
- **`.olt-chart-tooltip-date`**, **`.olt-chart-tooltip-row`**, **`.olt-chart-tooltip-label`**, **`.olt-chart-tooltip-value`** — Tooltip structure.

### Primary CTA

- **`.olt-btn-primary`** — Gradient button (brand blue → green), white text, shadow. Used for “VIEW TICKETS”.
- **`.olt-header-cta`** — Shown on desktop; hidden on mobile.
- **`.olt-mobile-cta`** — Hidden on desktop; full-width CTA block on mobile (≤480px).

### Footer

- **`.olt-footer`** — Timestamp row.
- **`.olt-timestamp`** — “Updated …” muted text (11px).

### UI States

- **`.olt-skeleton`** — Loading shimmer (gradient animation).
- **`.olt-skeleton-chart`** — Chart placeholder height (300px).
- **`.olt-error`** — Error message (danger bg/border, padding).
- **`.olt-event-ended-notice`** — “This event has ended” (surface-2, muted).

## Responsive Breakpoints

- **860px**: Root padding reduced to `--olt-space-4`.
- **480px**: Header stacks; title row full width; mobile badge visible, desktop badge hidden; status bar stacks; chart height 200px; header CTA hidden, mobile CTA visible; compact toggle padding.

---

## DOM Structure (reference)

```html
<div class="olt-pricing-embed theme-light">
  <header class="olt-header">
    <div class="olt-header-left">
      <div class="olt-title-row">
        <h2 class="olt-title"><a href="...">Event Title</a></h2>
        <span class="olt-change olt-change--mobile olt-change--up">…</span>
      </div>
      <span class="olt-subtitle">Date/time</span>
    </div>
    <div class="olt-header-right">
      <span class="olt-change olt-change--desktop olt-change--up">…</span>
      <a href="..." class="olt-btn-primary olt-header-cta">VIEW TICKETS</a>
    </div>
  </header>

  <div class="olt-status-bar">
    <div class="olt-status-left">
      <div class="olt-stats-note">Live market stats</div>
      <div
        class="olt-toggle-group olt-toggle-group--stat"
        role="group"
        aria-label="Price metric"
        data-active-index="0"
      >
        <span class="olt-toggle-pill" aria-hidden="true"></span>
        <button
          type="button"
          class="olt-toggle olt-toggle--stat"
          aria-pressed="true"
        >
          <span class="olt-toggle-stat-price">$125</span
          ><span class="olt-toggle-stat-label">MIN</span>
        </button>
        <button
          type="button"
          class="olt-toggle olt-toggle--stat"
          aria-pressed="false"
        >
          <span class="olt-toggle-stat-price">$285</span
          ><span class="olt-toggle-stat-label">AVG</span>
        </button>
        <button
          type="button"
          class="olt-toggle olt-toggle--stat"
          aria-pressed="false"
        >
          <span class="olt-toggle-stat-price">$450</span
          ><span class="olt-toggle-stat-label">MAX</span>
        </button>
      </div>
    </div>
    <div class="olt-controls">
      <div
        class="olt-toggle-group olt-toggle-group--range"
        data-active-index="0"
      >
        <span class="olt-toggle-pill" aria-hidden="true"></span>
        <button class="olt-toggle" aria-pressed="true">24 HR</button>
        <button class="olt-toggle" aria-pressed="false">3 DAY</button>
        <button class="olt-toggle" aria-pressed="false">ALL</button>
      </div>
    </div>
  </div>

  <div class="olt-chart">
    <div class="olt-chart-wrapper"><!-- Recharts --></div>
  </div>

  <div class="olt-mobile-cta">
    <a href="..." class="olt-btn-primary">VIEW TICKETS</a>
  </div>

  <footer class="olt-footer">
    <span class="olt-timestamp">Updated …</span>
  </footer>

  <!-- optional -->
  <div class="olt-event-ended-notice">This event has ended</div>
</div>
```

---

## Data Formatting (visual)

- **Currency**: Use `$` + whole number or two decimals (e.g. `$125` or `$125.50`). Widget uses rounded whole dollars in stats/chart.
- **Range change**: Show as percentage with sign (e.g. `+5.2%`, `-3.1%`). Green for down (good for buyers), red for up.
- **Range change source**: Badge is computed in the frontend from the visible chart dataset for the selected metric/range (`24h`, `3day`, `alltime`), not from fixed backend 24h fields.
- **Range change N/A**: If there are fewer than 2 valid points, baseline is `0`, or values are missing, show **N/A** (never force `0%`).
- **Labels**: Uppercase for stat labels (MIN, AVG, MAX) and range toggle text (24 HR, 3 DAY, ALL). Badge label uses compact range text (`24h`, `3d`, `All`).
- **Missing buckets (null values)**: For some timestamps there may be no eligible listings, so a metric can be `null`. Treat `null` as **missing data (a gap)**. Never coerce `null` to `0`—that can create impossible visuals (e.g. showing `MAX=$0` while `MIN=$507` for the same bucket).

### Unified display model

Chart, stat bar, and change badge all derive values from the same visible chart dataset. Shared validity helpers (`isValidMetricValue`, `getLastValidMetricValue`, `getRangeEndpoints`, `computeRangePercentChange`) live in `app/embed/src/utils/chartMetrics.js` and enforce one rule: a metric is valid iff `typeof v === 'number' && Number.isFinite(v)`.

- **Stat bar** shows the last valid value per metric from the displayed series (not from a separate backend RPC snapshot).
- **Badge** derives percent change from the first and last valid values in the visible series **for the currently selected metric** (min, avg, or max). Toggling the metric updates the badge.
- **Chart** renders null buckets as gaps and uses the same validity helper for tooltip display and Y-axis domain.

This ensures all three surfaces agree when data is sparse, stale, or missing.

---

## Loading / Empty / Error

- **Loading**: Use `.olt-skeleton` / `.olt-skeleton-chart`; no layout jump.
- **No data**: Keep widget visible; show a short message (e.g. “No chart data available”).
- **Error**: Use `.olt-error`; message + link if appropriate; no stack traces in UI.

---

## Accessibility

- All interactive elements (buttons, links) are focusable. Use `focus-visible` outlines (brand blue).
- Toggles use `aria-pressed`; range change badge uses range-specific `aria-label` text.
- Color is not the only indicator for up/down: include signed percentages and explicit range labels.

---

## Implementation Notes

- Styles are injected into the Shadow DOM as a single concatenated string (tokens + components) via `app/embed/src/bootstrap/styles.js`.
- Do not rely on host Tailwind or global CSS; the widget is self-contained.
- Treat class names as part of the embed contract; avoid breaking renames.
