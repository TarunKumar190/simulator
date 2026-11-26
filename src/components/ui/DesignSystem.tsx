import React from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  OctagonAlert,
  PowerOff,
  X,
} from 'lucide-react';
import type {
  AlertSeverity,
  MachineStatus,
  RiskCategory,
  WorkOrderStatus,
} from '../../types';

export function StatusBadge({ status }: { status: MachineStatus }) {
  const config: Record<
    MachineStatus,
    { label: string; colorClass: string; Icon: React.ComponentType<{ className?: string }> }
  > = {
    running: {
      label: 'Running',
      colorClass: 'bg-[#16836B]/10 text-[#16836B] border-[#16836B]/25',
      Icon: CheckCircle2,
    },
    warning: {
      label: 'Warning',
      colorClass: 'bg-[#D99A25]/12 text-[#A6710E] border-[#D99A25]/35',
      Icon: AlertTriangle,
    },
    critical: {
      label: 'Critical',
      colorClass: 'bg-[#C74747]/10 text-[#C74747] border-[#C74747]/30',
      Icon: OctagonAlert,
    },
    offline: {
      label: 'Offline',
      colorClass: 'bg-[#7B8794]/12 text-[#5B6672] border-[#7B8794]/30',
      Icon: PowerOff,
    },
  };

  const { label, colorClass, Icon } = config[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium border rounded whitespace-nowrap shrink-0 ${colorClass}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{label}</span>
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  const styles: Record<AlertSeverity, string> = {
    Critical: 'bg-[#C74747]/10 text-[#C74747] border-[#C74747]/30',
    High: 'bg-[#D97736]/12 text-[#B85B1C] border-[#D97736]/30',
    Medium: 'bg-[#D99A25]/12 text-[#A6710E] border-[#D99A25]/35',
    Low: 'bg-[#EAF0F6] text-[#172B4D] border-[#D9E0E7]',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded whitespace-nowrap shrink-0 ${styles[severity]}`}
    >
      {severity}
    </span>
  );
}

export function RiskBadge({ risk }: { risk: RiskCategory }) {
  const styles: Record<RiskCategory, string> = {
    Normal: 'bg-[#16836B]/10 text-[#16836B] border-[#16836B]/25',
    'Low Risk': 'bg-[#2563A6]/10 text-[#2563A6] border-[#2563A6]/25',
    'Medium Risk': 'bg-[#D99A25]/12 text-[#A6710E] border-[#D99A25]/35',
    'High Risk': 'bg-[#D97736]/12 text-[#B85B1C] border-[#D97736]/30',
    Critical: 'bg-[#C74747]/10 text-[#C74747] border-[#C74747]/30',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded whitespace-nowrap shrink-0 ${styles[risk]}`}
    >
      {risk}
    </span>
  );
}

export function WorkOrderStatusBadge({ status }: { status: WorkOrderStatus }) {
  const styles: Record<WorkOrderStatus, string> = {
    Open: 'bg-[#D99A25]/12 text-[#A6710E] border-[#D99A25]/35',
    Assigned: 'bg-[#2563A6]/10 text-[#2563A6] border-[#2563A6]/25',
    'In Progress': 'bg-[#D97736]/12 text-[#B85B1C] border-[#D97736]/30',
    Completed: 'bg-[#16836B]/10 text-[#16836B] border-[#16836B]/25',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded whitespace-nowrap shrink-0 ${styles[status]}`}
    >
      {status}
    </span>
  );
}

export function Panel({
  title,
  subtitle,
  action,
  children,
  className = '',
  noPadding = false,
}: {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
}) {
  return (
    <section
      className={`bg-white border border-[#D9E0E7] rounded-md shadow-[0_1px_2px_rgba(23,43,77,0.04)] ${className}`}
    >
      {(title || action) && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[#D9E0E7]">
          <div className="min-w-0">
            {title && (
              <h2 className="text-sm font-semibold text-[#172334] truncate">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-xs text-[#667586] mt-0.5">{subtitle}</p>
            )}
          </div>
          {action && <div className="flex items-center gap-2 shrink-0">{action}</div>}
        </div>
      )}
      <div className={noPadding ? '' : 'p-4'}>{children}</div>
    </section>
  );
}

export function StatTile({
  label,
  value,
  subtext,
  tone = 'default',
  onClick,
}: {
  label: string;
  value: string | number;
  subtext?: string;
  tone?: 'default' | 'success' | 'warning' | 'critical' | 'offline' | 'accent';
  onClick?: () => void;
}) {
  const toneValue: Record<string, string> = {
    default: 'text-[#172B4D]',
    success: 'text-[#16836B]',
    warning: 'text-[#D99A25]',
    critical: 'text-[#C74747]',
    offline: 'text-[#7B8794]',
    accent: 'text-[#2563A6]',
  };

  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`w-full text-left bg-white border border-[#D9E0E7] rounded-md px-4 py-3.5 shadow-[0_1px_2px_rgba(23,43,77,0.03)] ${
        onClick ? 'hover:border-[#2563A6]/50 transition-colors cursor-pointer' : ''
      }`}
    >
      <div className="text-xs font-medium text-[#667586] truncate">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums font-mono mt-1 ${toneValue[tone]}`}>
        {value}
      </div>
      {subtext && <div className="text-xs text-[#8A96A3] mt-1 truncate">{subtext}</div>}
    </Wrapper>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-[#D9E0E7]">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-[#172B4D] tracking-tight">{title}</h1>
        {description && (
          <p className="text-sm text-[#667586] mt-0.5">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-4">
      <div className="w-10 h-10 rounded-md bg-[#EAF0F6] flex items-center justify-center text-[#2563A6] mb-3">
        <Activity className="w-5 h-5" />
      </div>
      <div className="text-sm font-semibold text-[#172334]">{title}</div>
      <p className="text-xs text-[#667586] max-w-sm mt-1">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ModalDialog({
  open,
  title,
  subtitle,
  onClose,
  children,
  maxWidth = 'max-w-lg',
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#172B4D]/45 p-4">
      <div
        className={`w-full ${maxWidth} bg-white border border-[#D9E0E7] rounded-md shadow-xl overflow-hidden`}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-4 px-5 py-3.5 border-b border-[#D9E0E7] bg-[#F5F6F4]">
          <div>
            <h3 className="text-sm font-semibold text-[#172B4D]">{title}</h3>
            {subtitle && <p className="text-xs text-[#667586] mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#667586] hover:text-[#172334] rounded hover:bg-[#EAF0F6]"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 max-h-[80vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
