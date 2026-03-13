# Embed Final Polish — Audit Summary

**Date**: 2025-03-05  
**Scope**: React + Vite embeddable widget (`embed/`)

---

## A. Audit Summary

### 1. Redundancy

| Item | Location | Issue |
|------|----------|-------|
| **Duplicate 24h change badge** | `App.jsx` L144–173 | Same JSX block duplicated for mobile vs desktop; only CSS visibility differs. Extract to `<ChangeBadge />` component. |
| **Dead `checkEventEnded`** | `App.jsx` L18–27 | Defined but never used. API client returns `eventEnded` in `fetchWidgetData`. Remove. |
| **Duplicate CTA links** | `App.jsx` | "VIEW TICKETS" in header + mobile-cta. Intentional for responsive layout; keep as-is. |
| **Unused `fetchChartData`** | `api/client.js` | Exported but never called; App uses `fetchWidgetData` which includes chart data. Consider removing or document as optional API. |

### 2. Inconsistency

| Item | Issue |
|------|-------|
| **Chart colors** | `PriceChart.jsx` uses hardcoded `#2C356D`, `#24A8DF` instead of `--olt-chart-line`, `--olt-chart-accent` from tokens. |
| **Mount attributes** | `index.html` uses `te-event-id`; `index.production.html` uses `data-event-id`. Align to `te-event-id` (primary) for consistency. |
| **Production test event ID** | `index.production.html` has `data-event-id="lakers-celtics-2024-03-15"` (slug). Real API expects numeric TE event ID (e.g. `2795412`). |
| **Config `mode` not passed** | `parseConfig` reads `data-mode` but App never passes `config.mode` to `fetchWidgetData`. Mock/real toggle on mount node has no effect. |
| **Spacing token naming** | `tokens.css` uses `--olt-space-1`…`--olt-space-6`; `style.md` uses `--olt-1`…`--olt-6`. Implementation is correct; docs are stale. |

### 3. Stale / Outdated

| Item | Location | Issue |
|------|----------|-------|
| **README.md** | `embed/README.md` | References `PriceDisplay.jsx` (renamed to `PriceStats.jsx`), `embed.css` (deleted; now `tokens.css` + `components.css`). |
| **docs/style.md** | `docs/style.md` | Old token names (`--olt-navy-900`, `--olt-blue-500`), old class names (`.olt-kpis`, `.olt-tab`). Current uses `.olt-toggle-group--stat` (stat selector), `.olt-toggle-group`, `--olt-brand-*`. |
| **docs/STYLE_ALIGNMENT_CHECKLIST.md** | `docs/` | Entirely outdated. References non-existent classes and old token names. |
| **index.production.html** | `embed/` | Wrong event ID format; uses `data-event-id` instead of `te-event-id`. |
| **tests/embed-test-page.html** | `tests/` | Import path `./src/main.jsx` assumes project root; embed lives in `embed/`. Event IDs like `te_single_test` are non-numeric. |

### 4. Comments & Structure

| Item | Issue |
|------|-------|
| **App.jsx** | Comment "Mobile-only badge (duplicate for layout purposes)" is accurate but could be clearer. |
| **PriceChart.jsx** | Good JSDoc. Some inline comments are verbose. |
| **bootstrap/index.jsx** | JSDoc says "data-event-id" in `initializeWidgets` but also supports `te-event-id`. Minor. |
| **api/client.js** | Well-documented. `fetchChartData` export is standalone; consider if needed. |

### 5. What to Consolidate

- **Change badge**: Single component, two CSS classes for visibility.
- **Chart colors**: Use CSS variables from tokens.
- **Config flow**: Pass `config.mode` to `fetchWidgetData` so `data-mode="mock"` works.
- **Docs**: Update README, align style.md with current tokens, deprecate or update STYLE_ALIGNMENT_CHECKLIST.

---

## B. Cleanup Plan (Small Steps)

1. **Component cleanup**
   - Extract `ChangeBadge` from App.jsx.
   - Remove dead `checkEventEnded` from App.jsx.
   - Pass `config.mode` to `fetchWidgetData`.

2. **Styling consolidation**
   - Use `var(--olt-chart-line)` and `var(--olt-chart-accent)` in PriceChart (requires passing tokens into Recharts or using a wrapper with CSS vars).

3. **Comment cleanup**
   - Trim redundant comments in App.jsx, PriceChart.jsx.
   - Ensure bootstrap JSDoc reflects both `te-event-id` and `data-event-id`.

4. **Documentation cleanup**
   - Update `embed/README.md` (structure, component names, styles).
   - Update `index.production.html` (te-event-id, numeric event ID).
   - Update `docs/style.md` to match current tokens and classes (or add "current implementation" section).
   - Add note to `STYLE_ALIGNMENT_CHECKLIST.md` that it's historical; or archive.

5. **Optional**
   - Remove or document `fetchChartData` in api/client.js.
   - Fix tests/embed-test-page.html paths if still used.
