import React, { useMemo, useState } from 'react';
import { ArrowRight, Play, Wrench, AlertTriangle } from 'lucide-react';
import type { PageId, PlatformState } from '../types';
import {
  PageHeader,
  Panel,
  SeverityBadge,
  StatTile,
  StatusBadge,
  WorkOrderStatusBadge,
} from '../components/ui/DesignSystem';
import {
  BarMetricList,
  HealthArcGauge,
  StatusDistributionBar,
  TelemetryLineChart,
} from '../components/ui/Charts';

export function DashboardPage({
  state,
  onNavigate,
  onSelectMachine,
}: {
  state: PlatformState;
  onNavigate: (page: PageId) => void;
  onSelectMachine: (machineId: string) => void;
}) {
  const [trendMachineId, setTrendMachineId] = useState<string>(state.machines[0]?.id || 'M-101');

  const counts = useMemo(() => {
    const total = state.machines.length;
    const running = state.machines.filter((m) => m.status === 'running').length;
    const warning = state.machines.filter((m) => m.status === 'warning').length;
    const critical = state.machines.filter((m) => m.status === 'critical').length;
    const offline = state.machines.filter((m) => m.status === 'offline').length;
    const activeAlerts = state.alerts.filter((a) => a.status === 'Active').length;
    const avgHealth =
      total > 0
        ? Math.round(state.machines.reduce((acc, m) => acc + m.healthScore, 0) / total)
        : 0;
    const avgUptime =
      total > 0
        ? Number(
            (state.machines.reduce((acc, m) => acc + m.uptimePercent, 0) / total).toFixed(1)
          )
        : 0;
    return { total, running, warning, critical, offline, activeAlerts, avgHealth, avgUptime };
  }, [state.machines, state.alerts]);

  const trendMachine =
    state.machines.find((m) => m.id === trendMachineId) || state.machines[0];
  const activeAlertsList = state.alerts.filter((a) => a.status !== 'Resolved').slice(0, 4);
  const pendingWorkOrders = state.workOrders.filter((w) => w.status !== 'Completed').slice(0, 4);

  const fmtCount = (n: number) => String(n).padStart(2, '0');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Factory Operations Dashboard"
        description={`${state.factory.name} · Real-time machine health, predictive alerts, and active maintenance (Demo Simulation Data)`}
        actions={
          <>
            <button
              type="button"
              onClick={() => onNavigate('simulator')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-white border border-[#D9E0E7] text-[#172334] rounded hover:bg-[#EAF0F6] whitespace-nowrap shrink-0"
            >
              <Play className="w-3.5 h-3.5 text-[#2563A6]" />
              Open Simulator
            </button>
            <button
              type="button"
              onClick={() => onNavigate('digital-twin')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-[#172B4D] text-white rounded hover:bg-[#2563A6] whitespace-nowrap shrink-0"
            >
              <span>Launch 3D Digital Twin</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </>
        }
      />

      {/* Top 6 KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatTile
          label="Total Machines"
          value={fmtCount(counts.total)}
          subtext="Configured assets"
          onClick={() => onNavigate('machines')}
        />
        <StatTile
          label="Running Machines"
          value={fmtCount(counts.running)}
          subtext="Nominal operation"
          tone="success"
          onClick={() => onNavigate('machines')}
        />
        <StatTile
          label="Warning Machines"
          value={fmtCount(counts.warning)}
          subtext="Threshold drift"
          tone="warning"
          onClick={() => onNavigate('predictive')}
        />
        <StatTile
          label="Critical Machines"
          value={fmtCount(counts.critical)}
          subtext="Immediate attention"
          tone="critical"
          onClick={() => onNavigate('predictive')}
        />
        <StatTile
          label="Offline Machines"
          value={fmtCount(counts.offline)}
          subtext="Stopped / idle"
          tone="offline"
        />
        <StatTile
          label="Active Alerts"
          value={fmtCount(counts.activeAlerts)}
          subtext="Unresolved events"
          tone={counts.activeAlerts > 0 ? 'critical' : 'default'}
          onClick={() => onNavigate('alerts')}
        />
      </div>

      {/* Status Distribution + Average Health + Factory Performance Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Panel
          title="Machine Status Distribution"
          subtitle="Live operational state across production bays"
          className="lg:col-span-5"
        >
          <StatusDistributionBar machines={state.machines} />
          <div className="mt-4 pt-3 border-t border-[#D9E0E7] flex items-center justify-between text-xs text-[#667586]">
            <span>Shift: {state.factory.shift}</span>
            <button
              type="button"
              onClick={() => onNavigate('factory')}
              className="text-[#2563A6] font-medium hover:underline"
            >
              View Factory Overview
            </button>
          </div>
        </Panel>

        <Panel
          title="Average Machine Health"
          subtitle="Composite health index across all monitored assets"
          className="lg:col-span-3 flex flex-col justify-between"
        >
          <div className="flex flex-col items-center justify-center py-1">
            <HealthArcGauge score={counts.avgHealth} label="Fleet Health Index" />
          </div>
          <div className="pt-3 border-t border-[#D9E0E7] flex items-center justify-between text-xs">
            <span className="text-[#667586]">Fleet Uptime (Demo)</span>
            <span className="font-mono tabular-nums font-semibold text-[#172B4D]">
              {counts.avgUptime}%
            </span>
          </div>
        </Panel>

        <Panel
          title="Factory Performance Overview"
          subtitle="Asset health & utilization snapshot"
          className="lg:col-span-4"
        >
          <BarMetricList
            items={state.machines.map((m) => ({
              label: m.id,
              sublabel: m.name,
              value: m.healthScore,
              color:
                m.status === 'running'
                  ? '#16836B'
                  : m.status === 'warning'
                  ? '#D99A25'
                  : m.status === 'critical'
                  ? '#C74747'
                  : '#7B8794',
            }))}
          />
        </Panel>
      </div>

      {/* Temperature & Vibration Monitoring Charts */}
      {trendMachine && (
        <Panel
          title="Recent Sensor Trends"
          subtitle="Synchronized temperature and vibration telemetry stream"
          action={
            <div className="flex items-center gap-2">
              <label htmlFor="dash-trend-machine" className="text-xs text-[#667586]">
                Asset:
              </label>
              <select
                id="dash-trend-machine"
                value={trendMachine.id}
                onChange={(e) => setTrendMachineId(e.target.value)}
                className="px-2.5 py-1 text-xs bg-white border border-[#D9E0E7] rounded text-[#172334]"
              >
                {state.machines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id} — {m.name}
                  </option>
                ))}
              </select>
            </div>
          }
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-[#172B4D]">
                  Temperature Monitoring (°C)
                </h3>
                <span className="text-xs font-mono tabular-nums text-[#667586]">
                  Current: {trendMachine.temperature.toFixed(1)} °C · Limit: {trendMachine.thresholds.maxTemp} °C
                </span>
              </div>
              <TelemetryLineChart
                labels={trendMachine.sensorHistory.map((p) => p.timestamp)}
                series={[
                  {
                    key: 'temp',
                    label: 'Temperature',
                    color: '#D97736',
                    data: trendMachine.sensorHistory.map((p) => p.temperature),
                  },
                ]}
                unit="°C"
                threshold={trendMachine.thresholds.maxTemp}
                thresholdLabel={`Max ${trendMachine.thresholds.maxTemp}°C`}
                height={185}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-[#172B4D]">
                  Vibration Monitoring (mm/s)
                </h3>
                <span className="text-xs font-mono tabular-nums text-[#667586]">
                  Current: {trendMachine.vibration.toFixed(2)} mm/s · Limit: {trendMachine.thresholds.maxVibration} mm/s
                </span>
              </div>
              <TelemetryLineChart
                labels={trendMachine.sensorHistory.map((p) => p.timestamp)}
                series={[
                  {
                    key: 'vib',
                    label: 'Vibration',
                    color: '#2563A6',
                    data: trendMachine.sensorHistory.map((p) => p.vibration),
                  },
                ]}
                unit="mm/s"
                threshold={trendMachine.thresholds.maxVibration}
                thresholdLabel={`Max ${trendMachine.thresholds.maxVibration} mm/s`}
                height={185}
              />
            </div>
          </div>
        </Panel>
      )}

      {/* Machine Status Table */}
      <Panel
        title="Machine Status Table"
        subtitle="Click any machine to inspect full telemetry, anomaly history, and 3D preview"
        noPadding
        action={
          <button
            type="button"
            onClick={() => onNavigate('machines')}
            className="text-xs font-medium text-[#2563A6] hover:underline"
          >
            Manage All Machines
          </button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#D9E0E7] bg-[#F5F6F4] text-[11px] font-semibold text-[#667586]">
                <th className="py-2.5 px-4">Machine ID</th>
                <th className="py-2.5 px-4">Machine Name</th>
                <th className="py-2.5 px-4">Current Status</th>
                <th className="py-2.5 px-4 text-right">Health Score</th>
                <th className="py-2.5 px-4 text-right">Temperature</th>
                <th className="py-2.5 px-4 text-right">Vibration</th>
                <th className="py-2.5 px-4">Last Updated</th>
                <th className="py-2.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAF0F6] text-xs">
              {state.machines.map((m) => (
                <tr key={m.id} className="hover:bg-[#F5F6F4]/70 transition-colors">
                  <td className="py-2.5 px-4 font-mono font-semibold text-[#172B4D]">
                    {m.id}
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="font-medium text-[#172334]">{m.name}</div>
                    <div className="text-[11px] text-[#8A96A3]">{m.area}</div>
                  </td>
                  <td className="py-2.5 px-4">
                    <StatusBadge status={m.status} />
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums font-medium text-[#172334]">
                    {m.healthScore}%
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[#172334]">
                    {m.temperature.toFixed(1)} °C
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[#172334]">
                    {m.vibration.toFixed(2)} mm/s
                  </td>
                  <td className="py-2.5 px-4 font-mono tabular-nums text-[#667586]">
                    {m.lastUpdated}
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => onSelectMachine(m.id)}
                      className="px-2.5 py-1 text-xs font-medium text-[#2563A6] hover:bg-[#EAF0F6] rounded whitespace-nowrap"
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Active Alerts + Pending Work Orders + Recent Machine Events */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel
          title="Active Alerts"
          subtitle="Requires operator acknowledgement or maintenance"
          action={
            <button
              type="button"
              onClick={() => onNavigate('alerts')}
              className="text-xs font-medium text-[#2563A6] hover:underline"
            >
              All Alerts
            </button>
          }
        >
          {activeAlertsList.length === 0 ? (
            <p className="text-xs text-[#667586] py-4 text-center">
              No active alerts across monitored machines.
            </p>
          ) : (
            <div className="divide-y divide-[#EAF0F6]">
              {activeAlertsList.map((a) => (
                <div key={a.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#172B4D] flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-[#D97736]" />
                      {a.machineId} · {a.type}
                    </span>
                    <SeverityBadge severity={a.severity} />
                  </div>
                  <p className="text-xs text-[#667586] mt-1 line-clamp-2">{a.description}</p>
                  <div className="text-[11px] font-mono text-[#8A96A3] mt-1">
                    {a.id} · {a.timestamp} · {a.status}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Pending Maintenance Work Orders"
          subtitle="Scheduled and in-progress tasks"
          action={
            <button
              type="button"
              onClick={() => onNavigate('maintenance')}
              className="text-xs font-medium text-[#2563A6] hover:underline"
            >
              Work Orders
            </button>
          }
        >
          {pendingWorkOrders.length === 0 ? (
            <p className="text-xs text-[#667586] py-4 text-center">
              No pending maintenance orders.
            </p>
          ) : (
            <div className="divide-y divide-[#EAF0F6]">
              {pendingWorkOrders.map((w) => (
                <div key={w.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#172B4D] flex items-center gap-1.5">
                      <Wrench className="w-3.5 h-3.5 text-[#2563A6]" />
                      {w.id} · {w.machineId}
                    </span>
                    <WorkOrderStatusBadge status={w.status} />
                  </div>
                  <p className="text-xs text-[#667586] mt-1 line-clamp-2">{w.issue}</p>
                  <div className="text-[11px] text-[#8A96A3] mt-1">
                    Assignee: {w.assignedEngineer} · Due {w.dueDate}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Recent Machine Events"
          subtitle="Connected telemetry, simulator, and AI timeline"
          action={
            <button
              type="button"
              onClick={() => onNavigate('alerts')}
              className="text-xs font-medium text-[#2563A6] hover:underline"
            >
              Event Log
            </button>
          }
        >
          <div className="divide-y divide-[#EAF0F6]">
            {state.events.slice(0, 5).map((evt) => (
              <div key={evt.id} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-[#172334] truncate">{evt.title}</span>
                  <span className="font-mono text-[11px] text-[#8A96A3] shrink-0">
                    {evt.timestamp}
                  </span>
                </div>
                <p className="text-xs text-[#667586] mt-0.5 line-clamp-2">{evt.description}</p>
                <div className="text-[11px] text-[#8A96A3] mt-0.5">
                  {evt.machineId} · {evt.category}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
