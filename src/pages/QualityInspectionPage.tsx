import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Image as ImageIcon,
  Loader2,
  ScanSearch,
  Upload,
} from 'lucide-react';
import type { InspectionRecord, PlatformState } from '../types';
import { PageHeader, Panel } from '../components/ui/DesignSystem';

const SAMPLE_PARTS = [
  {
    id: 'sample-nominal',
    partName: 'Aerospace Aluminum Bracket #BR-410',
    machineId: 'M-101',
    path: '/src/assets/images/inspect_sample_nominal_1795722560190.jpg',
    caption: 'CNC Milled Nominal Sample',
  },
  {
    id: 'sample-defect',
    partName: 'Bearing Housing Flange #BH-F42',
    machineId: 'M-104',
    path: '/src/assets/images/inspect_sample_defect_1795722561212.jpg',
    caption: 'Cracked / Burred Flange Sample',
  },
  {
    id: 'sample-weld',
    partName: 'Hydraulic Manifold Plate #H-MANI-01',
    machineId: 'M-105',
    path: '/src/assets/images/inspect_sample_weld_1795722560981.jpg',
    caption: 'Weld Seam Pitting Sample',
  },
];

type InspectionUIState =
  | 'not-uploaded'
  | 'uploaded'
  | 'processing'
  | 'defect-detected'
  | 'no-defect'
  | 'model-unavailable';

export function QualityInspectionPage({
  state,
  onInspectComplete,
}: {
  state: PlatformState;
  onInspectComplete: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedMachineId, setSelectedMachineId] = useState(state.machines[0]?.id || 'M-101');
  const [partName, setPartName] = useState('Aerospace Aluminum Bracket #BR-410');
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [uploadedBase64, setUploadedBase64] = useState<string>('');
  const [samplePath, setSamplePath] = useState<string>('');
  const [uiState, setUiState] = useState<InspectionUIState>('not-uploaded');
  const [activeResult, setActiveResult] = useState<InspectionRecord | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [dragActive, setDragActive] = useState(false);

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please select a valid image file (PNG, JPG, WEBP).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      setPreviewUrl(dataUrl);
      setUploadedBase64(dataUrl);
      setSamplePath('');
      setPartName(file.name.replace(/\.[^.]+$/, ''));
      setActiveResult(null);
      setErrorMessage('');
      setUiState('uploaded');
    };
    reader.readAsDataURL(file);
  };

  const selectSample = (sample: (typeof SAMPLE_PARTS)[number]) => {
    setPreviewUrl(sample.path);
    setSamplePath(sample.path);
    setUploadedBase64('');
    setPartName(sample.partName);
    setSelectedMachineId(sample.machineId);
    setActiveResult(null);
    setErrorMessage('');
    setUiState('uploaded');
  };

  const runInspection = async () => {
    if (!previewUrl) return;
    setUiState('processing');
    setErrorMessage('');

    try {
      const res = await fetch('/api/quality/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machineId: selectedMachineId,
          partName,
          imageBase64: uploadedBase64 || undefined,
          sampleImagePath: samplePath || undefined,
          displayImageUrl: previewUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || 'Vision inspection model unavailable.');
        setUiState('model-unavailable');
        return;
      }
      const record = data as InspectionRecord;
      setActiveResult(record);
      setUiState(record.status === 'Defect Detected' ? 'defect-detected' : 'no-defect');
      onInspectComplete();
    } catch {
      setErrorMessage('Unable to communicate with the vision inspection backend.');
      setUiState('model-unavailable');
    }
  };

  const downloadReport = (record: InspectionRecord) => {
    const reportText = [
      'FORGETWIN AUTOMATED QUALITY INSPECTION REPORT',
      '=============================================',
      `Inspection ID : ${record.id}`,
      `Timestamp     : ${record.timestamp}`,
      `Machine ID    : ${record.machineId}`,
      `Part / Batch  : ${record.partName}`,
      `Result        : ${record.status}`,
      `Defect Class  : ${record.defectCategory}`,
      `Confidence    : ${record.confidence}%`,
      '',
      'Summary:',
      record.summary,
      '',
      'Recommended Action:',
      record.recommendedAction,
    ].join('\n');

    const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${record.id}_quality_report.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const stateLabel: Record<InspectionUIState, { label: string; color: string }> = {
    'not-uploaded': { label: 'Awaiting Image Upload', color: 'text-[#667586] bg-[#EAF0F6] border-[#D9E0E7]' },
    uploaded: { label: 'Image Ready for Inspection', color: 'text-[#2563A6] bg-[#2563A6]/10 border-[#2563A6]/30' },
    processing: { label: 'Analyzing Surface Features...', color: 'text-[#D99A25] bg-[#D99A25]/12 border-[#D99A25]/35' },
    'defect-detected': { label: 'Defect Detected', color: 'text-[#C74747] bg-[#C74747]/10 border-[#C74747]/30' },
    'no-defect': { label: 'No Defect Detected', color: 'text-[#16836B] bg-[#16836B]/10 border-[#16836B]/25' },
    'model-unavailable': { label: 'Vision Model Unavailable', color: 'text-[#C74747] bg-[#C74747]/10 border-[#C74747]/30' },
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Computer Vision Quality Inspection"
        description="Automated optical surface defect detection, localization bounding boxes, and inspection traceability"
        actions={
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded ${stateLabel[uiState].color}`}
          >
            {uiState === 'processing' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {uiState === 'defect-detected' && <AlertCircle className="w-3.5 h-3.5" />}
            {uiState === 'no-defect' && <CheckCircle2 className="w-3.5 h-3.5" />}
            <span>{stateLabel[uiState].label}</span>
          </span>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Upload, Samples, Preview + Overlay */}
        <Panel
          title="Optical Inspection Station"
          subtitle="Upload a component image or select a calibrated test sample"
          className="lg:col-span-7"
        >
          <div className="space-y-4">
            {/* Configuration inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#172334] mb-1">
                  Source Machine
                </label>
                <select
                  value={selectedMachineId}
                  onChange={(e) => setSelectedMachineId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-[#D9E0E7] rounded"
                >
                  {state.machines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id} — {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#172334] mb-1">
                  Part / Batch Identifier
                </label>
                <input
                  type="text"
                  value={partName}
                  onChange={(e) => setPartName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-[#D9E0E7] rounded"
                />
              </div>
            </div>

            {/* Drag and Drop Area */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-md p-4 text-center cursor-pointer transition-colors ${
                dragActive
                  ? 'border-[#2563A6] bg-[#EAF0F6]'
                  : 'border-[#D9E0E7] bg-[#F5F6F4]/60 hover:border-[#2563A6]/60'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) handleFile(e.target.files[0]);
                }}
              />
              <div className="flex flex-col items-center gap-1.5 text-xs text-[#667586]">
                <Upload className="w-5 h-5 text-[#2563A6]" />
                <span className="font-medium text-[#172334]">
                  Drag &amp; drop component photograph or click to browse
                </span>
                <span className="text-[11px] text-[#8A96A3]">
                  Supports PNG, JPG, WEBP · Calibrated top-down inspection images recommended
                </span>
              </div>
            </div>

            {/* Calibrated Sample Strip */}
            <div>
              <div className="text-xs font-medium text-[#667586] mb-2">
                Or select a calibrated factory test sample:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {SAMPLE_PARTS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => selectSample(s)}
                    className={`flex items-center gap-2.5 p-2 text-left border rounded transition-colors ${
                      samplePath === s.path
                        ? 'border-[#2563A6] bg-[#EAF0F6]/70'
                        : 'border-[#D9E0E7] bg-white hover:bg-[#F5F6F4]'
                    }`}
                  >
                    <img
                      src={s.path}
                      alt={s.caption}
                      className="w-11 h-11 rounded object-cover shrink-0 border border-[#D9E0E7]"
                      referrerPolicy="no-referrer"
                    />
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-[#172B4D] truncate">
                        {s.caption}
                      </div>
                      <div className="text-[10px] font-mono text-[#667586]">
                        {s.machineId}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Preview + Detection Bounding Box Visualization */}
            <div className="border border-[#D9E0E7] rounded-md bg-[#172334] overflow-hidden relative min-h-[260px] flex items-center justify-center">
              {!previewUrl ? (
                <div className="text-center p-8 text-[#CBD5E1] text-xs space-y-2">
                  <ImageIcon className="w-8 h-8 mx-auto text-[#8A96A3]" />
                  <div>No component image loaded. Upload an image or pick a test sample above.</div>
                </div>
              ) : (
                <div className="relative w-full max-h-[380px] flex items-center justify-center">
                  <img
                    src={previewUrl}
                    alt={partName}
                    className="w-full max-h-[380px] object-contain"
                    referrerPolicy="no-referrer"
                  />
                  {/* Bounding box detections */}
                  {activeResult?.detections.map((box, idx) => (
                    <div
                      key={idx}
                      style={{
                        left: `${box.x}%`,
                        top: `${box.y}%`,
                        width: `${box.w}%`,
                        height: `${box.h}%`,
                      }}
                      className="absolute border-2 border-[#C74747] bg-[#C74747]/15 pointer-events-none"
                    >
                      <span className="absolute -top-5 left-0 px-1.5 py-0.5 text-[10px] font-mono font-semibold bg-[#C74747] text-white whitespace-nowrap">
                        {box.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Inspect CTA */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-[#667586]">
                Vision Engine: <span className="font-mono text-[#172B4D]">ForgeTwin Optical CV ({state.systemHealth.visionModel})</span>
              </div>
              <button
                type="button"
                disabled={!previewUrl || uiState === 'processing'}
                onClick={runInspection}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-[#172B4D] text-white rounded hover:bg-[#2563A6] disabled:opacity-50"
              >
                {uiState === 'processing' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ScanSearch className="w-4 h-4" />
                )}
                <span>{uiState === 'processing' ? 'Inspecting Part...' : 'Inspect Image'}</span>
              </button>
            </div>
          </div>
        </Panel>

        {/* Right: Result Readout */}
        <Panel
          title="Inspection Result & Diagnostics"
          subtitle="Structured defect classification and quality disposition"
          className="lg:col-span-5"
          action={
            activeResult && (
              <button
                type="button"
                onClick={() => downloadReport(activeResult)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border border-[#D9E0E7] rounded hover:bg-[#EAF0F6] text-[#172B4D]"
              >
                <Download className="w-3.5 h-3.5" />
                Download Report
              </button>
            )
          }
        >
          {uiState === 'model-unavailable' && (
            <div className="p-4 border border-[#C74747]/30 bg-[#C74747]/8 rounded text-xs text-[#C74747] space-y-2">
              <div className="font-semibold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" />
                Computer Vision Model Unavailable
              </div>
              <p>{errorMessage}</p>
            </div>
          )}

          {!activeResult && uiState !== 'model-unavailable' && (
            <div className="py-12 text-center text-xs text-[#667586] space-y-2">
              <ScanSearch className="w-8 h-8 mx-auto text-[#8A96A3]" />
              <div className="font-medium text-[#172334]">
                {uiState === 'processing'
                  ? 'Running vision defect inspection...'
                  : 'Ready to inspect component'}
              </div>
              <p className="max-w-xs mx-auto">
                Load a part image on the left and click &ldquo;Inspect Image&rdquo; to evaluate
                surface finish, cracks, burrs, or weld porosity.
              </p>
            </div>
          )}

          {activeResult && (
            <div className="space-y-4 text-xs">
              <div
                className={`p-3.5 rounded border ${
                  activeResult.status === 'Defect Detected'
                    ? 'border-[#C74747]/35 bg-[#C74747]/8'
                    : 'border-[#16836B]/30 bg-[#16836B]/8'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-sm font-semibold ${
                      activeResult.status === 'Defect Detected'
                        ? 'text-[#C74747]'
                        : 'text-[#16836B]'
                    }`}
                  >
                    {activeResult.status}
                  </span>
                  <span className="font-mono font-semibold text-[#172B4D]">
                    {activeResult.confidence}% Confidence
                  </span>
                </div>
                <div className="text-[#172334] mt-1 font-medium">
                  Defect Category: {activeResult.defectCategory}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 p-3 bg-[#F5F6F4] border border-[#D9E0E7] rounded">
                <div>
                  <div className="text-[11px] text-[#667586]">Inspection ID</div>
                  <div className="font-mono font-semibold text-[#172B4D]">{activeResult.id}</div>
                </div>
                <div>
                  <div className="text-[11px] text-[#667586]">Machine Source</div>
                  <div className="font-mono font-semibold text-[#172B4D]">{activeResult.machineId}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-[11px] text-[#667586]">Part / Batch</div>
                  <div className="font-medium text-[#172334]">{activeResult.partName}</div>
                </div>
              </div>

              <div>
                <div className="font-semibold text-[#172B4D] mb-1">Inspection Summary</div>
                <p className="text-[#667586] leading-relaxed">{activeResult.summary}</p>
              </div>

              <div>
                <div className="font-semibold text-[#172B4D] mb-1">Recommended Quality Action</div>
                <p className="text-[#172334] leading-relaxed">{activeResult.recommendedAction}</p>
              </div>
            </div>
          )}
        </Panel>
      </div>

      {/* Inspection History Table */}
      <Panel title="Inspection History" subtitle="Recent automated optical inspections across production assets" noPadding>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#D9E0E7] bg-[#F5F6F4] text-[11px] font-semibold text-[#667586]">
                <th className="py-2.5 px-4">ID</th>
                <th className="py-2.5 px-4">Timestamp</th>
                <th className="py-2.5 px-4">Machine</th>
                <th className="py-2.5 px-4">Part Name</th>
                <th className="py-2.5 px-4">Result</th>
                <th className="py-2.5 px-4">Defect Category</th>
                <th className="py-2.5 px-4 text-right">Confidence</th>
                <th className="py-2.5 px-4 text-right">Report</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAF0F6]">
              {state.inspections.map((rec) => (
                <tr key={rec.id} className="hover:bg-[#F5F6F4]/70">
                  <td className="py-2.5 px-4 font-mono font-semibold text-[#172B4D]">{rec.id}</td>
                  <td className="py-2.5 px-4 font-mono text-[#667586]">{rec.timestamp}</td>
                  <td className="py-2.5 px-4 font-mono text-[#172334]">{rec.machineId}</td>
                  <td className="py-2.5 px-4 font-medium text-[#172334]">{rec.partName}</td>
                  <td className="py-2.5 px-4">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded ${
                        rec.status === 'Defect Detected'
                          ? 'bg-[#C74747]/10 text-[#C74747] border-[#C74747]/30'
                          : 'bg-[#16836B]/10 text-[#16836B] border-[#16836B]/25'
                      }`}
                    >
                      {rec.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-[#667586]">{rec.defectCategory}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums">{rec.confidence}%</td>
                  <td className="py-2.5 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => downloadReport(rec)}
                      className="px-2.5 py-1 text-xs font-medium text-[#2563A6] hover:bg-[#EAF0F6] rounded"
                    >
                      Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
