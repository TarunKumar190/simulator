import React, { useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Eye,
  MessageSquarePlus,
  Plus,
  Search,
} from 'lucide-react';
import type {
  AlertItem,
  AlertSeverity,
  PlatformState,
  WorkOrder,
  WorkOrderPriority,
  WorkOrderStatus,
} from '../types';
import {
  EmptyState,
  ModalDialog,
  PageHeader,
  Panel,
  SeverityBadge,
  StatTile,
  WorkOrderStatusBadge,
} from '../components/ui/DesignSystem';

export function AlertsPage({
  state,
  onAcknowledgeAlert,
  onResolveAlert,
  onSelectMachine,
}: {
  state: PlatformState;
  onAcknowledgeAlert: (id: string) => Promise<void>;
  onResolveAlert: (id: string) => Promise<void>;
  onSelectMachine: (machineId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'all' | AlertSeverity>('all');
  const [machineFilter, setMachineFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Active' | 'Acknowledged' | 'Resolved'>('all');
  const [dateFilter, setDateFilter] = useState<string>('');
  const [detailAlert, setDetailAlert] = useState<AlertItem | null>(null);

  const counts = useMemo(() => {
    const all = state.alerts;
    return {
      total: all.length,
      critical: all.filter((a) => a.severity === 'Critical').length,
      high: all.filter((a) => a.severity === 'High').length,
      medium: all.filter((a) => a.severity === 'Medium').length,
      low: all.filter((a) => a.severity === 'Low').length,
      active: all.filter((a) => a.status === 'Active').length,
      resolved: all.filter((a) => a.status === 'Resolved').length,
    };
  }, [state.alerts]);

  const filtered = useMemo(() => {
    return state.alerts.filter((a) => {
      const q = search.trim().toLowerCase();
      const matchQ =
        !q ||
        a.id.toLowerCase().includes(q) ||
        a.machineId.toLowerCase().includes(q) ||
        a.machineName.toLowerCase().includes(q) ||
        a.type.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q);
      const matchSev = severityFilter === 'all' || a.severity === severityFilter;
      const matchMach = machineFilter === 'all' || a.machineId === machineFilter;
      const matchStatus = statusFilter === 'all' || a.status === statusFilter;
      return matchQ && matchSev && matchMach && matchStatus;
    });
  }, [state.alerts, search, severityFilter, machineFilter, statusFilter]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alerts & Events Center"
        description="Centralized industrial alarm triage, acknowledgement workflow, and plant event timeline"
      />

      {/* Alert Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <StatTile label="Total Alerts" value={counts.total} />
        <StatTile label="Critical" value={counts.critical} tone="critical" />
        <StatTile label="High" value={counts.high} tone="warning" />
        <StatTile label="Medium" value={counts.medium} tone="warning" />
        <StatTile label="Low" value={counts.low} />
        <StatTile label="Active" value={counts.active} tone="critical" />
        <StatTile label="Resolved" value={counts.resolved} tone="success" />
      </div>

      {/* Filters */}
      <Panel>
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#8A96A3] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search alert ID, machine, type, or description..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-[#D9E0E7] rounded"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as 'all' | AlertSeverity)}
              className="px-2.5 py-2 text-xs bg-white border border-[#D9E0E7] rounded"
            >
              <option value="all">All Severities</option>
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
            <select
              value={machineFilter}
              onChange={(e) => setMachineFilter(e.target.value)}
              className="px-2.5 py-2 text-xs bg-white border border-[#D9E0E7] rounded"
            >
              <option value="all">All Machines</option>
              {state.machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id} — {m.name}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as 'all' | 'Active' | 'Acknowledged' | 'Resolved')
              }
              className="px-2.5 py-2 text-xs bg-white border border-[#D9E0E7] rounded"
            >
              <option value="all">All States</option>
              <option value="Active">Active</option>
              <option value="Acknowledged">Acknowledged</option>
              <option value="Resolved">Resolved</option>
            </select>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-2.5 py-2 text-xs bg-white border border-[#D9E0E7] rounded text-[#667586]"
              aria-label="Filter by date"
            />
          </div>
        </div>
      </Panel>

      {/* Alert Table */}
      <Panel title="Alert Queue" noPadding>
        {filtered.length === 0 ? (
          <EmptyState
            title="No alerts match current filters"
            description="Adjust severity, machine, or status filters to view historical alarms."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#D9E0E7] bg-[#F5F6F4] text-[11px] font-semibold text-[#667586]">
                  <th className="py-2.5 px-4">Alert ID</th>
                  <th className="py-2.5 px-4">Machine</th>
                  <th className="py-2.5 px-4">Alert Type</th>
                  <th className="py-2.5 px-4">Severity</th>
                  <th className="py-2.5 px-4">Description</th>
                  <th className="py-2.5 px-4">Timestamp</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAF0F6]">
                {filtered.map((a) => (
                  <tr key={a.id} className="hover:bg-[#F5F6F4]/70">
                    <td className="py-2.5 px-4 font-mono font-semibold text-[#172B4D]">{a.id}</td>
                    <td className="py-2.5 px-4">
                      <button
                        type="button"
                        onClick={() => onSelectMachine(a.machineId)}
                        className="font-mono font-semibold text-[#2563A6] hover:underline"
                      >
                        {a.machineId}
                      </button>
                      <div className="text-[11px] text-[#667586]">{a.machineName}</div>
                    </td>
                    <td className="py-2.5 px-4 font-medium text-[#172334]">{a.type}</td>
                    <td className="py-2.5 px-4">
                      <SeverityBadge severity={a.severity} />
                    </td>
                    <td className="py-2.5 px-4 text-[#667586] max-w-xs truncate">{a.description}</td>
                    <td className="py-2.5 px-4 font-mono text-[#667586]">{a.timestamp}</td>
                    <td className="py-2.5 px-4">
                      <span
                        className={`inline-flex px-2 py-0.5 text-xs font-medium border rounded ${
                          a.status === 'Active'
                            ? 'bg-[#C74747]/10 text-[#C74747] border-[#C74747]/30'
                            : a.status === 'Acknowledged'
                            ? 'bg-[#D99A25]/12 text-[#A6710E] border-[#D99A25]/35'
                            : 'bg-[#16836B]/10 text-[#16836B] border-[#16836B]/25'
                        }`}
                      >
                        {a.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        {a.status === 'Active' && (
                          <button
                            type="button"
                            onClick={() => onAcknowledgeAlert(a.id)}
                            className="px-2 py-1 text-[11px] font-medium border border-[#D9E0E7] rounded hover:bg-[#EAF0F6] text-[#172B4D]"
                          >
                            Acknowledge
                          </button>
                        )}
                        {a.status !== 'Resolved' && (
                          <button
                            type="button"
                            onClick={() => onResolveAlert(a.id)}
                            className="px-2 py-1 text-[11px] font-medium bg-[#16836B] text-white rounded hover:bg-[#126b57]"
                          >
                            Resolve
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setDetailAlert(a)}
                          className="p-1.5 text-[#667586] hover:text-[#172B4D] hover:bg-[#EAF0F6] rounded"
                          aria-label={`View ${a.id}`}
                        >
                          <Eye className="w-3.5 h-3.5" />
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

      {/* Event Timeline */}
      <Panel title="Machine Activity & Event Timeline" subtitle="Chronological audit trail across sensors, simulator, AI assistant, and maintenance">
        <div className="space-y-3">
          {state.events.slice(0, 14).map((evt) => (
            <div key={evt.id} className="flex items-start gap-3 pb-3 border-b border-[#EAF0F6] last:border-b-0 last:pb-0 text-xs">
              <div className="font-mono text-[11px] text-[#8A96A3] w-20 shrink-0 pt-0.5">
                {evt.timestamp}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-[#172B4D]">{evt.title}</span>
                  <span className="text-[11px] font-mono text-[#667586]">
                    {evt.machineId} · {evt.category}
                  </span>
                </div>
                <p className="text-[#667586] mt-0.5">{evt.description}</p>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <ModalDialog
        open={!!detailAlert}
        title={detailAlert ? `Alert ${detailAlert.id} Details` : 'Alert Details'}
        onClose={() => setDetailAlert(null)}
      >
        {detailAlert && (
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-mono font-semibold text-[#172B4D]">
                {detailAlert.machineId} · {detailAlert.machineName}
              </span>
              <SeverityBadge severity={detailAlert.severity} />
            </div>
            <div className="p-3 bg-[#F5F6F4] border border-[#D9E0E7] rounded">
              <div className="font-semibold text-[#172334]">{detailAlert.type}</div>
              <p className="text-[#667586] mt-1">{detailAlert.description}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[#667586]">
              <div>Status: <strong className="text-[#172334]">{detailAlert.status}</strong></div>
              <div>Logged: <strong className="font-mono text-[#172334]">{detailAlert.timestamp}</strong></div>
              {detailAlert.acknowledgedBy && (
                <div>Acknowledged by: <strong className="text-[#172334]">{detailAlert.acknowledgedBy}</strong></div>
              )}
              {detailAlert.resolvedAt && (
                <div>Resolved at: <strong className="font-mono text-[#172334]">{detailAlert.resolvedAt}</strong></div>
              )}
            </div>
          </div>
        )}
      </ModalDialog>
    </div>
  );
}

export function MaintenancePage({
  state,
  onCreateWorkOrder,
  onUpdateWorkOrder,
  onAddNote,
}: {
  state: PlatformState;
  onCreateWorkOrder: (payload: {
    machineId: string;
    issue: string;
    priority: WorkOrderPriority;
    assignedEngineer: string;
    dueDate?: string;
    source: 'Manual';
  }) => Promise<unknown>;
  onUpdateWorkOrder: (
    id: string,
    payload: { status?: WorkOrderStatus; assignedEngineer?: string }
  ) => Promise<void>;
  onAddNote: (id: string, text: string) => Promise<void>;
}) {
  const [statusFilter, setStatusFilter] = useState<'all' | WorkOrderStatus>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [newMachineId, setNewMachineId] = useState(state.machines[0]?.id || 'M-101');
  const [newIssue, setNewIssue] = useState('');
  const [newPriority, setNewPriority] = useState<WorkOrderPriority>('High');
  const [newEngineer, setNewEngineer] = useState('Arjun Deshmukh');
  const [newDue, setNewDue] = useState(new Date(Date.now() + 86400000).toISOString().slice(0, 10));

  const [selectedOrder, setSelectedOrder] = useState<WorkOrder | null>(null);
  const [noteInput, setNoteInput] = useState('');

  const counts = useMemo(() => {
    const all = state.workOrders;
    return {
      total: all.length,
      open: all.filter((w) => w.status === 'Open').length,
      assigned: all.filter((w) => w.status === 'Assigned').length,
      inProgress: all.filter((w) => w.status === 'In Progress').length,
      completed: all.filter((w) => w.status === 'Completed').length,
    };
  }, [state.workOrders]);

  const filtered = useMemo(
    () =>
      state.workOrders.filter((w) => statusFilter === 'all' || w.status === statusFilter),
    [state.workOrders, statusFilter]
  );

  // Sync modal with latest server state
  const liveSelectedOrder = selectedOrder
    ? state.workOrders.find((w) => w.id === selectedOrder.id) || selectedOrder
    : null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIssue.trim()) return;
    await onCreateWorkOrder({
      machineId: newMachineId,
      issue: newIssue.trim(),
      priority: newPriority,
      assignedEngineer: newEngineer,
      dueDate: newDue,
      source: 'Manual',
    });
    setNewIssue('');
    setCreateOpen(false);
  };

  const handleNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!liveSelectedOrder || !noteInput.trim()) return;
    await onAddNote(liveSelectedOrder.id, noteInput.trim());
    setNoteInput('');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Maintenance Management"
        description="Structured work order dispatch, engineer assignment, field notes, and completion tracking"
        actions={
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-[#172B4D] text-white rounded hover:bg-[#2563A6] whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Create Work Order
          </button>
        }
      />

      {/* Summary Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatTile label="Total Work Orders" value={counts.total} />
        <StatTile label="Open" value={counts.open} tone="warning" />
        <StatTile label="Assigned" value={counts.assigned} tone="accent" />
        <StatTile label="In Progress" value={counts.inProgress} tone="warning" />
        <StatTile label="Completed" value={counts.completed} tone="success" />
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-white border border-[#D9E0E7] rounded-md w-fit">
        {(['all', 'Open', 'Assigned', 'In Progress', 'Completed'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setStatusFilter(tab)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              statusFilter === tab
                ? 'bg-[#172B4D] text-white'
                : 'text-[#667586] hover:text-[#172334] hover:bg-[#EAF0F6]'
            }`}
          >
            {tab === 'all' ? 'All Work Orders' : tab}
          </button>
        ))}
      </div>

      {/* Work Orders Table */}
      <Panel noPadding>
        {filtered.length === 0 ? (
          <EmptyState
            title="No work orders in this state"
            description="Create a maintenance work order or approve one from the AI Operations Assistant."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#D9E0E7] bg-[#F5F6F4] text-[11px] font-semibold text-[#667586]">
                  <th className="py-2.5 px-4">Work Order ID</th>
                  <th className="py-2.5 px-4">Machine</th>
                  <th className="py-2.5 px-4">Issue</th>
                  <th className="py-2.5 px-4">Priority</th>
                  <th className="py-2.5 px-4">Assigned Engineer</th>
                  <th className="py-2.5 px-4">Created / Due</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAF0F6]">
                {filtered.map((wo) => (
                  <tr key={wo.id} className="hover:bg-[#F5F6F4]/70">
                    <td className="py-2.5 px-4">
                      <div className="font-mono font-semibold text-[#172B4D]">{wo.id}</div>
                      <div className="text-[10px] text-[#8A96A3]">{wo.source}</div>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-mono font-semibold text-[#172334]">{wo.machineId}</div>
                      <div className="text-[11px] text-[#667586]">{wo.machineName}</div>
                    </td>
                    <td className="py-2.5 px-4 text-[#172334] max-w-xs">{wo.issue}</td>
                    <td className="py-2.5 px-4">
                      <SeverityBadge severity={wo.priority} />
                    </td>
                    <td className="py-2.5 px-4">
                      <select
                        value={wo.assignedEngineer}
                        onChange={(e) =>
                          onUpdateWorkOrder(wo.id, { assignedEngineer: e.target.value })
                        }
                        className="px-2 py-1 text-xs bg-white border border-[#D9E0E7] rounded"
                        aria-label={`Assign engineer for ${wo.id}`}
                      >
                        <option value="Arjun Deshmukh">Arjun Deshmukh</option>
                        <option value="Priya Nair">Priya Nair</option>
                        <option value="Rohan Kulkarni">Rohan Kulkarni</option>
                      </select>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[11px] text-[#667586]">
                      <div>{wo.createdDate}</div>
                      <div>Due {wo.dueDate}</div>
                    </td>
                    <td className="py-2.5 px-4">
                      <WorkOrderStatusBadge status={wo.status} />
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {wo.status !== 'Completed' && (
                          <>
                            <select
                              value={wo.status}
                              onChange={(e) =>
                                onUpdateWorkOrder(wo.id, {
                                  status: e.target.value as WorkOrderStatus,
                                })
                              }
                              className="px-2 py-1 text-[11px] bg-white border border-[#D9E0E7] rounded"
                              aria-label={`Update status for ${wo.id}`}
                            >
                              <option value="Open">Open</option>
                              <option value="Assigned">Assigned</option>
                              <option value="In Progress">In Progress</option>
                              <option value="Completed">Completed</option>
                            </select>
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateWorkOrder(wo.id, { status: 'Completed' })
                              }
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-[#16836B] text-white rounded hover:bg-[#126b57]"
                              title="Complete Work Order"
                            >
                              <Check className="w-3 h-3" />
                              Complete
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => setSelectedOrder(wo)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium border border-[#D9E0E7] rounded hover:bg-[#EAF0F6] text-[#172B4D]"
                        >
                          <MessageSquarePlus className="w-3 h-3" />
                          Notes ({wo.notes.length})
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

      {/* Create Work Order Modal */}
      <ModalDialog
        open={createOpen}
        title="Create Maintenance Work Order"
        onClose={() => setCreateOpen(false)}
      >
        <form onSubmit={handleCreate} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-[#172334] mb-1">Machine</label>
              <select
                value={newMachineId}
                onChange={(e) => setNewMachineId(e.target.value)}
                className="w-full px-3 py-2 border border-[#D9E0E7] rounded bg-white"
              >
                {state.machines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id} — {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-[#172334] mb-1">Priority</label>
              <select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as WorkOrderPriority)}
                className="w-full px-3 py-2 border border-[#D9E0E7] rounded bg-white"
              >
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-[#172334] mb-1">Assigned Engineer</label>
              <select
                value={newEngineer}
                onChange={(e) => setNewEngineer(e.target.value)}
                className="w-full px-3 py-2 border border-[#D9E0E7] rounded bg-white"
              >
                <option value="Arjun Deshmukh">Arjun Deshmukh</option>
                <option value="Priya Nair">Priya Nair</option>
                <option value="Rohan Kulkarni">Rohan Kulkarni</option>
              </select>
            </div>
            <div>
              <label className="block font-medium text-[#172334] mb-1">Due Date</label>
              <input
                type="date"
                value={newDue}
                onChange={(e) => setNewDue(e.target.value)}
                className="w-full px-3 py-2 border border-[#D9E0E7] rounded"
              />
            </div>
          </div>
          <div>
            <label className="block font-medium text-[#172334] mb-1">Issue / Task Scope</label>
            <textarea
              rows={3}
              value={newIssue}
              onChange={(e) => setNewIssue(e.target.value)}
              placeholder="Describe the maintenance inspection or corrective action..."
              className="w-full px-3 py-2 border border-[#D9E0E7] rounded"
              required
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="px-3.5 py-2 border border-[#D9E0E7] rounded text-[#667586]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-[#172B4D] text-white font-medium rounded hover:bg-[#2563A6]"
            >
              Create Work Order
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* Work Order Notes & History Modal */}
      <ModalDialog
        open={!!liveSelectedOrder}
        title={liveSelectedOrder ? `${liveSelectedOrder.id} — Maintenance Log` : 'Maintenance Log'}
        subtitle={
          liveSelectedOrder
            ? `${liveSelectedOrder.machineId} ${liveSelectedOrder.machineName}`
            : undefined
        }
        onClose={() => setSelectedOrder(null)}
      >
        {liveSelectedOrder && (
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-[#F5F6F4] border border-[#D9E0E7] rounded space-y-1">
              <div className="flex items-center justify-between">
                <WorkOrderStatusBadge status={liveSelectedOrder.status} />
                <span className="font-mono text-[#667586]">
                  Assignee: {liveSelectedOrder.assignedEngineer}
                </span>
              </div>
              <p className="text-[#172334] font-medium pt-1">{liveSelectedOrder.issue}</p>
            </div>

            <div className="space-y-2">
              <div className="font-semibold text-[#172B4D]">Engineer Notes</div>
              {liveSelectedOrder.notes.length === 0 ? (
                <p className="text-[#8A96A3]">No maintenance notes recorded yet.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {liveSelectedOrder.notes.map((n) => (
                    <div key={n.id} className="p-2.5 border border-[#D9E0E7] rounded">
                      <div className="flex justify-between text-[11px] text-[#667586]">
                        <span className="font-semibold text-[#172B4D]">{n.author}</span>
                        <span className="font-mono">{n.timestamp}</span>
                      </div>
                      <p className="text-[#172334] mt-1">{n.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <form onSubmit={handleNoteSubmit} className="flex gap-2 pt-2 border-t border-[#D9E0E7]">
              <input
                type="text"
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder="Add field inspection note..."
                className="flex-1 px-3 py-2 border border-[#D9E0E7] rounded"
              />
              <button
                type="submit"
                className="px-3.5 py-2 bg-[#172B4D] text-white font-medium rounded hover:bg-[#2563A6]"
              >
                Add Note
              </button>
            </form>

            {liveSelectedOrder.status !== 'Completed' && (
              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={async () => {
                    await onUpdateWorkOrder(liveSelectedOrder.id, { status: 'Completed' });
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#16836B] text-white font-medium rounded hover:bg-[#126b57]"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Mark Work Order Completed
                </button>
              </div>
            )}
          </div>
        )}
      </ModalDialog>
    </div>
  );
}
