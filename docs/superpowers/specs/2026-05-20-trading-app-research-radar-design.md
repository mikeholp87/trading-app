# Trading App Research/Radar Phase Design

**Goal:** Turn the paper-trading desktop app into a symbol-first research desk where a trader can discover, inspect, compare, and annotate opportunities quickly without leaving the app.

**Architecture:** The research/radar phase centers the UI on a selected symbol. The left side discovers symbols through scanner/watchlist surfaces, the center shows a deep-dive research panel, and the right side holds fast context and actions. The existing Alpaca-backed market data flow stays the source of truth; the phase extends it with news and comparison data while preserving stale-request guards so symbol switching never flashes old content.

**Tech Stack:** Electron, Express, plain HTML/CSS/vanilla JS, Alpaca Trading API, Alpaca market data API, lightweight-charts.

---

## Scope

This phase ships a research and radar workspace for paper trading only.

It must help a user answer, in under a few seconds:

1. What is this symbol doing right now?
2. What changed since the last look?
3. How does it compare with nearby alternatives?
4. What should I keep an eye on next?

The phase is not the full execution cockpit. It can include lightweight action entry points like "open order ticket" or "add alert", but it should not try to redesign the full order-management experience.

## Existing Foundation

The current app already has the following useful pieces:

- `public/app.js` already tracks `currentSymbol`, `watchlists`, `symbolNotes`, `alerts`, `chartRequestId`, `rawBars`, and live quote/watchlist state.
- `src/alpaca.js` already exposes account, positions, orders, portfolio history, clock, historical bars, latest quote/trade, snapshots, and watchlist-adjacent market data helpers.
- `src/routes/market.js` already serves bars, historical bars, quotes, clock, snapshot, snapshots, and latest trade routes.
- `public/index.html` and `public/style.css` already provide the panel-grid shell that can be rebalanced instead of replaced.

The phase should reuse those primitives rather than introduce a parallel data model.

## Primary UX

### 1. Left Rail: Scanner and Watchlists

The left rail should combine two discovery modes:

- watchlists, including the existing multi-watchlist support
- a market scanner with simple filters such as gainers, losers, volume spikes, and "has position"

The scanner is a selector, not the main reading surface. Clicking a symbol should immediately load the deep-dive panel.

### 2. Center: Symbol Deep-Dive Panel

This is the anchor of the screen.

The deep-dive panel must include:

- a chart with timeframe switching
- current quote and session status
- key snapshot metrics such as bid, ask, day change, day range, and volume
- selected-symbol news
- symbol notes
- a compact compare strip for side-by-side context against 1 to 3 other symbols

The panel should remain useful even if news or a side feed fails. The chart and last known symbol context should stay visible.

### 3. Right Rail: Fast Context and Actions

The right rail should keep the selected symbol actionable without becoming a full execution workflow.

It should include:

- quick add/remove from watchlists
- set alert from the selected symbol
- open notes and recent annotations
- a small related-symbol block for peers and competitors
- quick jump to recent orders or activity for context

## Data Requirements

### Alpaca-backed data

The phase should use existing Alpaca-backed routes where possible:

- `getSnapshot(symbol)` for selected-symbol snapshot data
- `getLatestQuote(symbol)` and `getLatestTrade(symbol)` for current price context
- `getHistoricalBars(symbol, timeframe, start, end)` for chart history and comparison
- `getClock()` for market/session state
- `getPortfolioHistory()` for equity context if needed in the deep-dive header

### New market-news data

The phase requires a symbol news feed.

If the current Alpaca wrapper does not expose a news endpoint, add one in the existing server/data layer rather than fetching directly from the browser. The browser should continue to call local app routes, not Alpaca directly.

The news response should be normalized for the UI, with at least:

- headline
- source
- published timestamp
- short summary
- related symbol
- link to original article if available

### Comparison data

The compare strip should be lightweight and derived from existing snapshot/bar data. It should not require a separate storage model.

Useful compare fields:

- last price
- daily percent change
- volume
- market cap or float if available
- 1D/5D performance if historical bars are already available

## State and Flow

The phase should preserve the current stale-request protection pattern used in chart loading.

Selection flow:

1. User selects a symbol from watchlist, scanner, or search.
2. The app increments a symbol request token.
3. The app fetches snapshot, chart bars, and news in parallel.
4. Each response checks the current token before mutating state.
5. The deep-dive panel renders only the latest selected symbol.

If a slower response returns after a newer symbol is selected, it must be ignored.

## UI Behavior

The research/radar screen should feel dense but not cluttered.

Rules:

- The selected symbol must be visually obvious.
- The main chart and deep-dive data must stay in view during normal use.
- Secondary lists should not compete with the center panel.
- Empty states should explain what to do next, not just say there is no data.
- On smaller windows, the scanner and right rail may collapse into tabs or drawers, but the selected-symbol panel remains primary.

## Non-Goals

This phase does not need:

- live trading support
- advanced order ticket redesign
- portfolio tax reporting
- backtesting engine
- news scraping outside the Alpaca data layer
- server-side persistence for notes or layouts unless already easy to fit into the current app

## Error Handling

The UI should degrade gracefully:

- If news fails, keep the chart and snapshot visible.
- If snapshot fails, keep the chart and any cached last-price data visible.
- If chart history fails, keep watchlist, scanner, and notes functional.
- If the symbol changes mid-request, discard older responses silently and do not flash stale values.

## Acceptance Criteria

The phase is complete when:

1. A trader can select a symbol and immediately see chart, quote/snapshot, news, and notes in one research surface.
2. A trader can switch between symbols without stale data overwriting the current selection.
3. A trader can scan or filter symbols and jump directly into the deep-dive panel.
4. A trader can compare a selected symbol against a small set of peers without leaving the screen.
5. The UI clearly remains paper-trading only.

## Implementation Notes

The first implementation pass should prioritize:

1. symbol selection state and stale-request control
2. deep-dive panel layout
3. Alpaca news route integration
4. scanner/watchlist placement
5. compare strip and fast actions

Only after those are stable should the design expand into more advanced research utilities.
