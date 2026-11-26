import { count } from 'drizzle-orm';
import { db } from './index.ts';
import {
  aiConversations,
  aiMessages,
  alerts,
  anomalies,
  appSettings,
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
} from './schema.ts';
import { hashPassword } from '../lib/auth.ts';
import type { MachineThresholds } from '../types.ts';

function nowTimeLabel(offsetSeconds = 0): string {
  const d = new Date(Date.now() + offsetSeconds * 1000);
  return d.toLocaleTimeString('en-GB', { hour12: false });
}

function isoDateOffset(daysOffset = 0): string {
  const d = new Date(Date.now() + daysOffset * 86400000);
  return d.toISOString().slice(0, 10);
}

function generateInitialReadings(
  machineId: string,
  baseTemp: number,
  baseVib: number,
  basePress: number,
  baseRpm: number,
  baseLoad: number,
  health: number,
  anomaly: number,
  status: string,
  countPoints = 20
) {
  const rows = [];
  for (let i = countPoints - 1; i >= 0; i--) {
    const jitter = (scale: number) =>
      Number(((Math.sin(i * 1.37) * 0.5 + (Math.random() - 0.5)) * scale).toFixed(2));
    rows.push({
      machineId,
      sessionId: 'SIM-SESSION-01',
      temperature: Number((baseTemp + jitter(1.8)).toFixed(1)),
      vibration: Number(Math.max(0.2, baseVib + jitter(0.35)).toFixed(2)),
      pressure: Number(Math.max(0, basePress + jitter(4)).toFixed(1)),
      rpm: Math.max(0, Math.round(baseRpm + jitter(45))),
      load: Number(Math.min(100, Math.max(0, baseLoad + jitter(3))).toFixed(1)),
      healthScore: Math.min(100, Math.max(5, Math.round(health + jitter(1.5)))),
      anomalyScore: Number(Math.min(1, Math.max(0, anomaly + jitter(0.03))).toFixed(2)),
      status,
      timestampLabel: nowTimeLabel(-i * 15),
      recordedAt: new Date(Date.now() - i * 15000),
    });
  }
  return rows;
}

export async function seedBaselineOperationalData(): Promise<void> {
  await db
    .insert(factories)
    .values([
      {
        id: 'FAC-01',
        name: 'ForgeTwin Plant Alpha',
        location: 'Pune Precision Industrial Zone, Sector 4',
        shift: 'Shift B (06:00 – 18:00 IST)',
        targetOee: 92,
        isActive: true,
      },
      {
        id: 'FAC-02',
        name: 'ForgeTwin Plant Beta',
        location: 'Chakan Automated Assembly Hub, Wing B',
        shift: 'Shift A (08:00 – 20:00 IST)',
        targetOee: 89,
        isActive: false,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(appSettings)
    .values({
      key: 'ai_config',
      value: {
        anomalyThreshold: 0.55,
        visionConfidenceThreshold: 80,
        autoCreateAlerts: true,
        assistantModel: 'gemini-4-hydrogen',
      },
    })
    .onConflictDoNothing();

  await db
    .insert(simulatorSessions)
    .values({
      id: 'SIM-SESSION-01',
      status: 'running',
      speed: 1,
      selectedMachineId: 'M-101',
      tickCount: 0,
    })
    .onConflictDoNothing();

  const initialMachines: {
    id: string;
    factoryId: string;
    name: string;
    category: string;
    area: string;
    modelType: 'cnc' | 'compressor' | 'conveyor' | 'press' | 'packaging';
    status: string;
    healthScore: number;
    temperature: number;
    vibration: number;
    pressure: number;
    rpm: number;
    load: number;
    anomalyScore: number;
    riskCategory: string;
    abnormalParameters: string[];
    flaggedReason: string;
    uptimePercent: number;
    position3D: [number, number, number];
    thresholds: MachineThresholds;
    scenario: string;
    isActive: boolean;
    lastUpdated: string;
  }[] = [
    {
      id: 'M-101',
      factoryId: 'FAC-01',
      name: 'CNC Milling Machine',
      category: 'Precision Machining',
      area: 'Bay A — Machining',
      modelType: 'cnc',
      status: 'running',
      healthScore: 94,
      temperature: 61.4,
      vibration: 2.15,
      pressure: 98.2,
      rpm: 3420,
      load: 68.5,
      anomalyScore: 0.11,
      riskCategory: 'Normal',
      abnormalParameters: [],
      flaggedReason: 'All telemetry parameters remain within nominal operating thresholds.',
      uptimePercent: 98.6,
      position3D: [-8, 0, -4],
      thresholds: {
        maxTemp: 78,
        maxVibration: 4.5,
        maxPressure: 120,
        minPressure: 75,
        maxRpm: 4500,
        maxLoad: 90,
      },
      scenario: 'Normal Operation',
      isActive: true,
      lastUpdated: nowTimeLabel(),
    },
    {
      id: 'M-102',
      factoryId: 'FAC-01',
      name: 'Industrial Compressor',
      category: 'Pneumatic Systems',
      area: 'Bay B — Utilities',
      modelType: 'compressor',
      status: 'warning',
      healthScore: 71,
      temperature: 81.8,
      vibration: 4.92,
      pressure: 146.5,
      rpm: 1840,
      load: 84.0,
      anomalyScore: 0.58,
      riskCategory: 'Medium Risk',
      abnormalParameters: ['Temperature', 'Vibration'],
      flaggedReason:
        'Outlet discharge temperature (81.8 °C) and casing vibration (4.92 mm/s) exceed configured warning thresholds.',
      uptimePercent: 93.4,
      position3D: [0, 0, -4],
      thresholds: {
        maxTemp: 78,
        maxVibration: 4.5,
        maxPressure: 160,
        minPressure: 110,
        maxRpm: 2200,
        maxLoad: 90,
      },
      scenario: 'High Temperature',
      isActive: true,
      lastUpdated: nowTimeLabel(),
    },
    {
      id: 'M-103',
      factoryId: 'FAC-01',
      name: 'Conveyor Belt',
      category: 'Material Handling',
      area: 'Bay C — Transfer Line',
      modelType: 'conveyor',
      status: 'running',
      healthScore: 96,
      temperature: 43.2,
      vibration: 1.42,
      pressure: 101.0,
      rpm: 620,
      load: 54.0,
      anomalyScore: 0.08,
      riskCategory: 'Normal',
      abnormalParameters: [],
      flaggedReason: 'Belt drive motor current, speed, and bearing temperature are nominal.',
      uptimePercent: 99.4,
      position3D: [8, 0, -4],
      thresholds: {
        maxTemp: 65,
        maxVibration: 3.8,
        maxPressure: 120,
        minPressure: 80,
        maxRpm: 950,
        maxLoad: 88,
      },
      scenario: 'Normal Operation',
      isActive: true,
      lastUpdated: nowTimeLabel(),
    },
    {
      id: 'M-104',
      factoryId: 'FAC-01',
      name: 'Hydraulic Press',
      category: 'Metal Forming',
      area: 'Bay A — Forming',
      modelType: 'press',
      status: 'critical',
      healthScore: 44,
      temperature: 88.6,
      vibration: 6.45,
      pressure: 242.0,
      rpm: 1120,
      load: 95.4,
      anomalyScore: 0.89,
      riskCategory: 'Critical',
      abnormalParameters: ['Pressure', 'Load', 'Vibration', 'Temperature'],
      flaggedReason:
        'Hydraulic manifold pressure (242.0 bar) and structural load (95.4%) exceed critical safety limits alongside high ram vibration.',
      uptimePercent: 86.2,
      position3D: [-4.5, 0, 4.5],
      thresholds: {
        maxTemp: 82,
        maxVibration: 5.0,
        maxPressure: 215,
        minPressure: 140,
        maxRpm: 1500,
        maxLoad: 90,
      },
      scenario: 'Machine Overload',
      isActive: true,
      lastUpdated: nowTimeLabel(),
    },
    {
      id: 'M-105',
      factoryId: 'FAC-01',
      name: 'Packaging Machine',
      category: 'End-of-Line Automation',
      area: 'Bay D — Packaging',
      modelType: 'packaging',
      status: 'running',
      healthScore: 91,
      temperature: 51.0,
      vibration: 1.88,
      pressure: 96.4,
      rpm: 1480,
      load: 61.2,
      anomalyScore: 0.14,
      riskCategory: 'Normal',
      abnormalParameters: [],
      flaggedReason: 'Heat-sealing gantry and servo feed are operating within normal envelope.',
      uptimePercent: 97.8,
      position3D: [4.5, 0, 4.5],
      thresholds: {
        maxTemp: 70,
        maxVibration: 4.0,
        maxPressure: 115,
        minPressure: 75,
        maxRpm: 2000,
        maxLoad: 85,
      },
      scenario: 'Normal Operation',
      isActive: true,
      lastUpdated: nowTimeLabel(),
    },
  ];

  for (const m of initialMachines) {
    await db.insert(machines).values(m).onConflictDoNothing();
  }

  const [{ value: readingCount }] = await db.select({ value: count() }).from(sensorReadings);
  if (readingCount === 0) {
    for (const m of initialMachines) {
      const readings = generateInitialReadings(
        m.id,
        m.temperature,
        m.vibration,
        m.pressure,
        m.rpm,
        m.load,
        m.healthScore,
        m.anomalyScore,
        m.status,
        20
      );
      await db.insert(sensorReadings).values(readings);
    }
  }

  await db
    .insert(anomalies)
    .values([
      {
        id: 'ANM-1002',
        machineId: 'M-101',
        parameter: 'Vibration',
        value: '3.90 mm/s',
        anomalyScore: 0.34,
        riskCategory: 'Low Risk',
        modelVersion: '1.0.0',
        summary: 'Brief spindle resonance spike during roughing pass; stabilized automatically.',
        timestampLabel: '09:14:20',
      },
      {
        id: 'ANM-1009',
        machineId: 'M-102',
        parameter: 'Temperature',
        value: '81.8 °C',
        anomalyScore: 0.58,
        riskCategory: 'Medium Risk',
        modelVersion: '1.0.0',
        summary: 'Intercooler thermal drift detected over trailing 15-minute window.',
        timestampLabel: '11:02:45',
      },
      {
        id: 'ANM-1014',
        machineId: 'M-104',
        parameter: 'Pressure & Load',
        value: '242.0 bar / 95.4%',
        anomalyScore: 0.89,
        riskCategory: 'Critical',
        modelVersion: '1.0.0',
        summary: 'Sustained overpressure and ram load spike detected on primary cylinder.',
        timestampLabel: '11:36:12',
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(alerts)
    .values([
      {
        id: 'ALT-2041',
        machineId: 'M-104',
        machineName: 'Hydraulic Press',
        type: 'Overpressure & Overload',
        severity: 'Critical',
        description:
          'Manifold pressure (242.0 bar) and load (95.4%) exceeded configured critical ceiling.',
        status: 'Active',
        timestampLabel: nowTimeLabel(-420),
      },
      {
        id: 'ALT-2040',
        machineId: 'M-102',
        machineName: 'Industrial Compressor',
        type: 'Thermal & Vibration Drift',
        severity: 'High',
        description:
          'Discharge temperature (81.8 °C) and vibration (4.92 mm/s) exceeded warning thresholds.',
        status: 'Active',
        timestampLabel: nowTimeLabel(-960),
      },
      {
        id: 'ALT-2037',
        machineId: 'M-101',
        machineName: 'CNC Milling Machine',
        type: 'Spindle Resonance Spike',
        severity: 'Low',
        description: 'Transient vibration peak during tool change; self-resolved within 20 seconds.',
        status: 'Resolved',
        resolvedAtLabel: nowTimeLabel(-5340),
        resolvedAt: new Date(Date.now() - 5340 * 1000),
        timestampLabel: nowTimeLabel(-5400),
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(workOrders)
    .values([
      {
        id: 'WO-3104',
        machineId: 'M-104',
        machineName: 'Hydraulic Press',
        issue: 'Inspect primary hydraulic relief valve and recalibrate cylinder pressure limit.',
        priority: 'Critical',
        assignedEngineer: 'Arjun Deshmukh',
        createdDate: isoDateOffset(0),
        dueDate: isoDateOffset(1),
        status: 'In Progress',
        source: 'Predictive Alert',
      },
      {
        id: 'WO-3103',
        machineId: 'M-102',
        machineName: 'Industrial Compressor',
        issue: 'Clean intercooler heat exchanger fins and verify rotor bearing alignment.',
        priority: 'High',
        assignedEngineer: 'Priya Nair',
        createdDate: isoDateOffset(0),
        dueDate: isoDateOffset(2),
        status: 'Assigned',
        source: 'AI Assistant',
      },
      {
        id: 'WO-3098',
        machineId: 'M-105',
        machineName: 'Packaging Machine',
        issue: 'Scheduled preventive replacement of heat-seal PTFE strip and belt tension check.',
        priority: 'Medium',
        assignedEngineer: 'Rohan Kulkarni',
        createdDate: isoDateOffset(-3),
        dueDate: isoDateOffset(-1),
        status: 'Completed',
        source: 'Manual',
        completedAt: new Date(Date.now() - 86400000),
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(workOrderNotes)
    .values([
      {
        id: 'N-1',
        workOrderId: 'WO-3104',
        author: 'Arjun Deshmukh',
        text: 'Isolated secondary manifold and inspecting pressure relief cartridge.',
        timestampLabel: nowTimeLabel(-600),
      },
      {
        id: 'N-2',
        workOrderId: 'WO-3098',
        author: 'Rohan Kulkarni',
        text: 'PTFE strip replaced and film tension calibrated to spec.',
        timestampLabel: 'Yesterday 16:40',
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(qualityInspections)
    .values([
      {
        id: 'INSP-412',
        machineId: 'M-101',
        partName: 'Aerospace Mounting Bracket #BR-409',
        imageUrl: '/src/assets/images/inspect_sample_nominal_1795722560190.jpg',
        status: 'No Defect Detected',
        defectCategory: 'None',
        confidence: 98.4,
        analysisEngine: 'Calibrated Baseline Inspection Sample',
        summary: 'Surface finish, bore concentricity, and chamfer edges conform to tolerance.',
        recommendedAction: 'Release batch to downstream conveyor transfer.',
        detections: [],
        timestampLabel: nowTimeLabel(-1800),
      },
      {
        id: 'INSP-411',
        machineId: 'M-104',
        partName: 'Bearing Housing Flange #BH-F42',
        imageUrl: '/src/assets/images/inspect_sample_defect_1795722561212.jpg',
        status: 'Defect Detected',
        defectCategory: 'Radial Hairline Crack & Inner Bore Burr',
        confidence: 95.8,
        analysisEngine: 'Calibrated Baseline Inspection Sample',
        summary:
          'Detected radial fracture extending from inner bore edge alongside severe chatter burring.',
        recommendedAction:
          'Quarantine part and schedule CNC/Press tooling inspection immediately.',
        detections: [
          { label: 'Hairline Crack', x: 56, y: 26, w: 14, h: 16 },
          { label: 'Inner Bore Burr', x: 38, y: 34, w: 26, h: 32 },
        ],
        timestampLabel: nowTimeLabel(-3600),
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(machineEvents)
    .values([
      {
        id: 'EVT-9014',
        machineId: 'M-104',
        machineName: 'Hydraulic Press',
        category: 'Alert',
        title: 'Critical Overpressure Alert Triggered',
        description:
          'ALT-2041 raised after manifold pressure reached 242.0 bar (limit 215 bar).',
        severity: 'critical',
        timestampLabel: nowTimeLabel(-420),
      },
      {
        id: 'EVT-9013',
        machineId: 'M-104',
        machineName: 'Hydraulic Press',
        category: 'Maintenance',
        title: 'Work Order WO-3104 Moved to In Progress',
        description: 'Arjun Deshmukh began relief valve inspection on Hydraulic Press.',
        severity: 'info',
        timestampLabel: nowTimeLabel(-600),
      },
      {
        id: 'EVT-9012',
        machineId: 'M-102',
        machineName: 'Industrial Compressor',
        category: 'Anomaly',
        title: 'Thermal & Vibration Drift Flagged',
        description:
          'Predictive engine scored anomaly 0.58 (Medium Risk) on Industrial Compressor.',
        severity: 'warning',
        timestampLabel: nowTimeLabel(-960),
      },
      {
        id: 'EVT-9011',
        machineId: 'M-101',
        machineName: 'CNC Milling Machine',
        category: 'Inspection',
        title: 'Vision Inspection Passed (INSP-412)',
        description:
          'Aerospace Mounting Bracket passed automated surface quality check (98.4% confidence).',
        severity: 'success',
        timestampLabel: nowTimeLabel(-1800),
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(notifications)
    .values([
      {
        id: 'NOTIF-501',
        category: 'Critical Alert',
        title: 'M-104 Hydraulic Press Critical Overpressure',
        message:
          'Pressure reached 242.0 bar and load is 95.4%. Immediate relief inspection required.',
        read: false,
        machineId: 'M-104',
        targetPage: 'alerts',
        timestampLabel: nowTimeLabel(-420),
      },
      {
        id: 'NOTIF-502',
        category: 'Maintenance Assignment',
        title: 'WO-3103 Assigned to Priya Nair',
        message: 'Industrial Compressor thermal drift inspection scheduled.',
        read: false,
        machineId: 'M-102',
        targetPage: 'maintenance',
        timestampLabel: nowTimeLabel(-960),
      },
      {
        id: 'NOTIF-503',
        category: 'Quality Inspection',
        title: 'INSP-411 Defect Quarantined',
        message: 'Bearing Housing Flange flagged for radial crack and inner bore burr.',
        read: true,
        machineId: 'M-104',
        targetPage: 'quality',
        timestampLabel: nowTimeLabel(-1800),
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(simulatorLogs)
    .values({
      id: 'SLOG-1',
      sessionId: 'SIM-SESSION-01',
      machineId: 'M-101',
      scenario: 'Normal Operation',
      message: 'Software IoT telemetry generator active across 5 virtual industrial assets.',
      level: 'info',
      timestampLabel: nowTimeLabel(-60),
    })
    .onConflictDoNothing();
}

async function seedUsersAndConversations(): Promise<void> {
  const defaultPassword = process.env.DEMO_SEED_PASSWORD?.trim() || 'ForgeTwin@2026';
  const seedAccounts = [
    {
      id: 'USR-00',
      name: 'Ananya Verma',
      email: 'admin@forgetwin.io',
      role: 'System Admin',
      department: 'Platform Administration',
      lastActive: 'Online now',
    },
    {
      id: 'USR-01',
      name: 'Tarun Raj',
      email: 'tarun.raj@forgetwin.io',
      role: 'Factory Manager',
      department: 'Plant Operations',
      lastActive: 'Online now',
    },
    {
      id: 'USR-02',
      name: 'Arjun Deshmukh',
      email: 'arjun.d@forgetwin.io',
      role: 'Maintenance Engineer',
      department: 'Mechanical Maintenance',
      lastActive: '4 mins ago',
    },
    {
      id: 'USR-03',
      name: 'Priya Nair',
      email: 'priya.n@forgetwin.io',
      role: 'Maintenance Engineer',
      department: 'Utilities & Pneumatics',
      lastActive: '12 mins ago',
    },
    {
      id: 'USR-04',
      name: 'Rohan Kulkarni',
      email: 'rohan.k@forgetwin.io',
      role: 'Quality Inspector',
      department: 'Metrological QA',
      lastActive: '28 mins ago',
    },
    {
      id: 'USR-05',
      name: 'Vikram Singh',
      email: 'vikram.s@forgetwin.io',
      role: 'Operator',
      department: 'Bay A Shift Operations',
      lastActive: '18 mins ago',
    },
  ];

  for (const acc of seedAccounts) {
    const { salt, hash } = hashPassword(defaultPassword);
    await db
      .insert(users)
      .values({
        id: acc.id,
        name: acc.name,
        email: acc.email,
        passwordHash: hash,
        passwordSalt: salt,
        role: acc.role,
        status: 'Active',
        department: acc.department,
        lastActive: acc.lastActive,
      })
      .onConflictDoNothing();
  }

  await db
    .insert(aiConversations)
    .values({
      id: 'CONV-01',
      userId: 'USR-01',
      title: 'Plant Operations Shift Briefing',
      saved: true,
      createdAtLabel: 'Today · Shift B',
    })
    .onConflictDoNothing();

  await db
    .insert(aiMessages)
    .values({
      id: 'MSG-WELCOME',
      conversationId: 'CONV-01',
      role: 'assistant',
      content:
        'ForgeTwin Operations AI is connected to PostgreSQL machine telemetry, ML anomaly scoring, active alerts, and work orders. Select a suggested query or ask me to investigate any machine.',
      observedFacts: [
        'Connected to persistent Cloud SQL PostgreSQL repository.',
        'Real-time simulator and ML predictive anomaly scoring are online.',
      ],
      recommendations: [
        'Use "Investigate M-101." after triggering an Excessive Vibration scenario in the Simulator to generate and review a grounded maintenance work order.',
      ],
      timestampLabel: '11:40:00',
    })
    .onConflictDoNothing();
}

let seedPromise: Promise<void> | null = null;

export async function ensureDatabaseSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      try {
        const [{ value: userCount }] = await db.select({ value: count() }).from(users);
        if (userCount === 0) {
          await seedUsersAndConversations();
        }
        const [{ value: facCount }] = await db.select({ value: count() }).from(factories);
        if (facCount === 0) {
          await seedBaselineOperationalData();
        }
      } catch (err) {
        seedPromise = null;
        console.error('Database seed failed:', err);
        throw new Error('Failed to initialize ForgeTwin database seed.', { cause: err });
      }
    })();
  }
  return seedPromise;
}
