# ForgeTwin — Functionality Gap Analysis

This document details every technical gap between the existing ForgeTwin prototype and a launch-ready, database-connected, security-hardened industrial platform.

---

## 1. Persistence & Data Architecture Gaps
- **Current State:** Single global JavaScript object (`state: PlatformState`) and `activeSessions = new Map()` in `server.ts`. Restarting Node/tsx resets all telemetry, machines, alerts, work orders, quality inspections, notifications, and users.
- **Target State:** Managed **PostgreSQL (Cloud SQL)** via **Drizzle ORM** with versioned schema and idempotent seed script covering:
  - `users`, `user_sessions`
  - `factories`, `machines`, `sensor_readings`
  - `simulator_sessions`, `simulator_logs`
  - `anomalies`, `alerts`, `machine_events`
  - `work_orders`, `work_order_notes`
  - `quality_inspections` (with file storage path/metadata)
  - `ai_conversations`, `ai_messages`, `ai_tool_logs`
  - `notifications`, `audit_logs`, `app_settings`

## 2. Authentication, Security & RBAC Gaps
- **Current State:**
  - `POST /api/auth/login` accepts any password for any email and does not hash or verify passwords.
  - Zero endpoints verify bearer tokens (`requireAuth` is absent).
  - Zero role-based access enforcement (`System Admin`, `Factory Manager`, `Maintenance Engineer`, `Operator`, `Quality Inspector`).
  - Frontend `src/App.tsx` omits `Authorization` headers on all `fetch` calls except logout, and `EventSource('/api/stream')` cannot send custom headers cleanly without a query/cookie or authenticated stream token.
  - `Operator` role is missing from `UserAccount['role']`.
  - No rate limiting, no CORS allowlist, no Zod validation, no audit logging.
- **Target State:**
  - Server-side `scrypt` password hashing + per-user random salt + timing-safe comparison.
  - Signed HMAC/JWT session tokens stored in `user_sessions` (plus optional Firebase Auth sign-in verified via `firebase-admin`).
  - Strict `requireAuth` and `requireRole(...)` middleware on every `/api/*` route, never trusting client-supplied `role` or `user` names.
  - Server-enforced permissions matrix across Admin, Factory Manager, Maintenance Engineer, Quality Inspector, and Operator.
  - `express-rate-limit` on auth, AI, upload, and general API routes; strict CORS origin policy; Zod input validation; persistent `audit_logs`.

## 3. Machine Management Gaps
- **Current State:**
  - Cannot deactivate/soft-delete or permanently delete machines.
  - No pagination on machine table (`MachinesListPage`).
  - `sensorHistory` capped at 30 points in RAM.
- **Target State:**
  - Soft-deactivate (`isActive = false` / `Deactivated`) and admin delete endpoints (`PATCH /api/machines/:id/deactivate`, `DELETE /api/machines/:id`), updating Digital Twin & Dashboard consistently.
  - Paginated `GET /api/machines` with search, status, area, and active/inactive filtering, plus pagination controls in UI.
  - Historical sensor readings stored in `sensor_readings` table and queryable by time window (`GET /api/machines/:id/readings`).

## 4. Simulator & Streaming Gaps
- **Current State:**
  - Simulator runs via `setInterval` in memory; sessions are not recorded (`started_at`, `ended_at`, `tick_count`, `operator_id`).
  - SSE stream broadcasts full unauthenticated state.
- **Target State:**
  - Simulator sessions persisted in `simulator_sessions`; ticks write batched `sensor_readings`, `anomalies`, `alerts`, `machine_events`, and `simulator_logs` to PostgreSQL.
  - SSE stream authenticated via short-lived stream token or verified Bearer/session token.

## 5. Predictive Maintenance ML Pipeline Gaps
- **Current State:**
  - `evaluateAnomalyAndAlerts` uses a 4-line manual weighted sum against thresholds (`server.ts` lines 643–709) — no dataset, no feature normalization, no trained model artifact, and no real evaluation metrics.
- **Target State:**
  - Dedicated TypeScript/Node ML module (`src/ml/`):
    - Curated labeled training & validation telemetry dataset generator + CSV/JSON dataset artifact (`data/telemetry_benchmark.json`).
    - Preprocessing pipeline (z-score standardization + threshold-ratio feature engineering across temperature, vibration, pressure, RPM, load, and thermal-vibration interaction).
    - Trained & persisted model artifact (`src/ml/model_artifact.json`) implementing a **calibrated Multivariate Mahalanobis / Ensemble Anomaly Detector + Logistic Risk Classifier** trained on nominal vs fault regimes.
    - Automated training & evaluation script producing genuine confusion matrix, precision, recall, F1, and ROC-AUC metrics on held-out test split (exposed via `/api/ml/metrics` and shown transparently in Predictive Maintenance).

## 6. Alerts, Events & Maintenance Gaps
- **Current State:**
  - `AlertsPage` `dateFilter` input is disconnected (`UI-only`).
  - Work order status allows arbitrary jumps (even reopening or mutating completed orders without guardrails) and lacks full edit modal (priority, due date, issue description).
- **Target State:**
  - Wire `dateFilter` on `AlertsPage` to filter alerts accurately by date.
  - Enforce valid work order state machine (`Open -> Assigned -> In Progress -> Completed`, with Manager/Admin override only for reopening), full edit support (`PATCH /api/work-orders/:id`), persistent `work_order_notes`, and audit logging.

## 7. Quality Inspection Gaps
- **Current State:**
  - Raw base64 images stored inside JSON state in memory; no file-size limit or magic-byte check; no persistence.
  - UI does not explicitly note that Gemini multimodal analysis is an LLM visual assessment rather than a calibrated industrial CV classifier.
- **Target State:**
  - Validate uploaded files (max 5 MB, MIME + binary magic-byte verification for PNG/JPEG/WEBP), save uploaded inspection images safely under controlled local directory (`uploads/inspections/` with path-traversal protection) and serve via authenticated `/api/quality/images/:filename`, storing metadata in `quality_inspections`.
  - Clearly label Gemini Vision assessment vs dedicated CV inspection model and handle missing `GEMINI_API_KEY` cleanly without fabricated outputs.

## 8. Agentic AI Assistant Gaps
- **Current State:**
  - Only 4 inline helper functions; chat history and tool logs disappear on page refresh; no RBAC checks per tool.
- **Target State:**
  - 9+ structured DB-backed tools (`get_factory_summary`, `get_machine_status`, `get_machine_details`, `get_sensor_history`, `get_active_alerts`, `get_pending_work_orders`, `get_machine_health`, `get_recent_events`, `get_quality_inspections`, `prepare_work_order_draft`), all enforcing caller role permissions and logging every tool invocation to `ai_tool_logs`.
  - Full DB persistence for `ai_conversations` and `ai_messages` via `GET/POST /api/assistant/conversations`.

## 9. Analytics & Export Gaps
- **Current State:**
  - `uptimePercent` and `targetOee` are hardcoded static numbers; `dateRange` filter (`today | 7d | 30d`) does not query filtered DB records; PDF export relies on `window.print()` which behaves poorly inside embedded iframes.
- **Target State:**
  - Real SQL aggregation queries (`GET /api/analytics?machineId=...&range=...`) computing actual uptime/downtime percentages from `sensor_readings` + `machine_events`, alert severity breakdowns, MTTR/completion metrics, and inspection pass rates.
  - Server/client verifiable CSV export and downloadable real PDF report (`application/pdf` generated cleanly without `window.print()`).
