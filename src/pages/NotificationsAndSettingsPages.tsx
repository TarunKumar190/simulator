import React, { useState } from 'react';
import {
  Bell,
  CheckCheck,
  Plus,
  Server,
  Shield,
  Sliders,
  UserPlus,
} from 'lucide-react';
import type {
  MachineThresholds,
  NotificationItem,
  PageId,
  PlatformState,
  UserAccount,
} from '../types';
import {
  EmptyState,
  ModalDialog,
  PageHeader,
  Panel,
} from '../components/ui/DesignSystem';

export function NotificationsPage({
  state,
  onMarkRead,
  onMarkAllRead,
  onNavigate,
}: {
  state: PlatformState;
  onMarkRead: (id: string) => Promise<void>;
  onMarkAllRead: () => Promise<void>;
  onNavigate: (page: PageId) => void;
}) {
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [catFilter, setCatFilter] = useState<'all' | NotificationItem['category']>('all');

  const items = state.notifications.filter((n) => {
    const matchRead =
      filter === 'all' || (filter === 'unread' ? !n.read : n.read);
    const matchCat = catFilter === 'all' || n.category === catFilter;
    return matchRead && matchCat;
  });

  const unreadCount = state.notifications.filter((n) => !n.read).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications Center"
        description="Real-time critical alerts, maintenance assignments, work order updates, and vision inspection notices"
        actions={
          <button
            type="button"
            disabled={unreadCount === 0}
            onClick={onMarkAllRead}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-white border border-[#D9E0E7] text-[#172B4D] rounded hover:bg-[#EAF0F6] disabled:opacity-50"
          >
            <CheckCheck className="w-3.5 h-3.5 text-[#16836B]" />
            Mark All Read ({unreadCount})
          </button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-white border border-[#D9E0E7] rounded-md">
          {(['all', 'unread', 'read'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`px-3 py-1.5 text-xs font-medium rounded capitalize ${
                filter === tab
                  ? 'bg-[#172B4D] text-white'
                  : 'text-[#667586] hover:bg-[#EAF0F6]'
              }`}
            >
              {tab === 'all' ? 'All' : tab === 'unread' ? `Unread (${unreadCount})` : 'Read'}
            </button>
          ))}
        </div>

        <select
          value={catFilter}
          onChange={(e) =>
            setCatFilter(e.target.value as 'all' | NotificationItem['category'])
          }
          className="px-3 py-1.5 text-xs bg-white border border-[#D9E0E7] rounded"
        >
          <option value="all">All Categories</option>
          <option value="Critical Alert">Critical Alerts</option>
          <option value="Maintenance Assignment">Maintenance Assignments</option>
          <option value="Work Order Update">Work Order Updates</option>
          <option value="Quality Inspection">Inspection Notifications</option>
        </select>
      </div>

      <Panel noPadding>
        {items.length === 0 ? (
          <EmptyState
            title="No notifications in this view"
            description="Notifications are generated automatically when alerts trigger, work orders update, or inspections complete."
          />
        ) : (
          <div className="divide-y divide-[#EAF0F6]">
            {items.map((n) => (
              <div
                key={n.id}
                className={`px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                  n.read ? 'bg-white' : 'bg-[#EAF0F6]/45'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`p-2 rounded border ${
                      n.category === 'Critical Alert'
                        ? 'bg-[#C74747]/10 border-[#C74747]/25 text-[#C74747]'
                        : 'bg-white border-[#D9E0E7] text-[#2563A6]'
                    }`}
                  >
                    <Bell className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-[#172B4D]">{n.title}</span>
                      {!n.read && (
                        <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-[#2563A6] text-white rounded">
                          NEW
                        </span>
                      )}
                      <span className="text-[11px] text-[#8A96A3]">· {n.category}</span>
                    </div>
                    <p className="text-[#667586] mt-0.5">{n.message}</p>
                    <div className="text-[11px] font-mono text-[#8A96A3] mt-1">
                      {n.timestamp} {n.machineId ? `· ${n.machineId}` : ''}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {!n.read && (
                    <button
                      type="button"
                      onClick={() => onMarkRead(n.id)}
                      className="px-2.5 py-1 text-xs font-medium border border-[#D9E0E7] rounded bg-white hover:bg-[#EAF0F6] text-[#172334]"
                    >
                      Mark Read
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      if (!n.read) await onMarkRead(n.id);
                      onNavigate(n.targetPage);
                    }}
                    className="px-2.5 py-1 text-xs font-medium bg-[#172B4D] text-white rounded hover:bg-[#2563A6]"
                  >
                    Open Module
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

export function SettingsPage({
  state,
  currentUser,
  onSelectFactory,
  onUpdateThresholds,
  onUpdateAiSettings,
  onAddUser,
  onUpdateUser,
}: {
  state: PlatformState;
  currentUser: { name: string; email: string; role: string };
  onSelectFactory: (factoryId: string) => Promise<void>;
  onUpdateThresholds: (machineId: string, thresholds: MachineThresholds) => Promise<void>;
  onUpdateAiSettings: (payload: {
    anomalyThreshold: number;
    visionConfidenceThreshold: number;
    autoCreateAlerts: boolean;
  }) => Promise<void>;
  onAddUser: (payload: {
    name: string;
    email: string;
    role: UserAccount['role'];
    department: string;
  }) => Promise<void>;
  onUpdateUser: (id: string, payload: { role?: UserAccount['role']; status?: 'Active' | 'Inactive' }) => Promise<void>;
}) {
  const [thresholdMachineId, setThresholdMachineId] = useState(state.machines[0]?.id || 'M-101');
  const activeMachine =
    state.machines.find((m) => m.id === thresholdMachineId) || state.machines[0];
  const [thresholds, setThresholds] = useState<MachineThresholds>(
    activeMachine?.thresholds || {
      maxTemp: 78,
      maxVibration: 4.5,
      maxPressure: 140,
      minPressure: 75,
      maxRpm: 3500,
      maxLoad: 90,
    }
  );

  const [anomalyCutoff, setAnomalyCutoff] = useState(state.aiSettings.anomalyThreshold);
  const [visionConf, setVisionConf] = useState(state.aiSettings.visionConfidenceThreshold);
  const [autoAlerts, setAutoAlerts] = useState(state.aiSettings.autoCreateAlerts);
  const [savedMsg, setSavedMsg] = useState('');

  const [inviteOpen, setInviteOpen] = useState(false);
  const [invName, setInvName] = useState('');
  const [invEmail, setInvEmail] = useState('');
  const [invRole, setInvRole] = useState<UserAccount['role']>('Maintenance Engineer');
  const [invDept, setInvDept] = useState('Mechanical Maintenance');

  const handleMachineChange = (id: string) => {
    setThresholdMachineId(id);
    const m = state.machines.find((item) => item.id === id);
    if (m) setThresholds(m.thresholds);
  };

  const saveThresholds = async (e: React.FormEvent) => {
    e.preventDefault();
    await onUpdateThresholds(thresholdMachineId, thresholds);
    setSavedMsg(`Updated operating thresholds for ${thresholdMachineId}.`);
    setTimeout(() => setSavedMsg(''), 3000);
  };

  const saveAiConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    await onUpdateAiSettings({
      anomalyThreshold: anomalyCutoff,
      visionConfidenceThreshold: visionConf,
      autoCreateAlerts: autoAlerts,
    });
    setSavedMsg('Saved AI & predictive maintenance settings.');
    setTimeout(() => setSavedMsg(''), 3000);
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invName.trim() || !invEmail.trim()) return;
    await onAddUser({
      name: invName.trim(),
      email: invEmail.trim(),
      role: invRole,
      department: invDept.trim(),
    });
    setInvName('');
    setInvEmail('');
    setInviteOpen(false);
  };

  const services = [
    { name: 'Backend API (Express)', status: state.systemHealth.backendApi },
    { name: 'State Store / Database', status: state.systemHealth.database },
    { name: 'IoT Machine Simulator', status: state.systemHealth.simulator },
    { name: 'Telemetry Stream (SSE)', status: state.systemHealth.stream },
    { name: 'Predictive Anomaly Engine', status: state.systemHealth.predictiveModel },
    { name: 'Computer Vision Model', status: state.systemHealth.visionModel },
    { name: 'Agentic AI Assistant Service', status: state.systemHealth.assistantAi },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users, Thresholds & System Settings"
        description="Role-based access control, machine safety thresholds, AI pipeline calibration, and live service diagnostics"
        actions={
          savedMsg ? (
            <span className="px-3 py-1.5 text-xs font-medium bg-[#16836B]/10 text-[#16836B] border border-[#16836B]/30 rounded">
              {savedMsg}
            </span>
          ) : undefined
        }
      />

      {/* System Health Grid */}
      <Panel
        title="System Health & Connected Services"
        subtitle="Live operational status across ForgeTwin backend, simulation, and AI inference modules"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {services.map((svc) => {
            const ok = ['Operational', 'Running', 'Active', 'Ready', 'In-Memory Store'].includes(
              svc.status
            );
            return (
              <div
                key={svc.name}
                className="p-3 border border-[#D9E0E7] rounded bg-[#F5F6F4]/60 flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Server className="w-3.5 h-3.5 text-[#2563A6] shrink-0" />
                  <span className="font-medium text-[#172334] truncate">{svc.name}</span>
                </div>
                <span
                  className={`font-mono font-semibold shrink-0 ${
                    ok ? 'text-[#16836B]' : 'text-[#C74747]'
                  }`}
                >
                  {svc.status}
                </span>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* User & Role Management */}
      <Panel
        title="User & Role Management"
        subtitle={`Signed in as ${currentUser.name} (${currentUser.role})`}
        action={
          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#172B4D] text-white rounded hover:bg-[#2563A6]"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Add User
          </button>
        }
        noPadding
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#D9E0E7] bg-[#F5F6F4] text-[11px] font-semibold text-[#667586]">
                <th className="py-2.5 px-4">Name</th>
                <th className="py-2.5 px-4">Email</th>
                <th className="py-2.5 px-4">Department</th>
                <th className="py-2.5 px-4">Role</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Last Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAF0F6]">
              {state.users.map((u) => (
                <tr key={u.id}>
                  <td className="py-2.5 px-4 font-medium text-[#172334]">{u.name}</td>
                  <td className="py-2.5 px-4 font-mono text-[#667586]">{u.email}</td>
                  <td className="py-2.5 px-4 text-[#667586]">{u.department}</td>
                  <td className="py-2.5 px-4">
                    <select
                      value={u.role}
                      onChange={(e) =>
                        onUpdateUser(u.id, { role: e.target.value as UserAccount['role'] })
                      }
                      className="px-2 py-1 text-xs bg-white border border-[#D9E0E7] rounded"
                    >
                      <option value="Factory Manager">Factory Manager</option>
                      <option value="Maintenance Engineer">Maintenance Engineer</option>
                      <option value="Quality Inspector">Quality Inspector</option>
                      <option value="System Admin">System Admin</option>
                    </select>
                  </td>
                  <td className="py-2.5 px-4">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateUser(u.id, {
                          status: u.status === 'Active' ? 'Inactive' : 'Active',
                        })
                      }
                      className={`px-2 py-0.5 text-xs font-medium border rounded ${
                        u.status === 'Active'
                          ? 'bg-[#16836B]/10 text-[#16836B] border-[#16836B]/25'
                          : 'bg-[#7B8794]/12 text-[#5B6672] border-[#7B8794]/30'
                      }`}
                    >
                      {u.status}
                    </button>
                  </td>
                  <td className="py-2.5 px-4 text-[#667586]">{u.lastActive}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Machine Thresholds & AI / Factory Configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Machine Operating Thresholds" subtitle="Configure warning & anomaly trigger limits per machine">
          <form onSubmit={saveThresholds} className="space-y-4 text-xs">
            <div>
              <label className="block font-medium text-[#172334] mb-1">Select Machine</label>
              <select
                value={thresholdMachineId}
                onChange={(e) => handleMachineChange(e.target.value)}
                className="w-full px-3 py-2 border border-[#D9E0E7] rounded bg-white"
              >
                {state.machines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id} — {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[#667586] mb-1">Max Temp (°C)</label>
                <input
                  type="number"
                  step="0.5"
                  value={thresholds.maxTemp}
                  onChange={(e) => setThresholds({ ...thresholds, maxTemp: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 border border-[#D9E0E7] rounded font-mono"
                />
              </div>
              <div>
                <label className="block text-[#667586] mb-1">Max Vib (mm/s)</label>
                <input
                  type="number"
                  step="0.1"
                  value={thresholds.maxVibration}
                  onChange={(e) =>
                    setThresholds({ ...thresholds, maxVibration: Number(e.target.value) })
                  }
                  className="w-full px-2.5 py-1.5 border border-[#D9E0E7] rounded font-mono"
                />
              </div>
              <div>
                <label className="block text-[#667586] mb-1">Max Pressure (bar)</label>
                <input
                  type="number"
                  value={thresholds.maxPressure}
                  onChange={(e) =>
                    setThresholds({ ...thresholds, maxPressure: Number(e.target.value) })
                  }
                  className="w-full px-2.5 py-1.5 border border-[#D9E0E7] rounded font-mono"
                />
              </div>
              <div>
                <label className="block text-[#667586] mb-1">Min Pressure (bar)</label>
                <input
                  type="number"
                  value={thresholds.minPressure}
                  onChange={(e) =>
                    setThresholds({ ...thresholds, minPressure: Number(e.target.value) })
                  }
                  className="w-full px-2.5 py-1.5 border border-[#D9E0E7] rounded font-mono"
                />
              </div>
              <div>
                <label className="block text-[#667586] mb-1">Max RPM</label>
                <input
                  type="number"
                  value={thresholds.maxRpm}
                  onChange={(e) => setThresholds({ ...thresholds, maxRpm: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 border border-[#D9E0E7] rounded font-mono"
                />
              </div>
              <div>
                <label className="block text-[#667586] mb-1">Max Load (%)</label>
                <input
                  type="number"
                  value={thresholds.maxLoad}
                  onChange={(e) => setThresholds({ ...thresholds, maxLoad: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 border border-[#D9E0E7] rounded font-mono"
                />
              </div>
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#172B4D] text-white font-medium rounded hover:bg-[#2563A6]"
            >
              <Sliders className="w-3.5 h-3.5" />
              Save Machine Thresholds
            </button>
          </form>
        </Panel>

        <Panel title="Factory & AI Model Configuration" subtitle="Plant selection, predictive cutoff, and automatic alert generation">
          <form onSubmit={saveAiConfig} className="space-y-4 text-xs">
            <div>
              <label className="block font-medium text-[#172334] mb-1">Active Factory Profile</label>
              <select
                value={state.factory.id}
                onChange={(e) => onSelectFactory(e.target.value)}
                className="w-full px-3 py-2 border border-[#D9E0E7] rounded bg-white"
              >
                {state.factories.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} — {f.location}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[#667586] mb-1">Anomaly Score Cutoff</label>
                <input
                  type="number"
                  step="0.05"
                  min="0.2"
                  max="0.95"
                  value={anomalyCutoff}
                  onChange={(e) => setAnomalyCutoff(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 border border-[#D9E0E7] rounded font-mono"
                />
              </div>
              <div>
                <label className="block text-[#667586] mb-1">Vision Confidence Min (%)</label>
                <input
                  type="number"
                  min="50"
                  max="99"
                  value={visionConf}
                  onChange={(e) => setVisionConf(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 border border-[#D9E0E7] rounded font-mono"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-[#172334] cursor-pointer">
              <input
                type="checkbox"
                checked={autoAlerts}
                onChange={(e) => setAutoAlerts(e.target.checked)}
                className="rounded border-[#D9E0E7]"
              />
              Automatically generate alerts when machine telemetry crosses thresholds
            </label>

            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#172B4D] text-white font-medium rounded hover:bg-[#2563A6]"
            >
              <Shield className="w-3.5 h-3.5" />
              Save AI &amp; Plant Settings
            </button>
          </form>
        </Panel>
      </div>

      <ModalDialog
        open={inviteOpen}
        title="Add Plant Operator / Engineer"
        onClose={() => setInviteOpen(false)}
      >
        <form onSubmit={handleInvite} className="space-y-4 text-xs">
          <div>
            <label className="block font-medium text-[#172334] mb-1">Full Name</label>
            <input
              type="text"
              value={invName}
              onChange={(e) => setInvName(e.target.value)}
              className="w-full px-3 py-2 border border-[#D9E0E7] rounded"
              required
            />
          </div>
          <div>
            <label className="block font-medium text-[#172334] mb-1">Work Email</label>
            <input
              type="email"
              value={invEmail}
              onChange={(e) => setInvEmail(e.target.value)}
              className="w-full px-3 py-2 border border-[#D9E0E7] rounded"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-[#172334] mb-1">Role</label>
              <select
                value={invRole}
                onChange={(e) => setInvRole(e.target.value as UserAccount['role'])}
                className="w-full px-3 py-2 border border-[#D9E0E7] rounded bg-white"
              >
                <option value="Factory Manager">Factory Manager</option>
                <option value="Maintenance Engineer">Maintenance Engineer</option>
                <option value="Quality Inspector">Quality Inspector</option>
                <option value="System Admin">System Admin</option>
              </select>
            </div>
            <div>
              <label className="block font-medium text-[#172334] mb-1">Department</label>
              <input
                type="text"
                value={invDept}
                onChange={(e) => setInvDept(e.target.value)}
                className="w-full px-3 py-2 border border-[#D9E0E7] rounded"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setInviteOpen(false)}
              className="px-3.5 py-2 border border-[#D9E0E7] rounded text-[#667586]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#172B4D] text-white font-medium rounded hover:bg-[#2563A6]"
            >
              <Plus className="w-3.5 h-3.5" />
              Add User
            </button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}
