# Architecture

## Data flow

```
localStorage
    │
    ▼
App.tsx  ──── loadData() on mount
    │          saveData() on every state change
    │
    ├── settings: Settings
    ├── events:   SpecialEvent[]
    ├── extras:   ExtraWorkout[]
    ├── meals:    Meal[]
    └── weights:  WeightEntry[]
          │
          ▼ useMemo
      computeDays()  →  ComputedResult
          │
          └── ComputedDay[]  (one per day in the cut period)
                 budget, consumed, protein, preBufferReduction …
```

## Core calculation (`src/lib/compute.ts`)

1. Total deficit target = (startWeight − targetWeight) × 7700 kcal
2. Daily base deficit = total / days
3. For each day:
   - Look up TDEE by day-of-week pattern
   - Subtract base deficit
   - Subtract pre-buffer reductions from upcoming special events
   - Add extra workout calories
   - If day IS a special event: add excess kcal instead of subtracting buffer

## Weight trend (`src/lib/weight.ts`)

- 7-day rolling average of morning weights
- Weekly change extrapolated from trend
- TDEE correction: compares implied deficit (from weight trend) with assumed deficit (from logged kcal + TDEE settings) — flags if gap ≥ 100 kcal/day

## Storage (`src/lib/storage.ts`)

Single key `cutdata:v1` in localStorage. Full state serialised as JSON on every change. No migrations yet — if schema changes, clear localStorage.

## PWA (`public/sw.js`)

Cache-first strategy. On install, precaches `/`, `/index.html`, `/manifest.webmanifest`. On fetch, returns cached response first; falls back to network and caches the result. Old cache versions are deleted on activate.

## Component hierarchy

```
App
├── NavBar
└── (active view)
    ├── TodayView
    │   ├── ProgressBar
    │   └── MealRow[]
    ├── CalendarView
    │   ├── CalendarGrid
    │   ├── DayBreakdown
    │   ├── UpcomingList
    │   ├── EventModal?
    │   └── ExtraModal?
    ├── WeightView
    │   └── WeightChart
    ├── HistoryView
    └── SettingsView
```
