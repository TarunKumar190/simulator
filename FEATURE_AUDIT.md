# ForgeTwin — Feature Audit

**Audit Date:** 2026-11-26  
**Codebase Baseline:** React 19 + TypeScript + Vite 8 + Express 4 (`server.ts`)  
**Status Legend:** `fully working` | `partially working` | `UI-only` | `missing` | `blocked` | `not verified`

Every feature below was audited by tracing frontend UI actions (`src/App.tsx`, `src/pages/*`, `src/components/*`) through API calls (`/api/*`) to backend execution (`server.ts`).

---

## 1. Authentication & Role-Based Access Control (RBAC)

| Feature | Status | Verified Trace & Findings |
|---|---|---|
| Login Page UI (`LoginPage.tsx`) | **partially working** | Form submits `POST /api/auth/login`; includes quick-select demo buttons. Lacks Firebase Sign-In option and first-run/password registration flow. |
| Credential Verification (`POST /api/auth/login`) | **partially working** | Accepts **any** non-empty email and password without verifying any password hash (`server.ts` lines 1015–1048). Generates a random hex token in an in-memory `Map`, not persisted across restarts. |
| Password Hashing (`scrypt`/`bcrypt`) | **missing** | `UserAccount` has no `passwordHash` or `salt`; passwords are never hashed or compared. |
| Route & API Protection Middleware | **missing** | Zero `/api/*` endpoints check `Authorization: Bearer` tokens or session validity. `src/App.tsx` does not send `Authorization` headers on `apiPost`/`apiPatch`/`EventSource` (except logout). |
| Backend-Enforced RBAC | **missing** | No role checks exist on any backend route. `Operator` role is missing from `UserAccount['role']`. |
| Session Persistence & Secure Logout | **partially working** | `POST /api/auth/logout` deletes from in-memory `activeSessions`, which is wiped on restart anyway. |
| Rate Limiting, CORS, Input Validation, Audit Logs | **missing** | No rate limiting middleware, no explicit CORS policy, no Zod/schema validation, and no persistent `audit_logs` table. |

---

## 2. Database & Persistence

| Feature | Status | Verified Trace & Findings |
|---|---|---|
| PostgreSQL Database & ORM | **missing** | Entire platform state lives in `const state: PlatformState` in memory (`server.ts` line 546). All changes vanish on server restart. |
| Database Migrations & Seed | **missing** | No `drizzle.config.ts`, schema definitions, or SQL migrations exist yet. |
| Telemetry & History Retention | **partially working** | `sensorHistory` is capped at 30 points in memory (`server.ts` lines 860–872); historical queries across dates are impossible. |

---

## 3. Factory Overview & Machine Management

| Feature | Status | Verified Trace & Findings |
|---|---|---|
| Factory Switching (`PATCH /api/factory`) | **partially working** | Works in-memory; resets on restart. `targetOee` is static demo data (`88.4%`, `85.0%`). |
| Machine List, Search & Filters (`MachinesPages.tsx`) | **partially working** | Client-side search & status/area filters work on the 5+ seeded machines. Lacks server-side query support and pagination. |
| Add Machine (`POST /api/machines`) | **partially working** | Creates machine in memory and initializes 3D coordinates/thresholds; lost on restart; no RBAC or strict input schema validation. |
| Edit Machine & Thresholds (`PATCH /api/machines/:id`) | **partially working** | Updates metadata and thresholds in memory and logs an event; not persisted to DB and not RBAC-protected. |
| Deactivate / Delete Machine | **missing** | No `DELETE /api/machines/:id` or deactivation toggle in UI or backend. |
| Machine Detail View (`MachineDetailPage`) | **partially working** | Renders live metrics, thresholds, anomaly history, active alerts, work orders, and events. Limited to 30-point in-memory history. |

---

## 4. Real-Time Software IoT Simulator & SSE Stream

| Feature | Status | Verified Trace & Findings |
|---|---|---|
| Simulator Lifecycle (`start/pause/resume/stop/reset/step`) | **partially working** | `POST /api/simulator/control` works in memory (`0.5x`, `1x`, `2x`, `5x`). Simulator sessions are not tracked or persisted in DB. |
| Fault & Recovery Scenario Injection | **partially working** | `POST /api/simulator/scenario` drives realistic trajectories for 8 scenarios on the selected machine and triggers downstream alerts/twin updates. |
| Real-Time SSE Stream (`/api/stream`) | **partially working** | Pushes full `PlatformState` snapshots on ticks/mutations. Lacks authentication check and sends full payload rather than scoped updates. |

---

## 5. Predictive Maintenance & Anomaly Detection

| Feature | Status | Verified Trace & Findings |
|---|---|---|
| Anomaly Scoring Engine | **partially working** | `evaluateAnomalyAndAlerts` (`server.ts` lines 643–709) uses a deterministic hand-coded threshold-delta heuristic (`0.08 + deltas`), not a trained/calibrated ML pipeline with dataset, preprocessing, persisted model artifact, and measured evaluation metrics. |
| Predictive Maintenance UI (`PredictiveMaintenancePage.tsx`) | **fully working** | Displays health arc, anomaly score, risk category, parameter utilization bars, explainability box, and work-order dispatch. |

---

## 6. Alerts & Events

| Feature | Status | Verified Trace & Findings |
|---|---|---|
| Auto-Alert Generation | **partially working** | Automatically creates deduplicated alerts when anomalies cross threshold (`server.ts` lines 711–777). Lost on restart. |
| Alert Acknowledge & Resolve (`AlertsAndMaintenancePages.tsx`) | **partially working** | `POST /api/alerts/:id/acknowledge` and `/resolve` work in memory. `dateFilter` input on `AlertsPage` (line 43, 143) is **UI-only** — it is stored in state but never used in the `filtered` `useMemo`! |
| Event Timeline | **partially working** | Logs telemetry, anomaly, alert, maintenance, simulator, inspection, and AI events in memory (capped at 80). |

---

## 7. Interactive 3D Digital Twin

| Feature | Status | Verified Trace & Findings |
|---|---|---|
| Three.js 3D Plant Floor (`FactoryTwin3D.tsx`) | **fully working** | Renders 5 industrial machine archetypes with animated spindles/flywheels/conveyors/presses/jaws, vibration jitter, status beacons, raycast selection, camera presets, and 2D SVG WebGL fallback. |
| Live Synchronization (`DigitalTwinPage.tsx`) | **partially working** | Synchronized via SSE from in-memory state; dynamically adding/deactivating machines in DB needs clean rig sync when machine count changes while mounted. |

---

## 8. Computer Vision Quality Inspection

| Feature | Status | Verified Trace & Findings |
|---|---|---|
| Image Upload & Sample Selection (`QualityInspectionPage.tsx`) | **partially working** | Supports drag/drop upload, sample inspection, bounding box overlay, and `.txt` report download. Lacks strict server-side file size & magic-byte validation; stores raw base64 data URLs inside in-memory `state.inspections`. |
| Vision Analysis (`POST /api/quality/inspect`) | **partially working** | Calls `gemini-4-hydrogen` (`@google/genai`) on server side and returns structured JSON. Does not persist image metadata/results to PostgreSQL and needs clearer labeling distinguishing multimodal LLM visual assessment from a dedicated trained CV defect detector. |

---

## 9. Agentic AI Factory Assistant

| Feature | Status | Verified Trace & Findings |
|---|---|---|
| Conversational Investigation (`POST /api/assistant/chat`) | **partially working** | Uses Gemini `gemini-4-hydrogen` with a rule-based fallback if `GEMINI_API_KEY` is missing, plus 4 hardcoded inline tool functions (`get_machine_telemetry`, `get_sensor_history`, `analyze_active_alerts`, `get_maintenance_work_orders`). |
| Missing Backend Tools & DB Grounding | **missing** | Missing dedicated RBAC-enforced tools for `factory_summary`, `machine_details`, `events`, `quality_inspections`, and `create_work_order_draft`. |
| Conversation & Tool Log Persistence | **missing** | Conversations (`CONV-01`, etc.) and messages live only in React local state (`AIAssistantPage.tsx` line 61); page refresh loses all chat history. |
| Human-in-the-Loop Work Order Approval | **fully working** | Renders prepared draft card + Review & Approve modal before calling `POST /api/work-orders`. |

---

## 10. Maintenance Management

| Feature | Status | Verified Trace & Findings |
|---|---|---|
| Work Orders CRUD & Engineer Assignment | **partially working** | Create, assign engineer, update status, and add notes work in memory. Missing transition validation (e.g., preventing invalid state regressions once completed without authorization), edit modal, and DB persistence. |

---

## 11. Analytics & Reports

| Feature | Status | Verified Trace & Findings |
|---|---|---|
| KPI & Sensor Charts (`AnalyticsPage`) | **partially working** | Displays live in-memory metrics; `uptimePercent` and `targetOee` are static demo figures, and `dateRange` (`today | 7d | 30d`) selector is **UI-only** (changes filename on CSV export only, never queries time-windowed data). |
| CSV Export | **partially working** | Generates client-side CSV from current in-memory machine snapshot rather than DB-backed filtered analytics. |
| PDF Export | **UI-only / partial** | Calls `window.print()` (`AnalyticsAndSimulatorPages.tsx` line 88), which opens browser print dialog (often blocked/awkward in iframe) rather than generating a downloadable structured PDF/printable report verified against DB records. |

---

## 12. Notifications & Settings

| Feature | Status | Verified Trace & Findings |
|---|---|---|
| Notifications Center (`NotificationsPage`) | **partially working** | Lists notifications, filters read/unread/category, marks read/all read in memory. Lost on restart. |
| User Management (`SettingsPage`) | **partially working** | Lists, invites, updates roles/status in memory; no password creation, no RBAC enforcement (any user can promote themselves to System Admin), and `Operator` role missing. |
| System Health Diagnostics | **partially working** | Accurately shows `database: "In-Memory Store"`; needs real PostgreSQL health probe & ML model status. |
