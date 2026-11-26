import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pathToFileURL } from 'url';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { and, count, desc, eq, gte, sql } from 'drizzle-orm';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { db, pool } from './src/db/index.ts';
import {
  aiConversations,
  aiMessages,
  aiToolLogs,
  alerts,
  anomalies,
  appSettings,
  auditLogs,
  factories,
  machineEvents,
  machines,
  notifications,
  qualityInspections,
  sensorReadings,
  simulatorLogs,
  simulatorSessions,
  users,
  workOrderNotes,
  workOrders,
} from './src/db/schema.ts';
import { ensureDatabaseSeeded, seedBaselineOperationalData } from './src/db/seed.ts';
import {
  computeDatabaseAnalytics,
  getAiSettings,
  getPaginatedMachines,
  loadMachinesWithHistory,
  loadPlatformState,
  loadUserConversations,
  runRbacAssistantTools,
} from './src/db/repository.ts';
import {
  createUserSession,
  hashPassword,
  revokeSession,
  upsertFirebaseUser,
  verifyPassword,
} from './src/lib/auth.ts';
import { adminAuth } from './src/lib/firebase-admin.ts';
import { recordAuditLog } from './src/lib/audit.ts';
import {
  resolveSafeUploadedImagePath,
  validateAndSaveUploadedImage,
} from './src/lib/uploadValidation.ts';
import { buildAnalyticsPdfBuffer } from './src/lib/pdfReport.ts';
import { evaluateMachineTelemetryML, loadAnomalyArtifact } from './src/ml/anomalyModel.ts';
import {
  requireAuth,
  requireRole,
  requireStreamOrImageAuth,
  extractBearerToken,
  type AuthRequest,
} from './src/middleware/auth.ts';
import type {
  Machine,
  SimulationScenario,
  UserRole,
  WorkOrderPriority,
  WorkOrderStatus,
} from './src/types.ts';

const PORT = Number(process.env.PORT || 3000);

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function nowTimeLabel(offsetSeconds = 0): string {
  const d = new Date(Date.now() + offsetSeconds * 1000);
  return d.toLocaleTimeString('en-GB', { hour12: false });
}

function isoDateOffset(daysOffset = 0): string {
  const d = new Date(Date.now() + daysOffset * 86400000);
  return d.toISOString().slice(0, 10);
}

// SSE clients
const sseClients = new Set<Response>();

async function broadcastState(): Promise<void> {
  if (sseClients.size === 0) return;
  try {
    const snapshot = await loadPlatformState({
      geminiConfigured: Boolean(getGeminiClient()),
      streamActive: sseClients.size > 0,
    });
    const payload = `data: ${JSON.stringify(snapshot)}\n\n`;
    for (const res of sseClients) {
      try {
        res.write(payload);
      } catch {
        sseClients.delete(res);
      }
    }
  } catch (err) {
    console.error('Failed to broadcast SSE state:', err);
  }
}

async function stepMachineInDb(
  machineRow: Machine,
  immediateScenarioJump: boolean,
  autoCreateAlerts: boolean,
  sessionId = 'SIM-SESSION-01'
): Promise<Machine> {
  const prevStatus = machineRow.status;
  const t = machineRow.thresholds;
  const jitter = (s: number) => (Math.random() - 0.5) * s;

  const nominalByType: Record<
    Machine['modelType'],
    { temp: number; vib: number; press: number; rpm: number; load: number }
  > = {
    cnc: { temp: 60.5, vib: 2.1, press: 98, rpm: 3400, load: 68 },
    compressor: { temp: 68.0, vib: 2.8, press: 138, rpm: 1750, load: 70 },
    conveyor: { temp: 43.0, vib: 1.4, press: 100, rpm: 620, load: 54 },
    press: { temp: 66.0, vib: 2.9, press: 178, rpm: 1020, load: 72 },
    packaging: { temp: 51.0, vib: 1.85, press: 96, rpm: 1480, load: 61 },
  };
  const base = nominalByType[machineRow.modelType] || nominalByType.cnc;

  let targetTemp = base.temp;
  let targetVib = base.vib;
  let targetPress = base.press;
  let targetRpm = base.rpm;
  let targetLoad = base.load;

  switch (machineRow.scenario) {
    case 'Normal Operation':
    case 'Recovery After Maintenance':
      break;
    case 'High Temperature':
      targetTemp = t.maxTemp + 5.5;
      targetVib = base.vib + 0.6;
      break;
    case 'Excessive Vibration':
      targetVib = t.maxVibration + 2.65;
      targetTemp = base.temp + 6.0;
      targetRpm = base.rpm + 180;
      break;
    case 'Abnormal Pressure':
      targetPress = t.maxPressure + 28;
      targetLoad = Math.min(96, t.maxLoad + 4);
      break;
    case 'Machine Overload':
      targetLoad = 95.5;
      targetTemp = t.maxTemp + 6.5;
      targetVib = t.maxVibration + 1.4;
      targetPress = t.maxPressure + 24;
      break;
    case 'Sudden Shutdown':
      targetTemp = 34.0;
      targetVib = 0;
      targetPress = 0;
      targetRpm = 0;
      targetLoad = 0;
      break;
    case 'Multiple Abnormalities':
      targetTemp = t.maxTemp + 9.2;
      targetVib = t.maxVibration + 3.1;
      targetPress = t.maxPressure + 32;
      targetLoad = 96.2;
      break;
  }

  const blend = immediateScenarioJump ? 0.92 : 0.35;
  const nextTemp = Number(
    (machineRow.temperature + (targetTemp - machineRow.temperature) * blend + jitter(0.9)).toFixed(1)
  );
  const nextVib = Number(
    Math.max(0, machineRow.vibration + (targetVib - machineRow.vibration) * blend + jitter(0.22)).toFixed(2)
  );
  const nextPress = Number(
    Math.max(0, machineRow.pressure + (targetPress - machineRow.pressure) * blend + jitter(2.5)).toFixed(1)
  );
  const nextRpm = Math.max(0, Math.round(machineRow.rpm + (targetRpm - machineRow.rpm) * blend + jitter(35)));
  const nextLoad = Number(
    Math.min(100, Math.max(0, machineRow.load + (targetLoad - machineRow.load) * blend + jitter(1.8))).toFixed(1)
  );
  const label = nowTimeLabel();

  const candidate: Machine = {
    ...machineRow,
    temperature: nextTemp,
    vibration: nextVib,
    pressure: nextPress,
    rpm: nextRpm,
    load: nextLoad,
    lastUpdated: label,
  };

  const mlEval = evaluateMachineTelemetryML(candidate);
  candidate.status = mlEval.status;
  candidate.anomalyScore = mlEval.anomalyScore;
  candidate.riskCategory = mlEval.riskCategory;
  candidate.healthScore = mlEval.healthScore;
  candidate.abnormalParameters = mlEval.abnormalParameters;
  candidate.flaggedReason = mlEval.flaggedReason;

  await db
    .update(machines)
    .set({
      status: candidate.status,
      healthScore: candidate.healthScore,
      temperature: candidate.temperature,
      vibration: candidate.vibration,
      pressure: candidate.pressure,
      rpm: candidate.rpm,
      load: candidate.load,
      anomalyScore: candidate.anomalyScore,
      riskCategory: candidate.riskCategory,
      abnormalParameters: candidate.abnormalParameters,
      flaggedReason: candidate.flaggedReason,
      lastUpdated: label,
      lastUpdatedAt: new Date(),
    })
    .where(eq(machines.id, candidate.id));

  await db.insert(sensorReadings).values({
    machineId: candidate.id,
    sessionId,
    temperature: candidate.temperature,
    vibration: candidate.vibration,
    pressure: candidate.pressure,
    rpm: candidate.rpm,
    load: candidate.load,
    healthScore: candidate.healthScore,
    anomalyScore: candidate.anomalyScore,
    status: candidate.status,
    timestampLabel: label,
  });

  if (
    autoCreateAlerts &&
    (candidate.status === 'warning' || candidate.status === 'critical' || candidate.status === 'offline')
  ) {
    const existingActive = await db
      .select()
      .from(alerts)
      .where(and(eq(alerts.machineId, candidate.id), sql`${alerts.status} != 'Resolved'`))
      .limit(1);

    const desiredSeverity =
      candidate.status === 'critical' || candidate.status === 'offline' ? 'Critical' : 'High';

    if (existingActive.length === 0) {
      const alertType =
        candidate.abnormalParameters.length > 0
          ? `${candidate.abnormalParameters.join(' & ')} Anomaly`
          : 'Operational Fault';
      const alertId = `ALT-${Math.floor(2050 + Math.random() * 899)}-${Date.now().toString().slice(-3)}`;

      await db.insert(alerts).values({
        id: alertId,
        machineId: candidate.id,
        machineName: candidate.name,
        type: alertType,
        severity: desiredSeverity,
        description: candidate.flaggedReason,
        status: 'Active',
        timestampLabel: label,
      });

      const anmId = `ANM-${Date.now().toString().slice(-5)}-${Math.floor(Math.random() * 99)}`;
      await db.insert(anomalies).values({
        id: anmId,
        machineId: candidate.id,
        parameter: candidate.abnormalParameters.join(', ') || 'System',
        value: candidate.abnormalParameters.includes('Vibration')
          ? `${candidate.vibration.toFixed(2)} mm/s`
          : candidate.abnormalParameters.includes('Temperature')
          ? `${candidate.temperature.toFixed(1)} °C`
          : `${candidate.pressure.toFixed(1)} bar`,
        anomalyScore: candidate.anomalyScore,
        riskCategory: candidate.riskCategory,
        modelVersion: mlEval.modelVersion,
        summary: candidate.flaggedReason,
        timestampLabel: label,
      });

      await db.insert(machineEvents).values({
        id: `EVT-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 99)}`,
        machineId: candidate.id,
        machineName: candidate.name,
        category: 'Alert',
        title: `${desiredSeverity} Alert Raised (${alertId})`,
        description: candidate.flaggedReason,
        severity: desiredSeverity === 'Critical' ? 'critical' : 'warning',
        timestampLabel: label,
      });

      await db.insert(notifications).values({
        id: `NOTIF-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 99)}`,
        category: 'Critical Alert',
        title: `${candidate.id} ${candidate.name} — ${alertType}`,
        message: candidate.flaggedReason,
        read: false,
        machineId: candidate.id,
        targetPage: 'alerts',
        timestampLabel: label,
      });
    } else if (existingActive[0].severity !== desiredSeverity && desiredSeverity === 'Critical') {
      await db
        .update(alerts)
        .set({
          severity: 'Critical',
          description: candidate.flaggedReason,
          timestampLabel: label,
        })
        .where(eq(alerts.id, existingActive[0].id));
    }
  } else if (prevStatus !== 'running' && candidate.status === 'running') {
    await db.insert(machineEvents).values({
      id: `EVT-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 99)}`,
      machineId: candidate.id,
      machineName: candidate.name,
      category: 'Telemetry',
      title: `${candidate.id} Returned to Normal Operation`,
      description: 'All sensor values settled back inside nominal operating bands.',
      severity: 'success',
      timestampLabel: label,
    });
  }

  return candidate;
}

async function stepAllMachinesTelemetry(): Promise<void> {
  await ensureDatabaseSeeded();
  const [simRow] = await db
    .select()
    .from(simulatorSessions)
    .orderBy(desc(simulatorSessions.startedAt))
    .limit(1);
  const aiSettings = await getAiSettings();
  const activeMachines = await loadMachinesWithHistory(false);

  const sessionId = simRow?.id || 'SIM-SESSION-01';
  await db
    .update(simulatorSessions)
    .set({ tickCount: (simRow?.tickCount || 0) + 1 })
    .where(eq(simulatorSessions.id, sessionId));

  for (const m of activeMachines) {
    await stepMachineInDb(m, false, aiSettings.autoCreateAlerts, sessionId);
  }
}

// Validation schemas
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  rememberMe: z.boolean().optional(),
});

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
  department: z.string().trim().min(2).max(80).optional(),
});

const firebaseLoginSchema = z.object({
  idToken: z.string().min(20),
});

const createMachineSchema = z.object({
  name: z.string().trim().min(2).max(100),
  category: z.string().trim().min(2).max(80).default('General Manufacturing'),
  area: z.string().trim().min(2).max(80).default('Bay A — Machining'),
  modelType: z.enum(['cnc', 'compressor', 'conveyor', 'press', 'packaging']).default('cnc'),
  thresholds: z
    .object({
      maxTemp: z.number().min(20).max(300).optional(),
      maxVibration: z.number().min(0.5).max(50).optional(),
      maxPressure: z.number().min(10).max(1000).optional(),
      minPressure: z.number().min(0).max(500).optional(),
      maxRpm: z.number().min(50).max(30000).optional(),
      maxLoad: z.number().min(10).max(100).optional(),
    })
    .optional(),
});

const updateMachineSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  category: z.string().trim().min(2).max(80).optional(),
  area: z.string().trim().min(2).max(80).optional(),
  isActive: z.boolean().optional(),
  thresholds: z
    .object({
      maxTemp: z.number().min(20).max(300).optional(),
      maxVibration: z.number().min(0.5).max(50).optional(),
      maxPressure: z.number().min(10).max(1000).optional(),
      minPressure: z.number().min(0).max(500).optional(),
      maxRpm: z.number().min(50).max(30000).optional(),
      maxLoad: z.number().min(10).max(100).optional(),
    })
    .optional(),
});

const simulatorControlSchema = z.object({
  action: z.enum(['start', 'pause', 'resume', 'stop', 'reset', 'step']).optional(),
  speed: z
    .number()
    .refine((v) => [0.5, 1, 2, 5].includes(v), { message: 'Speed must be 0.5, 1, 2, or 5.' })
    .optional(),
  selectedMachineId: z.string().trim().min(1).max(32).optional(),
});

const simulatorScenarioSchema = z.object({
  machineId: z.string().trim().min(1).max(32),
  scenario: z.enum([
    'Normal Operation',
    'High Temperature',
    'Excessive Vibration',
    'Abnormal Pressure',
    'Machine Overload',
    'Sudden Shutdown',
    'Multiple Abnormalities',
    'Recovery After Maintenance',
  ]),
});

const createWorkOrderSchema = z.object({
  machineId: z.string().trim().min(1).max(32),
  issue: z.string().trim().min(4).max(1000),
  priority: z.enum(['Critical', 'High', 'Medium', 'Low']).default('High'),
  assignedEngineer: z.string().trim().min(2).max(100).default('Arjun Deshmukh'),
  dueDate: z.string().trim().optional(),
  source: z.enum(['Manual', 'AI Assistant', 'Predictive Alert']).default('Manual'),
  assistantMessageId: z.string().trim().max(36).optional(),
});

const updateWorkOrderSchema = z.object({
  status: z.enum(['Open', 'Assigned', 'In Progress', 'Completed']).optional(),
  assignedEngineer: z.string().trim().min(2).max(100).optional(),
  priority: z.enum(['Critical', 'High', 'Medium', 'Low']).optional(),
  issue: z.string().trim().min(4).max(1000).optional(),
  dueDate: z.string().trim().optional(),
});

const VALID_ROLES: UserRole[] = [
  'System Admin',
  'Factory Manager',
  'Maintenance Engineer',
  'Quality Inspector',
  'Operator',
];

const createUserSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email(),
  role: z.enum([
    'System Admin',
    'Factory Manager',
    'Maintenance Engineer',
    'Quality Inspector',
    'Operator',
  ]),
  department: z.string().trim().min(2).max(80).default('Operations'),
  password: z.string().min(8).max(128).optional(),
});

const updateUserSchema = z.object({
  role: z
    .enum([
      'System Admin',
      'Factory Manager',
      'Maintenance Engineer',
      'Quality Inspector',
      'Operator',
    ])
    .optional(),
  status: z.enum(['Active', 'Inactive']).optional(),
});

export async function createApp(options?: { attachFrontend?: boolean }) {
  const app = express();
  app.set('trust proxy', 1);

  // Strict CORS allowlist (never wildcard * on authenticated routes)
  const allowedOrigins = new Set<string>([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ]);
  if (process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL') {
    try {
      allowedOrigins.add(new URL(process.env.APP_URL).origin);
    } catch {
      // ignore invalid APP_URL
    }
  }
  if (process.env.ALLOWED_ORIGINS) {
    for (const o of process.env.ALLOWED_ORIGINS.split(',')) {
      if (o.trim()) allowedOrigins.add(o.trim());
    }
  }

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (
          allowedOrigins.has(origin) ||
          /^https:\/\/[a-z0-9-]+\.run\.app$/i.test(origin) ||
          /^https:\/\/([a-z0-9-]+\.)?aistudio\.google\.com$/i.test(origin)
        ) {
          return callback(null, true);
        }
        return callback(null, false);
      },
      credentials: true,
    })
  );

  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.use(express.json({ limit: '10mb' }));

  const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isTestEnv ? 500 : 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts. Please try again later.' },
  });

  const aiLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: isTestEnv ? 500 : 40,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'AI service rate limit exceeded. Please wait briefly.' },
  });

  const apiLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: isTestEnv ? 5000 : 600,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use('/api', apiLimiter);

  // --- Healthcheck (Public) ---
  app.get('/api/health', async (_req, res) => {
    let dbOk = false;
    try {
      await pool.query('SELECT 1');
      dbOk = true;
    } catch {
      dbOk = false;
    }
    const artifact = loadAnomalyArtifact();
    res.status(dbOk ? 200 : 503).json({
      ok: dbOk,
      systemHealth: {
        backendApi: 'Operational',
        database: dbOk ? 'Operational' : 'Degraded',
        predictiveModel: 'Active',
        visionModel: getGeminiClient() ? 'Ready' : 'Unavailable',
        assistantAi: getGeminiClient() ? 'Ready' : 'Unavailable',
      },
      mlModelVersion: artifact.version,
    });
  });

  // --- Auth Endpoints ---
  app.post('/api/auth/login', authLimiter, async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Valid email and password are required.' });
    }
    try {
      await ensureDatabaseSeeded();
      const email = parsed.data.email.trim().toLowerCase();
      const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (rows.length === 0) {
        await recordAuditLog({
          req,
          userEmail: email,
          action: 'AUTH_LOGIN_FAILED',
          resourceType: 'session',
          details: { reason: 'user_not_found' },
        });
        return res.status(401).json({ error: 'Invalid work email or password.' });
      }
      const u = rows[0];
      if (u.status !== 'Active') {
        await recordAuditLog({
          req,
          userId: u.id,
          userEmail: u.email,
          userRole: u.role,
          action: 'AUTH_LOGIN_BLOCKED',
          resourceType: 'session',
          details: { reason: 'inactive_account' },
        });
        return res.status(403).json({ error: 'Account is deactivated. Contact System Admin.' });
      }
      if (!verifyPassword(parsed.data.password, u.passwordSalt, u.passwordHash)) {
        await recordAuditLog({
          req,
          userId: u.id,
          userEmail: u.email,
          userRole: u.role,
          action: 'AUTH_LOGIN_FAILED',
          resourceType: 'session',
          details: { reason: 'invalid_password' },
        });
        return res.status(401).json({ error: 'Invalid work email or password.' });
      }

      const token = await createUserSession(u.id, parsed.data.rememberMe ?? true);
      await recordAuditLog({
        req,
        userId: u.id,
        userEmail: u.email,
        userRole: u.role,
        action: 'AUTH_LOGIN_SUCCESS',
        resourceType: 'session',
        resourceId: u.id,
      });

      return res.json({
        token,
        user: {
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          department: u.department,
        },
      });
    } catch (err) {
      console.error('Login error:', err);
      return res.status(500).json({ error: 'Authentication service failed.' });
    }
  });

  app.post('/api/auth/register', authLimiter, async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Name, valid email, and password (minimum 8 characters) are required.',
      });
    }
    try {
      await ensureDatabaseSeeded();
      const email = parsed.data.email.trim().toLowerCase();
      const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (existing.length > 0) {
        return res.status(409).json({ error: 'An account with this work email already exists.' });
      }

      const [{ value: totalUsers }] = await db.select({ value: count() }).from(users);
      const role: UserRole = totalUsers === 0 ? 'System Admin' : 'Operator';
      const { salt, hash } = hashPassword(parsed.data.password);
      const newId = `USR-${Date.now().toString().slice(-6)}`;

      const [created] = await db
        .insert(users)
        .values({
          id: newId,
          name: parsed.data.name,
          email,
          passwordHash: hash,
          passwordSalt: salt,
          role,
          status: 'Active',
          department: parsed.data.department || 'Plant Operations',
          lastActive: 'Online now',
        })
        .returning();

      const token = await createUserSession(created.id, true);
      await recordAuditLog({
        req,
        userId: created.id,
        userEmail: created.email,
        userRole: created.role,
        action: 'AUTH_REGISTER',
        resourceType: 'user',
        resourceId: created.id,
      });

      await broadcastState();
      return res.status(201).json({
        token,
        user: {
          id: created.id,
          email: created.email,
          name: created.name,
          role: created.role,
          department: created.department,
        },
      });
    } catch (err) {
      console.error('Register error:', err);
      return res.status(500).json({ error: 'Registration failed.' });
    }
  });

  app.post('/api/auth/firebase', authLimiter, async (req, res) => {
    const parsed = firebaseLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Valid Firebase ID token is required.' });
    }
    try {
      await ensureDatabaseSeeded();
      const decoded = await adminAuth.verifyIdToken(parsed.data.idToken);
      if (!decoded.email) {
        return res.status(400).json({ error: 'Firebase account must include an email address.' });
      }
      const user = await upsertFirebaseUser(decoded.uid, decoded.email, decoded.name);
      if (user.status !== 'Active') {
        return res.status(403).json({ error: 'Account is deactivated. Contact System Admin.' });
      }
      const token = await createUserSession(user.id, true);
      await recordAuditLog({
        req,
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        action: 'AUTH_FIREBASE_LOGIN',
        resourceType: 'session',
        resourceId: user.id,
      });
      await broadcastState();
      return res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          department: user.department,
        },
      });
    } catch (err) {
      console.error('Firebase auth error:', err);
      return res.status(401).json({ error: 'Invalid or expired Firebase authentication token.' });
    }
  });

  app.post('/api/auth/logout', requireAuth, async (req: AuthRequest, res) => {
    const rawToken = extractBearerToken(req, false);
    await revokeSession(rawToken);
    await recordAuditLog({
      req,
      action: 'AUTH_LOGOUT',
      resourceType: 'session',
      resourceId: req.authUser?.id || null,
    });
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAuth, async (req: AuthRequest, res) => {
    res.json({ user: req.authUser });
  });

  // --- Full Platform State & SSE Stream ---
  app.get('/api/state', requireAuth, async (_req, res) => {
    try {
      await ensureDatabaseSeeded();
      const snapshot = await loadPlatformState({
        geminiConfigured: Boolean(getGeminiClient()),
        streamActive: sseClients.size > 0,
      });
      res.json(snapshot);
    } catch (err) {
      console.error('Failed to load state:', err);
      res.status(500).json({ error: 'Failed to load operational state.' });
    }
  });

  app.get('/api/stream', requireStreamOrImageAuth, async (req: AuthRequest, res) => {
    try {
      await ensureDatabaseSeeded();
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      sseClients.add(res);
      const snapshot = await loadPlatformState({
        geminiConfigured: Boolean(getGeminiClient()),
        streamActive: true,
      });
      res.write(`data: ${JSON.stringify(snapshot)}\n\n`);

      req.on('close', () => {
        sseClients.delete(res);
      });
    } catch (err) {
      console.error('SSE stream error:', err);
      sseClients.delete(res);
      res.end();
    }
  });

  // --- Factory Switch ---
  app.patch(
    '/api/factory',
    requireAuth,
    requireRole('System Admin', 'Factory Manager'),
    async (req: AuthRequest, res) => {
      const factoryId = typeof req.body?.factoryId === 'string' ? req.body.factoryId.trim() : '';
      if (!factoryId) {
        return res.status(400).json({ error: 'factoryId is required.' });
      }
      await ensureDatabaseSeeded();
      const existing = await db.select().from(factories).where(eq(factories.id, factoryId)).limit(1);
      if (existing.length === 0) {
        return res.status(404).json({ error: 'Factory profile not found.' });
      }
      await db.update(factories).set({ isActive: false });
      const [updated] = await db
        .update(factories)
        .set({ isActive: true })
        .where(eq(factories.id, factoryId))
        .returning();

      await recordAuditLog({
        req,
        action: 'FACTORY_SWITCHED',
        resourceType: 'factory',
        resourceId: factoryId,
      });
      await broadcastState();
      res.json({ factory: updated });
    }
  );

  // --- Machines CRUD & Readings ---
  app.get('/api/machines', requireAuth, async (req, res) => {
    try {
      await ensureDatabaseSeeded();
      const result = await getPaginatedMachines({
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        area: typeof req.query.area === 'string' ? req.query.area : undefined,
        includeInactive: req.query.includeInactive === 'true',
        page: req.query.page ? Number(req.query.page) : 1,
        pageSize: req.query.pageSize ? Number(req.query.pageSize) : 10,
      });
      res.json(result);
    } catch (err) {
      console.error('GET /api/machines failed:', err);
      res.status(500).json({ error: 'Failed to fetch machines.' });
    }
  });

  app.get('/api/machines/:id/readings', requireAuth, async (req, res) => {
    const machineId = String(req.params.id);
    const limit = Math.min(500, Math.max(5, Number(req.query.limit) || 60));
    await ensureDatabaseSeeded();
    const rows = await db
      .select()
      .from(sensorReadings)
      .where(eq(sensorReadings.machineId, machineId))
      .orderBy(desc(sensorReadings.id))
      .limit(limit);
    res.json({
      machineId,
      readings: rows.reverse().map((r) => ({
        timestamp: r.timestampLabel,
        temperature: r.temperature,
        vibration: r.vibration,
        pressure: r.pressure,
        rpm: r.rpm,
        load: r.load,
        healthScore: r.healthScore,
        anomalyScore: r.anomalyScore,
        status: r.status,
      })),
    });
  });

  app.post(
    '/api/machines',
    requireAuth,
    requireRole('System Admin', 'Factory Manager'),
    async (req: AuthRequest, res) => {
      const parsed = createMachineSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid machine payload.', details: parsed.error.flatten() });
      }
      await ensureDatabaseSeeded();
      const allExisting = await db.select({ id: machines.id }).from(machines);
      let maxNum = 100;
      for (const m of allExisting) {
        const match = m.id.match(/^M-(\d+)$/);
        if (match) maxNum = Math.max(maxNum, Number(match[1]));
      }
      const id = `M-${maxNum + 1}`;
      const activeFactoryRows = await db
        .select()
        .from(factories)
        .where(eq(factories.isActive, true))
        .limit(1);
      const factoryId = activeFactoryRows[0]?.id || 'FAC-01';

      const idx = allExisting.length;
      const pos3D: [number, number, number] = [
        ((idx % 3) - 1) * 7,
        0,
        Math.floor(idx / 3) * 7 - 2,
      ];
      const thresholds = {
        maxTemp: parsed.data.thresholds?.maxTemp ?? 78,
        maxVibration: parsed.data.thresholds?.maxVibration ?? 4.5,
        maxPressure: parsed.data.thresholds?.maxPressure ?? 140,
        minPressure: parsed.data.thresholds?.minPressure ?? 75,
        maxRpm: parsed.data.thresholds?.maxRpm ?? 3500,
        maxLoad: parsed.data.thresholds?.maxLoad ?? 90,
      };
      const label = nowTimeLabel();

      const [created] = await db
        .insert(machines)
        .values({
          id,
          factoryId,
          name: parsed.data.name,
          category: parsed.data.category,
          area: parsed.data.area,
          modelType: parsed.data.modelType,
          status: 'running',
          healthScore: 95,
          temperature: 54.0,
          vibration: 1.9,
          pressure: 100.0,
          rpm: 1800,
          load: 58.0,
          anomalyScore: 0.09,
          riskCategory: 'Normal',
          abnormalParameters: [],
          flaggedReason: 'Newly commissioned asset operating within nominal thresholds.',
          uptimePercent: 99.8,
          position3D: pos3D,
          thresholds,
          scenario: 'Normal Operation',
          isActive: true,
          lastUpdated: label,
        })
        .returning();

      await db.insert(sensorReadings).values({
        machineId: created.id,
        sessionId: 'SIM-SESSION-01',
        temperature: 54.0,
        vibration: 1.9,
        pressure: 100.0,
        rpm: 1800,
        load: 58.0,
        healthScore: 95,
        anomalyScore: 0.09,
        status: 'running',
        timestampLabel: label,
      });

      await db.insert(machineEvents).values({
        id: `EVT-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 99)}`,
        machineId: created.id,
        machineName: created.name,
        category: 'Telemetry',
        title: `Machine ${created.id} Commissioned`,
        description: `Added ${created.name} to ${created.area}.`,
        severity: 'info',
        timestampLabel: label,
      });

      await recordAuditLog({
        req,
        action: 'MACHINE_CREATED',
        resourceType: 'machine',
        resourceId: created.id,
        details: { name: created.name, area: created.area },
      });

      await broadcastState();
      res.status(201).json(created);
    }
  );

  app.patch(
    '/api/machines/:id',
    requireAuth,
    requireRole('System Admin', 'Factory Manager', 'Maintenance Engineer'),
    async (req: AuthRequest, res) => {
      const parsed = updateMachineSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid machine update payload.' });
      }
      await ensureDatabaseSeeded();
      const machineId = String(req.params.id);
      const existingRows = await db.select().from(machines).where(eq(machines.id, machineId)).limit(1);
      if (existingRows.length === 0) {
        return res.status(404).json({ error: 'Machine not found.' });
      }
      const existing = existingRows[0];

      const mergedThresholds = parsed.data.thresholds
        ? {
            maxTemp: parsed.data.thresholds.maxTemp ?? existing.thresholds.maxTemp,
            maxVibration: parsed.data.thresholds.maxVibration ?? existing.thresholds.maxVibration,
            maxPressure: parsed.data.thresholds.maxPressure ?? existing.thresholds.maxPressure,
            minPressure: parsed.data.thresholds.minPressure ?? existing.thresholds.minPressure,
            maxRpm: parsed.data.thresholds.maxRpm ?? existing.thresholds.maxRpm,
            maxLoad: parsed.data.thresholds.maxLoad ?? existing.thresholds.maxLoad,
          }
        : existing.thresholds;

      const machineObj: Machine = {
        id: existing.id,
        name: parsed.data.name ?? existing.name,
        category: parsed.data.category ?? existing.category,
        area: parsed.data.area ?? existing.area,
        modelType: existing.modelType as Machine['modelType'],
        status: existing.status as Machine['status'],
        healthScore: existing.healthScore,
        temperature: existing.temperature,
        vibration: existing.vibration,
        pressure: existing.pressure,
        rpm: existing.rpm,
        load: existing.load,
        anomalyScore: existing.anomalyScore,
        riskCategory: existing.riskCategory as Machine['riskCategory'],
        abnormalParameters: existing.abnormalParameters,
        flaggedReason: existing.flaggedReason,
        lastUpdated: existing.lastUpdated,
        uptimePercent: existing.uptimePercent,
        position3D: existing.position3D,
        thresholds: mergedThresholds,
        scenario: existing.scenario as SimulationScenario,
        isActive: parsed.data.isActive ?? existing.isActive,
        sensorHistory: [],
        anomalyHistory: [],
      };

      const mlEval = evaluateMachineTelemetryML(machineObj);

      const [updated] = await db
        .update(machines)
        .set({
          name: machineObj.name,
          category: machineObj.category,
          area: machineObj.area,
          isActive: machineObj.isActive,
          thresholds: mergedThresholds,
          status: mlEval.status,
          healthScore: mlEval.healthScore,
          anomalyScore: mlEval.anomalyScore,
          riskCategory: mlEval.riskCategory,
          abnormalParameters: mlEval.abnormalParameters,
          flaggedReason: mlEval.flaggedReason,
          lastUpdated: nowTimeLabel(),
          lastUpdatedAt: new Date(),
        })
        .where(eq(machines.id, machineId))
        .returning();

      await recordAuditLog({
        req,
        action: 'MACHINE_UPDATED',
        resourceType: 'machine',
        resourceId: machineId,
        details: parsed.data as Record<string, unknown>,
      });

      await broadcastState();
      res.json(updated);
    }
  );

  app.patch(
    '/api/machines/:id/deactivate',
    requireAuth,
    requireRole('System Admin', 'Factory Manager'),
    async (req: AuthRequest, res) => {
      await ensureDatabaseSeeded();
      const machineId = String(req.params.id);
      const rows = await db.select().from(machines).where(eq(machines.id, machineId)).limit(1);
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Machine not found.' });
      }
      const nextActive = typeof req.body?.isActive === 'boolean' ? req.body.isActive : false;
      const [updated] = await db
        .update(machines)
        .set({ isActive: nextActive, status: nextActive ? rows[0].status : 'offline' })
        .where(eq(machines.id, machineId))
        .returning();

      await db.insert(machineEvents).values({
        id: `EVT-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 99)}`,
        machineId,
        machineName: updated.name,
        category: 'Telemetry',
        title: nextActive ? `Machine ${machineId} Reactivated` : `Machine ${machineId} Deactivated`,
        description: `Asset active flag set to ${nextActive} by ${req.authUser?.name}.`,
        severity: 'info',
        timestampLabel: nowTimeLabel(),
      });

      await recordAuditLog({
        req,
        action: nextActive ? 'MACHINE_REACTIVATED' : 'MACHINE_DEACTIVATED',
        resourceType: 'machine',
        resourceId: machineId,
      });

      await broadcastState();
      res.json(updated);
    }
  );

  app.delete(
    '/api/machines/:id',
    requireAuth,
    requireRole('System Admin'),
    async (req: AuthRequest, res) => {
      await ensureDatabaseSeeded();
      const machineId = String(req.params.id);
      const rows = await db.select().from(machines).where(eq(machines.id, machineId)).limit(1);
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Machine not found.' });
      }
      await db.delete(machines).where(eq(machines.id, machineId));
      await recordAuditLog({
        req,
        action: 'MACHINE_DELETED',
        resourceType: 'machine',
        resourceId: machineId,
        details: { name: rows[0].name },
      });
      await broadcastState();
      res.json({ ok: true, deletedId: machineId });
    }
  );

  // --- Simulator Controls & Scenarios ---
  app.post(
    '/api/simulator/control',
    requireAuth,
    requireRole('System Admin', 'Factory Manager', 'Maintenance Engineer', 'Operator'),
    async (req: AuthRequest, res) => {
      const parsed = simulatorControlSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid simulator control payload.' });
      }
      await ensureDatabaseSeeded();
      const [simRow] = await db
        .select()
        .from(simulatorSessions)
        .orderBy(desc(simulatorSessions.startedAt))
        .limit(1);
      const sessionId = simRow?.id || 'SIM-SESSION-01';

      let status = simRow?.status || 'running';
      let speed = simRow?.speed || 1;
      let selectedMachineId = simRow?.selectedMachineId || 'M-101';
      let tickCount = simRow?.tickCount || 0;

      const { action } = parsed.data;
      if (action === 'start' || action === 'resume') {
        status = 'running';
      } else if (action === 'pause') {
        status = 'paused';
      } else if (action === 'stop') {
        status = 'stopped';
      } else if (action === 'reset') {
        await db.delete(sensorReadings);
        await db.delete(anomalies);
        await db.delete(alerts);
        await db.delete(workOrderNotes);
        await db.delete(workOrders);
        await db.delete(machineEvents);
        await db.delete(notifications);
        await db.delete(simulatorLogs);
        await db.delete(machines);
        await seedBaselineOperationalData();
        status = 'running';
        tickCount = 0;
        await db.insert(simulatorLogs).values({
          id: `SLOG-${Date.now().toString().slice(-6)}`,
          sessionId,
          machineId: 'ALL',
          scenario: 'Normal Operation',
          message: `Simulation environment reset to baseline factory state by ${req.authUser?.name}.`,
          level: 'info',
          timestampLabel: nowTimeLabel(),
        });
      } else if (action === 'step') {
        await stepAllMachinesTelemetry();
        tickCount += 1;
      }

      if (parsed.data.speed !== undefined) speed = parsed.data.speed;
      if (parsed.data.selectedMachineId) selectedMachineId = parsed.data.selectedMachineId;

      await db
        .update(simulatorSessions)
        .set({ status, speed, selectedMachineId, tickCount })
        .where(eq(simulatorSessions.id, sessionId));

      await recordAuditLog({
        req,
        action: `SIMULATOR_${(action || 'UPDATE').toUpperCase()}`,
        resourceType: 'simulator',
        resourceId: sessionId,
        details: parsed.data as Record<string, unknown>,
      });

      await broadcastState();
      const snapshot = await loadPlatformState({
        geminiConfigured: Boolean(getGeminiClient()),
        streamActive: sseClients.size > 0,
      });
      res.json(snapshot.simulator);
    }
  );

  app.post(
    '/api/simulator/scenario',
    requireAuth,
    requireRole('System Admin', 'Factory Manager', 'Maintenance Engineer', 'Operator'),
    async (req: AuthRequest, res) => {
      const parsed = simulatorScenarioSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid simulation scenario payload.' });
      }
      await ensureDatabaseSeeded();
      const { machineId, scenario } = parsed.data;
      const allMachines = await loadMachinesWithHistory(false);
      const target = allMachines.find((m) => m.id === machineId);
      if (!target) {
        return res.status(404).json({ error: 'Target machine not found.' });
      }

      await db.update(machines).set({ scenario }).where(eq(machines.id, machineId));
      target.scenario = scenario;

      const [simRow] = await db
        .select()
        .from(simulatorSessions)
        .orderBy(desc(simulatorSessions.startedAt))
        .limit(1);
      const sessionId = simRow?.id || 'SIM-SESSION-01';
      await db
        .update(simulatorSessions)
        .set({ selectedMachineId: machineId })
        .where(eq(simulatorSessions.id, sessionId));

      const aiSettings = await getAiSettings();
      const updatedMachine = await stepMachineInDb(
        target,
        true,
        aiSettings.autoCreateAlerts,
        sessionId
      );

      if (scenario === 'Normal Operation' || scenario === 'Recovery After Maintenance') {
        const label = nowTimeLabel();
        await db
          .update(alerts)
          .set({
            status: 'Resolved',
            resolvedAtLabel: label,
            resolvedAt: new Date(),
          })
          .where(and(eq(alerts.machineId, machineId), sql`${alerts.status} != 'Resolved'`));
      }

      const logLevel =
        updatedMachine.status === 'critical' || updatedMachine.status === 'offline'
          ? 'critical'
          : updatedMachine.status === 'warning'
          ? 'warning'
          : 'info';

      await db.insert(simulatorLogs).values({
        id: `SLOG-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 99)}`,
        sessionId,
        machineId: updatedMachine.id,
        scenario,
        message: `Applied "${scenario}" scenario to ${updatedMachine.id} (${updatedMachine.name}). Status: ${updatedMachine.status.toUpperCase()}.`,
        level: logLevel,
        timestampLabel: nowTimeLabel(),
      });

      await db.insert(machineEvents).values({
        id: `EVT-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 99)}`,
        machineId: updatedMachine.id,
        machineName: updatedMachine.name,
        category: 'Simulator',
        title: `Simulator Scenario: ${scenario}`,
        description: `${updatedMachine.id} telemetry updated under ${scenario} profile (Temp ${updatedMachine.temperature}°C, Vib ${updatedMachine.vibration} mm/s).`,
        severity: logLevel === 'info' ? 'success' : logLevel,
        timestampLabel: nowTimeLabel(),
      });

      await recordAuditLog({
        req,
        action: 'SIMULATOR_SCENARIO_APPLIED',
        resourceType: 'machine',
        resourceId: machineId,
        details: { scenario, status: updatedMachine.status, anomalyScore: updatedMachine.anomalyScore },
      });

      await broadcastState();
      const snapshot = await loadPlatformState({
        geminiConfigured: Boolean(getGeminiClient()),
        streamActive: sseClients.size > 0,
      });
      res.json({
        machine: snapshot.machines.find((m) => m.id === machineId) || updatedMachine,
        simulator: snapshot.simulator,
      });
    }
  );

  // --- ML Metrics ---
  app.get('/api/ml/metrics', requireAuth, async (_req, res) => {
    const artifact = loadAnomalyArtifact();
    res.json(artifact.metrics);
  });

  // --- Alerts ---
  app.post(
    '/api/alerts/:id/acknowledge',
    requireAuth,
    requireRole('System Admin', 'Factory Manager', 'Maintenance Engineer', 'Operator'),
    async (req: AuthRequest, res) => {
      await ensureDatabaseSeeded();
      const alertId = String(req.params.id);
      const rows = await db.select().from(alerts).where(eq(alerts.id, alertId)).limit(1);
      if (rows.length === 0) return res.status(404).json({ error: 'Alert not found.' });

      const actorName = req.authUser!.name;
      const [updated] = await db
        .update(alerts)
        .set({ status: 'Acknowledged', acknowledgedBy: actorName })
        .where(eq(alerts.id, alertId))
        .returning();

      await db.insert(machineEvents).values({
        id: `EVT-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 99)}`,
        machineId: updated.machineId,
        machineName: updated.machineName,
        category: 'Alert',
        title: `Alert ${updated.id} Acknowledged`,
        description: `Acknowledged by ${actorName}.`,
        severity: 'info',
        timestampLabel: nowTimeLabel(),
      });

      await recordAuditLog({
        req,
        action: 'ALERT_ACKNOWLEDGED',
        resourceType: 'alert',
        resourceId: alertId,
      });

      await broadcastState();
      res.json(updated);
    }
  );

  app.post(
    '/api/alerts/:id/resolve',
    requireAuth,
    requireRole('System Admin', 'Factory Manager', 'Maintenance Engineer'),
    async (req: AuthRequest, res) => {
      await ensureDatabaseSeeded();
      const alertId = String(req.params.id);
      const rows = await db.select().from(alerts).where(eq(alerts.id, alertId)).limit(1);
      if (rows.length === 0) return res.status(404).json({ error: 'Alert not found.' });

      const label = nowTimeLabel();
      const [updated] = await db
        .update(alerts)
        .set({ status: 'Resolved', resolvedAtLabel: label, resolvedAt: new Date() })
        .where(eq(alerts.id, alertId))
        .returning();

      await db.insert(machineEvents).values({
        id: `EVT-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 99)}`,
        machineId: updated.machineId,
        machineName: updated.machineName,
        category: 'Alert',
        title: `Alert ${updated.id} Resolved`,
        description: `${updated.type} marked resolved by ${req.authUser!.name}.`,
        severity: 'success',
        timestampLabel: label,
      });

      await recordAuditLog({
        req,
        action: 'ALERT_RESOLVED',
        resourceType: 'alert',
        resourceId: alertId,
      });

      await broadcastState();
      res.json(updated);
    }
  );

  // --- Maintenance Work Orders ---
  app.post(
    '/api/work-orders',
    requireAuth,
    requireRole('System Admin', 'Factory Manager', 'Maintenance Engineer'),
    async (req: AuthRequest, res) => {
      const parsed = createWorkOrderSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Valid machineId and issue description are required.' });
      }
      await ensureDatabaseSeeded();
      const machineRows = await db
        .select()
        .from(machines)
        .where(eq(machines.id, parsed.data.machineId))
        .limit(1);
      if (machineRows.length === 0) {
        return res.status(404).json({ error: 'Target machine not found.' });
      }
      const machine = machineRows[0];
      const woId = `WO-${Math.floor(3105 + Math.random() * 800)}-${Date.now().toString().slice(-3)}`;
      const status: WorkOrderStatus = parsed.data.assignedEngineer ? 'Assigned' : 'Open';
      const createdDate = isoDateOffset(0);
      const dueDate = parsed.data.dueDate || isoDateOffset(1);

      const [created] = await db
        .insert(workOrders)
        .values({
          id: woId,
          machineId: machine.id,
          machineName: machine.name,
          issue: parsed.data.issue,
          priority: parsed.data.priority,
          assignedEngineer: parsed.data.assignedEngineer,
          createdDate,
          dueDate,
          status,
          source: parsed.data.source,
          createdBy: req.authUser!.id,
        })
        .returning();

      const label = nowTimeLabel();
      await db.insert(machineEvents).values({
        id: `EVT-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 99)}`,
        machineId: machine.id,
        machineName: machine.name,
        category: 'Maintenance',
        title: `Work Order ${created.id} Created (${parsed.data.source})`,
        description: `${parsed.data.priority} priority task assigned to ${parsed.data.assignedEngineer}: ${parsed.data.issue}`,
        severity: parsed.data.priority === 'Critical' ? 'critical' : 'info',
        timestampLabel: label,
      });

      await db.insert(notifications).values({
        id: `NOTIF-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 99)}`,
        category: 'Maintenance Assignment',
        title: `New Work Order ${created.id} (${machine.id})`,
        message: `Assigned to ${parsed.data.assignedEngineer}: ${parsed.data.issue}`,
        read: false,
        machineId: machine.id,
        targetPage: 'maintenance',
        timestampLabel: label,
      });

      if (parsed.data.assistantMessageId) {
        await db
          .update(aiMessages)
          .set({ workOrderApprovedId: created.id })
          .where(eq(aiMessages.id, parsed.data.assistantMessageId));
      }

      await recordAuditLog({
        req,
        action: 'WORK_ORDER_CREATED',
        resourceType: 'work_order',
        resourceId: created.id,
        details: { machineId: machine.id, priority: parsed.data.priority, source: parsed.data.source },
      });

      await broadcastState();
      res.status(201).json({ ...created, notes: [] });
    }
  );

  app.patch(
    '/api/work-orders/:id',
    requireAuth,
    requireRole('System Admin', 'Factory Manager', 'Maintenance Engineer'),
    async (req: AuthRequest, res) => {
      const parsed = updateWorkOrderSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid work order update payload.' });
      }
      await ensureDatabaseSeeded();
      const woId = String(req.params.id);
      const rows = await db.select().from(workOrders).where(eq(workOrders.id, woId)).limit(1);
      if (rows.length === 0) return res.status(404).json({ error: 'Work order not found.' });
      const existing = rows[0];

      // Enforce status transition rules
      if (parsed.data.status && parsed.data.status !== existing.status) {
        if (existing.status === 'Completed') {
          if (!['System Admin', 'Factory Manager'].includes(req.authUser!.role)) {
            return res.status(400).json({
              error: 'Completed work orders can only be reopened by a Factory Manager or System Admin.',
            });
          }
        }
      }

      const nextStatus = (parsed.data.status || existing.status) as WorkOrderStatus;
      const [updated] = await db
        .update(workOrders)
        .set({
          status: nextStatus,
          assignedEngineer: parsed.data.assignedEngineer ?? existing.assignedEngineer,
          priority: (parsed.data.priority ?? existing.priority) as WorkOrderPriority,
          issue: parsed.data.issue ?? existing.issue,
          dueDate: parsed.data.dueDate ?? existing.dueDate,
          completedAt: nextStatus === 'Completed' ? new Date() : existing.completedAt,
        })
        .where(eq(workOrders.id, woId))
        .returning();

      const label = nowTimeLabel();
      await db.insert(machineEvents).values({
        id: `EVT-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 99)}`,
        machineId: updated.machineId,
        machineName: updated.machineName,
        category: 'Maintenance',
        title: `Work Order ${updated.id} Updated to ${updated.status}`,
        description: `Engineer: ${updated.assignedEngineer} · Updated by ${req.authUser!.name}`,
        severity: updated.status === 'Completed' ? 'success' : 'info',
        timestampLabel: label,
      });

      await db.insert(notifications).values({
        id: `NOTIF-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 99)}`,
        category: 'Work Order Update',
        title: `${updated.id} status changed to ${updated.status}`,
        message: `${updated.machineId} ${updated.machineName} — ${updated.issue}`,
        read: false,
        machineId: updated.machineId,
        targetPage: 'maintenance',
        timestampLabel: label,
      });

      await recordAuditLog({
        req,
        action: 'WORK_ORDER_UPDATED',
        resourceType: 'work_order',
        resourceId: woId,
        details: parsed.data as Record<string, unknown>,
      });

      await broadcastState();
      const noteRows = await db
        .select()
        .from(workOrderNotes)
        .where(eq(workOrderNotes.workOrderId, woId))
        .orderBy(workOrderNotes.createdAt);
      res.json({
        ...updated,
        notes: noteRows.map((n) => ({
          id: n.id,
          author: n.author,
          timestamp: n.timestampLabel,
          text: n.text,
        })),
      });
    }
  );

  app.post(
    '/api/work-orders/:id/notes',
    requireAuth,
    requireRole('System Admin', 'Factory Manager', 'Maintenance Engineer', 'Operator'),
    async (req: AuthRequest, res) => {
      const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
      if (!text || text.length > 1000) {
        return res.status(400).json({ error: 'Valid note text (1–1000 characters) is required.' });
      }
      await ensureDatabaseSeeded();
      const woId = String(req.params.id);
      const rows = await db.select().from(workOrders).where(eq(workOrders.id, woId)).limit(1);
      if (rows.length === 0) return res.status(404).json({ error: 'Work order not found.' });

      await db.insert(workOrderNotes).values({
        id: `NOTE-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 99)}`,
        workOrderId: woId,
        author: req.authUser!.name,
        text,
        timestampLabel: nowTimeLabel(),
      });

      await recordAuditLog({
        req,
        action: 'WORK_ORDER_NOTE_ADDED',
        resourceType: 'work_order',
        resourceId: woId,
      });

      await broadcastState();
      const noteRows = await db
        .select()
        .from(workOrderNotes)
        .where(eq(workOrderNotes.workOrderId, woId))
        .orderBy(workOrderNotes.createdAt);
      res.json({
        ...rows[0],
        notes: noteRows.map((n) => ({
          id: n.id,
          author: n.author,
          timestamp: n.timestampLabel,
          text: n.text,
        })),
      });
    }
  );

  // --- Notifications ---
  app.post('/api/notifications/read-all', requireAuth, async (req: AuthRequest, res) => {
    await ensureDatabaseSeeded();
    await db.update(notifications).set({ read: true });
    await broadcastState();
    res.json({ ok: true });
  });

  app.post('/api/notifications/:id/read', requireAuth, async (req: AuthRequest, res) => {
    await ensureDatabaseSeeded();
    const id = String(req.params.id);
    const rows = await db.select().from(notifications).where(eq(notifications.id, id)).limit(1);
    if (rows.length === 0) return res.status(404).json({ error: 'Notification not found.' });
    const [updated] = await db
      .update(notifications)
      .set({ read: true })
      .where(eq(notifications.id, id))
      .returning();
    await broadcastState();
    res.json(updated);
  });

  // --- Users, Audit Logs & AI Settings ---
  app.get(
    '/api/audit-logs',
    requireAuth,
    requireRole('System Admin', 'Factory Manager'),
    async (req, res) => {
      await ensureDatabaseSeeded();
      const limit = Math.min(200, Math.max(10, Number(req.query.limit) || 50));
      const rows = await db
        .select()
        .from(auditLogs)
        .orderBy(desc(auditLogs.createdAt))
        .limit(limit);
      res.json({ logs: rows });
    }
  );

  app.post(
    '/api/users',
    requireAuth,
    requireRole('System Admin'),
    async (req: AuthRequest, res) => {
      const parsed = createUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Valid name, email, and role are required.' });
      }
      await ensureDatabaseSeeded();
      const email = parsed.data.email.trim().toLowerCase();
      const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (existing.length > 0) {
        return res.status(409).json({ error: 'User with this email already exists.' });
      }
      const initialPassword =
        parsed.data.password || process.env.DEMO_SEED_PASSWORD?.trim() || 'ForgeTwin@2026';
      const { salt, hash } = hashPassword(initialPassword);
      const id = `USR-${Date.now().toString().slice(-6)}`;

      const [created] = await db
        .insert(users)
        .values({
          id,
          name: parsed.data.name,
          email,
          passwordHash: hash,
          passwordSalt: salt,
          role: parsed.data.role,
          status: 'Active',
          department: parsed.data.department,
          lastActive: 'Just invited',
        })
        .returning();

      await recordAuditLog({
        req,
        action: 'USER_CREATED',
        resourceType: 'user',
        resourceId: created.id,
        details: { email: created.email, role: created.role },
      });

      await broadcastState();
      res.status(201).json({
        id: created.id,
        name: created.name,
        email: created.email,
        role: created.role,
        status: created.status,
        department: created.department,
        lastActive: created.lastActive,
      });
    }
  );

  app.patch(
    '/api/users/:id',
    requireAuth,
    requireRole('System Admin'),
    async (req: AuthRequest, res) => {
      const parsed = updateUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid user update payload.' });
      }
      await ensureDatabaseSeeded();
      const userId = String(req.params.id);
      const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (rows.length === 0) return res.status(404).json({ error: 'User not found.' });
      const existing = rows[0];

      const [updated] = await db
        .update(users)
        .set({
          role: parsed.data.role && VALID_ROLES.includes(parsed.data.role) ? parsed.data.role : existing.role,
          status: parsed.data.status ?? existing.status,
        })
        .where(eq(users.id, userId))
        .returning();

      await recordAuditLog({
        req,
        action: 'USER_UPDATED',
        resourceType: 'user',
        resourceId: userId,
        details: parsed.data as Record<string, unknown>,
      });

      await broadcastState();
      res.json({
        id: updated.id,
        name: updated.name,
        email: updated.email,
        role: updated.role,
        status: updated.status,
        department: updated.department,
        lastActive: updated.lastActive,
      });
    }
  );

  app.patch(
    '/api/settings/ai',
    requireAuth,
    requireRole('System Admin', 'Factory Manager'),
    async (req: AuthRequest, res) => {
      await ensureDatabaseSeeded();
      const current = await getAiSettings();
      const nextSettings = {
        anomalyThreshold:
          typeof req.body?.anomalyThreshold === 'number'
            ? Math.min(0.95, Math.max(0.2, req.body.anomalyThreshold))
            : current.anomalyThreshold,
        visionConfidenceThreshold:
          typeof req.body?.visionConfidenceThreshold === 'number'
            ? Math.min(99, Math.max(50, req.body.visionConfidenceThreshold))
            : current.visionConfidenceThreshold,
        autoCreateAlerts:
          typeof req.body?.autoCreateAlerts === 'boolean'
            ? req.body.autoCreateAlerts
            : current.autoCreateAlerts,
        assistantModel: current.assistantModel,
      };

      await db
        .insert(appSettings)
        .values({
          key: 'ai_config',
          value: nextSettings,
          updatedBy: req.authUser!.id,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: appSettings.key,
          set: {
            value: nextSettings,
            updatedBy: req.authUser!.id,
            updatedAt: new Date(),
          },
        });

      await recordAuditLog({
        req,
        action: 'AI_SETTINGS_UPDATED',
        resourceType: 'settings',
        resourceId: 'ai_config',
        details: nextSettings,
      });

      await broadcastState();
      res.json(nextSettings);
    }
  );

  // --- Analytics & Reports (PostgreSQL backed + CSV/PDF Export) ---
  app.get('/api/analytics', requireAuth, async (req, res) => {
    try {
      await ensureDatabaseSeeded();
      const machineId = typeof req.query.machineId === 'string' ? req.query.machineId : 'all';
      const rangeRaw = typeof req.query.range === 'string' ? req.query.range : 'today';
      const range = (['today', '7d', '30d'].includes(rangeRaw) ? rangeRaw : 'today') as
        | 'today'
        | '7d'
        | '30d';
      const report = await computeDatabaseAnalytics({ machineId, range });
      res.json(report);
    } catch (err) {
      console.error('Analytics error:', err);
      res.status(500).json({ error: 'Failed to compute analytics.' });
    }
  });

  app.get('/api/analytics/export', requireAuth, async (req: AuthRequest, res) => {
    try {
      await ensureDatabaseSeeded();
      const format = req.query.format === 'pdf' ? 'pdf' : 'csv';
      const machineId = typeof req.query.machineId === 'string' ? req.query.machineId : 'all';
      const rangeRaw = typeof req.query.range === 'string' ? req.query.range : 'today';
      const range = (['today', '7d', '30d'].includes(rangeRaw) ? rangeRaw : 'today') as
        | 'today'
        | '7d'
        | '30d';

      const analytics = await computeDatabaseAnalytics({ machineId, range });
      const dateStr = new Date().toISOString().slice(0, 10);

      await recordAuditLog({
        req,
        action: `ANALYTICS_EXPORT_${format.toUpperCase()}`,
        resourceType: 'analytics',
        resourceId: machineId,
        details: { range, format },
      });

      if (format === 'pdf') {
        const lines: string[] = [
          `ForgeTwin Plant Operational Analytics Report (${dateStr})`,
          `Scope: Machine=${analytics.machineId} | Window=${analytics.range} | Generated By=${req.authUser!.name}`,
          `Avg Health: ${analytics.avgHealth}% | Total Telemetry Samples: ${analytics.totalReadings}`,
          `Alerts: Total=${analytics.alertSummary.total}, Active=${analytics.alertSummary.active}, Critical=${analytics.alertSummary.critical}, High=${analytics.alertSummary.high}`,
          `Work Orders: Total=${analytics.workOrderSummary.total}, Completed=${analytics.workOrderSummary.completed}, Open=${analytics.workOrderSummary.open}`,
          `Quality Inspections: Total=${analytics.qualitySummary.total}, Passed=${analytics.qualitySummary.passed}, Defects=${analytics.qualitySummary.defects}, PassRate=${analytics.qualitySummary.passRate}%`,
          '--------------------------------------------------------------------------',
          'Machine Breakdown:',
        ];
        for (const m of analytics.machineBreakdown) {
          lines.push(
            `${m.machineId} | ${m.name} | Status=${m.status.toUpperCase()} | Health=${m.healthScore}% | Anomaly=${m.anomalyScore} | Uptime=${m.uptimePercent}% | AvgTemp=${m.avgTemperature}C | AvgVib=${m.avgVibration}mm/s`
          );
        }
        const pdfBuf = buildAnalyticsPdfBuffer(lines);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="ForgeTwin_Analytics_${range}_${dateStr}.pdf"`
        );
        return res.send(pdfBuf);
      }

      const header = [
        'Machine ID',
        'Name',
        'Status',
        'Health Score (%)',
        'Uptime (%)',
        'Downtime (%)',
        'Avg Temp (C)',
        'Avg Vibration (mm/s)',
        'Anomaly Score',
        'Risk Category',
        'Readings Count',
        'Alerts Count',
      ].join(',');
      const rows = analytics.machineBreakdown.map((m) =>
        [
          m.machineId,
          `"${m.name.replace(/"/g, '""')}"`,
          m.status,
          m.healthScore,
          m.uptimePercent,
          m.downtimePercent,
          m.avgTemperature,
          m.avgVibration,
          m.anomalyScore,
          `"${m.riskCategory}"`,
          m.readingsCount,
          m.alertCount,
        ].join(',')
      );
      const csv = [header, ...rows].join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="ForgeTwin_Analytics_${range}_${dateStr}.csv"`
      );
      return res.send(csv);
    } catch (err) {
      console.error('Analytics export failed:', err);
      return res.status(500).json({ error: 'Failed to generate analytics export.' });
    }
  });

  // --- Quality Inspection Images (Protected) ---
  app.get('/api/quality/images/:fileName', requireStreamOrImageAuth, (req, res) => {
    const safePath = resolveSafeUploadedImagePath(String(req.params.fileName));
    if (!safePath) {
      return res.status(404).json({ error: 'Inspection image not found.' });
    }
    return res.sendFile(safePath);
  });

  // --- Gemini AI Quality Inspection ---
  app.post(
    '/api/quality/inspect',
    requireAuth,
    requireRole('System Admin', 'Factory Manager', 'Quality Inspector', 'Maintenance Engineer'),
    aiLimiter,
    async (req: AuthRequest, res) => {
      await ensureDatabaseSeeded();

      const machineId = typeof req.body?.machineId === 'string' ? req.body.machineId.trim() : 'M-101';
      const partName =
        typeof req.body?.partName === 'string' && req.body.partName.trim()
          ? req.body.partName.trim().slice(0, 120)
          : 'Inspected Component';
      const base64Data = typeof req.body?.imageBase64 === 'string' ? req.body.imageBase64 : '';
      const mimeType = typeof req.body?.mimeType === 'string' ? req.body.mimeType : undefined;
      const sampleImagePath =
        typeof req.body?.sampleImagePath === 'string' ? req.body.sampleImagePath : '';

      let resolvedBase64 = '';
      let resolvedMime = 'image/jpeg';
      let displayImageUrl = '';
      let storageKey: string | null = null;
      let fileSizeBytes: number | null = null;

      if (base64Data) {
        try {
          const saved = validateAndSaveUploadedImage(base64Data, mimeType);
          resolvedBase64 = saved.base64;
          resolvedMime = saved.mimeType;
          storageKey = saved.fileName;
          fileSizeBytes = saved.fileSizeBytes;
          displayImageUrl = `/api/quality/images/${saved.fileName}`;
        } catch (err) {
          return res.status(400).json({
            error: err instanceof Error ? err.message : 'Invalid uploaded image.',
          });
        }
      } else if (sampleImagePath) {
        const baseDir = path.resolve(process.cwd(), 'src', 'assets', 'images');
        const fileName = path.basename(sampleImagePath);
        const targetPath = path.resolve(baseDir, fileName);
        if (!targetPath.startsWith(baseDir + path.sep) || !fs.existsSync(targetPath)) {
          return res.status(400).json({ error: 'Sample inspection image not found.' });
        }
        const buf = fs.readFileSync(targetPath);
        resolvedBase64 = buf.toString('base64');
        resolvedMime = fileName.endsWith('.png') ? 'image/png' : 'image/jpeg';
        displayImageUrl = `/src/assets/images/${fileName}`;
        fileSizeBytes = buf.length;
      } else {
        return res
          .status(400)
          .json({ error: 'Please upload an image or choose a sample inspection part.' });
      }

      const ai = getGeminiClient();
      if (!ai) {
        return res.status(503).json({
          error:
            'Computer Vision model unavailable: GEMINI_API_KEY is not configured in environment secrets.',
          code: 'MODEL_UNAVAILABLE',
        });
      }

      try {
        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: resolvedMime,
                  data: resolvedBase64,
                },
              },
              {
                text: `You are an industrial metrological visual quality assessment system for ForgeTwin. Analyze this image of part "${partName}" produced by machine ${machineId}. Identify any surface defects (cracks, burrs, weld porosity, pitting, scratches, corrosion, dimensional anomalies). Return bounding boxes in normalized 0-100 percentage coordinates relative to image width/height. Be precise and conservative: if the machined surface looks clean and defect-free, report "No Defect Detected".`,
              },
            ],
          },
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                status: {
                  type: Type.STRING,
                  description: 'Must be exactly "Defect Detected" or "No Defect Detected".',
                },
                defectCategory: {
                  type: Type.STRING,
                  description: 'Specific defect category or "None" if no defect.',
                },
                confidence: {
                  type: Type.NUMBER,
                  description: 'Confidence score from 0 to 100.',
                },
                summary: {
                  type: Type.STRING,
                  description: 'Concise engineering description of findings.',
                },
                recommendedAction: {
                  type: Type.STRING,
                  description: 'Concrete QA / manufacturing action.',
                },
                detections: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      label: { type: Type.STRING },
                      x: { type: Type.NUMBER },
                      y: { type: Type.NUMBER },
                      w: { type: Type.NUMBER },
                      h: { type: Type.NUMBER },
                    },
                  },
                },
              },
              required: [
                'status',
                'defectCategory',
                'confidence',
                'summary',
                'recommendedAction',
                'detections',
              ],
            },
          },
        });

        const parsed = JSON.parse((response.text ?? '{}').trim());
        const status =
          parsed.status === 'Defect Detected' ? 'Defect Detected' : 'No Defect Detected';
        const inspId = `INSP-${Math.floor(420 + Math.random() * 500)}-${Date.now().toString().slice(-3)}`;
        const label = nowTimeLabel();
        const confidence = Number(
          Math.min(99.9, Math.max(50, Number(parsed.confidence) || 90)).toFixed(1)
        );
        const defectCategory = String(
          parsed.defectCategory || (status === 'Defect Detected' ? 'Surface Anomaly' : 'None')
        );
        const summary = String(parsed.summary || 'Automated visual inspection completed.');
        const recommendedAction = String(
          parsed.recommendedAction || 'Log result in batch traceability sheet.'
        );
        const detections = Array.isArray(parsed.detections)
          ? parsed.detections.map((d: Record<string, unknown>) => ({
              label: String(d.label || 'Defect'),
              x: Math.min(95, Math.max(0, Number(d.x) || 20)),
              y: Math.min(95, Math.max(0, Number(d.y) || 20)),
              w: Math.min(90, Math.max(5, Number(d.w) || 20)),
              h: Math.min(90, Math.max(5, Number(d.h) || 20)),
            }))
          : [];
        const analysisEngine = 'Gemini Multimodal Visual Assessment (gemini-4-hydrogen)';

        await db.insert(qualityInspections).values({
          id: inspId,
          machineId,
          partName,
          imageUrl: displayImageUrl,
          storageKey,
          mimeType: resolvedMime,
          fileSizeBytes,
          status,
          defectCategory,
          confidence,
          analysisEngine,
          summary,
          recommendedAction,
          detections,
          inspectedBy: req.authUser!.id,
          timestampLabel: label,
        });

        const machineRows = await db.select().from(machines).where(eq(machines.id, machineId)).limit(1);
        await db.insert(machineEvents).values({
          id: `EVT-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 99)}`,
          machineId,
          machineName: machineRows[0]?.name || machineId,
          category: 'Inspection',
          title: `Vision Inspection ${inspId}: ${status}`,
          description: `${partName} — ${defectCategory} (${confidence}% confidence).`,
          severity: status === 'Defect Detected' ? 'warning' : 'success',
          timestampLabel: label,
        });

        await db.insert(notifications).values({
          id: `NOTIF-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 99)}`,
          category: 'Quality Inspection',
          title: `${inspId}: ${status}`,
          message: `${partName} (${machineId}) — ${summary}`,
          read: false,
          machineId,
          targetPage: 'quality',
          timestampLabel: label,
        });

        await recordAuditLog({
          req,
          action: 'QUALITY_INSPECTION_RUN',
          resourceType: 'inspection',
          resourceId: inspId,
          details: { machineId, partName, status, confidence },
        });

        await broadcastState();
        return res.json({
          id: inspId,
          timestamp: label,
          machineId,
          partName,
          imageUrl: displayImageUrl,
          status,
          defectCategory,
          confidence,
          analysisEngine,
          summary,
          recommendedAction,
          detections,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Vision inspection request failed.';
        return res.status(502).json({ error: msg, code: 'MODEL_UNAVAILABLE' });
      }
    }
  );

  // --- Agentic AI Factory Assistant Conversations & Chat ---
  app.get('/api/assistant/conversations', requireAuth, async (req: AuthRequest, res) => {
    await ensureDatabaseSeeded();
    const conversations = await loadUserConversations(req.authUser!.id);
    res.json({ conversations });
  });

  app.post('/api/assistant/conversations', requireAuth, async (req: AuthRequest, res) => {
    await ensureDatabaseSeeded();
    const title =
      typeof req.body?.title === 'string' && req.body.title.trim()
        ? req.body.title.trim().slice(0, 80)
        : 'New Investigation';
    const convId = `CONV-${Date.now().toString().slice(-6)}`;
    const createdAtLabel = nowTimeLabel();

    await db.insert(aiConversations).values({
      id: convId,
      userId: req.authUser!.id,
      title,
      saved: false,
      createdAtLabel,
    });

    const msgId = `MSG-${Date.now().toString().slice(-6)}`;
    await db.insert(aiMessages).values({
      id: msgId,
      conversationId: convId,
      role: 'assistant',
      content:
        'New investigation session initialized. Ask about machine health, vibration trends, alerts, or maintenance readiness.',
      timestampLabel: createdAtLabel,
    });

    res.status(201).json({
      id: convId,
      title,
      createdAt: createdAtLabel,
      saved: false,
      messages: [
        {
          id: msgId,
          role: 'assistant',
          timestamp: createdAtLabel,
          content:
            'New investigation session initialized. Ask about machine health, vibration trends, alerts, or maintenance readiness.',
        },
      ],
    });
  });

  app.patch('/api/assistant/conversations/:id', requireAuth, async (req: AuthRequest, res) => {
    await ensureDatabaseSeeded();
    const convId = String(req.params.id);
    const rows = await db
      .select()
      .from(aiConversations)
      .where(eq(aiConversations.id, convId))
      .limit(1);
    if (rows.length === 0) return res.status(404).json({ error: 'Conversation not found.' });

    const conv = rows[0];
    if (
      conv.userId !== req.authUser!.id &&
      conv.id !== 'CONV-01' &&
      req.authUser!.role !== 'System Admin'
    ) {
      return res.status(403).json({ error: 'Forbidden: Cannot modify another user conversation.' });
    }

    const [updated] = await db
      .update(aiConversations)
      .set({
        saved: typeof req.body?.saved === 'boolean' ? req.body.saved : conv.saved,
        title:
          typeof req.body?.title === 'string' && req.body.title.trim()
            ? req.body.title.trim().slice(0, 80)
            : conv.title,
      })
      .where(eq(aiConversations.id, convId))
      .returning();

    res.json(updated);
  });

  app.post('/api/assistant/chat', requireAuth, aiLimiter, async (req: AuthRequest, res) => {
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    const selectedMachineId =
      typeof req.body?.selectedMachineId === 'string' ? req.body.selectedMachineId : undefined;
    let conversationId =
      typeof req.body?.conversationId === 'string' && req.body.conversationId.trim()
        ? req.body.conversationId.trim()
        : 'CONV-01';

    if (!prompt || prompt.length > 2000) {
      return res.status(400).json({ error: 'Message prompt (1–2000 characters) is required.' });
    }

    await ensureDatabaseSeeded();

    // Ensure conversation exists
    const existingConv = await db
      .select()
      .from(aiConversations)
      .where(eq(aiConversations.id, conversationId))
      .limit(1);
    if (existingConv.length === 0) {
      conversationId = `CONV-${Date.now().toString().slice(-6)}`;
      await db.insert(aiConversations).values({
        id: conversationId,
        userId: req.authUser!.id,
        title: prompt.slice(0, 36),
        saved: false,
        createdAtLabel: nowTimeLabel(),
      });
    } else if (existingConv[0].title === 'New Investigation') {
      await db
        .update(aiConversations)
        .set({ title: prompt.slice(0, 36) })
        .where(eq(aiConversations.id, conversationId));
    }

    const userMsgId = `MSG-${Date.now()}-${Math.floor(Math.random() * 999)}`;
    await db.insert(aiMessages).values({
      id: userMsgId,
      conversationId,
      role: 'user',
      content: prompt,
      timestampLabel: nowTimeLabel(),
    });

    const { traces, contextJson, referencedIds, canDraftWorkOrder } = await runRbacAssistantTools({
      prompt,
      selectedMachineId,
      userRole: req.authUser!.role,
    });

    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({
        error:
          'AI Operations Assistant unavailable: GEMINI_API_KEY is not configured in Settings > Secrets.',
        toolTraces: traces,
        conversationId,
      });
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `User question: "${prompt}"\n\nLive ForgeTwin PostgreSQL Telemetry & Operational Context:\n${contextJson}`,
        config: {
          systemInstruction: `You are ForgeTwin Operations AI, an industrial reliability and maintenance engineering copilot.
Rules:
1. Ground every single number, status, alert ID, and machine name strictly in the Live ForgeTwin Backend Telemetry JSON provided. Never invent sensor readings or probabilities of failure.
2. Explicitly separate observed machine facts ("observedFacts") from engineering interpretations/recommendations ("recommendations").
3. Only if "canApproveWorkOrder" is true AND the user is investigating a machine with warning/critical/offline status, anomaly, or asking for maintenance action, include a structured "workOrderDraft" recommending a concrete maintenance action and assigning an appropriate engineer (Arjun Deshmukh for CNC/Press/Mechanical, Priya Nair for Compressor/Pneumatics, Rohan Kulkarni for Conveyor/Packaging). Otherwise set workOrderDraft to null.
4. Keep "answer" concise, technical, and clear (2-4 sentences).`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              answer: { type: Type.STRING },
              observedFacts: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              recommendations: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              referencedMachineIds: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              workOrderDraft: {
                type: Type.OBJECT,
                nullable: true,
                properties: {
                  machineId: { type: Type.STRING },
                  machineName: { type: Type.STRING },
                  issue: { type: Type.STRING },
                  priority: { type: Type.STRING },
                  assignedEngineer: { type: Type.STRING },
                  rationale: { type: Type.STRING },
                },
              },
            },
            required: ['answer', 'observedFacts', 'recommendations', 'referencedMachineIds'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      const sanitizedDraft = canDraftWorkOrder && parsed.workOrderDraft ? parsed.workOrderDraft : null;

      if (sanitizedDraft) {
        traces.push({
          tool: 'prepare_maintenance_work_order',
          status: 'completed',
          summary: `Drafted maintenance work order for ${sanitizedDraft.machineId} pending human review`,
        });
      }

      const answer = String(parsed.answer || 'Investigation complete.');
      const observedFacts = Array.isArray(parsed.observedFacts) ? parsed.observedFacts : [];
      const recommendations = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];
      const finalRefIds =
        Array.isArray(parsed.referencedMachineIds) && parsed.referencedMachineIds.length > 0
          ? parsed.referencedMachineIds
          : referencedIds;

      const assistantMsgId = `MSG-${Date.now() + 1}-${Math.floor(Math.random() * 999)}`;
      const msgLabel = nowTimeLabel();
      await db.insert(aiMessages).values({
        id: assistantMsgId,
        conversationId,
        role: 'assistant',
        content: answer,
        observedFacts,
        recommendations,
        referencedMachineIds: finalRefIds,
        workOrderDraft: sanitizedDraft,
        timestampLabel: msgLabel,
      });

      for (const tr of traces) {
        await db.insert(aiToolLogs).values({
          messageId: assistantMsgId,
          userId: req.authUser!.id,
          toolName: tr.tool,
          status: tr.status,
          summary: tr.summary,
        });
      }

      const refMachineId = finalRefIds[0] || 'FACTORY';
      const machineRows = await db
        .select({ name: machines.name })
        .from(machines)
        .where(eq(machines.id, refMachineId))
        .limit(1);
      await db.insert(machineEvents).values({
        id: `EVT-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 99)}`,
        machineId: refMachineId,
        machineName: machineRows[0]?.name || 'ForgeTwin Plant',
        category: 'AI Assistant',
        title: 'AI Operations Investigation Completed',
        description: `Analyzed prompt: "${prompt.slice(0, 72)}"`,
        severity: 'info',
        timestampLabel: msgLabel,
      });

      await recordAuditLog({
        req,
        action: 'AI_ASSISTANT_QUERY',
        resourceType: 'ai_conversation',
        resourceId: conversationId,
        details: { referencedMachineIds: finalRefIds, draftedWorkOrder: Boolean(sanitizedDraft) },
      });

      await broadcastState();

      return res.json({
        conversationId,
        messageId: assistantMsgId,
        answer,
        observedFacts,
        recommendations,
        referencedMachineIds: finalRefIds,
        workOrderDraft: sanitizedDraft,
        toolTraces: traces,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'AI assistant request failed.';
      return res.status(502).json({ error: msg, toolTraces: traces, conversationId });
    }
  });

  // Frontend middleware / static dist
  if (options?.attachFrontend !== false) {
    if (process.env.NODE_ENV !== 'production') {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      const distDir = path.resolve(process.cwd(), 'dist');
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  return app;
}

async function startServer() {
  const app = await createApp({ attachFrontend: true });

  // Background simulator loop backed by PostgreSQL
  let simAccumulatorMs = 0;
  let simTickInFlight = false;
  const SIM_TICK_INTERVAL_MS = 500;

  setInterval(async () => {
    if (simTickInFlight) return;
    try {
      const [simRow] = await db
        .select()
        .from(simulatorSessions)
        .orderBy(desc(simulatorSessions.startedAt))
        .limit(1);
      if (!simRow || simRow.status !== 'running') return;

      const speed = Math.max(0.5, Number(simRow.speed) || 1);
      const targetInterval = 2500 / speed;
      simAccumulatorMs += SIM_TICK_INTERVAL_MS;
      if (simAccumulatorMs < targetInterval) return;
      simAccumulatorMs = 0;

      simTickInFlight = true;
      await stepAllMachinesTelemetry();
      await broadcastState();
    } catch {
      // Do not crash background loop on transient error
    } finally {
      simTickInFlight = false;
    }
  }, SIM_TICK_INTERVAL_MS);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ForgeTwin server running at http://0.0.0.0:${PORT}`);
  });
}

const isMainEntry =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainEntry) {
  startServer();
}
