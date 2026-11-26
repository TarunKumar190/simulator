# ForgeTwin — Testing Checklist

Each test below must pass before launch readiness sign-off.

## 1. Authentication & Authorization Tests
- [ ] Unauthenticated requests to `/api/state`, `/api/machines`, `/api/work-orders`, `/api/assistant/chat`, `/api/stream` return `401 Unauthorized`.
- [ ] Invalid password login returns `401` and creates an `audit_logs` failure entry.
- [ ] Valid login returns token and user profile; logout revokes session token immediately.
- [ ] `Operator` cannot create/delete machines, manage users, or mutate AI settings (`403 Forbidden`).
- [ ] `Maintenance Engineer` can update work orders and acknowledge alerts, but cannot manage users (`403 Forbidden`).
- [ ] `Quality Inspector` can run quality inspections, but cannot alter machine thresholds (`403 Forbidden`).
- [ ] `Factory Manager` & `System Admin` permissions enforced strictly from DB user record (client-supplied role ignored).

## 2. Database & Persistence Tests
- [ ] Machines, alerts, work orders, inspections, notifications, and AI conversations persist across state reload from PostgreSQL.
- [ ] Sensor readings accumulate in `sensor_readings` during simulator ticks without unbounded memory leaks.

## 3. Machine Management Tests
- [ ] Add machine creates DB row with valid thresholds and 3D coordinates.
- [ ] Edit machine updates metadata & thresholds in DB.
- [ ] Deactivate machine marks `isActive = false` and removes from active floor/twin views; admin delete removes record cleanly.
- [ ] Search, status/area filters, and pagination return accurate subsets and totals.

## 4. Real-Time Simulator & SSE Tests
- [ ] Start, pause, resume, stop, step, and reset update `simulator_sessions` and `tickCount`.
- [ ] Speed change (`0.5x`, `1x`, `2x`, `5x`) updates cadence cleanly.
- [ ] Scenario injection (`Excessive Vibration`, `High Temperature`, `Sudden Shutdown`, `Recovery After Maintenance`) updates telemetry & SSE stream.

## 5. Predictive Maintenance ML Tests
- [ ] Training/evaluation script runs cleanly and outputs non-fabricated metrics on held-out test split.
- [ ] Inference classifies nominal readings as `Normal` and excessive vibration/thermal faults as `High Risk` / `Critical`.

## 6. Quality Inspection Tests
- [ ] Rejects oversized (>5 MB) or invalid-magic-byte files (`400 Bad Request`).
- [ ] Stores valid inspection metadata & local image safely in `quality_inspections`.
- [ ] Missing `GEMINI_API_KEY` returns honest `503` error without fabricated inspection output.

## 7. Agentic AI & Maintenance Tests
- [ ] AI assistant calls DB-backed tools respecting caller RBAC and logs to `ai_tool_logs`.
- [ ] Conversations and messages persist in `ai_conversations` and `ai_messages`.
- [ ] Work order creation enforces valid status transitions (`Open -> Assigned -> In Progress -> Completed`) and persists field notes.

## 8. Analytics & Exports Tests
- [ ] `/api/analytics` returns DB-computed uptime, alert counts, work-order stats, and inspection pass rates filtered by machine & date range.
- [ ] CSV and PDF exports download valid files matching DB counts.

## 9. End-to-End Connected Workflow Test (`M-101` USP)
- [ ] Start simulator -> Inject `Excessive Vibration` on `M-101` -> Readings persist to DB -> ML flags anomaly -> Alert generated -> Dashboard & 3D Twin reflect `critical`/`warning` -> AI Assistant investigates `M-101` using DB tools & proposes draft -> Manager approves work order -> Engineer completes work order -> Recovery restores `M-101` to `running`.
