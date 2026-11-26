# ForgeTwin — PostgreSQL Database Design

**Database Engine:** Cloud SQL (PostgreSQL)  
**ORM & Migrations:** Drizzle ORM (`drizzle-orm/node-postgres`, `pg`, `drizzle-kit`)

---

## Entity-Relationship Overview

```
factories (1) ───< (N) machines (1) ───< (N) sensor_readings
                         │
                         ├───< (N) anomalies
                         ├───< (N) alerts
                         ├───< (N) machine_events
                         ├───< (N) work_orders ───< (N) work_order_notes
                         └───< (N) quality_inspections

users (1) ───< (N) user_sessions
      ├───< (N) simulator_sessions ───< (N) simulator_logs
      ├───< (N) ai_conversations ───< (N) ai_messages ───< (N) ai_tool_logs
      ├───< (N) notifications
      └───< (N) audit_logs
```

---

## Table Schemas

### 1. `users` & `user_sessions`
- **`users`**:
  - `id` (`varchar(32)`, PK — e.g. `USR-01`)
  - `name` (`text`, not null)
  - `email` (`text`, unique, not null)
  - `passwordHash` (`text`, not null — `scrypt` hex)
  - `passwordSalt` (`text`, not null)
  - `firebaseUid` (`text`, nullable, unique)
  - `role` (`varchar(32)`, not null — `'System Admin' | 'Factory Manager' | 'Maintenance Engineer' | 'Quality Inspector' | 'Operator'`)
  - `status` (`varchar(16)`, not null default `'Active'`)
  - `department` (`text`, not null)
  - `lastActiveAt` (`timestamp with time zone`)
  - `createdAt` (`timestamp with time zone`, default now)
- **`user_sessions`**:
  - `id` (`varchar(64)`, PK — token hash SHA-256)
  - `userId` (`varchar(32)`, FK -> `users.id` cascade)
  - `expiresAt` (`timestamp with time zone`, not null)
  - `createdAt` (`timestamp with time zone`, default now)
  - `revokedAt` (`timestamp with time zone`, nullable)

### 2. `factories` & `app_settings`
- **`factories`**:
  - `id` (`varchar(32)`, PK — e.g. `FAC-01`)
  - `name` (`text`, not null)
  - `location` (`text`, not null)
  - `shift` (`text`, not null)
  - `targetOee` (`real`, not null)
  - `isActive` (`boolean`, default false)
- **`app_settings`**:
  - `key` (`varchar(64)`, PK — e.g. `'ai_config'`, `'active_factory_id'`)
  - `value` (`jsonb`, not null)
  - `updatedBy` (`varchar(32)`, nullable)
  - `updatedAt` (`timestamp with time zone`, default now)

### 3. `machines` & `sensor_readings`
- **`machines`**:
  - `id` (`varchar(32)`, PK — e.g. `M-101`)
  - `factoryId` (`varchar(32)`, FK -> `factories.id`)
  - `name` (`text`, not null)
  - `category` (`text`, not null)
  - `area` (`text`, not null)
  - `modelType` (`varchar(24)`, not null)
  - `status` (`varchar(16)`, not null)
  - `healthScore` (`integer`, not null)
  - `temperature` (`real`, not null)
  - `vibration` (`real`, not null)
  - `pressure` (`real`, not null)
  - `rpm` (`integer`, not null)
  - `load` (`real`, not null)
  - `anomalyScore` (`real`, not null)
  - `riskCategory` (`varchar(24)`, not null)
  - `abnormalParameters` (`jsonb`, `string[]`)
  - `flaggedReason` (`text`, not null)
  - `position3D` (`jsonb`, `[number, number, number]`)
  - `thresholds` (`jsonb`, `MachineThresholds`)
  - `scenario` (`varchar(48)`, not null)
  - `isActive` (`boolean`, not null, default true)
  - `lastUpdatedAt` (`timestamp with time zone`, default now)
- **`sensor_readings`**:
  - `id` (`serial`, PK)
  - `machineId` (`varchar(32)`, FK -> `machines.id` cascade, indexed)
  - `sessionId` (`varchar(36)`, nullable, FK -> `simulator_sessions.id`)
  - `temperature` (`real`, not null)
  - `vibration` (`real`, not null)
  - `pressure` (`real`, not null)
  - `rpm` (`integer`, not null)
  - `load` (`real`, not null)
  - `healthScore` (`integer`, not null)
  - `anomalyScore` (`real`, not null)
  - `recordedAt` (`timestamp with time zone`, default now, indexed)

### 4. `simulator_sessions` & `simulator_logs`
- **`simulator_sessions`**:
  - `id` (`varchar(36)`, PK)
  - `startedBy` (`varchar(32)`, FK -> `users.id`)
  - `status` (`varchar(16)` — `'running' | 'paused' | 'stopped'`)
  - `speed` (`real`, not null default 1)
  - `selectedMachineId` (`varchar(32)`)
  - `tickCount` (`integer`, default 0)
  - `startedAt` (`timestamp with time zone`, default now)
  - `endedAt` (`timestamp with time zone`, nullable)
- **`simulator_logs`**:
  - `id` (`varchar(36)`, PK)
  - `sessionId` (`varchar(36)`, nullable, FK -> `simulator_sessions.id`)
  - `machineId` (`varchar(32)`, not null)
  - `scenario` (`varchar(48)`, not null)
  - `message` (`text`, not null)
  - `level` (`varchar(16)`, not null)
  - `createdAt` (`timestamp with time zone`, default now)

### 5. `anomalies`, `alerts`, `machine_events`
- **`anomalies`**:
  - `id` (`varchar(36)`, PK)
  - `machineId` (`varchar(32)`, FK -> `machines.id` cascade, indexed)
  - `parameter` (`text`, not null)
  - `observedValue` (`text`, not null)
  - `anomalyScore` (`real`, not null)
  - `riskCategory` (`varchar(24)`, not null)
  - `modelVersion` (`varchar(32)`, not null)
  - `summary` (`text`, not null)
  - `detectedAt` (`timestamp with time zone`, default now)
- **`alerts`**:
  - `id` (`varchar(36)`, PK — e.g. `ALT-1001`)
  - `machineId` (`varchar(32)`, FK -> `machines.id` cascade, indexed)
  - `machineName` (`text`, not null)
  - `type` (`text`, not null)
  - `severity` (`varchar(16)`, not null)
  - `description` (`text`, not null)
  - `status` (`varchar(16)`, not null)
  - `acknowledgedBy` (`text`, nullable)
  - `resolvedAt` (`timestamp with time zone`, nullable)
  - `createdAt` (`timestamp with time zone`, default now)
- **`machine_events`**:
  - `id` (`varchar(36)`, PK)
  - `machineId` (`varchar(32)`, not null, indexed)
  - `machineName` (`text`, not null)
  - `category` (`varchar(24)`, not null)
  - `title` (`text`, not null)
  - `description` (`text`, not null)
  - `severity` (`varchar(16)`, not null)
  - `createdAt` (`timestamp with time zone`, default now)

### 6. `work_orders` & `work_order_notes`
- **`work_orders`**:
  - `id` (`varchar(36)`, PK — e.g. `WO-401`)
  - `machineId` (`varchar(32)`, FK -> `machines.id` cascade)
  - `machineName` (`text`, not null)
  - `issue` (`text`, not null)
  - `priority` (`varchar(16)`, not null)
  - `assignedEngineer` (`text`, not null)
  - `status` (`varchar(20)`, not null)
  - `source` (`varchar(32)`, not null)
  - `createdBy` (`varchar(32)`, nullable)
  - `createdDate` (`varchar(16)`, not null)
  - `dueDate` (`varchar(16)`, not null)
  - `completedAt` (`timestamp with time zone`, nullable)
  - `createdAt` (`timestamp with time zone`, default now)
- **`work_order_notes`**:
  - `id` (`varchar(36)`, PK)
  - `workOrderId` (`varchar(36)`, FK -> `work_orders.id` cascade)
  - `author` (`text`, not null)
  - `text` (`text`, not null)
  - `createdAt` (`timestamp with time zone`, default now)

### 7. `quality_inspections`
- **`quality_inspections`**:
  - `id` (`varchar(36)`, PK — e.g. `QC-901`)
  - `machineId` (`varchar(32)`, FK -> `machines.id` cascade)
  - `partName` (`text`, not null)
  - `imageUrl` (`text`, not null — local safe asset or `/api/quality/images/:file`)
  - `storageKey` (`text`, nullable)
  - `mimeType` (`varchar(64)`, nullable)
  - `fileSizeBytes` (`integer`, nullable)
  - `status` (`varchar(32)`, not null)
  - `defectCategory` (`text`, not null)
  - `confidence` (`integer`, not null)
  - `analysisEngine` (`text`, not null — distinguishes LLM visual assessment vs sample baseline)
  - `summary` (`text`, not null)
  - `recommendedAction` (`text`, not null)
  - `detections` (`jsonb`, `DefectDetectionBox[]`)
  - `inspectedBy` (`varchar(32)`, nullable)
  - `inspectedAt` (`timestamp with time zone`, default now)

### 8. `ai_conversations`, `ai_messages`, `ai_tool_logs`
- **`ai_conversations`**:
  - `id` (`varchar(36)`, PK)
  - `userId` (`varchar(32)`, FK -> `users.id` cascade)
  - `title` (`text`, not null)
  - `saved` (`boolean`, default false)
  - `createdAt` (`timestamp with time zone`, default now)
- **`ai_messages`**:
  - `id` (`varchar(36)`, PK)
  - `conversationId` (`varchar(36)`, FK -> `ai_conversations.id` cascade)
  - `role` (`varchar(16)`, not null)
  - `content` (`text`, not null)
  - `observedFacts` (`jsonb`, nullable)
  - `recommendations` (`jsonb`, nullable)
  - `referencedMachineIds` (`jsonb`, nullable)
  - `workOrderDraft` (`jsonb`, nullable)
  - `workOrderApprovedId` (`varchar(36)`, nullable)
  - `error` (`text`, nullable)
  - `createdAt` (`timestamp with time zone`, default now)
- **`ai_tool_logs`**:
  - `id` (`serial`, PK)
  - `messageId` (`varchar(36)`, FK -> `ai_messages.id` cascade)
  - `userId` (`varchar(32)`, not null)
  - `toolName` (`varchar(64)`, not null)
  - `status` (`varchar(16)`, not null)
  - `summary` (`text`, not null)
  - `executedAt` (`timestamp with time zone`, default now)

### 9. `notifications` & `audit_logs`
- **`notifications`**:
  - `id` (`varchar(36)`, PK)
  - `category` (`varchar(32)`, not null)
  - `title` (`text`, not null)
  - `message` (`text`, not null)
  - `read` (`boolean`, default false)
  - `machineId` (`varchar(32)`, nullable)
  - `targetPage` (`varchar(32)`, not null)
  - `createdAt` (`timestamp with time zone`, default now)
- **`audit_logs`**:
  - `id` (`serial`, PK)
  - `userId` (`varchar(32)`, nullable)
  - `userEmail` (`text`, nullable)
  - `userRole` (`varchar(32)`, nullable)
  - `action` (`varchar(64)`, not null)
  - `resourceType` (`varchar(32)`, not null)
  - `resourceId` (`varchar(64)`, nullable)
  - `details` (`jsonb`, nullable)
  - `ipAddress` (`varchar(64)`, nullable)
  - `createdAt` (`timestamp with time zone`, default now)
