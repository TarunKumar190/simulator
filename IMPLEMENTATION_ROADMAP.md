# ForgeTwin — Implementation Roadmap

This roadmap upgrades the existing ForgeTwin application in strict, testable phases while preserving the existing UI, routes, 3D Digital Twin, simulator, and core workflows.

---

## Phase 0 — Initial Code Audit & Planning (Current)
- Inspect frontend pages, components, backend routes, simulator, ML logic, vision pipeline, and AI assistant.
- Produce `FEATURE_AUDIT.md`, `FUNCTIONALITY_GAP_ANALYSIS.md`, `DATABASE_DESIGN.md`, `IMPLEMENTATION_ROADMAP.md`, `LAUNCH_READINESS_CHECKLIST.md`, `TESTING_CHECKLIST.md`, and `PROJECT_STATUS.md`.
- Obtain Cloud SQL provisioning approval via AI Studio UI.

## Phase 1 — PostgreSQL Database & Persistence
- Provision Cloud SQL PostgreSQL instance and configure Drizzle ORM (`drizzle-orm`, `pg`, `drizzle-kit`).
- Implement `src/db/schema.ts`, `src/db/drizzle.config.ts`, `src/db/index.ts`, and idempotent `src/db/seed.ts`.
- Push schema via `cloudsql.UpdateSchema` and verify columns in `information_schema.columns`.
- Replace in-memory `state` mutations in `server.ts` with PostgreSQL read/write queries while preserving `/api/state` and `/api/stream` compatibility.

## Phase 2 — Authentication, Authorization & Security Hardening
- Implement `scrypt` password hashing, salted verification, and HMAC-signed session tokens persisted in `user_sessions` (plus Firebase Auth token verification when configured).
- Support `System Admin`, `Factory Manager`, `Maintenance Engineer`, `Quality Inspector`, and `Operator` roles.
- Enforce `requireAuth` and `requireRole` middleware on all `/api/*` endpoints; attach Bearer token in `src/App.tsx` requests and SSE connection.
- Add `express-rate-limit`, strict CORS policy, Zod input validation, safe file upload bounds, and `audit_logs` recording.

## Phase 3 — Complete Functional Machine Management
- Implement `POST /api/machines`, `PATCH /api/machines/:id`, `PATCH /api/machines/:id/deactivate`, `DELETE /api/machines/:id`, and paginated `GET /api/machines`.
- Add `GET /api/machines/:id/readings` for historical telemetry queries.
- Add deactivation toggle, pagination controls, and consistent ID synchronization in `MachinesPages.tsx`.

## Phase 4 — Real-Time Simulator Persistence & Control
- Track simulator runs in `simulator_sessions` and logs in `simulator_logs`.
- Persist every simulator tick's readings to `sensor_readings` and evaluate anomalies/alerts/events atomically.
- Support start, pause, resume, stop, reset, step, speed (`0.5x/1x/2x/5x`), and concurrent multi-machine simulation.

## Phase 5 — Calibrated ML Predictive Maintenance Pipeline
- Build `src/ml/` pipeline: synthetic benchmark dataset generation (`data/telemetry_benchmark.json`), feature scaling (z-score + threshold margin ratios), Multivariate Mahalanobis + Isolation-inspired anomaly scorer, and logistic risk classifier (`src/ml/train.ts` -> `src/ml/model_artifact.json`).
- Compute genuine held-out evaluation metrics (precision, recall, F1, confusion matrix) and expose `/api/ml/metrics`.
- Integrate inference into backend telemetry evaluation and surface model metadata in `PredictiveMaintenancePage.tsx`.

## Phase 6 — Alerts & Events Lifecycle
- Persist alerts and machine events in PostgreSQL.
- Wire `dateFilter` on `AlertsPage` to work end-to-end.
- Enforce RBAC and audit logging on alert acknowledge/resolve actions.

## Phase 7 — Digital Twin Live DB Sync
- Keep Three.js `FactoryTwin3D` scene intact; dynamically synchronize machine additions, deactivations, and live DB-backed telemetry status changes.

## Phase 8 — Quality Inspection Upload & Persistence
- Validate uploads (max 5 MB, MIME + magic-byte checks for PNG/JPEG/WEBP), store uploaded images safely on disk (`uploads/inspections/`), and serve via authenticated `/api/quality/images/:filename`.
- Persist records and metadata in `quality_inspections`.
- Label LLM multimodal inspection clearly and surface `MODEL_UNAVAILABLE` cleanly when `GEMINI_API_KEY` is absent.

## Phase 9 — Agentic AI Assistant Expansion & Persistence
- Expand backend tools to 10 RBAC-checked DB queries (`factory_summary`, `machine_status`, `machine_details`, `sensor_history`, `active_alerts`, `pending_work_orders`, `machine_health`, `recent_events`, `quality_inspections`, `prepare_work_order_draft`).
- Persist conversations, messages, and tool execution traces in PostgreSQL (`ai_conversations`, `ai_messages`, `ai_tool_logs`).
- Enforce human-in-the-loop approval before creating work orders.

## Phase 10 — Maintenance Management Lifecycle
- Enforce valid status transition rules (`Open -> Assigned -> In Progress -> Completed`), role permissions, full editing, persistent notes, and completion timestamps.

## Phase 11 — DB-Backed Analytics & Real Exports
- Compute actual uptime, downtime, alert breakdown, MTTR/completion, and inspection pass rates from PostgreSQL filtered by `machineId` and `range` (`today | 7d | 30d`).
- Implement verified CSV and downloadable PDF report generation (`GET /api/analytics/export`).

## Phases 12–14 — Automated Testing, Security Review & Deployment Readiness
- Add `vitest` + Supertest integration test suite covering auth, RBAC, DB persistence, CRUD, simulator, ML evaluation, alerts, AI tools, quality upload validation, work orders, exports, and the full 12-step `M-101` end-to-end workflow.
- Run `npm run lint`, `npm run build`, and `bun audit`.
- Add `/api/health`, backup/recovery documentation, and complete `README.md`.
