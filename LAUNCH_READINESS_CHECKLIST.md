# ForgeTwin — Launch Readiness Checklist

Updated after each phase. Do not check off any item until implemented and verified by automated or live execution tests.

## Database & Persistence
- [ ] Cloud SQL PostgreSQL provisioned and connected via Drizzle ORM (`src/db/`)
- [ ] All 16+ tables created and verified in `information_schema.columns`
- [ ] Idempotent seed script (`src/db/seed.ts`) populates initial factory, machines, users, alerts, work orders, and inspections
- [ ] Data persists across server restarts (verified in automated/restart test)

## Authentication & Security
- [ ] `scrypt` salted password hashing + timing-safe verification
- [ ] Server-verified session tokens (`user_sessions`) + Firebase Auth verification support
- [ ] All `/api/*` routes protected by `requireAuth` (except `/api/health`, `/api/auth/login`, `/api/auth/register` or `/api/auth/firebase`)
- [ ] Backend-enforced RBAC for `System Admin`, `Factory Manager`, `Maintenance Engineer`, `Quality Inspector`, `Operator`
- [ ] Rate limiting (`express-rate-limit`), CORS allowlist, Zod input validation
- [ ] Safe upload validation (size + MIME + magic bytes + path confinement)
- [ ] Persistent `audit_logs` for auth, mutations, and privileged actions

## Core Functional Modules
- [ ] Complete Machine Management (Add, Edit, Deactivate/Delete, Search, Filter, Pagination, Details, Readings)
- [ ] Real-Time Simulator (Start, Pause, Resume, Stop, Reset, Step, Speed, Multi-machine, DB session & readings)
- [ ] ML Predictive Maintenance (Dataset, preprocessing, persisted model artifact, real evaluation metrics, inference)
- [ ] Alerts & Events (Auto-trigger, Acknowledge, Resolve, Date/Severity/Machine/Status filters, Event timeline)
- [ ] 3D Digital Twin (Live DB status sync, dynamic add/deactivate sync, WebGL + 2D fallback)
- [ ] Quality Inspection (Validated upload, DB persistence, inspection history, LLM vs CV label, report download)
- [ ] Agentic AI Assistant (10 DB-backed RBAC-enforced tools, DB conversation persistence, human work-order approval)
- [ ] Maintenance Management (Create, Edit, Assign, Valid Status Transitions, Notes, Completion History)
- [ ] Analytics & Reports (Real DB queries by machine & date range, CSV export, PDF report download)

## Verification & Deployment
- [ ] Automated test suite passes (`npm test` / `vitest`) including end-to-end M-101 workflow
- [ ] `npm run lint` (`tsc --noEmit`) passes with 0 errors
- [ ] `npm run build` succeeds cleanly
- [ ] `/api/health` checks Express + PostgreSQL connectivity
- [ ] `README.md`, `.env.example`, and backup/recovery docs complete
