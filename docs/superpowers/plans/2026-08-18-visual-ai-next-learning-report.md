# Visual AI Next Learning Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the complete localhost report readable at a glance and end it with an actionable AI next-learning recommendation.

**Architecture:** Keep the existing static preview data and HOME/LIFE/category interactions. Restructure the React view into a visual current-state hero, compact numeric comparison, one selected domain panel, and a final recommendation card whose details open on demand.

**Tech Stack:** React 19, TypeScript, Vinext, CSS, Node test runner, JSDOM

**Spec:** Approved in the 2026-08-18 conversation: current state first; then change, domain state, and AI next-learning recommendation; detailed evidence remains collapsed.

## Global Constraints

- Apply only to `/report?example=complete` through `NumericReportPreview`.
- Keep HOME/LIFE and category selection behavior.
- Do not connect the preview to the database.
- Do not implement real teacher authorization or plan persistence.
- Use short Korean labels and preserve accessible names and keyboard-native controls.

---

### Task 1: Visual hierarchy and next-learning recommendation

**Files:**
- Modify: `mormi-web/tests/numeric-report-preview.dom.test.mjs`
- Modify: `mormi-web/app/report/NumericReportPreview.tsx`
- Modify: `mormi-web/app/globals.css`

**Interfaces:**
- Consumes: existing `PreviewDomain`, HOME/LIFE selection, domain selection.
- Produces: current-state hero, compact comparisons, selected-domain AI insight, and `.numeric-next-plan` recommendation with native `<details>` disclosure.

- [x] **Step 1: Write the failing rendered-behavior test**

Add assertions that the report exposes one current-state headline, four key measures, a final AI recommendation, and a native plan disclosure containing repetition concept, problem count, starting ladder level, and observation point.

- [x] **Step 2: Run the focused test to verify it fails**

Run: `node --experimental-transform-types --import ./tests/ts-resolver.mjs --test tests/numeric-report-preview.dom.test.mjs`

Expected: FAIL because `.numeric-next-plan` and its plan disclosure do not exist.

- [x] **Step 3: Implement the minimal React structure and styles**

Add recommendation fields to each preview domain, render the four-section reading flow, remove repeated visible AI paragraphs, and add a visually prominent bottom recommendation card. Use large numbers, soft mint/lilac/blue surfaces, rounded corners, whitespace, restrained shadows, and responsive stacking.

- [x] **Step 4: Run focused and full verification**

Run the focused DOM test, all report tests, lint, TypeScript, and production build. Verify `/report?example=complete` in the browser at desktop and narrow width.

- [x] **Step 5: Commit**

Commit the tested report-only change on `codex/numeric-report-preview`.
