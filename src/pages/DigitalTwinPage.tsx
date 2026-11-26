import React, { useState } from 'react';
import { AlertTriangle, Bot, ExternalLink, Sliders } from 'lucide-react';
import type { PageId, PlatformState, SimulationScenario } from '../types';
import {
  PageHeader,
  Panel,
  RiskBadge,
  StatusBadge,
} from '../components/ui/DesignSystem';
import { FactoryTwin3D } from '../components/twin/FactoryTwin3D';

export function DigitalTwinPage({
  state,
  selectedMachineId,
  onSelectMachineId,
  onViewMachineDetails,
  onOpenAssistantForMachine,
  onApplyScenario,
  onNavigate,
}: {
  state: PlatformState;
  selectedMachineId: string;
  onSelectMachineId: (id: string) => void;
  onViewMachineDetails: (id: string) => void;
  onOpenAssistantForMachine: (id: string) => void;
  onApplyScenario: (machineId: string, scenario: SimulationScenario) => Promise<void>;
  onNavigate: (page: PageId) => void;
}) {
  const [applying, setApplying] = useState(false);

  const selectedMachine =
    state.machines.find((m) => m.id === selectedMachineId) || state.machines[0];
  const machineAlerts = state.alerts.filter(
    (a) => a.machineId === selectedMachine?.id && a.status !== 'Resolved'
  );

  const quickScenario = async (scenario: SimulationScenario) => {
    if (!selectedMachine) return;
    setApplying(true);
    try {
      await onApplyScenario(selectedMachine.id, scenario);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Interactive 3D Digital Twin"
        description="Real-time spatial representation synchronized directly with backend machine telemetry and anomaly detection"
        actions={
          <button
            type="button"
            onClick={() => onNavigate('simulator')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-white border border-[#D9E0E7] text-[#172334] rounded hover:bg-[#EAF0F6] whitespace-nowrap shrink-0"
          >
            <Sliders className="w-3.5 h-3.5 text-[#D97736]" />
            Open Full Simulator
          </button>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        {/* Large 3D Visualization Viewport */}
        <div className="xl:col-span-8 min-h-[520px] flex flex-col">
          <FactoryTwin3D
            machines={state.machines}
            selectedMachineId={selectedMachine?.id || 'M-101'}
            onSelectMachine={onSelectMachineId}
          />
        </div>

        {/* Compact Selected Machine Information Panel */}
        <div className="xl:col-span-4 flex flex-col gap-4">
          {selectedMachine && (
            <Panel
              title={`${selectedMachine.id} — ${selectedMachine.name}`}
              subtitle={`${selectedMachine.category} · ${selectedMachine.area}`}
              action={<StatusBadge status={selectedMachine.status} />}
              className="flex-1"
            >
              <div className="space-y-4">
                {/* Key Readings */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-2.5 bg-[#F5F6F4] border border-[#D9E0E7] rounded">
                    <div className="text-[11px] text-[#667586]">Health Score</div>
                    <div className="text-lg font-mono tabular-nums font-semibold text-[#172B4D]">
                      {selectedMachine.healthScore}%
                    </div>
                  </div>
                  <div className="p-2.5 bg-[#F5F6F4] border border-[#D9E0E7] rounded">
                    <div className="text-[11px] text-[#667586]">Temperature</div>
                    <div className="text-lg font-mono tabular-nums font-semibold text-[#172B4D]">
                      {selectedMachine.temperature.toFixed(1)} °C
                    </div>
                  </div>
                  <div className="p-2.5 bg-[#F5F6F4] border border-[#D9E0E7] rounded">
                    <div className="text-[11px] text-[#667586]">Vibration</div>
                    <div
                      className={`text-lg font-mono tabular-nums font-semibold ${
                        selectedMachine.vibration > selectedMachine.thresholds.maxVibration
                          ? 'text-[#C74747]'
                          : 'text-[#172B4D]'
                      }`}
                    >
                      {selectedMachine.vibration.toFixed(2)} mm/s
                    </div>
                  </div>
                  <div className="p-2.5 bg-[#F5F6F4] border border-[#D9E0E7] rounded">
                    <div className="text-[11px] text-[#667586]">Pressure</div>
                    <div className="text-lg font-mono tabular-nums font-semibold text-[#172B4D]">
                      {selectedMachine.pressure.toFixed(1)} bar
                    </div>
                  </div>
                </div>

                {/* Risk & Reason */}
                <div className="pt-3 border-t border-[#D9E0E7] space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[#667586]">Predictive Risk</span>
                    <RiskBadge risk={selectedMachine.riskCategory} />
                  </div>
                  <p className="text-[#667586] leading-relaxed">
                    {selectedMachine.flaggedReason}
                  </p>
                </div>

                {/* Active Alerts */}
                <div className="pt-3 border-t border-[#D9E0E7]">
                  <div className="text-xs font-semibold text-[#172B4D] mb-2">
                    Active Alerts ({machineAlerts.length})
                  </div>
                  {machineAlerts.length === 0 ? (
                    <p className="text-xs text-[#8A96A3]">
                      No unresolved alerts on {selectedMachine.id}.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {machineAlerts.map((a) => (
                        <div
                          key={a.id}
                          className="p-2.5 border border-[#C74747]/30 bg-[#C74747]/5 rounded text-xs"
                        >
                          <div className="flex items-center gap-1.5 font-semibold text-[#C74747]">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>{a.type}</span>
                          </div>
                          <div className="text-[#667586] mt-0.5">{a.description}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Live Twin Scenario Test */}
                <div className="pt-3 border-t border-[#D9E0E7]">
                  <div className="text-xs font-semibold text-[#172B4D] mb-2">
                    Test Live Twin Response ({selectedMachine.id})
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={applying}
                      onClick={() => quickScenario('Excessive Vibration')}
                      className="px-2.5 py-1.5 text-xs font-medium border border-[#D97736]/40 text-[#B85B1C] bg-[#D97736]/8 hover:bg-[#D97736]/15 rounded"
                    >
                      Trigger Vibration Fault
                    </button>
                    <button
                      type="button"
                      disabled={applying}
                      onClick={() => quickScenario('Recovery After Maintenance')}
                      className="px-2.5 py-1.5 text-xs font-medium border border-[#16836B]/35 text-[#16836B] bg-[#16836B]/8 hover:bg-[#16836B]/15 rounded"
                    >
                      Recover Normal
                    </button>
                  </div>
                </div>

                {/* Navigation Actions */}
                <div className="pt-3 border-t border-[#D9E0E7] flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => onViewMachineDetails(selectedMachine.id)}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#172B4D] text-white rounded hover:bg-[#2563A6]"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    View Full Machine Details
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenAssistantForMachine(selectedMachine.id)}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-white border border-[#D9E0E7] text-[#172334] rounded hover:bg-[#EAF0F6]"
                  >
                    <Bot className="w-3.5 h-3.5 text-[#2563A6]" />
                    Investigate {selectedMachine.id} in AI Assistant
                  </button>
                </div>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
