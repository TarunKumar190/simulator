export type MachineStatus = 'running' | 'warning' | 'critical' | 'offline';

export type RiskCategory = 'Normal' | 'Low Risk' | 'Medium Risk' | 'High Risk' | 'Critical';

export type SimulationScenario =
  | 'Normal Operation'
  | 'High Temperature'
  | 'Excessive Vibration'
  | 'Abnormal Pressure'
  | 'Machine Overload'
  | 'Sudden Shutdown'
  | 'Multiple Abnormalities'
  | 'Recovery After Maintenance';

export type PageId =
  | 'dashboard'
  | 'factory'
  | 'machines'
  | 'machine-detail'
  | 'digital-twin'
  | 'predictive'
  | 'quality'
  | 'assistant'
  | 'alerts'
  | 'maintenance'
  | 'analytics'
  | 'simulator'
  | 'notifications'
  | 'settings';

export interface SensorPoint {
  timestamp: string;
  temperature: number;
  vibration: number;
  pressure: number;
  rpm: number;
  load: number;
  healthScore: number;
  anomalyScore: number;
}

export interface MachineThresholds {
  maxTemp: number;
  maxVibration: number;
  maxPressure: number;
  minPressure: number;
  maxRpm: number;
  maxLoad: number;
}

export interface AnomalyRecord {
  id: string;
  timestamp: string;
  parameter: string;
  value: string;
  anomalyScore: number;
  riskCategory: RiskCategory;
  summary: string;
}

export interface Machine {
  id: string;
  name: string;
  category: string;
  area: string;
  modelType: 'cnc' | 'compressor' | 'conveyor' | 'press' | 'packaging';
  status: MachineStatus;
  healthScore: number;
  temperature: number;
  vibration: number;
  pressure: number;
  rpm: number;
  load: number;
  anomalyScore: number;
  riskCategory: RiskCategory;
  abnormalParameters: string[];
  flaggedReason: string;
  lastUpdated: string;
  uptimePercent: number;
  position3D: [number, number, number];
  thresholds: MachineThresholds;
  scenario: SimulationScenario;
  sensorHistory: SensorPoint[];
  anomalyHistory: AnomalyRecord[];
}

export type AlertSeverity = 'Critical' | 'High' | 'Medium' | 'Low';
export type AlertStatus = 'Active' | 'Acknowledged' | 'Resolved';

export interface AlertItem {
  id: string;
  machineId: string;
  machineName: string;
  type: string;
  severity: AlertSeverity;
  description: string;
  timestamp: string;
  status: AlertStatus;
  acknowledgedBy?: string;
  resolvedAt?: string;
}

export type WorkOrderPriority = 'Critical' | 'High' | 'Medium' | 'Low';
export type WorkOrderStatus = 'Open' | 'Assigned' | 'In Progress' | 'Completed';

export interface WorkOrderNote {
  id: string;
  author: string;
  timestamp: string;
  text: string;
}

export interface WorkOrder {
  id: string;
  machineId: string;
  machineName: string;
  issue: string;
  priority: WorkOrderPriority;
  assignedEngineer: string;
  createdDate: string;
  dueDate: string;
  status: WorkOrderStatus;
  source: 'Manual' | 'AI Assistant' | 'Predictive Alert';
  notes: WorkOrderNote[];
}

export interface DefectDetectionBox {
  label: string;
  x: number; // 0..100 percentage
  y: number; // 0..100 percentage
  w: number; // 0..100 percentage
  h: number; // 0..100 percentage
}

export interface InspectionRecord {
  id: string;
  timestamp: string;
  machineId: string;
  partName: string;
  imageUrl: string;
  status: 'Defect Detected' | 'No Defect Detected';
  defectCategory: string;
  confidence: number;
  summary: string;
  recommendedAction: string;
  detections: DefectDetectionBox[];
}

export interface EventLogItem {
  id: string;
  timestamp: string;
  machineId: string;
  machineName: string;
  category:
    | 'Telemetry'
    | 'Anomaly'
    | 'Alert'
    | 'Maintenance'
    | 'Simulator'
    | 'Inspection'
    | 'AI Assistant';
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical' | 'success';
}

export interface NotificationItem {
  id: string;
  timestamp: string;
  category:
    | 'Critical Alert'
    | 'Maintenance Assignment'
    | 'Work Order Update'
    | 'Quality Inspection';
  title: string;
  message: string;
  read: boolean;
  machineId?: string;
  targetPage: PageId;
}

export interface SimulatorLogItem {
  id: string;
  timestamp: string;
  machineId: string;
  scenario: SimulationScenario;
  message: string;
  level: 'info' | 'warning' | 'critical';
}

export interface SimulatorState {
  running: boolean;
  paused: boolean;
  speed: 0.5 | 1 | 2 | 5;
  selectedMachineId: string;
  tickCount: number;
  logs: SimulatorLogItem[];
}

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: 'Factory Manager' | 'Maintenance Engineer' | 'Quality Inspector' | 'System Admin';
  status: 'Active' | 'Inactive';
  department: string;
  lastActive: string;
}

export interface FactoryProfile {
  id: string;
  name: string;
  location: string;
  shift: string;
  targetOee: number;
}

export interface SystemHealthStatus {
  backendApi: 'Operational' | 'Degraded';
  database: 'Operational' | 'In-Memory Store';
  simulator: 'Running' | 'Paused' | 'Stopped';
  stream: 'Active' | 'Idle';
  predictiveModel: 'Active' | 'Standby';
  visionModel: 'Ready' | 'Unavailable';
  assistantAi: 'Ready' | 'Unavailable';
}

export interface PlatformState {
  factory: FactoryProfile;
  factories: FactoryProfile[];
  machines: Machine[];
  alerts: AlertItem[];
  workOrders: WorkOrder[];
  inspections: InspectionRecord[];
  events: EventLogItem[];
  notifications: NotificationItem[];
  simulator: SimulatorState;
  users: UserAccount[];
  systemHealth: SystemHealthStatus;
  aiSettings: {
    anomalyThreshold: number;
    visionConfidenceThreshold: number;
    autoCreateAlerts: boolean;
    assistantModel: string;
  };
}

export interface WorkOrderDraft {
  machineId: string;
  machineName: string;
  issue: string;
  priority: WorkOrderPriority;
  assignedEngineer: string;
  rationale: string;
}

export interface AssistantToolTrace {
  tool: string;
  status: 'completed' | 'failed';
  summary: string;
}

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  timestamp: string;
  content: string;
  observedFacts?: string[];
  recommendations?: string[];
  toolTraces?: AssistantToolTrace[];
  referencedMachineIds?: string[];
  workOrderDraft?: WorkOrderDraft | null;
  workOrderApprovedId?: string;
  error?: string;
}

export interface AssistantConversation {
  id: string;
  title: string;
  createdAt: string;
  saved: boolean;
  messages: AssistantMessage[];
}
