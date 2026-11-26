import React, { useMemo, useState } from 'react';
import {
  Download,
  FileText,
  Pause,
  Play,
  RotateCcw,
  Square,
  StepForward,
} from 'lucide-react';
import type { PlatformState, SimulationScenario } from '../types';
import {
  PageHeader,
  Panel,
  RiskBadge,
  StatTile,
  StatusBadge,
} from '../components/ui/DesignSystem';
import { BarMetricList, TelemetryLineChart } from '../components/ui/Charts';

export function AnalyticsPage({ state }: { state: PlatformState }) {
  const [machineFilter, setMachineFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<'today' | '7d' | '30d'>('today');

  const selectedMachines = useMemo(
    () =>
      machineFilter === 'all'
        ? state.machines
        : state.machines.filter((m) => m.id === machineFilter),
    [state.machines, machineFilter]
  );

  const primaryMachine = selectedMachines[0] || state.machines[0];
  const filteredAlerts = state.alerts.filter(
    (a) => machineFilter === 'all' || a.machineId === machineFilter
  );
  const filteredOrders = state.workOrders.filter(
    (w) => machineFilter === 'all' || w.machineId === machineFilter
  );
  const filteredInspections = state.inspections.filter(
    (i) => machineFilter === 'all' || i.machineId === machineFilter
  );

  const defectCount = filteredInspections.filter((i) => i.status === 'Defect Detected').length;
  const passRate =
    filteredInspections.length > 0
      ? Math.round(((filteredInspections.length - defectCount) / filteredInspections.length) * 100)
      : 100;

  const exportCsv = () => {
    const header = [
      'Machine ID',
      'Name',
      'Status',
      'Health Score (%)',
      'Uptime (Demo %)',
      'Temperature (C)',
      'Vibration (mm/s)',
      'Pressure (bar)',
      'Anomaly Score',
      'Risk Category',
    ].join(',');
    const rows = selectedMachines.map((m) =>
      [
        m.id,
        `"${m.name}"`,
        m.status,
        m.healthScore,
        m.uptimePercent,
        m.temperature,
        m.vibration,
        m.pressure,
        m.anomalyScore,
        `"${m.riskCategory}"`,
      ].join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ForgeTwin_Analytics_${dateRange}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdfSummary = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics & Operational Reports"
        description="Aggregated telemetry trends, uptime (demo), anomaly counts, maintenance logs, and quality inspection metrics"
        actions={
          <>
            <select
              value={machineFilter}
              onChange={(e) => setMachineFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white border border-[#D9E0E7] rounded"
            >
              <option value="all">All Machines</option>
              {state.machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id} — {m.name}
                </option>
              ))}
            </select>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as 'today' | '7d' | '30d')}
              className="px-2.5 py-1.5 text-xs bg-white border border-[#D9E0E7] rounded"
            >
              <option value="today">Current Shift (Demo)</option>
              <option value="7d">Trailing 7 Days (Demo)</option>
              <option value="30d">Trailing 30 Days (Demo)</option>
            </select>
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-[#D9E0E7] rounded hover:bg-[#EAF0F6] text-[#172B4D]"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={exportPdfSummary}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#172B4D] text-white rounded hover:bg-[#2563A6]"
            >
              <FileText className="w-3.5 h-3.5" />
              Export PDF
            </button>
          </>
        }
      />

      {/* High-Level KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="Avg Asset Health"
          value={`${Math.round(
            selectedMachines.reduce((a, b) => a + b.healthScore, 0) /
              Math.max(1, selectedMachines.length)
          )}%`}
          subtext="Live computed index"
        />
        <StatTile
          label="Recorded Alerts"
          value={filteredAlerts.length}
          subtext={`${filteredAlerts.filter((a) => a.status === 'Active').length} active`}
          tone="warning"
        />
        <StatTile
          label="Work Orders"
          value={filteredOrders.length}
          subtext={`${filteredOrders.filter((w) => w.status === 'Completed').length} completed`}
          tone="accent"
        />
        <StatTile
          label="Vision Inspection Pass Rate"
          value={`${passRate}%`}
          subtext={`${filteredInspections.length} recorded inspections`}
          tone="success"
        />
      </div>

      {/* Health & Sensor Trends */}
      {primaryMachine && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Panel title={`Health & Anomaly Trend (${primaryMachine.id})`}>
            <TelemetryLineChart
              labels={primaryMachine.sensorHistory.map((p) => p.timestamp)}
              series={[
                {
                  key: 'health',
                  label: 'Health Score (%)',
                  color: '#16836B',
                  data: primaryMachine.sensorHistory.map((p) => p.healthScore),
                },
                {
                  key: 'anm',
                  label: 'Anomaly ×100',
                  color: '#C74747',
                  data: primaryMachine.sensorHistory.map((p) => Math.round(p.anomalyScore * 100)),
                },
              ]}
            />
          </Panel>

          <Panel title={`Sensor Trend (${primaryMachine.id})`}>
            <TelemetryLineChart
              labels={primaryMachine.sensorHistory.map((p) => p.timestamp)}
              series={[
                {
                  key: 'temp',
                  label: 'Temp (°C)',
                  color: '#D97736',
                  data: primaryMachine.sensorHistory.map((p) => p.temperature),
                },
                {
                  key: 'vib',
                  label: 'Vibration ×10',
                  color: '#2563A6',
                  data: primaryMachine.sensorHistory.map((p) => Number((p.vibration * 10).toFixed(1))),
                },
              ]}
            />
          </Panel>
        </div>
      )}

      {/* Uptime, Alert Stats & Quality Inspection Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="Uptime & Downtime (Demo Baseline)">
          <BarMetricList
            items={selectedMachines.map((m) => ({
              label: m.id,
              sublabel: `Downtime ${(100 - m.uptimePercent).toFixed(1)}%`,
              value: m.uptimePercent,
              color: m.uptimePercent >= 95 ? '#16836B' : '#D99A25',
            }))}
          />
        </Panel>

        <Panel title="Alert Statistics">
          <div className="space-y-3 text-xs">
            {(['Critical', 'High', 'Medium', 'Low'] as const).map((sev) => {
              const count = filteredAlerts.filter((a) => a.severity === sev).length;
              return (
                <div key={sev} className="flex items-center justify-between py-1.5 border-b border-[#EAF0F6] last:border-b-0">
                  <span className="text-[#667586]">{sev} Severity Alerts</span>
                  <span className="font-mono font-semibold text-[#172B4D]">{count}</span>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Quality Inspection Statistics">
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between py-1.5 border-b border-[#EAF0F6]">
              <span className="text-[#667586]">Total Parts Inspected</span>
              <span className="font-mono font-semibold text-[#172B4D]">{filteredInspections.length}</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-[#EAF0F6]">
              <span className="text-[#667586]">Passed (No Defect)</span>
              <span className="font-mono font-semibold text-[#16836B]">
                {filteredInspections.length - defectCount}
              </span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-[#EAF0F6]">
              <span className="text-[#667586]">Flagged (Defect Detected)</span>
              <span className="font-mono font-semibold text-[#C74747]">{defectCount}</span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-[#667586]">Maintenance Completed</span>
              <span className="font-mono font-semibold text-[#172B4D]">
                {filteredOrders.filter((w) => w.status === 'Completed').length}
              </span>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

const SCENARIOS: { name: SimulationScenario; detail: string; tone: string }[] = [
  { name: 'Normal Operation', detail: 'Nominal temperature, vibration, and pressure bands', tone: 'border-[#16836B]/30 text-[#16836B]' },
  { name: 'High Temperature', detail: 'Thermal climb above configured max temperature', tone: 'border-[#D99A25]/40 text-[#A6710E]' },
  { name: 'Excessive Vibration', detail: 'Spindle/bearing vibration surge above limit', tone: 'border-[#D97736]/40 text-[#B85B1C]' },
  { name: 'Abnormal Pressure', detail: 'Manifold pressure spike exceeding safety ceiling', tone: 'border-[#D99A25]/40 text-[#A6710E]' },
  { name: 'Machine Overload', detail: 'Motor load > 95% with concurrent thermal rise', tone: 'border-[#C74747]/40 text-[#C74747]' },
  { name: 'Sudden Shutdown', detail: 'Immediate zero-RPM stoppage & offline transition', tone: 'border-[#7B8794]/40 text-[#5B6672]' },
  { name: 'Multiple Abnormalities', detail: 'Compound fault across temp, vibration, pressure, load', tone: 'border-[#C74747]/40 text-[#C74747]' },
  { name: 'Recovery After Maintenance', detail: 'Restores nominal readings and resolves active alerts', tone: 'border-[#16836B]/30 text-[#16836B]' },
];

export function SimulatorPage({
  state,
  onControl,
  onApplyScenario,
}: {
  state: PlatformState;
  onControl: (payload: {
    action?: 'start' | 'pause' | 'resume' | 'stop' | 'reset' | 'step';
    speed?: 0.5 | 1 | 2 | 5;
    selectedMachineId?: string;
  }) => Promise<void>;
  onApplyScenario: (machineId: string, scenario: SimulationScenario) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const selectedMachine =
    state.machines.find((m) => m.id === state.simulator.selectedMachineId) || state.machines[0];

  const simStatus = state.simulator.running
    ? state.simulator.paused
      ? 'Paused'
      : 'Running'
    : 'Stopped';

  const triggerScenario = async (scenario: SimulationScenario) => {
    if (!selectedMachine) return;
    setBusy(true);
    try {
      await onApplyScenario(selectedMachine.id, scenario);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Software IoT Machine Simulator Control Center"
        description="Generate live industrial telemetry and fault scenarios without physical hardware — drives predictive alerts, 3D Digital Twin, and AI Assistant"
        actions={
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[#667586]">Engine Status:</span>
            <span className="px-2.5 py-1 font-mono font-semibold bg-white border border-[#D9E0E7] rounded text-[#172B4D]">
              {simStatus} · {state.simulator.speed}x · Tick #{state.simulator.tickCount}
            </span>
          </div>
        }
      />

      {/* Master Simulator Controls */}
      <Panel title="Simulator Execution Controls" subtitle="Select target asset, stream cadence, and simulation state">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label htmlFor="sim-machine" className="block text-[11px] font-medium text-[#667586] mb-1">
                Target Machine
              </label>
              <select
                id="sim-machine"
                value={selectedMachine?.id || 'M-101'}
                onChange={(e) => onControl({ selectedMachineId: e.target.value })}
                className="px-3 py-2 text-xs bg-white border border-[#D9E0E7] rounded font-medium text-[#172B4D]"
              >
                {state.machines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id} — {m.name} ({m.status.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#667586] mb-1">
                Simulation Speed
              </label>
              <div className="inline-flex border border-[#D9E0E7] rounded overflow-hidden bg-[#F5F6F4]">
                {([0.5, 1, 2, 5] as const).map((spd) => (
                  <button
                    key={spd}
                    type="button"
                    onClick={() => onControl({ speed: spd })}
                    className={`px-2.5 py-1.5 text-xs font-mono ${
                      state.simulator.speed === spd
                        ? 'bg-[#172B4D] text-white'
                        : 'text-[#172334] hover:bg-[#EAF0F6]'
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onControl({ action: 'start' })}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#16836B] text-white rounded hover:bg-[#126b57]"
            >
              <Play className="w-3.5 h-3.5" /> Start
            </button>
            <button
              type="button"
              onClick={() => onControl({ action: 'pause' })}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white border border-[#D9E0E7] text-[#172334] rounded hover:bg-[#EAF0F6]"
            >
              <Pause className="w-3.5 h-3.5" /> Pause
            </button>
            <button
              type="button"
              onClick={() => onControl({ action: 'resume' })}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white border border-[#D9E0E7] text-[#172334] rounded hover:bg-[#EAF0F6]"
            >
              <Play className="w-3.5 h-3.5 text-[#2563A6]" /> Resume
            </button>
            <button
              type="button"
              onClick={() => onControl({ action: 'stop' })}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white border border-[#D9E0E7] text-[#C74747] rounded hover:bg-[#C74747]/10"
            >
              <Square className="w-3.5 h-3.5" /> Stop
            </button>
            <button
              type="button"
              onClick={() => onControl({ action: 'step' })}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white border border-[#D9E0E7] text-[#172334] rounded hover:bg-[#EAF0F6]"
            >
              <StepForward className="w-3.5 h-3.5" /> Step Tick
            </button>
            <button
              type="button"
              onClick={() => onControl({ action: 'reset' })}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white border border-[#D9E0E7] text-[#172334] rounded hover:bg-[#EAF0F6]"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset All
            </button>
          </div>
        </div>
      </Panel>

      {/* Scenario Selector + Live Machine Telemetry */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Panel
          title={`Fault & Operation Scenario Injection — ${selectedMachine?.id}`}
          subtitle="Click a scenario to inject realistic sensor trajectories into the live pipeline"
          className="lg:col-span-7"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {SCENARIOS.map((sc) => {
              const isActive = selectedMachine?.scenario === sc.name;
              return (
                <button
                  key={sc.name}
                  type="button"
                  disabled={busy}
                  onClick={() => triggerScenario(sc.name)}
                  className={`p-3 text-left rounded border transition-colors ${
                    isActive
                      ? 'bg-[#172B4D] text-white border-[#172B4D]'
                      : 'bg-white border-[#D9E0E7] hover:border-[#2563A6] hover:bg-[#F5F6F4]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold">{sc.name}</span>
                    {isActive && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/15">
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <div className={`text-[11px] mt-1 ${isActive ? 'text-[#CBD5E1]' : 'text-[#667586]'}`}>
                    {sc.detail}
                  </div>
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel
          title={`Live Generated Readings (${selectedMachine?.id})`}
          subtitle={selectedMachine?.name}
          action={selectedMachine && <StatusBadge status={selectedMachine.status} />}
          className="lg:col-span-5"
        >
          {selectedMachine && (
            <div className="space-y-4 text-xs">
              <div className="flex items-center justify-between p-2.5 bg-[#F5F6F4] border border-[#D9E0E7] rounded">
                <span className="text-[#667586]">Current Scenario</span>
                <span className="font-semibold text-[#172B4D]">{selectedMachine.scenario}</span>
              </div>

              <div className="grid grid-cols-2 gap-2.5 font-mono tabular-nums">
                <div className="p-2.5 border border-[#D9E0E7] rounded">
                  <div className="text-[11px] font-sans text-[#667586]">Temperature</div>
                  <div className="text-base font-semibold text-[#172B4D]">
                    {selectedMachine.temperature.toFixed(1)} °C
                  </div>
                </div>
                <div className="p-2.5 border border-[#D9E0E7] rounded">
                  <div className="text-[11px] font-sans text-[#667586]">Vibration</div>
                  <div
                    className={`text-base font-semibold ${
                      selectedMachine.vibration > selectedMachine.thresholds.maxVibration
                        ? 'text-[#C74747]'
                        : 'text-[#172B4D]'
                    }`}
                  >
                    {selectedMachine.vibration.toFixed(2)} mm/s
                  </div>
                </div>
                <div className="p-2.5 border border-[#D9E0E7] rounded">
                  <div className="text-[11px] font-sans text-[#667586]">Pressure</div>
                  <div className="text-base font-semibold text-[#172B4D]">
                    {selectedMachine.pressure.toFixed(1)} bar
                  </div>
                </div>
                <div className="p-2.5 border border-[#D9E0E7] rounded">
                  <div className="text-[11px] font-sans text-[#667586]">RPM / Load</div>
                  <div className="text-base font-semibold text-[#172B4D]">
                    {selectedMachine.rpm} · {selectedMachine.load.toFixed(0)}%
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-[#D9E0E7]">
                <span className="text-[#667586]">Predictive Risk Assessment</span>
                <RiskBadge risk={selectedMachine.riskCategory} />
              </div>
              <p className="text-[#667586] leading-relaxed">{selectedMachine.flaggedReason}</p>
            </div>
          )}
        </Panel>
      </div>

      {/* Event Stream & Simulator Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Simulator Execution Logs" noPadding>
          <div className="max-h-64 overflow-y-auto divide-y divide-[#EAF0F6] text-xs font-mono">
            {state.simulator.logs.map((log) => (
              <div key={log.id} className="px-4 py-2.5 flex items-start gap-3">
                <span className="text-[#8A96A3] shrink-0">{log.timestamp}</span>
                <span className="font-semibold text-[#172B4D] shrink-0">{log.machineId}</span>
                <span
                  className={
                    log.level === 'critical'
                      ? 'text-[#C74747]'
                      : log.level === 'warning'
                      ? 'text-[#A6710E]'
                      : 'text-[#172334]'
                  }
                >
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Downstream Platform Event Stream" noPadding>
          <div className="max-h-64 overflow-y-auto divide-y divide-[#EAF0F6] text-xs">
            {state.events.slice(0, 10).map((evt) => (
              <div key={evt.id} className="px-4 py-2.5 flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-[#172334]">{evt.title}</div>
                  <div className="text-[11px] text-[#667586]">{evt.description}</div>
                </div>
                <span className="font-mono text-[11px] text-[#8A96A3] shrink-0">
                  {evt.timestamp}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
