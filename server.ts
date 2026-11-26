import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import type {
  AlertItem,
  AssistantToolTrace,
  EventLogItem,
  FactoryProfile,
  InspectionRecord,
  Machine,
  MachineStatus,
  NotificationItem,
  PlatformState,
  RiskCategory,
  SensorPoint,
  SimulationScenario,
  SimulatorLogItem,
  UserAccount,
  WorkOrder,
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

function generateHistory(
  baseTemp: number,
  baseVib: number,
  basePress: number,
  baseRpm: number,
  baseLoad: number,
  health: number,
  anomaly: number,
  count = 20
): SensorPoint[] {
  const points: SensorPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const jitter = (scale: number) => Number(((Math.sin(i * 1.37) * 0.5 + (Math.random() - 0.5)) * scale).toFixed(2));
    points.push({
      timestamp: nowTimeLabel(-i * 15),
      temperature: Number((baseTemp + jitter(1.8)).toFixed(1)),
      vibration: Number(Math.max(0.2, baseVib + jitter(0.35)).toFixed(2)),
      pressure: Number(Math.max(0, basePress + jitter(4)).toFixed(1)),
      rpm: Math.max(0, Math.round(baseRpm + jitter(45))),
      load: Number(Math.min(100, Math.max(0, baseLoad + jitter(3))).toFixed(1)),
      healthScore: Math.min(100, Math.max(5, Math.round(health + jitter(1.5)))),
      anomalyScore: Number(Math.min(1, Math.max(0, anomaly + jitter(0.03))).toFixed(2)),
    });
  }
  return points;
}

const FACTORIES: FactoryProfile[] = [
  {
    id: 'FAC-01',
    name: 'ForgeTwin Plant Alpha',
    location: 'Pune Precision Industrial Zone, Sector 4',
    shift: 'Shift B (06:00 – 18:00 IST)',
    targetOee: 92,
  },
  {
    id: 'FAC-02',
    name: 'ForgeTwin Plant Beta',
    location: 'Chakan Automated Assembly Hub, Wing B',
    shift: 'Shift A (08:00 – 20:00 IST)',
    targetOee: 89,
  },
];

function createInitialMachines(): Machine[] {
  return [
    {
      id: 'M-101',
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
      lastUpdated: nowTimeLabel(),
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
      sensorHistory: generateHistory(61.4, 2.15, 98.2, 3420, 68.5, 94, 0.11),
      anomalyHistory: [
        {
          id: 'ANM-1002',
          timestamp: '09:14:20',
          parameter: 'Vibration',
          value: '3.90 mm/s',
          anomalyScore: 0.34,
          riskCategory: 'Low Risk',
          summary: 'Brief spindle resonance spike during roughing pass; stabilized automatically.',
        },
      ],
    },
    {
      id: 'M-102',
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
      lastUpdated: nowTimeLabel(),
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
      sensorHistory: generateHistory(81.8, 4.92, 146.5, 1840, 84.0, 71, 0.58),
      anomalyHistory: [
        {
          id: 'ANM-1009',
          timestamp: '11:02:45',
          parameter: 'Temperature',
          value: '81.8 °C',
          anomalyScore: 0.58,
          riskCategory: 'Medium Risk',
          summary: 'Intercooler thermal drift detected over trailing 15-minute window.',
        },
      ],
    },
    {
      id: 'M-103',
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
      lastUpdated: nowTimeLabel(),
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
      sensorHistory: generateHistory(43.2, 1.42, 101.0, 620, 54.0, 96, 0.08),
      anomalyHistory: [],
    },
    {
      id: 'M-104',
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
      lastUpdated: nowTimeLabel(),
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
      sensorHistory: generateHistory(88.6, 6.45, 242.0, 1120, 95.4, 44, 0.89),
      anomalyHistory: [
        {
          id: 'ANM-1014',
          timestamp: '11:36:12',
          parameter: 'Pressure & Load',
          value: '242.0 bar / 95.4%',
          anomalyScore: 0.89,
          riskCategory: 'Critical',
          summary: 'Sustained overpressure and ram load spike detected on primary cylinder.',
        },
      ],
    },
    {
      id: 'M-105',
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
      lastUpdated: nowTimeLabel(),
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
      sensorHistory: generateHistory(51.0, 1.88, 96.4, 1480, 61.2, 91, 0.14),
      anomalyHistory: [],
    },
  ];
}

function createInitialAlerts(): AlertItem[] {
  return [
    {
      id: 'ALT-2041',
      machineId: 'M-104',
      machineName: 'Hydraulic Press',
      type: 'Overpressure & Overload',
      severity: 'Critical',
      description: 'Manifold pressure (242.0 bar) and load (95.4%) exceeded configured critical ceiling.',
      timestamp: nowTimeLabel(-420),
      status: 'Active',
    },
    {
      id: 'ALT-2040',
      machineId: 'M-102',
      machineName: 'Industrial Compressor',
      type: 'Thermal & Vibration Drift',
      severity: 'High',
      description: 'Discharge temperature (81.8 °C) and vibration (4.92 mm/s) exceeded warning thresholds.',
      timestamp: nowTimeLabel(-960),
      status: 'Active',
    },
    {
      id: 'ALT-2037',
      machineId: 'M-101',
      machineName: 'CNC Milling Machine',
      type: 'Spindle Resonance Spike',
      severity: 'Low',
      description: 'Transient vibration peak during tool change; self-resolved within 20 seconds.',
      timestamp: nowTimeLabel(-5400),
      status: 'Resolved',
      resolvedAt: nowTimeLabel(-5340),
    },
  ];
}

function createInitialWorkOrders(): WorkOrder[] {
  return [
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
      notes: [
        {
          id: 'N-1',
          author: 'Arjun Deshmukh',
          timestamp: nowTimeLabel(-600),
          text: 'Isolated secondary manifold and inspecting pressure relief cartridge.',
        },
      ],
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
      notes: [],
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
      notes: [
        {
          id: 'N-2',
          author: 'Rohan Kulkarni',
          timestamp: 'Yesterday 16:40',
          text: 'PTFE strip replaced and film tension calibrated to spec.',
        },
      ],
    },
  ];
}

function createInitialInspections(): InspectionRecord[] {
  return [
    {
      id: 'INSP-412',
      timestamp: nowTimeLabel(-1800),
      machineId: 'M-101',
      partName: 'Aerospace Mounting Bracket #BR-409',
      imageUrl: '/src/assets/images/inspect_sample_nominal_1795722560190.jpg',
      status: 'No Defect Detected',
      defectCategory: 'None',
      confidence: 98.4,
      summary: 'Surface finish, bore concentricity, and chamfer edges conform to tolerance.',
      recommendedAction: 'Release batch to downstream conveyor transfer.',
      detections: [],
    },
    {
      id: 'INSP-411',
      timestamp: nowTimeLabel(-3600),
      machineId: 'M-104',
      partName: 'Bearing Housing Flange #BH-F42',
      imageUrl: '/src/assets/images/inspect_sample_defect_1795722561212.jpg',
      status: 'Defect Detected',
      defectCategory: 'Radial Hairline Crack & Inner Bore Burr',
      confidence: 95.8,
      summary: 'Detected radial fracture extending from inner bore edge alongside severe chatter burring.',
      recommendedAction: 'Quarantine part and schedule CNC/Press tooling inspection immediately.',
      detections: [
        { label: 'Hairline Crack', x: 56, y: 26, w: 14, h: 16 },
        { label: 'Inner Bore Burr', x: 38, y: 34, w: 26, h: 32 },
      ],
    },
  ];
}

function createInitialEvents(): EventLogItem[] {
  return [
    {
      id: 'EVT-9014',
      timestamp: nowTimeLabel(-420),
      machineId: 'M-104',
      machineName: 'Hydraulic Press',
      category: 'Alert',
      title: 'Critical Overpressure Alert Triggered',
      description: 'ALT-2041 raised after manifold pressure reached 242.0 bar (limit 215 bar).',
      severity: 'critical',
    },
    {
      id: 'EVT-9013',
      timestamp: nowTimeLabel(-600),
      machineId: 'M-104',
      machineName: 'Hydraulic Press',
      category: 'Maintenance',
      title: 'Work Order WO-3104 Moved to In Progress',
      description: 'Arjun Deshmukh began relief valve inspection on Hydraulic Press.',
      severity: 'info',
    },
    {
      id: 'EVT-9012',
      timestamp: nowTimeLabel(-960),
      machineId: 'M-102',
      machineName: 'Industrial Compressor',
      category: 'Anomaly',
      title: 'Thermal & Vibration Drift Flagged',
      description: 'Predictive engine scored anomaly 0.58 (Medium Risk) on Industrial Compressor.',
      severity: 'warning',
    },
    {
      id: 'EVT-9011',
      timestamp: nowTimeLabel(-1800),
      machineId: 'M-101',
      machineName: 'CNC Milling Machine',
      category: 'Inspection',
      title: 'Vision Inspection Passed (INSP-412)',
      description: 'Aerospace Mounting Bracket passed automated surface quality check (98.4% confidence).',
      severity: 'success',
    },
  ];
}

function createInitialNotifications(): NotificationItem[] {
  return [
    {
      id: 'NOTIF-501',
      timestamp: nowTimeLabel(-420),
      category: 'Critical Alert',
      title: 'M-104 Hydraulic Press Critical Overpressure',
      message: 'Pressure reached 242.0 bar and load is 95.4%. Immediate relief inspection required.',
      read: false,
      machineId: 'M-104',
      targetPage: 'alerts',
    },
    {
      id: 'NOTIF-502',
      timestamp: nowTimeLabel(-960),
      category: 'Maintenance Assignment',
      title: 'WO-3103 Assigned to Priya Nair',
      message: 'Industrial Compressor thermal drift inspection scheduled.',
      read: false,
      machineId: 'M-102',
      targetPage: 'maintenance',
    },
    {
      id: 'NOTIF-503',
      timestamp: nowTimeLabel(-1800),
      category: 'Quality Inspection',
      title: 'INSP-411 Defect Quarantined',
      message: 'Bearing Housing Flange flagged for radial crack and inner bore burr.',
      read: true,
      machineId: 'M-104',
      targetPage: 'quality',
    },
  ];
}

function createInitialUsers(): UserAccount[] {
  return [
    {
      id: 'USR-01',
      name: 'Tarun Raj',
      email: 'tarun.raj@forgetwin.io',
      role: 'Factory Manager',
      status: 'Active',
      department: 'Plant Operations',
      lastActive: 'Online now',
    },
    {
      id: 'USR-02',
      name: 'Arjun Deshmukh',
      email: 'arjun.d@forgetwin.io',
      role: 'Maintenance Engineer',
      status: 'Active',
      department: 'Mechanical Maintenance',
      lastActive: '4 mins ago',
    },
    {
      id: 'USR-03',
      name: 'Priya Nair',
      email: 'priya.n@forgetwin.io',
      role: 'Maintenance Engineer',
      status: 'Active',
      department: 'Utilities & Pneumatics',
      lastActive: '12 mins ago',
    },
    {
      id: 'USR-04',
      name: 'Rohan Kulkarni',
      email: 'rohan.k@forgetwin.io',
      role: 'Quality Inspector',
      status: 'Active',
      department: 'Metrological QA',
      lastActive: '28 mins ago',
    },
  ];
}

// --- Server State ---
const state: PlatformState = {
  factory: FACTORIES[0],
  factories: FACTORIES,
  machines: createInitialMachines(),
  alerts: createInitialAlerts(),
  workOrders: createInitialWorkOrders(),
  inspections: createInitialInspections(),
  events: createInitialEvents(),
  notifications: createInitialNotifications(),
  simulator: {
    running: true,
    paused: false,
    speed: 1,
    selectedMachineId: 'M-101',
    tickCount: 0,
    logs: [
      {
        id: 'SLOG-1',
        timestamp: nowTimeLabel(-60),
        machineId: 'M-101',
        scenario: 'Normal Operation',
        message: 'Software IoT telemetry generator active across 5 virtual industrial assets.',
        level: 'info',
      },
    ],
  },
  users: createInitialUsers(),
  systemHealth: {
    backendApi: 'Operational',
    database: 'In-Memory Store',
    simulator: 'Running',
    stream: 'Active',
    predictiveModel: 'Active',
    visionModel: getGeminiClient() ? 'Ready' : 'Unavailable',
    assistantAi: getGeminiClient() ? 'Ready' : 'Unavailable',
  },
  aiSettings: {
    anomalyThreshold: 0.55,
    visionConfidenceThreshold: 80,
    autoCreateAlerts: true,
    assistantModel: 'gemini-4-hydrogen',
  },
};

// In-memory auth sessions
const activeSessions = new Map<string, { email: string; name: string; role: string }>();

// SSE Listeners
const sseClients = new Set<express.Response>();

function broadcastState() {
  state.systemHealth.simulator = state.simulator.running
    ? state.simulator.paused
      ? 'Paused'
      : 'Running'
    : 'Stopped';
  state.systemHealth.visionModel = getGeminiClient() ? 'Ready' : 'Unavailable';
  state.systemHealth.assistantAi = getGeminiClient() ? 'Ready' : 'Unavailable';

  const payload = `data: ${JSON.stringify(state)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  }
}

function pushEvent(evt: Omit<EventLogItem, 'id' | 'timestamp'>) {
  const item: EventLogItem = {
    id: `EVT-${Math.floor(9000 + Math.random() * 999)}-${Date.now().toString().slice(-3)}`,
    timestamp: nowTimeLabel(),
    ...evt,
  };
  state.events = [item, ...state.events].slice(0, 40);
}

function pushNotification(notif: Omit<NotificationItem, 'id' | 'timestamp' | 'read'>) {
  const item: NotificationItem = {
    id: `NOTIF-${Date.now().toString().slice(-5)}`,
    timestamp: nowTimeLabel(),
    read: false,
    ...notif,
  };
  state.notifications = [item, ...state.notifications].slice(0, 30);
}

function pushSimulatorLog(log: Omit<SimulatorLogItem, 'id' | 'timestamp'>) {
  const item: SimulatorLogItem = {
    id: `SLOG-${Date.now().toString().slice(-5)}-${Math.floor(Math.random() * 99)}`,
    timestamp: nowTimeLabel(),
    ...log,
  };
  state.simulator.logs = [item, ...state.simulator.logs].slice(0, 40);
}

function evaluateAnomalyAndAlerts(machine: Machine, previousStatus: MachineStatus) {
  const t = machine.thresholds;
  const abnormal: string[] = [];
  const reasons: string[] = [];

  if (machine.scenario === 'Sudden Shutdown' || (machine.rpm === 0 && machine.load === 0 && machine.status === 'offline')) {
    machine.status = 'offline';
    machine.anomalyScore = 0.92;
    machine.riskCategory = 'Critical';
    machine.abnormalParameters = ['RPM', 'Load', 'Power State'];
    machine.flaggedReason = 'Unexpected zero-RPM stoppage detected while shift schedule is active.';
    machine.healthScore = Math.min(machine.healthScore, 32);
  } else {
    let score = 0.08;

    if (machine.temperature > t.maxTemp) {
      abnormal.push('Temperature');
      const delta = (machine.temperature - t.maxTemp) / 15;
      score += 0.28 + Math.min(0.35, delta);
      reasons.push(`temperature (${machine.temperature.toFixed(1)} °C) is above the ${t.maxTemp} °C threshold`);
    }
    if (machine.vibration > t.maxVibration) {
      abnormal.push('Vibration');
      const delta = (machine.vibration - t.maxVibration) / 3;
      score += 0.34 + Math.min(0.4, delta);
      reasons.push(`vibration (${machine.vibration.toFixed(2)} mm/s) exceeds the ${t.maxVibration} mm/s operating limit`);
    }
    if (machine.pressure > t.maxPressure || machine.pressure < t.minPressure) {
      abnormal.push('Pressure');
      score += 0.32;
      reasons.push(
        machine.pressure > t.maxPressure
          ? `pressure (${machine.pressure.toFixed(1)} bar) exceeds the ${t.maxPressure} bar ceiling`
          : `pressure (${machine.pressure.toFixed(1)} bar) dropped below ${t.minPressure} bar minimum`
      );
    }
    if (machine.rpm > t.maxRpm) {
      abnormal.push('RPM');
      score += 0.25;
      reasons.push(`rotational speed (${machine.rpm} RPM) exceeds ${t.maxRpm} RPM rating`);
    }
    if (machine.load > t.maxLoad) {
      abnormal.push('Load');
      score += 0.28;
      reasons.push(`motor load (${machine.load.toFixed(1)}%) exceeds ${t.maxLoad}% continuous limit`);
    }

    machine.anomalyScore = Number(Math.min(0.99, score).toFixed(2));
    machine.abnormalParameters = abnormal;

    if (abnormal.length === 0) {
      machine.status = 'running';
      machine.riskCategory = machine.anomalyScore > 0.25 ? 'Low Risk' : 'Normal';
      machine.flaggedReason = 'All telemetry parameters remain within configured operating thresholds.';
      machine.healthScore = Math.min(99, Math.max(84, Math.round(97 - machine.anomalyScore * 20)));
    } else if (machine.anomalyScore >= 0.75 || abnormal.length >= 2 || machine.vibration > t.maxVibration * 1.45) {
      machine.status = 'critical';
      machine.riskCategory = 'Critical';
      machine.flaggedReason = `Flagged because ${reasons.join(' and ')}.`;
      machine.healthScore = Math.max(22, Math.round(90 - machine.anomalyScore * 55));
    } else {
      machine.status = 'warning';
      machine.riskCategory = machine.anomalyScore >= 0.55 ? 'High Risk' : 'Medium Risk';
      machine.flaggedReason = `Flagged because ${reasons.join(' and ')}.`;
      machine.healthScore = Math.max(48, Math.round(92 - machine.anomalyScore * 40));
    }
  }

  // Record anomaly history & alert when entering warning/critical/offline
  if (
    state.aiSettings.autoCreateAlerts &&
    (machine.status === 'warning' || machine.status === 'critical' || machine.status === 'offline')
  ) {
    const existingActive = state.alerts.find(
      (a) => a.machineId === machine.id && a.status !== 'Resolved'
    );

    const desiredSeverity =
      machine.status === 'critical' || machine.status === 'offline' ? 'Critical' : 'High';

    if (!existingActive) {
      const alertType =
        machine.abnormalParameters.length > 0
          ? `${machine.abnormalParameters.join(' & ')} Anomaly`
          : 'Operational Fault';
      const newAlert: AlertItem = {
        id: `ALT-${Math.floor(2050 + Math.random() * 899)}`,
        machineId: machine.id,
        machineName: machine.name,
        type: alertType,
        severity: desiredSeverity,
        description: machine.flaggedReason,
        timestamp: nowTimeLabel(),
        status: 'Active',
      };
      state.alerts = [newAlert, ...state.alerts].slice(0, 50);

      machine.anomalyHistory = [
        {
          id: `ANM-${Date.now().toString().slice(-4)}`,
          timestamp: nowTimeLabel(),
          parameter: machine.abnormalParameters.join(', ') || 'System',
          value:
            machine.abnormalParameters.includes('Vibration')
              ? `${machine.vibration.toFixed(2)} mm/s`
              : machine.abnormalParameters.includes('Temperature')
              ? `${machine.temperature.toFixed(1)} °C`
              : `${machine.pressure.toFixed(1)} bar`,
          anomalyScore: machine.anomalyScore,
          riskCategory: machine.riskCategory,
          summary: machine.flaggedReason,
        },
        ...machine.anomalyHistory,
      ].slice(0, 20);

      pushEvent({
        machineId: machine.id,
        machineName: machine.name,
        category: 'Alert',
        title: `${desiredSeverity} Alert Raised (${newAlert.id})`,
        description: machine.flaggedReason,
        severity: desiredSeverity === 'Critical' ? 'critical' : 'warning',
      });

      pushNotification({
        category: 'Critical Alert',
        title: `${machine.id} ${machine.name} — ${alertType}`,
        message: machine.flaggedReason,
        machineId: machine.id,
        targetPage: 'alerts',
      });
    } else if (existingActive.severity !== desiredSeverity && desiredSeverity === 'Critical') {
      existingActive.severity = 'Critical';
      existingActive.description = machine.flaggedReason;
      existingActive.timestamp = nowTimeLabel();
    }
  } else if (previousStatus !== 'running' && machine.status === 'running') {
    pushEvent({
      machineId: machine.id,
      machineName: machine.name,
      category: 'Telemetry',
      title: `${machine.id} Returned to Normal Operation`,
      description: 'All sensor values settled back inside nominal operating bands.',
      severity: 'success',
    });
  }
}

function stepMachineTelemetry(machine: Machine, immediateScenarioJump = false) {
  const prevStatus = machine.status;
  const t = machine.thresholds;
  const jitter = (s: number) => (Math.random() - 0.5) * s;

  // Baseline nominal targets by machine type
  const nominalByType: Record<Machine['modelType'], { temp: number; vib: number; press: number; rpm: number; load: number }> = {
    cnc: { temp: 60.5, vib: 2.1, press: 98, rpm: 3400, load: 68 },
    compressor: { temp: 68.0, vib: 2.8, press: 138, rpm: 1750, load: 70 },
    conveyor: { temp: 43.0, vib: 1.4, press: 100, rpm: 620, load: 54 },
    press: { temp: 66.0, vib: 2.9, press: 178, rpm: 1020, load: 72 },
    packaging: { temp: 51.0, vib: 1.85, press: 96, rpm: 1480, load: 61 },
  };
  const base = nominalByType[machine.modelType];

  let targetTemp = base.temp;
  let targetVib = base.vib;
  let targetPress = base.press;
  let targetRpm = base.rpm;
  let targetLoad = base.load;

  switch (machine.scenario) {
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
  machine.temperature = Number((machine.temperature + (targetTemp - machine.temperature) * blend + jitter(0.9)).toFixed(1));
  machine.vibration = Number(Math.max(0, machine.vibration + (targetVib - machine.vibration) * blend + jitter(0.22)).toFixed(2));
  machine.pressure = Number(Math.max(0, machine.pressure + (targetPress - machine.pressure) * blend + jitter(2.5)).toFixed(1));
  machine.rpm = Math.max(0, Math.round(machine.rpm + (targetRpm - machine.rpm) * blend + jitter(35)));
  machine.load = Number(Math.min(100, Math.max(0, machine.load + (targetLoad - machine.load) * blend + jitter(1.8))).toFixed(1));
  machine.lastUpdated = nowTimeLabel();

  evaluateAnomalyAndAlerts(machine, prevStatus);

  machine.sensorHistory = [
    ...machine.sensorHistory.slice(-29),
    {
      timestamp: machine.lastUpdated,
      temperature: machine.temperature,
      vibration: machine.vibration,
      pressure: machine.pressure,
      rpm: machine.rpm,
      load: machine.load,
      healthScore: machine.healthScore,
      anomalyScore: machine.anomalyScore,
    },
  ];
}

// Background simulator loop
let simAccumulatorMs = 0;
const SIM_TICK_INTERVAL_MS = 500;
setInterval(() => {
  if (!state.simulator.running || state.simulator.paused) return;
  const targetInterval = 2500 / state.simulator.speed;
  simAccumulatorMs += SIM_TICK_INTERVAL_MS;
  if (simAccumulatorMs < targetInterval) return;
  simAccumulatorMs = 0;

  state.simulator.tickCount += 1;
  for (const m of state.machines) {
    stepMachineTelemetry(m, false);
  }
  broadcastState();
}, SIM_TICK_INTERVAL_MS);

// --- Server-Side Tool Runner for Agentic AI Assistant ---
function runBackendToolsForAssistant(prompt: string, selectedMachineId?: string): {
  traces: AssistantToolTrace[];
  contextJson: string;
  referencedIds: string[];
} {
  const traces: AssistantToolTrace[] = [];
  const lower = prompt.toLowerCase();

  // Detect referenced machine IDs from prompt or selected context
  const referencedIds = new Set<string>();
  for (const m of state.machines) {
    if (
      lower.includes(m.id.toLowerCase()) ||
      lower.includes(m.name.toLowerCase())
    ) {
      referencedIds.add(m.id);
    }
  }
  if (referencedIds.size === 0 && selectedMachineId) {
    referencedIds.add(selectedMachineId);
  }
  if (
    referencedIds.size === 0 &&
    (lower.includes('critical') || lower.includes('warning') || lower.includes('maintenance') || lower.includes('factory'))
  ) {
    for (const m of state.machines) {
      if (m.status !== 'running') referencedIds.add(m.id);
    }
  }
  const targetIds = Array.from(referencedIds);

  // Tool 1: Retrieve live machine telemetry
  const targetMachines =
    targetIds.length > 0
      ? state.machines.filter((m) => targetIds.includes(m.id))
      : state.machines;

  traces.push({
    tool: 'get_machine_telemetry',
    status: 'completed',
    summary: `Retrieved live readings & thresholds for ${targetMachines.map((m) => m.id).join(', ')}`,
  });

  // Tool 2: Check sensor history & anomaly records
  const historySummary = targetMachines.map((m) => ({
    id: m.id,
    name: m.name,
    status: m.status,
    healthScore: m.healthScore,
    scenario: m.scenario,
    readings: {
      temperature_C: m.temperature,
      vibration_mm_s: m.vibration,
      pressure_bar: m.pressure,
      rpm: m.rpm,
      load_pct: m.load,
    },
    thresholds: m.thresholds,
    anomalyScore: m.anomalyScore,
    riskCategory: m.riskCategory,
    abnormalParameters: m.abnormalParameters,
    flaggedReason: m.flaggedReason,
    recentTrendLast5: m.sensorHistory.slice(-5).map((p) => ({
      time: p.timestamp,
      temp: p.temperature,
      vib: p.vibration,
      press: p.pressure,
    })),
    recentAnomalies: m.anomalyHistory.slice(0, 3),
  }));

  traces.push({
    tool: 'get_sensor_history',
    status: 'completed',
    summary: `Analyzed trailing sensor history & anomaly scores across ${targetMachines.length} asset(s)`,
  });

  // Tool 3: Analyze active alerts
  const relevantAlerts = state.alerts.filter(
    (a) => a.status !== 'Resolved' && (targetIds.length === 0 || targetIds.includes(a.machineId))
  );
  traces.push({
    tool: 'analyze_active_alerts',
    status: 'completed',
    summary: `Checked ${relevantAlerts.length} active/acknowledged alert(s)`,
  });

  // Tool 4: Inspect maintenance work orders
  const openOrders = state.workOrders.filter((w) => w.status !== 'Completed');
  traces.push({
    tool: 'get_maintenance_work_orders',
    status: 'completed',
    summary: `Inspected ${openOrders.length} open/in-progress maintenance work order(s)`,
  });

  const contextPayload = {
    factory: state.factory,
    summaryCounts: {
      totalMachines: state.machines.length,
      running: state.machines.filter((m) => m.status === 'running').length,
      warning: state.machines.filter((m) => m.status === 'warning').length,
      critical: state.machines.filter((m) => m.status === 'critical').length,
      offline: state.machines.filter((m) => m.status === 'offline').length,
      activeAlerts: state.alerts.filter((a) => a.status === 'Active').length,
    },
    machines: historySummary,
    activeAlerts: relevantAlerts,
    openWorkOrders: openOrders,
  };

  return {
    traces,
    contextJson: JSON.stringify(contextPayload, null, 2),
    referencedIds: targetIds.length > 0 ? targetIds : targetMachines.filter((m) => m.status !== 'running').map((m) => m.id),
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // Auth endpoints
  app.post('/api/auth/login', (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    const matchedUser = state.users.find((u) => u.email.toLowerCase() === email.toLowerCase()) || {
      id: 'USR-DEMO',
      name: email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || 'Factory Manager',
      email,
      role: 'Factory Manager',
    };
    const token = crypto.randomBytes(24).toString('hex');
    activeSessions.set(token, {
      email: matchedUser.email,
      name: matchedUser.name,
      role: matchedUser.role,
    });
    return res.json({
      token,
      user: {
        email: matchedUser.email,
        name: matchedUser.name,
        role: matchedUser.role,
      },
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (token) activeSessions.delete(token);
    res.json({ ok: true });
  });

  // Health & full state
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, systemHealth: state.systemHealth });
  });

  app.get('/api/state', (_req, res) => {
    res.json(state);
  });

  // SSE stream
  app.get('/api/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write(`data: ${JSON.stringify(state)}\n\n`);
    sseClients.add(res);
    req.on('close', () => {
      sseClients.delete(res);
    });
  });

  // Factory switch
  app.patch('/api/factory', (req, res) => {
    const factoryId = typeof req.body?.factoryId === 'string' ? req.body.factoryId : '';
    const found = state.factories.find((f) => f.id === factoryId);
    if (!found) {
      return res.status(404).json({ error: 'Factory profile not found.' });
    }
    state.factory = found;
    broadcastState();
    res.json({ factory: state.factory });
  });

  // Machine management
  app.post('/api/machines', (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const category = typeof req.body?.category === 'string' ? req.body.category.trim() : 'General Manufacturing';
    const area = typeof req.body?.area === 'string' ? req.body.area.trim() : 'Bay A — Machining';
    const modelType = (['cnc', 'compressor', 'conveyor', 'press', 'packaging'].includes(req.body?.modelType)
      ? req.body.modelType
      : 'cnc') as Machine['modelType'];

    if (!name) {
      return res.status(400).json({ error: 'Machine name is required.' });
    }

    const nextNum = 101 + state.machines.length;
    const id = `M-${nextNum}`;
    const newMachine: Machine = {
      id,
      name,
      category,
      area,
      modelType,
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
      lastUpdated: nowTimeLabel(),
      uptimePercent: 99.8,
      position3D: [(state.machines.length % 3 - 1) * 7, 0, Math.floor(state.machines.length / 3) * 7 - 2],
      thresholds: {
        maxTemp: 78,
        maxVibration: 4.5,
        maxPressure: 140,
        minPressure: 75,
        maxRpm: 3500,
        maxLoad: 90,
      },
      scenario: 'Normal Operation',
      sensorHistory: generateHistory(54.0, 1.9, 100.0, 1800, 58.0, 95, 0.09),
      anomalyHistory: [],
    };
    state.machines.push(newMachine);
    pushEvent({
      machineId: newMachine.id,
      machineName: newMachine.name,
      category: 'Telemetry',
      title: `Machine ${newMachine.id} Commissioned`,
      description: `Added ${newMachine.name} to ${newMachine.area}.`,
      severity: 'info',
    });
    broadcastState();
    res.status(201).json(newMachine);
  });

  app.patch('/api/machines/:id', (req, res) => {
    const machine = state.machines.find((m) => m.id === req.params.id);
    if (!machine) {
      return res.status(404).json({ error: 'Machine not found.' });
    }
    if (typeof req.body?.name === 'string' && req.body.name.trim()) {
      machine.name = req.body.name.trim();
    }
    if (typeof req.body?.category === 'string' && req.body.category.trim()) {
      machine.category = req.body.category.trim();
    }
    if (typeof req.body?.area === 'string' && req.body.area.trim()) {
      machine.area = req.body.area.trim();
    }
    if (req.body?.thresholds && typeof req.body.thresholds === 'object') {
      const th = req.body.thresholds;
      if (typeof th.maxTemp === 'number') machine.thresholds.maxTemp = th.maxTemp;
      if (typeof th.maxVibration === 'number') machine.thresholds.maxVibration = th.maxVibration;
      if (typeof th.maxPressure === 'number') machine.thresholds.maxPressure = th.maxPressure;
      if (typeof th.minPressure === 'number') machine.thresholds.minPressure = th.minPressure;
      if (typeof th.maxRpm === 'number') machine.thresholds.maxRpm = th.maxRpm;
      if (typeof th.maxLoad === 'number') machine.thresholds.maxLoad = th.maxLoad;
      evaluateAnomalyAndAlerts(machine, machine.status);
    }
    broadcastState();
    res.json(machine);
  });

  // Simulator controls
  app.post('/api/simulator/control', (req, res) => {
    const action = req.body?.action;
    if (action === 'start') {
      state.simulator.running = true;
      state.simulator.paused = false;
    } else if (action === 'pause') {
      state.simulator.paused = true;
    } else if (action === 'resume') {
      state.simulator.running = true;
      state.simulator.paused = false;
    } else if (action === 'stop') {
      state.simulator.running = false;
      state.simulator.paused = false;
    } else if (action === 'reset') {
      state.machines = createInitialMachines();
      state.alerts = createInitialAlerts();
      state.workOrders = createInitialWorkOrders();
      state.events = createInitialEvents();
      state.notifications = createInitialNotifications();
      state.simulator.running = true;
      state.simulator.paused = false;
      state.simulator.tickCount = 0;
      pushSimulatorLog({
        machineId: 'ALL',
        scenario: 'Normal Operation',
        message: 'Simulation environment reset to baseline factory state.',
        level: 'info',
      });
    } else if (action === 'step') {
      state.simulator.tickCount += 1;
      for (const m of state.machines) {
        stepMachineTelemetry(m, false);
      }
    }

    if (typeof req.body?.speed === 'number' && [0.5, 1, 2, 5].includes(req.body.speed)) {
      state.simulator.speed = req.body.speed as 0.5 | 1 | 2 | 5;
    }
    if (typeof req.body?.selectedMachineId === 'string') {
      state.simulator.selectedMachineId = req.body.selectedMachineId;
    }

    broadcastState();
    res.json(state.simulator);
  });

  app.post('/api/simulator/scenario', (req, res) => {
    const machineId = typeof req.body?.machineId === 'string' ? req.body.machineId : '';
    const scenario = req.body?.scenario as SimulationScenario;
    const machine = state.machines.find((m) => m.id === machineId);
    if (!machine) {
      return res.status(404).json({ error: 'Target machine not found.' });
    }
    const validScenarios: SimulationScenario[] = [
      'Normal Operation',
      'High Temperature',
      'Excessive Vibration',
      'Abnormal Pressure',
      'Machine Overload',
      'Sudden Shutdown',
      'Multiple Abnormalities',
      'Recovery After Maintenance',
    ];
    if (!validScenarios.includes(scenario)) {
      return res.status(400).json({ error: 'Invalid simulation scenario.' });
    }

    machine.scenario = scenario;
    state.simulator.selectedMachineId = machine.id;
    stepMachineTelemetry(machine, true);

    if (scenario === 'Normal Operation' || scenario === 'Recovery After Maintenance') {
      // Auto-resolve active alerts if machine recovered
      for (const alert of state.alerts) {
        if (alert.machineId === machine.id && alert.status !== 'Resolved') {
          alert.status = 'Resolved';
          alert.resolvedAt = nowTimeLabel();
        }
      }
    }

    pushSimulatorLog({
      machineId: machine.id,
      scenario,
      message: `Applied "${scenario}" scenario to ${machine.id} (${machine.name}). Status: ${machine.status.toUpperCase()}.`,
      level: machine.status === 'critical' || machine.status === 'offline' ? 'critical' : machine.status === 'warning' ? 'warning' : 'info',
    });

    pushEvent({
      machineId: machine.id,
      machineName: machine.name,
      category: 'Simulator',
      title: `Simulator Scenario: ${scenario}`,
      description: `${machine.id} telemetry updated under ${scenario} profile (Temp ${machine.temperature}°C, Vib ${machine.vibration} mm/s).`,
      severity: machine.status === 'critical' || machine.status === 'offline' ? 'critical' : machine.status === 'warning' ? 'warning' : 'success',
    });

    broadcastState();
    res.json({ machine, simulator: state.simulator });
  });

  // Alerts
  app.post('/api/alerts/:id/acknowledge', (req, res) => {
    const alert = state.alerts.find((a) => a.id === req.params.id);
    if (!alert) return res.status(404).json({ error: 'Alert not found.' });
    alert.status = 'Acknowledged';
    alert.acknowledgedBy = typeof req.body?.user === 'string' ? req.body.user : 'Tarun Raj';
    pushEvent({
      machineId: alert.machineId,
      machineName: alert.machineName,
      category: 'Alert',
      title: `Alert ${alert.id} Acknowledged`,
      description: `Acknowledged by ${alert.acknowledgedBy}.`,
      severity: 'info',
    });
    broadcastState();
    res.json(alert);
  });

  app.post('/api/alerts/:id/resolve', (req, res) => {
    const alert = state.alerts.find((a) => a.id === req.params.id);
    if (!alert) return res.status(404).json({ error: 'Alert not found.' });
    alert.status = 'Resolved';
    alert.resolvedAt = nowTimeLabel();
    pushEvent({
      machineId: alert.machineId,
      machineName: alert.machineName,
      category: 'Alert',
      title: `Alert ${alert.id} Resolved`,
      description: `${alert.type} marked resolved.`,
      severity: 'success',
    });
    broadcastState();
    res.json(alert);
  });

  // Maintenance Work Orders
  app.post('/api/work-orders', (req, res) => {
    const machineId = typeof req.body?.machineId === 'string' ? req.body.machineId : '';
    const issue = typeof req.body?.issue === 'string' ? req.body.issue.trim() : '';
    const priority = (['Critical', 'High', 'Medium', 'Low'].includes(req.body?.priority)
      ? req.body.priority
      : 'High') as WorkOrderPriority;
    const assignedEngineer =
      typeof req.body?.assignedEngineer === 'string' && req.body.assignedEngineer.trim()
        ? req.body.assignedEngineer.trim()
        : 'Arjun Deshmukh';
    const source = (['Manual', 'AI Assistant', 'Predictive Alert'].includes(req.body?.source)
      ? req.body.source
      : 'Manual') as WorkOrder['source'];

    const machine = state.machines.find((m) => m.id === machineId);
    if (!machine || !issue) {
      return res.status(400).json({ error: 'Valid machineId and issue description are required.' });
    }

    const wo: WorkOrder = {
      id: `WO-${Math.floor(3105 + Math.random() * 800)}`,
      machineId: machine.id,
      machineName: machine.name,
      issue,
      priority,
      assignedEngineer,
      createdDate: isoDateOffset(0),
      dueDate: typeof req.body?.dueDate === 'string' && req.body.dueDate ? req.body.dueDate : isoDateOffset(1),
      status: assignedEngineer ? 'Assigned' : 'Open',
      source,
      notes: [],
    };
    state.workOrders = [wo, ...state.workOrders];

    pushEvent({
      machineId: machine.id,
      machineName: machine.name,
      category: 'Maintenance',
      title: `Work Order ${wo.id} Created (${source})`,
      description: `${priority} priority task assigned to ${assignedEngineer}: ${issue}`,
      severity: priority === 'Critical' ? 'critical' : 'info',
    });

    pushNotification({
      category: 'Maintenance Assignment',
      title: `New Work Order ${wo.id} (${machine.id})`,
      message: `Assigned to ${assignedEngineer}: ${issue}`,
      machineId: machine.id,
      targetPage: 'maintenance',
    });

    broadcastState();
    res.status(201).json(wo);
  });

  app.patch('/api/work-orders/:id', (req, res) => {
    const wo = state.workOrders.find((w) => w.id === req.params.id);
    if (!wo) return res.status(404).json({ error: 'Work order not found.' });

    if (['Open', 'Assigned', 'In Progress', 'Completed'].includes(req.body?.status)) {
      wo.status = req.body.status as WorkOrderStatus;
    }
    if (typeof req.body?.assignedEngineer === 'string' && req.body.assignedEngineer.trim()) {
      wo.assignedEngineer = req.body.assignedEngineer.trim();
    }
    if (['Critical', 'High', 'Medium', 'Low'].includes(req.body?.priority)) {
      wo.priority = req.body.priority as WorkOrderPriority;
    }

    pushEvent({
      machineId: wo.machineId,
      machineName: wo.machineName,
      category: 'Maintenance',
      title: `Work Order ${wo.id} Updated to ${wo.status}`,
      description: `Engineer: ${wo.assignedEngineer}`,
      severity: wo.status === 'Completed' ? 'success' : 'info',
    });

    pushNotification({
      category: 'Work Order Update',
      title: `${wo.id} status changed to ${wo.status}`,
      message: `${wo.machineId} ${wo.machineName} — ${wo.issue}`,
      machineId: wo.machineId,
      targetPage: 'maintenance',
    });

    broadcastState();
    res.json(wo);
  });

  app.post('/api/work-orders/:id/notes', (req, res) => {
    const wo = state.workOrders.find((w) => w.id === req.params.id);
    if (!wo) return res.status(404).json({ error: 'Work order not found.' });
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    const author = typeof req.body?.author === 'string' && req.body.author.trim() ? req.body.author.trim() : 'Tarun Raj';
    if (!text) return res.status(400).json({ error: 'Note text is required.' });
    wo.notes.push({
      id: `NOTE-${Date.now().toString().slice(-4)}`,
      author,
      timestamp: nowTimeLabel(),
      text,
    });
    broadcastState();
    res.json(wo);
  });

  // Notifications
  app.post('/api/notifications/read-all', (_req, res) => {
    for (const n of state.notifications) n.read = true;
    broadcastState();
    res.json({ ok: true });
  });

  app.post('/api/notifications/:id/read', (req, res) => {
    const notif = state.notifications.find((n) => n.id === req.params.id);
    if (!notif) return res.status(404).json({ error: 'Notification not found.' });
    notif.read = true;
    broadcastState();
    res.json(notif);
  });

  // Users & AI Settings
  app.post('/api/users', (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    const role = (['Factory Manager', 'Maintenance Engineer', 'Quality Inspector', 'System Admin'].includes(req.body?.role)
      ? req.body.role
      : 'Maintenance Engineer') as UserAccount['role'];
    const department = typeof req.body?.department === 'string' ? req.body.department.trim() : 'Operations';
    if (!name || !email) return res.status(400).json({ error: 'Name and email are required.' });
    const user: UserAccount = {
      id: `USR-${String(state.users.length + 1).padStart(2, '0')}`,
      name,
      email,
      role,
      status: 'Active',
      department,
      lastActive: 'Just invited',
    };
    state.users.push(user);
    broadcastState();
    res.status(201).json(user);
  });

  app.patch('/api/users/:id', (req, res) => {
    const user = state.users.find((u) => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (['Factory Manager', 'Maintenance Engineer', 'Quality Inspector', 'System Admin'].includes(req.body?.role)) {
      user.role = req.body.role as UserAccount['role'];
    }
    if (['Active', 'Inactive'].includes(req.body?.status)) {
      user.status = req.body.status as 'Active' | 'Inactive';
    }
    broadcastState();
    res.json(user);
  });

  app.patch('/api/settings/ai', (req, res) => {
    if (typeof req.body?.anomalyThreshold === 'number') {
      state.aiSettings.anomalyThreshold = Math.min(0.95, Math.max(0.2, req.body.anomalyThreshold));
    }
    if (typeof req.body?.visionConfidenceThreshold === 'number') {
      state.aiSettings.visionConfidenceThreshold = Math.min(99, Math.max(50, req.body.visionConfidenceThreshold));
    }
    if (typeof req.body?.autoCreateAlerts === 'boolean') {
      state.aiSettings.autoCreateAlerts = req.body.autoCreateAlerts;
    }
    broadcastState();
    res.json(state.aiSettings);
  });

  // --- Gemini AI Quality Inspection ---
  app.post('/api/quality/inspect', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({
        error: 'Computer Vision model unavailable: GEMINI_API_KEY is not configured in environment secrets.',
        code: 'MODEL_UNAVAILABLE',
      });
    }

    const machineId = typeof req.body?.machineId === 'string' ? req.body.machineId : 'M-101';
    const partName = typeof req.body?.partName === 'string' && req.body.partName.trim()
      ? req.body.partName.trim()
      : 'Inspected Component';
    const base64Data = typeof req.body?.imageBase64 === 'string' ? req.body.imageBase64 : '';
    const mimeType = typeof req.body?.mimeType === 'string' ? req.body.mimeType : 'image/jpeg';
    const sampleImagePath = typeof req.body?.sampleImagePath === 'string' ? req.body.sampleImagePath : '';

    let resolvedBase64 = base64Data;
    let resolvedMime = mimeType;
    let displayImageUrl = typeof req.body?.displayImageUrl === 'string' ? req.body.displayImageUrl : '';

    if (!resolvedBase64 && sampleImagePath) {
      // Strictly confine sample path reads to src/assets/images
      const baseDir = path.resolve(process.cwd(), 'src', 'assets', 'images');
      const fileName = path.basename(sampleImagePath);
      const targetPath = path.resolve(baseDir, fileName);
      if (!targetPath.startsWith(baseDir + path.sep) || !fs.existsSync(targetPath)) {
        return res.status(400).json({ error: 'Sample inspection image not found.' });
      }
      resolvedBase64 = fs.readFileSync(targetPath).toString('base64');
      resolvedMime = fileName.endsWith('.png') ? 'image/png' : 'image/jpeg';
      displayImageUrl = `/src/assets/images/${fileName}`;
    }

    if (!resolvedBase64) {
      return res.status(400).json({ error: 'Please upload an image or choose a sample inspection part.' });
    }

    // Strip data URL prefix if sent by browser
    if (resolvedBase64.includes(',')) {
      const [prefix, raw] = resolvedBase64.split(',');
      resolvedBase64 = raw;
      const match = prefix.match(/data:(image\/[a-zA-Z0-9+.-]+);base64/);
      if (match) resolvedMime = match[1];
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
              text: `You are an industrial metrological computer vision quality inspection system for ForgeTwin. Analyze this image of part "${partName}" produced by machine ${machineId}. Identify any surface defects (cracks, burrs, weld porosity, pitting, scratches, corrosion, dimensional anomalies). Return bounding boxes in normalized 0-100 percentage coordinates relative to image width/height. Be precise and conservative: if the machined surface looks clean and defect-free, report "No Defect Detected".`,
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
            required: ['status', 'defectCategory', 'confidence', 'summary', 'recommendedAction', 'detections'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      const status =
        parsed.status === 'Defect Detected' ? 'Defect Detected' : 'No Defect Detected';

      const record: InspectionRecord = {
        id: `INSP-${Math.floor(420 + Math.random() * 500)}`,
        timestamp: nowTimeLabel(),
        machineId,
        partName,
        imageUrl: displayImageUrl || `data:${resolvedMime};base64,${resolvedBase64}`,
        status,
        defectCategory: String(parsed.defectCategory || (status === 'Defect Detected' ? 'Surface Anomaly' : 'None')),
        confidence: Number(Math.min(99.9, Math.max(50, Number(parsed.confidence) || 90)).toFixed(1)),
        summary: String(parsed.summary || 'Automated inspection completed.'),
        recommendedAction: String(parsed.recommendedAction || 'Log result in batch traceability sheet.'),
        detections: Array.isArray(parsed.detections)
          ? parsed.detections.map((d: Record<string, unknown>) => ({
              label: String(d.label || 'Defect'),
              x: Math.min(95, Math.max(0, Number(d.x) || 20)),
              y: Math.min(95, Math.max(0, Number(d.y) || 20)),
              w: Math.min(90, Math.max(5, Number(d.w) || 20)),
              h: Math.min(90, Math.max(5, Number(d.h) || 20)),
            }))
          : [],
      };

      state.inspections = [record, ...state.inspections].slice(0, 25);
      const machine = state.machines.find((m) => m.id === machineId);
      pushEvent({
        machineId,
        machineName: machine?.name || machineId,
        category: 'Inspection',
        title: `Vision Inspection ${record.id}: ${record.status}`,
        description: `${partName} — ${record.defectCategory} (${record.confidence}% confidence).`,
        severity: record.status === 'Defect Detected' ? 'warning' : 'success',
      });
      pushNotification({
        category: 'Quality Inspection',
        title: `${record.id}: ${record.status}`,
        message: `${partName} (${machineId}) — ${record.summary}`,
        machineId,
        targetPage: 'quality',
      });
      broadcastState();
      return res.json(record);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Vision inspection request failed.';
      return res.status(502).json({ error: msg, code: 'MODEL_UNAVAILABLE' });
    }
  });

  // --- Agentic AI Factory Assistant ---
  app.post('/api/assistant/chat', async (req, res) => {
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    const selectedMachineId = typeof req.body?.selectedMachineId === 'string' ? req.body.selectedMachineId : undefined;
    if (!prompt) {
      return res.status(400).json({ error: 'Message prompt is required.' });
    }

    const { traces, contextJson, referencedIds } = runBackendToolsForAssistant(prompt, selectedMachineId);
    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({
        error: 'AI Operations Assistant unavailable: GEMINI_API_KEY is not configured in Settings > Secrets.',
        toolTraces: traces,
      });
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `User question: "${prompt}"\n\nLive ForgeTwin Backend Telemetry & Operational Context:\n${contextJson}`,
        config: {
          systemInstruction: `You are ForgeTwin Operations AI, an industrial reliability and maintenance engineering copilot.
Rules:
1. Ground every single number, status, alert ID, and machine name strictly in the Live ForgeTwin Backend Telemetry JSON provided. Never invent sensor readings or probabilities of failure.
2. Explicitly separate observed machine facts ("observedFacts") from engineering interpretations/recommendations ("recommendations").
3. If the user is investigating a machine with warning/critical/offline status, anomaly, or asking for maintenance action, include a structured "workOrderDraft" recommending a concrete maintenance action and assigning an appropriate engineer (Arjun Deshmukh for CNC/Press/Mechanical, Priya Nair for Compressor/Pneumatics, Rohan Kulkarni for Conveyor/Packaging). Otherwise set workOrderDraft to null.
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
      if (parsed.workOrderDraft) {
        traces.push({
          tool: 'prepare_maintenance_work_order',
          status: 'completed',
          summary: `Drafted maintenance work order for ${parsed.workOrderDraft.machineId} pending human review`,
        });
      }

      pushEvent({
        machineId: referencedIds[0] || 'FACTORY',
        machineName:
          state.machines.find((m) => m.id === referencedIds[0])?.name || state.factory.name,
        category: 'AI Assistant',
        title: 'AI Operations Investigation Completed',
        description: `Analyzed prompt: "${prompt.slice(0, 72)}"`,
        severity: 'info',
      });
      broadcastState();

      return res.json({
        answer: String(parsed.answer || 'Investigation complete.'),
        observedFacts: Array.isArray(parsed.observedFacts) ? parsed.observedFacts : [],
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
        referencedMachineIds:
          Array.isArray(parsed.referencedMachineIds) && parsed.referencedMachineIds.length > 0
            ? parsed.referencedMachineIds
            : referencedIds,
        workOrderDraft: parsed.workOrderDraft || null,
        toolTraces: traces,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'AI assistant request failed.';
      return res.status(502).json({ error: msg, toolTraces: traces });
    }
  });

  // Vite dev middleware or static dist serving
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ForgeTwin server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
