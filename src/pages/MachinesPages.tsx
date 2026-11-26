import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bot,
  Edit3,
  Plus,
  Search,
  Sliders,
  Wrench,
} from 'lucide-react';
import type { Machine, MachineStatus, PageId, PlatformState } from '../types';
import {
  EmptyState,
  ModalDialog,
  PageHeader,
  Panel,
  RiskBadge,
  SeverityBadge,
  StatTile,
  StatusBadge,
  WorkOrderStatusBadge,
} from '../components/ui/DesignSystem';
import { HealthArcGauge, TelemetryLineChart } from '../components/ui/Charts';

export function MachinesListPage({
  state,
  onSelectMachine,
  onAddMachine,
  onUpdateMachine,
}: {
  state: PlatformState;
  onSelectMachine: (machineId: string) => void;
  onAddMachine: (payload: {
    name: string;
    category: string;
    area: string;
    modelType: Machine['modelType'];
  }) => Promise<void>;
  onUpdateMachine: (
    machineId: string,
    payload: { name: string; category: string; area: string }
  ) => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | MachineStatus>('all');
  const [areaFilter, setAreaFilter] = useState<string>('all');

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('Precision Machining');
  const [newArea, setNewArea] = useState('Bay A — Machining');
  const [newModel, setNewModel] = useState<Machine['modelType']>('cnc');
  const [saving, setSaving] = useState(false);

  const [editTarget, setEditTarget] = useState<Machine | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editArea, setEditArea] = useState('');

  const areas = useMemo(
    () => Array.from(new Set(state.machines.map((m) => m.area))),
    [state.machines]
  );

  const filtered = useMemo(() => {
    return state.machines.filter((m) => {
      const q = search.trim().toLowerCase();
      const matchesQ =
        !q ||
        m.id.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q) ||
        m.area.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || m.status === statusFilter;
      const matchesArea = areaFilter === 'all' || m.area === areaFilter;
      return matchesQ && matchesStatus && matchesArea;
    });
  }, [state.machines, search, statusFilter, areaFilter]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await onAddMachine({
        name: newName.trim(),
        category: newCategory.trim(),
        area: newArea.trim(),
        modelType: newModel,
      });
      setNewName('');
      setAddOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget || !editName.trim()) return;
    setSaving(true);
    try {
      await onUpdateMachine(editTarget.id, {
        name: editName.trim(),
        category: editCategory.trim(),
        area: editArea.trim(),
      });
      setEditTarget(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Machine Management"
        description="Inventory, operational thresholds, and live health across factory machinery"
        actions={
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-[#172B4D] text-white rounded hover:bg-[#2563A6] whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Machine
          </button>
        }
      />

      {/* Search & Filters */}
      <Panel>
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#8A96A3] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Machine ID, name, category, or production area..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-[#D9E0E7] rounded text-[#172334] focus:outline-none focus:border-[#2563A6]"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | MachineStatus)}
              className="px-3 py-2 text-xs bg-white border border-[#D9E0E7] rounded text-[#172334]"
              aria-label="Filter by machine status"
            >
              <option value="all">All Statuses</option>
              <option value="running">Running</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
              <option value="offline">Offline</option>
            </select>
            <select
              value={areaFilter}
              onChange={(e) => setAreaFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-white border border-[#D9E0E7] rounded text-[#172334]"
              aria-label="Filter by production area"
            >
              <option value="all">All Production Areas</option>
              {areas.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Panel>

      {/* Machine Table */}
      <Panel noPadding>
        {filtered.length === 0 ? (
          <EmptyState
            title="No matching machines"
            description="Adjust your search term or status filter to view registered plant assets."
            action={
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setStatusFilter('all');
                  setAreaFilter('all');
                }}
                className="px-3 py-1.5 text-xs font-medium bg-[#EAF0F6] text-[#172B4D] rounded"
              >
                Reset Filters
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#D9E0E7] bg-[#F5F6F4] text-[11px] font-semibold text-[#667586]">
                  <th className="py-2.5 px-4">Machine ID</th>
                  <th className="py-2.5 px-4">Machine Name</th>
                  <th className="py-2.5 px-4">Category</th>
                  <th className="py-2.5 px-4">Production Area</th>
                  <th className="py-2.5 px-4">Current Status</th>
                  <th className="py-2.5 px-4 text-right">Health Score</th>
                  <th className="py-2.5 px-4">Last Active</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAF0F6] text-xs">
                {filtered.map((m) => (
                  <tr key={m.id} className="hover:bg-[#F5F6F4]/70 transition-colors">
                    <td className="py-2.5 px-4 font-mono font-semibold text-[#172B4D]">
                      {m.id}
                    </td>
                    <td className="py-2.5 px-4 font-medium text-[#172334]">{m.name}</td>
                    <td className="py-2.5 px-4 text-[#667586]">{m.category}</td>
                    <td className="py-2.5 px-4 text-[#667586]">{m.area}</td>
                    <td className="py-2.5 px-4">
                      <StatusBadge status={m.status} />
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-medium text-[#172334]">
                      {m.healthScore}%
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-[#667586]">
                      {m.lastUpdated}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditTarget(m);
                            setEditName(m.name);
                            setEditCategory(m.category);
                            setEditArea(m.area);
                          }}
                          className="p-1.5 text-[#667586] hover:text-[#172B4D] hover:bg-[#EAF0F6] rounded"
                          title="Edit machine"
                          aria-label={`Edit ${m.id}`}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelectMachine(m.id)}
                          className="px-2.5 py-1 text-xs font-medium text-[#2563A6] hover:bg-[#EAF0F6] rounded whitespace-nowrap"
                        >
                          View Details
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Add Machine Modal */}
      <ModalDialog
        open={addOpen}
        title="Register Industrial Machine"
        subtitle="Commission a new virtual/IoT asset into the ForgeTwin plant registry"
        onClose={() => setAddOpen(false)}
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#172334] mb-1">
              Machine Name
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g., 5-Axis CNC Lathe"
              className="w-full px-3 py-2 text-xs border border-[#D9E0E7] rounded focus:outline-none focus:border-[#2563A6]"
              required
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#172334] mb-1">
                Category
              </label>
              <input
                type="text"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#D9E0E7] rounded"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#172334] mb-1">
                Production Area
              </label>
              <input
                type="text"
                value={newArea}
                onChange={(e) => setNewArea(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#D9E0E7] rounded"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#172334] mb-1">
              3D Digital Twin Asset Archetype
            </label>
            <select
              value={newModel}
              onChange={(e) => setNewModel(e.target.value as Machine['modelType'])}
              className="w-full px-3 py-2 text-xs border border-[#D9E0E7] rounded bg-white"
            >
              <option value="cnc">CNC Machining Center</option>
              <option value="compressor">Industrial Compressor</option>
              <option value="conveyor">Conveyor Transfer System</option>
              <option value="press">Hydraulic Forming Press</option>
              <option value="packaging">End-of-Line Packaging Unit</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              className="px-3.5 py-2 text-xs font-medium border border-[#D9E0E7] rounded text-[#667586] hover:bg-[#F5F6F4]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-medium bg-[#172B4D] text-white rounded hover:bg-[#2563A6]"
            >
              {saving ? 'Adding...' : 'Commission Machine'}
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* Edit Machine Modal */}
      <ModalDialog
        open={!!editTarget}
        title={editTarget ? `Edit ${editTarget.id} Configuration` : 'Edit Machine'}
        onClose={() => setEditTarget(null)}
      >
        <form onSubmit={handleEditSave} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#172334] mb-1">
              Machine Name
            </label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-[#D9E0E7] rounded"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#172334] mb-1">
              Category
            </label>
            <input
              type="text"
              value={editCategory}
              onChange={(e) => setEditCategory(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-[#D9E0E7] rounded"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#172334] mb-1">
              Production Area
            </label>
            <input
              type="text"
              value={editArea}
              onChange={(e) => setEditArea(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-[#D9E0E7] rounded"
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setEditTarget(null)}
              className="px-3.5 py-2 text-xs font-medium border border-[#D9E0E7] rounded text-[#667586]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-medium bg-[#172B4D] text-white rounded hover:bg-[#2563A6]"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}

export function MachineDetailPage({
  state,
  machineId,
  onBack,
  onNavigate,
  onOpenAssistantForMachine,
}: {
  state: PlatformState;
  machineId: string;
  onBack: () => void;
  onNavigate: (page: PageId) => void;
  onOpenAssistantForMachine: (machineId: string) => void;
}) {
  const machine = state.machines.find((m) => m.id === machineId) || state.machines[0];
  if (!machine) return null;

  const activeAlerts = state.alerts.filter(
    (a) => a.machineId === machine.id && a.status !== 'Resolved'
  );
  const workOrders = state.workOrders.filter((w) => w.machineId === machine.id);
  const recentEvents = state.events.filter((e) => e.machineId === machine.id).slice(0, 6);
  const labels = machine.sensorHistory.map((p) => p.timestamp);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#D9E0E7]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 bg-white border border-[#D9E0E7] rounded hover:bg-[#EAF0F6] text-[#172B4D]"
            aria-label="Back to machines"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-semibold text-[#172B4D] font-mono">
                {machine.id}
              </h1>
              <span className="text-xl font-semibold text-[#172334]">
                {machine.name}
              </span>
              <StatusBadge status={machine.status} />
            </div>
            <p className="text-xs text-[#667586] mt-0.5">
              {machine.category} · {machine.area} · Active Scenario: {machine.scenario}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('simulator')}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white border border-[#D9E0E7] text-[#172334] rounded hover:bg-[#EAF0F6]"
          >
            <Sliders className="w-3.5 h-3.5 text-[#D97736]" />
            Simulate Fault
          </button>
          <button
            type="button"
            onClick={() => onOpenAssistantForMachine(machine.id)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#172B4D] text-white rounded hover:bg-[#2563A6]"
          >
            <Bot className="w-3.5 h-3.5" />
            Investigate with AI
          </button>
        </div>
      </div>

      {/* Top Health + Telemetry Strip */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Panel className="lg:col-span-3 flex flex-col items-center justify-center">
          <HealthArcGauge score={machine.healthScore} label="Asset Health Index" />
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="text-[#667586]">Risk:</span>
            <RiskBadge risk={machine.riskCategory} />
          </div>
        </Panel>

        <div className="lg:col-span-9 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatTile
            label="Temperature"
            value={`${machine.temperature.toFixed(1)} °C`}
            subtext={`Max ${machine.thresholds.maxTemp} °C`}
            tone={machine.temperature > machine.thresholds.maxTemp ? 'critical' : 'default'}
          />
          <StatTile
            label="Vibration"
            value={`${machine.vibration.toFixed(2)} mm/s`}
            subtext={`Max ${machine.thresholds.maxVibration} mm/s`}
            tone={machine.vibration > machine.thresholds.maxVibration ? 'critical' : 'default'}
          />
          <StatTile
            label="Pressure"
            value={`${machine.pressure.toFixed(1)} bar`}
            subtext={`${machine.thresholds.minPressure}–${machine.thresholds.maxPressure} bar`}
            tone={
              machine.pressure > machine.thresholds.maxPressure ||
              machine.pressure < machine.thresholds.minPressure
                ? 'warning'
                : 'default'
            }
          />
          <StatTile
            label="Spindle / Motor RPM"
            value={machine.rpm}
            subtext={`Max ${machine.thresholds.maxRpm} RPM`}
          />
          <StatTile
            label="Motor Load"
            value={`${machine.load.toFixed(1)}%`}
            subtext={`Limit ${machine.thresholds.maxLoad}%`}
            tone={machine.load > machine.thresholds.maxLoad ? 'critical' : 'default'}
          />
        </div>
      </div>

      {/* Diagnostic summary + Twin link */}
      <Panel
        title="Operational Diagnostics & Flagged Status"
        action={
          <button
            type="button"
            onClick={() => onNavigate('digital-twin')}
            className="text-xs font-medium text-[#2563A6] hover:underline"
          >
            Locate in 3D Digital Twin
          </button>
        }
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
          <div className="space-y-1">
            <div className="font-medium text-[#172334]">{machine.flaggedReason}</div>
            <div className="text-[#667586]">
              Anomaly Index: <span className="font-mono font-semibold text-[#172B4D]">{machine.anomalyScore}</span>
              {' · '}
              Abnormal Parameters:{' '}
              {machine.abnormalParameters.length > 0
                ? machine.abnormalParameters.join(', ')
                : 'None'}
            </div>
          </div>
          <div className="font-mono text-[#8A96A3] shrink-0">
            Last sample: {machine.lastUpdated}
          </div>
        </div>
      </Panel>

      {/* Sensor Trend Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Temperature & Load Trend">
          <TelemetryLineChart
            labels={labels}
            series={[
              {
                key: 'temp',
                label: 'Temp (°C)',
                color: '#D97736',
                data: machine.sensorHistory.map((p) => p.temperature),
              },
              {
                key: 'load',
                label: 'Load (%)',
                color: '#172B4D',
                data: machine.sensorHistory.map((p) => p.load),
              },
            ]}
            threshold={machine.thresholds.maxTemp}
            thresholdLabel={`Temp Limit ${machine.thresholds.maxTemp}°C`}
          />
        </Panel>
        <Panel title="Vibration & Pressure Trend">
          <TelemetryLineChart
            labels={labels}
            series={[
              {
                key: 'vib',
                label: 'Vibration (mm/s)',
                color: '#2563A6',
                data: machine.sensorHistory.map((p) => p.vibration),
              },
            ]}
            unit="mm/s"
            threshold={machine.thresholds.maxVibration}
            thresholdLabel={`Vib Limit ${machine.thresholds.maxVibration} mm/s`}
          />
        </Panel>
      </div>

      {/* Anomaly History, Active Alerts, Maintenance History, Recent Events */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Anomaly History">
          {machine.anomalyHistory.length === 0 ? (
            <p className="text-xs text-[#667586]">No anomaly events recorded for this machine.</p>
          ) : (
            <div className="divide-y divide-[#EAF0F6] text-xs">
              {machine.anomalyHistory.map((anm) => (
                <div key={anm.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[#172B4D]">
                      {anm.parameter} · {anm.value}
                    </span>
                    <RiskBadge risk={anm.riskCategory} />
                  </div>
                  <p className="text-[#667586] mt-1">{anm.summary}</p>
                  <div className="text-[11px] font-mono text-[#8A96A3] mt-1">
                    {anm.id} · {anm.timestamp} · Score {anm.anomalyScore}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Active Alerts & Maintenance History">
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-semibold text-[#172B4D] mb-2">Active Alerts</h3>
              {activeAlerts.length === 0 ? (
                <p className="text-xs text-[#667586]">No active alerts on {machine.id}.</p>
              ) : (
                <div className="space-y-2">
                  {activeAlerts.map((a) => (
                    <div key={a.id} className="p-2.5 border border-[#D9E0E7] rounded text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-[#172334]">{a.type}</span>
                        <SeverityBadge severity={a.severity} />
                      </div>
                      <p className="text-[#667586] mt-1">{a.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-[#D9E0E7]">
              <h3 className="text-xs font-semibold text-[#172B4D] mb-2 flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5 text-[#2563A6]" />
                Maintenance History
              </h3>
              {workOrders.length === 0 ? (
                <p className="text-xs text-[#667586]">No work orders logged for {machine.id}.</p>
              ) : (
                <div className="space-y-2">
                  {workOrders.map((w) => (
                    <div key={w.id} className="p-2.5 border border-[#D9E0E7] rounded text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-semibold text-[#172B4D]">{w.id}</span>
                        <WorkOrderStatusBadge status={w.status} />
                      </div>
                      <p className="text-[#172334] mt-1">{w.issue}</p>
                      <div className="text-[11px] text-[#8A96A3] mt-1">
                        {w.assignedEngineer} · Due {w.dueDate}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Recent Machine Events">
        {recentEvents.length === 0 ? (
          <p className="text-xs text-[#667586]">No recent events logged for {machine.id}.</p>
        ) : (
          <div className="divide-y divide-[#EAF0F6] text-xs">
            {recentEvents.map((e) => (
              <div key={e.id} className="py-2.5 first:pt-0 last:pb-0 flex justify-between gap-4">
                <div>
                  <div className="font-medium text-[#172334]">{e.title}</div>
                  <div className="text-[#667586]">{e.description}</div>
                </div>
                <div className="font-mono text-[11px] text-[#8A96A3] shrink-0">
                  {e.timestamp}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
