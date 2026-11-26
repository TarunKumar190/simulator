import React from 'react';
import { MapPin, Building2, Layers, ArrowRight } from 'lucide-react';
import type { PageId, PlatformState } from '../types';
import { PageHeader, Panel, StatTile, StatusBadge } from '../components/ui/DesignSystem';

export function FactoryOverviewPage({
  state,
  onNavigate,
  onSelectMachine,
}: {
  state: PlatformState;
  onNavigate: (page: PageId) => void;
  onSelectMachine: (machineId: string) => void;
}) {
  const areas = Array.from(new Set(state.machines.map((m) => m.area)));
  const runningCount = state.machines.filter((m) => m.status === 'running').length;
  const criticalCount = state.machines.filter((m) => m.status === 'critical').length;
  const warningCount = state.machines.filter((m) => m.status === 'warning').length;

  const factoryStatus =
    criticalCount > 0
      ? 'Attention Required — Critical Asset Fault'
      : warningCount > 0
      ? 'Operational — Advisory Warnings Active'
      : 'Nominal — All Production Bays Healthy';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Factory Overview"
        description="Production bays, physical zone hierarchy, and live operational status"
        actions={
          <button
            type="button"
            onClick={() => onNavigate('digital-twin')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-[#172B4D] text-white rounded hover:bg-[#2563A6] whitespace-nowrap shrink-0"
          >
            <span>Open 3D Factory Twin</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        }
      />

      {/* Plant Identity Banner */}
      <Panel>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-[#172B4D] font-semibold text-base">
              <Building2 className="w-4 h-4 text-[#2563A6]" />
              <span>{state.factory.name}</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-[#667586]">
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {state.factory.location}
              </span>
              <span aria-hidden="true">·</span>
              <span>{state.factory.shift}</span>
              <span aria-hidden="true">·</span>
              <span>Target OEE: {state.factory.targetOee}% (Demo)</span>
            </div>
          </div>
          <div className="px-3.5 py-2 rounded border border-[#D9E0E7] bg-[#F5F6F4] text-xs font-medium text-[#172B4D]">
            Plant Status: <span className="font-semibold">{factoryStatus}</span>
          </div>
        </div>
      </Panel>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Production Areas" value={String(areas.length).padStart(2, '0')} subtext="Active floor zones" />
        <StatTile label="Total Machines" value={String(state.machines.length).padStart(2, '0')} subtext="Registered assets" />
        <StatTile label="Running Machines" value={String(runningCount).padStart(2, '0')} tone="success" subtext="Operating normally" />
        <StatTile label="Critical Machines" value={String(criticalCount).padStart(2, '0')} tone="critical" subtext="Faults active" />
      </div>

      {/* Area-wise Machine Distribution */}
      <Panel
        title="Area-Wise Machine Distribution"
        subtitle="Logical grouping of industrial machines across production bays"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {areas.map((area) => {
            const areaMachines = state.machines.filter((m) => m.area === area);
            return (
              <div
                key={area}
                className="border border-[#D9E0E7] rounded-md p-4 bg-[#F5F6F4]/50"
              >
                <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-[#D9E0E7]">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#172B4D]">
                    <Layers className="w-4 h-4 text-[#2563A6]" />
                    <span>{area}</span>
                  </div>
                  <span className="text-xs font-mono text-[#667586]">
                    {areaMachines.length} {areaMachines.length === 1 ? 'asset' : 'assets'}
                  </span>
                </div>
                <div className="space-y-2.5">
                  {areaMachines.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between gap-3 bg-white border border-[#D9E0E7] rounded px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => onSelectMachine(m.id)}
                          className="text-xs font-semibold text-[#172B4D] hover:text-[#2563A6] truncate block text-left"
                        >
                          {m.id} · {m.name}
                        </button>
                        <div className="text-[11px] font-mono tabular-nums text-[#667586] mt-0.5">
                          Health {m.healthScore}% · {m.temperature}°C · {m.vibration} mm/s
                        </div>
                      </div>
                      <StatusBadge status={m.status} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Recent Factory Activity */}
      <Panel
        title="Recent Factory Activity"
        subtitle="Chronological log of plant-wide telemetry, simulator, and maintenance events"
        noPadding
      >
        <div className="divide-y divide-[#EAF0F6]">
          {state.events.slice(0, 8).map((evt) => (
            <div key={evt.id} className="px-4 py-3 flex items-start justify-between gap-4 text-xs">
              <div className="min-w-0">
                <div className="font-medium text-[#172334]">{evt.title}</div>
                <div className="text-[#667586] mt-0.5">{evt.description}</div>
              </div>
              <div className="text-right shrink-0 font-mono text-[11px] text-[#8A96A3]">
                <div>{evt.timestamp}</div>
                <div>{evt.machineId}</div>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
