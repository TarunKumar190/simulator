import { and, desc, eq, gte, ilike, inArray, or, sql } from 'drizzle-orm';
import { db } from './index.ts';
import {
  aiConversations,
  aiMessages,
  aiToolLogs,
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
import { loadAnomalyArtifact } from '../ml/anomalyModel.ts';
import type {
  AlertItem,
  AssistantConversation,
  AssistantMessage,
  AssistantToolTrace,
  EventLogItem,
  FactoryProfile,
  InspectionRecord,
  Machine,
  MachineStatus,
  NotificationItem,
  PlatformState,
  RiskCategory,
  SimulationScenario,
  SimulatorLogItem,
  UserAccount,
  UserRole,
  WorkOrder,
  WorkOrderPriority,
  WorkOrderStatus,
} from '../types.ts';

export async function getAiSettings(): Promise<PlatformState['aiSettings']> {
  try {
    const rows = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, 'ai_config'))
      .limit(1);
    const val = (rows[0]?.value || {}) as Record<string, unknown>;
    return {
      anomalyThreshold: typeof val.anomalyThreshold === 'number' ? val.anomalyThreshold : 0.55,
      visionConfidenceThreshold:
        typeof val.visionConfidenceThreshold === 'number' ? val.visionConfidenceThreshold : 80,
      autoCreateAlerts: typeof val.autoCreateAlerts === 'boolean' ? val.autoCreateAlerts : true,
      assistantModel:
        typeof val.assistantModel === 'string' ? val.assistantModel : 'gemini-4-hydrogen',
    };
  } catch (error) {
    console.error('Database query failed (getAiSettings):', error);
    throw new Error('Database query failed.', { cause: error });
  }
}

export async function loadMachinesWithHistory(includeInactive = false): Promise<Machine[]> {
  try {
    const machineRows = includeInactive
      ? await db.select().from(machines).orderBy(machines.id)
      : await db.select().from(machines).where(eq(machines.isActive, true)).orderBy(machines.id);

    if (machineRows.length === 0) return [];
    const ids = machineRows.map((m) => m.id);

    const recentReadings = await db
      .select()
      .from(sensorReadings)
      .where(inArray(sensorReadings.machineId, ids))
      .orderBy(desc(sensorReadings.id))
      .limit(ids.length * 30);

    const recentAnomalies = await db
      .select()
      .from(anomalies)
      .where(inArray(anomalies.machineId, ids))
      .orderBy(desc(anomalies.detectedAt))
      .limit(ids.length * 15);

    const readingsByMachine = new Map<string, typeof recentReadings>();
    for (const r of recentReadings) {
      const list = readingsByMachine.get(r.machineId) || [];
      if (list.length < 30) {
        list.push(r);
        readingsByMachine.set(r.machineId, list);
      }
    }

    const anomaliesByMachine = new Map<string, typeof recentAnomalies>();
    for (const a of recentAnomalies) {
      const list = anomaliesByMachine.get(a.machineId) || [];
      if (list.length < 15) {
        list.push(a);
        anomaliesByMachine.set(a.machineId, list);
      }
    }

    // Compute live uptime percentage from recent sensor_readings when available
    return machineRows.map((m) => {
      const hist = (readingsByMachine.get(m.id) || []).slice().reverse();
      const nonOfflineCount = hist.filter((p) => p.status !== 'offline').length;
      const computedUptime =
        hist.length >= 5
          ? Number(((nonOfflineCount / hist.length) * 100).toFixed(1))
          : m.uptimePercent;

      return {
        id: m.id,
        name: m.name,
        category: m.category,
        area: m.area,
        modelType: m.modelType as Machine['modelType'],
        status: m.status as MachineStatus,
        healthScore: m.healthScore,
        temperature: m.temperature,
        vibration: m.vibration,
        pressure: m.pressure,
        rpm: m.rpm,
        load: m.load,
        anomalyScore: m.anomalyScore,
        riskCategory: m.riskCategory as RiskCategory,
        abnormalParameters: Array.isArray(m.abnormalParameters) ? m.abnormalParameters : [],
        flaggedReason: m.flaggedReason,
        lastUpdated: m.lastUpdated,
        uptimePercent: computedUptime,
        position3D: m.position3D,
        thresholds: m.thresholds,
        scenario: m.scenario as SimulationScenario,
        isActive: m.isActive,
        sensorHistory: hist.map((p) => ({
          timestamp: p.timestampLabel,
          temperature: p.temperature,
          vibration: p.vibration,
          pressure: p.pressure,
          rpm: p.rpm,
          load: p.load,
          healthScore: p.healthScore,
          anomalyScore: p.anomalyScore,
        })),
        anomalyHistory: (anomaliesByMachine.get(m.id) || []).map((a) => ({
          id: a.id,
          timestamp: a.timestampLabel,
          parameter: a.parameter,
          value: a.value,
          anomalyScore: a.anomalyScore,
          riskCategory: a.riskCategory as RiskCategory,
          summary: a.summary,
        })),
      };
    });
  } catch (error) {
    console.error('Database query failed (loadMachinesWithHistory):', error);
    throw new Error('Database query failed.', { cause: error });
  }
}

export async function loadPlatformState(options: {
  geminiConfigured: boolean;
  streamActive: boolean;
}): Promise<PlatformState> {
  try {
    const [
      factoryRows,
      machineList,
      alertRows,
      orderRows,
      noteRows,
      inspRows,
      eventRows,
      notifRows,
      simSessionRows,
      simLogRows,
      userRows,
      aiSettings,
    ] = await Promise.all([
      db.select().from(factories).orderBy(factories.id),
      loadMachinesWithHistory(false),
      db.select().from(alerts).orderBy(desc(alerts.createdAt)).limit(60),
      db.select().from(workOrders).orderBy(desc(workOrders.createdAt)).limit(60),
      db.select().from(workOrderNotes).orderBy(workOrderNotes.createdAt),
      db.select().from(qualityInspections).orderBy(desc(qualityInspections.inspectedAt)).limit(30),
      db.select().from(machineEvents).orderBy(desc(machineEvents.createdAt)).limit(50),
      db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(40),
      db.select().from(simulatorSessions).orderBy(desc(simulatorSessions.startedAt)).limit(1),
      db.select().from(simulatorLogs).orderBy(desc(simulatorLogs.createdAt)).limit(40),
      db.select().from(users).orderBy(users.id),
      getAiSettings(),
    ]);

    const factoryList: FactoryProfile[] = factoryRows.map((f) => ({
      id: f.id,
      name: f.name,
      location: f.location,
      shift: f.shift,
      targetOee: f.targetOee,
    }));
    const activeFactory =
      factoryRows.find((f) => f.isActive) || factoryRows[0] || {
        id: 'FAC-01',
        name: 'ForgeTwin Plant Alpha',
        location: 'Pune Precision Industrial Zone',
        shift: 'Shift B',
        targetOee: 92,
      };

    const notesByOrder = new Map<string, WorkOrder['notes']>();
    for (const n of noteRows) {
      const list = notesByOrder.get(n.workOrderId) || [];
      list.push({
        id: n.id,
        author: n.author,
        timestamp: n.timestampLabel,
        text: n.text,
      });
      notesByOrder.set(n.workOrderId, list);
    }

    const mappedOrders: WorkOrder[] = orderRows.map((w) => ({
      id: w.id,
      machineId: w.machineId,
      machineName: w.machineName,
      issue: w.issue,
      priority: w.priority as WorkOrderPriority,
      assignedEngineer: w.assignedEngineer,
      createdDate: w.createdDate,
      dueDate: w.dueDate,
      status: w.status as WorkOrderStatus,
      source: w.source as WorkOrder['source'],
      notes: notesByOrder.get(w.id) || [],
    }));

    const mappedAlerts: AlertItem[] = alertRows.map((a) => ({
      id: a.id,
      machineId: a.machineId,
      machineName: a.machineName,
      type: a.type,
      severity: a.severity as AlertItem['severity'],
      description: a.description,
      timestamp: a.timestampLabel,
      createdDate: a.createdAt ? new Date(a.createdAt).toISOString().slice(0, 10) : undefined,
      status: a.status as AlertItem['status'],
      acknowledgedBy: a.acknowledgedBy || undefined,
      resolvedAt: a.resolvedAtLabel || undefined,
    }));

    const mappedInspections: InspectionRecord[] = inspRows.map((i) => ({
      id: i.id,
      timestamp: i.timestampLabel,
      machineId: i.machineId,
      partName: i.partName,
      imageUrl: i.imageUrl,
      status: i.status as InspectionRecord['status'],
      defectCategory: i.defectCategory,
      confidence: Number(i.confidence),
      analysisEngine: i.analysisEngine,
      summary: i.summary,
      recommendedAction: i.recommendedAction,
      detections: Array.isArray(i.detections) ? i.detections : [],
    }));

    const mappedEvents: EventLogItem[] = eventRows.map((e) => ({
      id: e.id,
      timestamp: e.timestampLabel,
      machineId: e.machineId,
      machineName: e.machineName,
      category: e.category as EventLogItem['category'],
      title: e.title,
      description: e.description,
      severity: e.severity as EventLogItem['severity'],
    }));

    const mappedNotifications: NotificationItem[] = notifRows.map((n) => ({
      id: n.id,
      timestamp: n.timestampLabel,
      category: n.category as NotificationItem['category'],
      title: n.title,
      message: n.message,
      read: n.read,
      machineId: n.machineId || undefined,
      targetPage: n.targetPage as NotificationItem['targetPage'],
    }));

    const sim = simSessionRows[0];
    const simRunning = sim ? sim.status !== 'stopped' : true;
    const simPaused = sim ? sim.status === 'paused' : false;
    const simSpeed = (sim && [0.5, 1, 2, 5].includes(sim.speed) ? sim.speed : 1) as
      | 0.5
      | 1
      | 2
      | 5;

    const mappedSimLogs: SimulatorLogItem[] = simLogRows.map((l) => ({
      id: l.id,
      timestamp: l.timestampLabel,
      machineId: l.machineId,
      scenario: l.scenario as SimulationScenario,
      message: l.message,
      level: l.level as SimulatorLogItem['level'],
    }));

    const mappedUsers: UserAccount[] = userRows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role as UserRole,
      status: u.status === 'Inactive' ? 'Inactive' : 'Active',
      department: u.department,
      lastActive: u.lastActive,
    }));

    const mlArtifact = loadAnomalyArtifact();

    return {
      factory: {
        id: activeFactory.id,
        name: activeFactory.name,
        location: activeFactory.location,
        shift: activeFactory.shift,
        targetOee: activeFactory.targetOee,
      },
      factories: factoryList,
      machines: machineList,
      alerts: mappedAlerts,
      workOrders: mappedOrders,
      inspections: mappedInspections,
      events: mappedEvents,
      notifications: mappedNotifications,
      simulator: {
        running: simRunning,
        paused: simPaused,
        speed: simSpeed,
        selectedMachineId: sim?.selectedMachineId || 'M-101',
        tickCount: sim?.tickCount || 0,
        logs: mappedSimLogs,
      },
      users: mappedUsers,
      systemHealth: {
        backendApi: 'Operational',
        database: 'Operational',
        simulator: simRunning ? (simPaused ? 'Paused' : 'Running') : 'Stopped',
        stream: options.streamActive ? 'Active' : 'Idle',
        predictiveModel: 'Active',
        visionModel: options.geminiConfigured ? 'Ready' : 'Unavailable',
        assistantAi: options.geminiConfigured ? 'Ready' : 'Unavailable',
      },
      mlMetrics: mlArtifact.metrics,
      aiSettings,
    };
  } catch (error) {
    console.error('Database query failed (loadPlatformState):', error);
    throw new Error('Failed to load operational state from PostgreSQL.', { cause: error });
  }
}

export async function getPaginatedMachines(params: {
  search?: string;
  status?: string;
  area?: string;
  includeInactive?: boolean;
  page?: number;
  pageSize?: number;
}) {
  try {
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(50, Math.max(1, params.pageSize || 10));
    const conditions = [];

    if (!params.includeInactive) {
      conditions.push(eq(machines.isActive, true));
    }
    if (params.status && params.status !== 'all') {
      conditions.push(eq(machines.status, params.status));
    }
    if (params.area && params.area !== 'all') {
      conditions.push(eq(machines.area, params.area));
    }
    if (params.search && params.search.trim()) {
      const pattern = `%${params.search.trim()}%`;
      conditions.push(
        or(
          ilike(machines.id, pattern),
          ilike(machines.name, pattern),
          ilike(machines.category, pattern),
          ilike(machines.area, pattern)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const allFiltered = await db
      .select()
      .from(machines)
      .where(whereClause)
      .orderBy(machines.id);

    const total = allFiltered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const offset = (page - 1) * pageSize;
    const items = allFiltered.slice(offset, offset + pageSize);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages,
    };
  } catch (error) {
    console.error('Database query failed (getPaginatedMachines):', error);
    throw new Error('Failed to query paginated machines.', { cause: error });
  }
}

export async function computeDatabaseAnalytics(params: {
  machineId?: string;
  range?: 'today' | '7d' | '30d';
}) {
  try {
    const range = params.range || 'today';
    const days = range === '30d' ? 30 : range === '7d' ? 7 : 1;
    const since = new Date(Date.now() - days * 86400000);

    const machineCond =
      params.machineId && params.machineId !== 'all'
        ? and(eq(machines.isActive, true), eq(machines.id, params.machineId))
        : eq(machines.isActive, true);

    const targetMachines = await db.select().from(machines).where(machineCond).orderBy(machines.id);
    const ids = targetMachines.map((m) => m.id);

    const readingRows =
      ids.length > 0
        ? await db
            .select()
            .from(sensorReadings)
            .where(and(inArray(sensorReadings.machineId, ids), gte(sensorReadings.recordedAt, since)))
            .orderBy(desc(sensorReadings.recordedAt))
            .limit(2000)
        : [];

    const alertRows =
      ids.length > 0
        ? await db
            .select()
            .from(alerts)
            .where(and(inArray(alerts.machineId, ids), gte(alerts.createdAt, since)))
        : [];

    const orderRows =
      ids.length > 0
        ? await db
            .select()
            .from(workOrders)
            .where(and(inArray(workOrders.machineId, ids), gte(workOrders.createdAt, since)))
        : [];

    const inspRows =
      ids.length > 0
        ? await db
            .select()
            .from(qualityInspections)
            .where(
              and(
                inArray(qualityInspections.machineId, ids),
                gte(qualityInspections.inspectedAt, since)
              )
            )
        : [];

    const machineBreakdown = targetMachines.map((m) => {
      const mReadings = readingRows.filter((r) => r.machineId === m.id);
      const upReadings = mReadings.filter((r) => r.status !== 'offline').length;
      const computedUptime =
        mReadings.length > 0
          ? Number(((upReadings / mReadings.length) * 100).toFixed(1))
          : m.status === 'offline'
          ? 0
          : m.uptimePercent;
      const avgTemp =
        mReadings.length > 0
          ? Number(
              (mReadings.reduce((a, b) => a + b.temperature, 0) / mReadings.length).toFixed(1)
            )
          : m.temperature;
      const avgVib =
        mReadings.length > 0
          ? Number((mReadings.reduce((a, b) => a + b.vibration, 0) / mReadings.length).toFixed(2))
          : m.vibration;
      const mAlerts = alertRows.filter((a) => a.machineId === m.id).length;

      return {
        machineId: m.id,
        name: m.name,
        status: m.status,
        healthScore: m.healthScore,
        anomalyScore: m.anomalyScore,
        riskCategory: m.riskCategory,
        readingsCount: mReadings.length,
        uptimePercent: computedUptime,
        downtimePercent: Number((100 - computedUptime).toFixed(1)),
        avgTemperature: avgTemp,
        avgVibration: avgVib,
        alertCount: mAlerts,
      };
    });

    const defectCount = inspRows.filter((i) => i.status === 'Defect Detected').length;
    const passRate =
      inspRows.length > 0
        ? Math.round(((inspRows.length - defectCount) / inspRows.length) * 100)
        : 100;

    return {
      range,
      machineId: params.machineId || 'all',
      sinceIso: since.toISOString(),
      avgHealth: Math.round(
        targetMachines.reduce((a, b) => a + b.healthScore, 0) / Math.max(1, targetMachines.length)
      ),
      totalReadings: readingRows.length,
      alertSummary: {
        total: alertRows.length,
        active: alertRows.filter((a) => a.status === 'Active').length,
        critical: alertRows.filter((a) => a.severity === 'Critical').length,
        high: alertRows.filter((a) => a.severity === 'High').length,
        medium: alertRows.filter((a) => a.severity === 'Medium').length,
        low: alertRows.filter((a) => a.severity === 'Low').length,
      },
      workOrderSummary: {
        total: orderRows.length,
        completed: orderRows.filter((w) => w.status === 'Completed').length,
        open: orderRows.filter((w) => w.status !== 'Completed').length,
      },
      qualitySummary: {
        total: inspRows.length,
        passed: inspRows.length - defectCount,
        defects: defectCount,
        passRate,
      },
      machineBreakdown,
    };
  } catch (error) {
    console.error('Database query failed (computeDatabaseAnalytics):', error);
    throw new Error('Failed to compute analytics from PostgreSQL.', { cause: error });
  }
}

export async function runRbacAssistantTools(params: {
  prompt: string;
  selectedMachineId?: string;
  userRole: UserRole;
}): Promise<{
  traces: AssistantToolTrace[];
  contextJson: string;
  referencedIds: string[];
  canDraftWorkOrder: boolean;
}> {
  const traces: AssistantToolTrace[] = [];
  const lower = params.prompt.toLowerCase();

  // 1. Factory summary tool
  const activeFactoryRows = await db.select().from(factories).where(eq(factories.isActive, true)).limit(1);
  const allActiveMachines = await db
    .select()
    .from(machines)
    .where(eq(machines.isActive, true))
    .orderBy(machines.id);

  traces.push({
    tool: 'get_factory_summary',
    status: 'completed',
    summary: `Loaded ${activeFactoryRows[0]?.name || 'Plant Alpha'} with ${allActiveMachines.length} active machines`,
  });

  // Identify target machines
  const referencedSet = new Set<string>();
  for (const m of allActiveMachines) {
    if (lower.includes(m.id.toLowerCase()) || lower.includes(m.name.toLowerCase())) {
      referencedSet.add(m.id);
    }
  }
  if (referencedSet.size === 0 && params.selectedMachineId) {
    referencedSet.add(params.selectedMachineId);
  }
  if (
    referencedSet.size === 0 &&
    (lower.includes('critical') ||
      lower.includes('warning') ||
      lower.includes('maintenance') ||
      lower.includes('factory'))
  ) {
    for (const m of allActiveMachines) {
      if (m.status !== 'running') referencedSet.add(m.id);
    }
  }
  const targetIds = Array.from(referencedSet);
  const targetMachines =
    targetIds.length > 0
      ? allActiveMachines.filter((m) => targetIds.includes(m.id))
      : allActiveMachines;

  // 2. Machine status tool
  traces.push({
    tool: 'get_machine_status',
    status: 'completed',
    summary: `Queried PostgreSQL status for ${targetMachines.map((m) => m.id).join(', ')}`,
  });

  // 3. Machine details + health tool
  traces.push({
    tool: 'get_machine_details',
    status: 'completed',
    summary: `Retrieved thresholds, area, scenario, and health index for ${targetMachines.length} machine(s)`,
  });

  // 4. Sensor history tool
  const tIds = targetMachines.map((m) => m.id);
  const historyRows =
    tIds.length > 0
      ? await db
          .select()
          .from(sensorReadings)
          .where(inArray(sensorReadings.machineId, tIds))
          .orderBy(desc(sensorReadings.id))
          .limit(tIds.length * 6)
      : [];

  traces.push({
    tool: 'get_sensor_history',
    status: 'completed',
    summary: `Fetched ${historyRows.length} historical telemetry samples from sensor_readings`,
  });

  // 5. Machine health & anomaly history tool
  const anomalyRows =
    tIds.length > 0
      ? await db
          .select()
          .from(anomalies)
          .where(inArray(anomalies.machineId, tIds))
          .orderBy(desc(anomalies.detectedAt))
          .limit(10)
      : [];
  traces.push({
    tool: 'get_machine_health',
    status: 'completed',
    summary: `Checked ML anomaly records (${anomalyRows.length} recent entries)`,
  });

  // 6. Active alerts tool
  const activeAlertsRows = await db
    .select()
    .from(alerts)
    .where(sql`${alerts.status} != 'Resolved'`)
    .orderBy(desc(alerts.createdAt))
    .limit(20);
  traces.push({
    tool: 'get_active_alerts',
    status: 'completed',
    summary: `Inspected ${activeAlertsRows.length} unresolved alert(s) in PostgreSQL`,
  });

  // 7. Pending work orders tool
  const pendingOrdersRows = await db
    .select()
    .from(workOrders)
    .where(sql`${workOrders.status} != 'Completed'`)
    .orderBy(desc(workOrders.createdAt))
    .limit(20);
  traces.push({
    tool: 'get_pending_work_orders',
    status: 'completed',
    summary: `Checked ${pendingOrdersRows.length} pending maintenance work order(s)`,
  });

  // 8. Recent events tool
  const recentEventRows = await db
    .select()
    .from(machineEvents)
    .orderBy(desc(machineEvents.createdAt))
    .limit(12);
  traces.push({
    tool: 'get_recent_events',
    status: 'completed',
    summary: `Read ${recentEventRows.length} recent machine & simulator audit events`,
  });

  // 9. Quality inspections tool (RBAC check: all plant roles can read summary, or note scope)
  const recentInspections = await db
    .select({
      id: qualityInspections.id,
      machineId: qualityInspections.machineId,
      partName: qualityInspections.partName,
      status: qualityInspections.status,
      defectCategory: qualityInspections.defectCategory,
      confidence: qualityInspections.confidence,
      timestamp: qualityInspections.timestampLabel,
    })
    .from(qualityInspections)
    .orderBy(desc(qualityInspections.inspectedAt))
    .limit(8);
  traces.push({
    tool: 'get_quality_inspections',
    status: 'completed',
    summary: `Reviewed ${recentInspections.length} quality inspection records`,
  });

  const canDraftWorkOrder = ['System Admin', 'Factory Manager', 'Maintenance Engineer'].includes(
    params.userRole
  );

  const contextPayload = {
    callerRole: params.userRole,
    canApproveWorkOrder: canDraftWorkOrder,
    factory: activeFactoryRows[0] || null,
    summaryCounts: {
      totalMachines: allActiveMachines.length,
      running: allActiveMachines.filter((m) => m.status === 'running').length,
      warning: allActiveMachines.filter((m) => m.status === 'warning').length,
      critical: allActiveMachines.filter((m) => m.status === 'critical').length,
      offline: allActiveMachines.filter((m) => m.status === 'offline').length,
      activeAlerts: activeAlertsRows.filter((a) => a.status === 'Active').length,
    },
    machines: targetMachines.map((m) => ({
      id: m.id,
      name: m.name,
      area: m.area,
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
      recentTrendLast5: historyRows
        .filter((h) => h.machineId === m.id)
        .slice(0, 5)
        .map((p) => ({
          time: p.timestampLabel,
          temp: p.temperature,
          vib: p.vibration,
          press: p.pressure,
        })),
      recentAnomalies: anomalyRows.filter((a) => a.machineId === m.id).slice(0, 3),
    })),
    activeAlerts: activeAlertsRows,
    openWorkOrders: pendingOrdersRows,
    recentEvents: recentEventRows,
    recentQualityInspections: recentInspections,
  };

  return {
    traces,
    contextJson: JSON.stringify(contextPayload, null, 2),
    referencedIds:
      targetIds.length > 0
        ? targetIds
        : targetMachines.filter((m) => m.status !== 'running').map((m) => m.id),
    canDraftWorkOrder,
  };
}

export async function loadUserConversations(userId: string): Promise<AssistantConversation[]> {
  try {
    const convRows = await db
      .select()
      .from(aiConversations)
      .where(or(eq(aiConversations.userId, userId), eq(aiConversations.id, 'CONV-01')))
      .orderBy(desc(aiConversations.createdAt))
      .limit(20);

    if (convRows.length === 0) return [];
    const convIds = convRows.map((c) => c.id);

    const msgRows = await db
      .select()
      .from(aiMessages)
      .where(inArray(aiMessages.conversationId, convIds))
      .orderBy(aiMessages.createdAt);

    const msgIds = msgRows.map((m) => m.id);
    const logRows =
      msgIds.length > 0
        ? await db
            .select()
            .from(aiToolLogs)
            .where(inArray(aiToolLogs.messageId, msgIds))
            .orderBy(aiToolLogs.executedAt)
        : [];

    const logsByMsg = new Map<string, AssistantToolTrace[]>();
    for (const l of logRows) {
      const list = logsByMsg.get(l.messageId) || [];
      list.push({
        tool: l.toolName,
        status: l.status === 'failed' ? 'failed' : 'completed',
        summary: l.summary,
      });
      logsByMsg.set(l.messageId, list);
    }

    const msgsByConv = new Map<string, AssistantMessage[]>();
    for (const m of msgRows) {
      const list = msgsByConv.get(m.conversationId) || [];
      list.push({
        id: m.id,
        role: m.role === 'user' ? 'user' : 'assistant',
        timestamp: m.timestampLabel,
        content: m.content,
        observedFacts: m.observedFacts || undefined,
        recommendations: m.recommendations || undefined,
        toolTraces: logsByMsg.get(m.id),
        referencedMachineIds: m.referencedMachineIds || undefined,
        workOrderDraft: m.workOrderDraft || undefined,
        workOrderApprovedId: m.workOrderApprovedId || undefined,
        error: m.error || undefined,
      });
      msgsByConv.set(m.conversationId, list);
    }

    return convRows.map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAtLabel,
      saved: c.saved,
      messages: msgsByConv.get(c.id) || [],
    }));
  } catch (error) {
    console.error('Database query failed (loadUserConversations):', error);
    throw new Error('Failed to load AI conversations.', { cause: error });
  }
}
