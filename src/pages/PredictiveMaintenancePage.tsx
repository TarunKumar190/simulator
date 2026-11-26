import React from 'react';
import { Bot, Cpu, HelpCircle, Wrench } from 'lucide-react';
import type { PageId, PlatformState } from '../types';
import {
  PageHeader,
  Panel,
  RiskBadge,
  StatTile,
  StatusBadge,
} from '../components/ui/DesignSystem';
import { BarMetricList, HealthArcGauge, TelemetryLineChart } from '../components/ui/Charts';

export function PredictiveMaintenancePage({
  state,
  selectedMachineId,
  onSelectMachineId,
  onNavigate,
  onOpenAssistantForMachine,
  onCreateWorkOrder,
}: {
  state: PlatformState;
  selectedMachineId: string;
  onSelectMachineId: (id: string) => void;
  onNavigate: (page: PageId) => void;
  onOpenAssistantForMachine: (id: string) => void;
  onCreateWorkOrder: (payload: {
    machineId: string;
    issue: string;
    priority: 'Critical' | 'High' | 'Medium' | 'Low';
    assignedEngineer: string;
    source: 'Predictive Alert';
  }) => Promise<void>;
}) {
  const machine =
    state.machines.find((m) => m.id === selectedMachineId) || state.machines[0];
  if (!machine) return null;

  const labels = machine.sensorHistory.map((p) => p.timestamp);
  const recommendedAction =
    machine.abnormalParameters.includes('Vibration')
      ? 'Inspect spindle bearings, check tool-holder runout, and verify mounting torque.'
      : machine.abnormalParameters.includes('Temperature')
      ? 'Inspect cooling circuit airflow, clean heat-exchanger fins, and verify coolant flow.'
      : machine.abnormalParameters.includes('Pressure')
      ? 'Inspect hydraulic relief valve, manifold seals, and pressure transducer calibration.'
      : machine.status === 'offline'
      ? 'Inspect main breaker interlocks, emergency stop loop, and motor drive controller.'
      : 'Continue routine condition monitoring; no corrective intervention required.';

  const handleDispatchOrder = async () => {
    await onCreateWorkOrder({
      machineId: machine.id,
      issue: `${machine.flaggedReason} Recommended: ${recommendedAction}`,
      priority: machine.status === 'critical' || machine.status === 'offline' ? 'Critical' : 'High',
      assignedEngineer: machine.modelType === 'compressor' ? 'Priya Nair' : 'Arjun Deshmukh',
      source: 'Predictive Alert',
    });
    onNavigate('maintenance');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Predictive Maintenance & Anomaly Detection"
        description="Explainable threshold and statistical anomaly scoring across live machine telemetry"
        actions={
          <div className="flex items-center gap-2">
            <label htmlFor="pm-machine" className="text-xs font-medium text-[#667586]">
              Target Machine:
            </label>
            <select
              id="pm-machine"
              value={machine.id}
              onChange={(e) => onSelectMachineId(e.target.value)}
              className="px-3 py-1.5 text-xs bg-white border border-[#D9E0E7] rounded text-[#172334] font-medium"
            >
              {state.machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id} — {m.name} ({m.riskCategory})
                </option>
              ))}
            </select>
          </div>
        }
      />

      {/* Top Health, Anomaly Status, Risk & Model Info */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Panel className="lg:col-span-3 flex flex-col items-center justify-center">
          <HealthArcGauge score={machine.healthScore} label="Overall Machine Health" />
          <div className="mt-3 flex items-center gap-2">
            <StatusBadge status={machine.status} />
            <RiskBadge risk={machine.riskCategory} />
          </div>
        </Panel>

        <div className="lg:col-span-9 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatTile
            label="Anomaly Score"
            value={machine.anomalyScore.toFixed(2)}
            subtext={`Threshold: ${state.aiSettings.anomalyThreshold}`}
            tone={
              machine.anomalyScore >= 0.75
                ? 'critical'
                : machine.anomalyScore >= 0.45
                ? 'warning'
                : 'success'
            }
          />
          <StatTile
            label="Temperature"
            value={`${machine.temperature.toFixed(1)} °C`}
            subtext={`Limit ${machine.thresholds.maxTemp} °C`}
            tone={machine.temperature > machine.thresholds.maxTemp ? 'critical' : 'default'}
          />
          <StatTile
            label="Vibration"
            value={`${machine.vibration.toFixed(2)} mm/s`}
            subtext={`Limit ${machine.thresholds.maxVibration} mm/s`}
            tone={machine.vibration > machine.thresholds.maxVibration ? 'critical' : 'default'}
          />
          <StatTile
            label="Pressure"
            value={`${machine.pressure.toFixed(1)} bar`}
            subtext={`Max ${machine.thresholds.maxPressure} bar`}
            tone={machine.pressure > machine.thresholds.maxPressure ? 'warning' : 'default'}
          />
          <StatTile
            label="RPM / Load"
            value={`${machine.rpm}`}
            subtext={`Load ${machine.load.toFixed(1)}%`}
          />
        </div>
      </div>

      {/* Explainability Callout: Why was this machine flagged? */}
      <Panel
        title="Why was this machine flagged?"
        subtitle="Transparent rule + statistical deviation attribution (anomaly scores indicate deviation magnitude, not guaranteed failure probability)"
        action={<RiskBadge risk={machine.riskCategory} />}
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-7 space-y-3">
            <div className="p-3.5 bg-[#F5F6F4] border border-[#D9E0E7] rounded text-xs space-y-2">
              <div className="flex items-start gap-2">
                <HelpCircle className="w-4 h-4 text-[#2563A6] shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-[#172B4D]">
                    Diagnostic Explanation for {machine.id} ({machine.name})
                  </div>
                  <p className="text-[#172334] mt-1 leading-relaxed">{machine.flaggedReason}</p>
                </div>
              </div>
              <div className="pt-2 border-t border-[#D9E0E7] flex flex-wrap gap-4 text-[11px] text-[#667586]">
                <span>
                  Abnormal Parameters:{' '}
                  <strong className="text-[#172334]">
                    {machine.abnormalParameters.length > 0
                      ? machine.abnormalParameters.join(', ')
                      : 'None'}
                  </strong>
                </span>
                <span>
                  Active Profile: <strong className="text-[#172334]">{machine.scenario}</strong>
                </span>
              </div>
            </div>

            <div className="p-3.5 bg-white border border-[#D9E0E7] rounded text-xs space-y-2">
              <div className="font-semibold text-[#172B4D]">Recommended Engineering Actions</div>
              <p className="text-[#667586]">{recommendedAction}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleDispatchOrder}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#172B4D] text-white rounded hover:bg-[#2563A6]"
                >
                  <Wrench className="w-3.5 h-3.5" />
                  Create Maintenance Work Order
                </button>
                <button
                  type="button"
                  onClick={() => onOpenAssistantForMachine(machine.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-[#D9E0E7] text-[#172334] rounded hover:bg-[#EAF0F6]"
                >
                  <Bot className="w-3.5 h-3.5 text-[#2563A6]" />
                  Ask AI Operations Assistant
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 space-y-4">
            <div className="p-3.5 border border-[#D9E0E7] rounded">
              <div className="text-xs font-semibold text-[#172B4D] mb-3">
                Parameter Utilization vs Configured Limits
              </div>
              <BarMetricList
                items={[
                  {
                    label: 'Temperature',
                    value: Number(((machine.temperature / machine.thresholds.maxTemp) * 100).toFixed(0)),
                    color: machine.temperature > machine.thresholds.maxTemp ? '#C74747' : '#16836B',
                  },
                  {
                    label: 'Vibration',
                    value: Number(((machine.vibration / machine.thresholds.maxVibration) * 100).toFixed(0)),
                    color: machine.vibration > machine.thresholds.maxVibration ? '#C74747' : '#2563A6',
                  },
                  {
                    label: 'Pressure',
                    value: Number(((machine.pressure / machine.thresholds.maxPressure) * 100).toFixed(0)),
                    color: machine.pressure > machine.thresholds.maxPressure ? '#D99A25' : '#16836B',
                  },
                  {
                    label: 'RPM',
                    value: Number(((machine.rpm / machine.thresholds.maxRpm) * 100).toFixed(0)),
                    color: '#2563A6',
                  },
                  {
                    label: 'Load',
                    value: Number(machine.load.toFixed(0)),
                    color: machine.load > machine.thresholds.maxLoad ? '#C74747' : '#172B4D',
                  },
                ]}
              />
            </div>

            <div className="p-3.5 bg-[#EAF0F6]/60 border border-[#D9E0E7] rounded text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 font-semibold text-[#172B4D]">
                <Cpu className="w-3.5 h-3.5 text-[#2563A6]" />
                <span>Predictive Model Information</span>
              </div>
              <div className="text-[#667586] space-y-0.5 text-[11px]">
                <div>Pipeline: Multi-Parameter Residual &amp; Threshold Evaluator</div>
                <div>Alert Trigger Cutoff: Anomaly Index &ge; {state.aiSettings.anomalyThreshold}</div>
                <div>
                  Note: Anomaly index quantifies sensor deviation from baseline operating bands and
                  does not represent a statistical failure probability.
                </div>
              </div>
            </div>
          </div>
        </div>
      </Panel>

      {/* Sensor History Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Vibration & Anomaly Score Trajectory">
          <TelemetryLineChart
            labels={labels}
            series={[
              {
                key: 'vib',
                label: 'Vibration (mm/s)',
                color: '#2563A6',
                data: machine.sensorHistory.map((p) => p.vibration),
              },
              {
                key: 'anm',
                label: 'Anomaly ×10',
                color: '#C74747',
                data: machine.sensorHistory.map((p) => Number((p.anomalyScore * 10).toFixed(1))),
              },
            ]}
            threshold={machine.thresholds.maxVibration}
            thresholdLabel={`Vib Limit ${machine.thresholds.maxVibration} mm/s`}
          />
        </Panel>

        <Panel title="Temperature, Pressure & Load History">
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
              {
                key: 'press',
                label: 'Pressure (bar)',
                color: '#16836B',
                data: machine.sensorHistory.map((p) => p.pressure),
              },
            ]}
          />
        </Panel>
      </div>

      {/* Recent Anomalies Table */}
      <Panel title={`Recent Anomalies — ${machine.id}`} noPadding>
        {machine.anomalyHistory.length === 0 ? (
          <div className="p-6 text-center text-xs text-[#667586]">
            No anomaly events recorded for {machine.id} in the current window.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#D9E0E7] bg-[#F5F6F4] text-[11px] font-semibold text-[#667586]">
                  <th className="py-2.5 px-4">Anomaly ID</th>
                  <th className="py-2.5 px-4">Timestamp</th>
                  <th className="py-2.5 px-4">Parameter</th>
                  <th className="py-2.5 px-4">Observed Value</th>
                  <th className="py-2.5 px-4 text-right">Score</th>
                  <th className="py-2.5 px-4">Risk Category</th>
                  <th className="py-2.5 px-4">Explanation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAF0F6]">
                {machine.anomalyHistory.map((a) => (
                  <tr key={a.id}>
                    <td className="py-2.5 px-4 font-mono font-semibold text-[#172B4D]">{a.id}</td>
                    <td className="py-2.5 px-4 font-mono text-[#667586]">{a.timestamp}</td>
                    <td className="py-2.5 px-4 font-medium text-[#172334]">{a.parameter}</td>
                    <td className="py-2.5 px-4 font-mono text-[#172334]">{a.value}</td>
                    <td className="py-2.5 px-4 text-right font-mono">{a.anomalyScore.toFixed(2)}</td>
                    <td className="py-2.5 px-4">
                      <RiskBadge risk={a.riskCategory} />
                    </td>
                    <td className="py-2.5 px-4 text-[#667586]">{a.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
