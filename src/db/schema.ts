import {
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import type {
  DefectDetectionBox,
  MachineThresholds,
  WorkOrderDraft,
} from '../types.ts';

export const users = pgTable('users', {
  id: varchar('id', { length: 32 }).primaryKey(),
  uid: text('uid').unique(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  passwordSalt: text('password_salt').notNull(),
  role: varchar('role', { length: 32 }).notNull().default('Operator'),
  status: varchar('status', { length: 16 }).notNull().default('Active'),
  department: text('department').notNull().default('Operations'),
  lastActive: text('last_active').notNull().default('Never'),
  lastActiveAt: timestamp('last_active_at', { withTimezone: true }).defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const userSessions = pgTable('user_sessions', {
  tokenHash: varchar('token_hash', { length: 64 }).primaryKey(),
  userId: varchar('user_id', { length: 32 })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const factories = pgTable('factories', {
  id: varchar('id', { length: 32 }).primaryKey(),
  name: text('name').notNull(),
  location: text('location').notNull(),
  shift: text('shift').notNull(),
  targetOee: real('target_oee').notNull().default(90),
  isActive: boolean('is_active').notNull().default(false),
});

export const appSettings = pgTable('app_settings', {
  key: varchar('key', { length: 64 }).primaryKey(),
  value: jsonb('value').$type<Record<string, unknown>>().notNull(),
  updatedBy: varchar('updated_by', { length: 32 }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const machines = pgTable('machines', {
  id: varchar('id', { length: 32 }).primaryKey(),
  factoryId: varchar('factory_id', { length: 32 })
    .notNull()
    .references(() => factories.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  category: text('category').notNull(),
  area: text('area').notNull(),
  modelType: varchar('model_type', { length: 24 }).notNull(),
  status: varchar('status', { length: 16 }).notNull().default('running'),
  healthScore: integer('health_score').notNull().default(95),
  temperature: real('temperature').notNull().default(55),
  vibration: real('vibration').notNull().default(2.0),
  pressure: real('pressure').notNull().default(100),
  rpm: integer('rpm').notNull().default(1800),
  load: real('load').notNull().default(60),
  anomalyScore: real('anomaly_score').notNull().default(0.1),
  riskCategory: varchar('risk_category', { length: 24 }).notNull().default('Normal'),
  abnormalParameters: jsonb('abnormal_parameters').$type<string[]>().notNull().default([]),
  flaggedReason: text('flagged_reason').notNull(),
  uptimePercent: real('uptime_percent').notNull().default(99),
  position3D: jsonb('position_3d').$type<[number, number, number]>().notNull(),
  thresholds: jsonb('thresholds').$type<MachineThresholds>().notNull(),
  scenario: varchar('scenario', { length: 48 }).notNull().default('Normal Operation'),
  isActive: boolean('is_active').notNull().default(true),
  lastUpdated: text('last_updated').notNull(),
  lastUpdatedAt: timestamp('last_updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const simulatorSessions = pgTable('simulator_sessions', {
  id: varchar('id', { length: 36 }).primaryKey(),
  startedBy: varchar('started_by', { length: 32 }).references(() => users.id),
  status: varchar('status', { length: 16 }).notNull().default('running'),
  speed: real('speed').notNull().default(1),
  selectedMachineId: varchar('selected_machine_id', { length: 32 }).notNull().default('M-101'),
  tickCount: integer('tick_count').notNull().default(0),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
});

export const simulatorLogs = pgTable('simulator_logs', {
  id: varchar('id', { length: 36 }).primaryKey(),
  sessionId: varchar('session_id', { length: 36 }).references(() => simulatorSessions.id),
  machineId: varchar('machine_id', { length: 32 }).notNull(),
  scenario: varchar('scenario', { length: 48 }).notNull(),
  message: text('message').notNull(),
  level: varchar('level', { length: 16 }).notNull(),
  timestampLabel: text('timestamp_label').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const sensorReadings = pgTable('sensor_readings', {
  id: serial('id').primaryKey(),
  machineId: varchar('machine_id', { length: 32 })
    .notNull()
    .references(() => machines.id, { onDelete: 'cascade' }),
  sessionId: varchar('session_id', { length: 36 }).references(() => simulatorSessions.id),
  temperature: real('temperature').notNull(),
  vibration: real('vibration').notNull(),
  pressure: real('pressure').notNull(),
  rpm: integer('rpm').notNull(),
  load: real('load').notNull(),
  healthScore: integer('health_score').notNull(),
  anomalyScore: real('anomaly_score').notNull(),
  status: varchar('status', { length: 16 }).notNull().default('running'),
  timestampLabel: text('timestamp_label').notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
});

export const anomalies = pgTable('anomalies', {
  id: varchar('id', { length: 36 }).primaryKey(),
  machineId: varchar('machine_id', { length: 32 })
    .notNull()
    .references(() => machines.id, { onDelete: 'cascade' }),
  parameter: text('parameter').notNull(),
  value: text('value').notNull(),
  anomalyScore: real('anomaly_score').notNull(),
  riskCategory: varchar('risk_category', { length: 24 }).notNull(),
  modelVersion: varchar('model_version', { length: 32 }).notNull().default('mahalanobis-v1'),
  summary: text('summary').notNull(),
  timestampLabel: text('timestamp_label').notNull(),
  detectedAt: timestamp('detected_at', { withTimezone: true }).defaultNow().notNull(),
});

export const alerts = pgTable('alerts', {
  id: varchar('id', { length: 36 }).primaryKey(),
  machineId: varchar('machine_id', { length: 32 })
    .notNull()
    .references(() => machines.id, { onDelete: 'cascade' }),
  machineName: text('machine_name').notNull(),
  type: text('type').notNull(),
  severity: varchar('severity', { length: 16 }).notNull(),
  description: text('description').notNull(),
  status: varchar('status', { length: 16 }).notNull().default('Active'),
  acknowledgedBy: text('acknowledged_by'),
  resolvedAtLabel: text('resolved_at_label'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  timestampLabel: text('timestamp_label').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const machineEvents = pgTable('machine_events', {
  id: varchar('id', { length: 36 }).primaryKey(),
  machineId: varchar('machine_id', { length: 32 }).notNull(),
  machineName: text('machine_name').notNull(),
  category: varchar('category', { length: 24 }).notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  severity: varchar('severity', { length: 16 }).notNull(),
  timestampLabel: text('timestamp_label').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const workOrders = pgTable('work_orders', {
  id: varchar('id', { length: 36 }).primaryKey(),
  machineId: varchar('machine_id', { length: 32 })
    .notNull()
    .references(() => machines.id, { onDelete: 'cascade' }),
  machineName: text('machine_name').notNull(),
  issue: text('issue').notNull(),
  priority: varchar('priority', { length: 16 }).notNull(),
  assignedEngineer: text('assigned_engineer').notNull(),
  createdDate: varchar('created_date', { length: 16 }).notNull(),
  dueDate: varchar('due_date', { length: 16 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('Open'),
  source: varchar('source', { length: 32 }).notNull().default('Manual'),
  createdBy: varchar('created_by', { length: 32 }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const workOrderNotes = pgTable('work_order_notes', {
  id: varchar('id', { length: 36 }).primaryKey(),
  workOrderId: varchar('work_order_id', { length: 36 })
    .notNull()
    .references(() => workOrders.id, { onDelete: 'cascade' }),
  author: text('author').notNull(),
  text: text('text').notNull(),
  timestampLabel: text('timestamp_label').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const qualityInspections = pgTable('quality_inspections', {
  id: varchar('id', { length: 36 }).primaryKey(),
  machineId: varchar('machine_id', { length: 32 })
    .notNull()
    .references(() => machines.id, { onDelete: 'cascade' }),
  partName: text('part_name').notNull(),
  imageUrl: text('image_url').notNull(),
  storageKey: text('storage_key'),
  mimeType: varchar('mime_type', { length: 64 }),
  fileSizeBytes: integer('file_size_bytes'),
  status: varchar('status', { length: 32 }).notNull(),
  defectCategory: text('defect_category').notNull(),
  confidence: real('confidence').notNull(),
  analysisEngine: text('analysis_engine').notNull().default('Gemini Multimodal Visual Assessment'),
  summary: text('summary').notNull(),
  recommendedAction: text('recommended_action').notNull(),
  detections: jsonb('detections').$type<DefectDetectionBox[]>().notNull().default([]),
  inspectedBy: varchar('inspected_by', { length: 32 }),
  timestampLabel: text('timestamp_label').notNull(),
  inspectedAt: timestamp('inspected_at', { withTimezone: true }).defaultNow().notNull(),
});

export const aiConversations = pgTable('ai_conversations', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 32 })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  saved: boolean('saved').notNull().default(false),
  createdAtLabel: text('created_at_label').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const aiMessages = pgTable('ai_messages', {
  id: varchar('id', { length: 36 }).primaryKey(),
  conversationId: varchar('conversation_id', { length: 36 })
    .notNull()
    .references(() => aiConversations.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 16 }).notNull(),
  content: text('content').notNull(),
  observedFacts: jsonb('observed_facts').$type<string[] | null>(),
  recommendations: jsonb('recommendations').$type<string[] | null>(),
  referencedMachineIds: jsonb('referenced_machine_ids').$type<string[] | null>(),
  workOrderDraft: jsonb('work_order_draft').$type<WorkOrderDraft | null>(),
  workOrderApprovedId: varchar('work_order_approved_id', { length: 36 }),
  error: text('error'),
  timestampLabel: text('timestamp_label').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const aiToolLogs = pgTable('ai_tool_logs', {
  id: serial('id').primaryKey(),
  messageId: varchar('message_id', { length: 36 })
    .notNull()
    .references(() => aiMessages.id, { onDelete: 'cascade' }),
  userId: varchar('user_id', { length: 32 }).notNull(),
  toolName: varchar('tool_name', { length: 64 }).notNull(),
  status: varchar('status', { length: 16 }).notNull(),
  summary: text('summary').notNull(),
  executedAt: timestamp('executed_at', { withTimezone: true }).defaultNow().notNull(),
});

export const notifications = pgTable('notifications', {
  id: varchar('id', { length: 36 }).primaryKey(),
  category: varchar('category', { length: 32 }).notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  read: boolean('read').notNull().default(false),
  machineId: varchar('machine_id', { length: 32 }),
  targetPage: varchar('target_page', { length: 32 }).notNull(),
  timestampLabel: text('timestamp_label').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  userId: varchar('user_id', { length: 32 }),
  userEmail: text('user_email'),
  userRole: varchar('user_role', { length: 32 }),
  action: varchar('action', { length: 64 }).notNull(),
  resourceType: varchar('resource_type', { length: 32 }).notNull(),
  resourceId: varchar('resource_id', { length: 64 }),
  details: jsonb('details').$type<Record<string, unknown> | null>(),
  ipAddress: varchar('ip_address', { length: 64 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
