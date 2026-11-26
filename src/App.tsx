import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Bot,
  Box,
  Building2,
  Cpu,
  LayoutDashboard,
  LogOut,
  Menu,
  ScanSearch,
  Search,
  Settings,
  Sliders,
  Users,
  Wifi,
  WifiOff,
  Wrench,
  X,
} from 'lucide-react';
import type {
  Machine,
  MachineThresholds,
  PageId,
  PlatformState,
  SimulationScenario,
  UserAccount,
  WorkOrderPriority,
  WorkOrderStatus,
} from './types';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { FactoryOverviewPage } from './pages/FactoryOverviewPage';
import { MachineDetailPage, MachinesListPage } from './pages/MachinesPages';
import { DigitalTwinPage } from './pages/DigitalTwinPage';
import { PredictiveMaintenancePage } from './pages/PredictiveMaintenancePage';
import { QualityInspectionPage } from './pages/QualityInspectionPage';
import { AIAssistantPage } from './pages/AIAssistantPage';
import { AlertsPage, MaintenancePage } from './pages/AlertsAndMaintenancePages';
import { AnalyticsPage, SimulatorPage } from './pages/AnalyticsAndSimulatorPages';
import { NotificationsPage, SettingsPage } from './pages/NotificationsAndSettingsPages';

interface NavItem {
  id: PageId;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { id: 'factory', label: 'Factory Overview', Icon: Building2 },
  { id: 'machines', label: 'Machines', Icon: Cpu },
  { id: 'digital-twin', label: 'Digital Twin', Icon: Box },
  { id: 'predictive', label: 'Predictive Maintenance', Icon: Activity },
  { id: 'quality', label: 'Quality Inspection', Icon: ScanSearch },
  { id: 'assistant', label: 'AI Assistant', Icon: Bot },
  { id: 'alerts', label: 'Alerts & Events', Icon: AlertTriangle },
  { id: 'maintenance', label: 'Maintenance', Icon: Wrench },
  { id: 'analytics', label: 'Analytics & Reports', Icon: BarChart3 },
  { id: 'simulator', label: 'Simulator', Icon: Sliders },
  { id: 'notifications', label: 'Notifications', Icon: Bell },
  { id: 'settings', label: 'Users & Settings', Icon: Users },
];

export default function App() {
  const [auth, setAuth] = useState<{
    token: string;
    user: { email: string; name: string; role: string };
  } | null>(null);

  const [state, setState] = useState<PlatformState | null>(null);
  const [streamConnected, setStreamConnected] = useState(false);
  const [activePage, setActivePage] = useState<PageId>('dashboard');
  const [selectedMachineId, setSelectedMachineId] = useState<string>('M-101');
  const [assistantPendingPrompt, setAssistantPendingPrompt] = useState<string | undefined>(
    undefined
  );

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifPopoverOpen, setNotifPopoverOpen] = useState(false);

  const searchBoxRef = useRef<HTMLDivElement | null>(null);

  // Fetch initial state and subscribe to real-time SSE stream when authenticated
  useEffect(() => {
    if (!auth) return;
    let active = true;

    fetch('/api/state')
      .then((r) => r.json())
      .then((data: PlatformState) => {
        if (active) setState(data);
      })
      .catch(() => {});

    const es = new EventSource('/api/stream');
    es.onopen = () => {
      if (active) setStreamConnected(true);
    };
    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as PlatformState;
        if (active) {
          setState(parsed);
          setStreamConnected(true);
        }
      } catch {
        // ignore malformed chunk
      }
    };
    es.onerror = () => {
      if (active) setStreamConnected(false);
    };

    return () => {
      active = false;
      es.close();
    };
  }, [auth]);

  // Close search dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const searchResults = useMemo(() => {
    if (!state || !globalSearch.trim()) return [];
    const q = globalSearch.trim().toLowerCase();
    const results: { type: string; id: string; title: string; action: () => void }[] = [];

    for (const m of state.machines) {
      if (m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)) {
        results.push({
          type: 'Machine',
          id: m.id,
          title: `${m.id} — ${m.name}`,
          action: () => {
            setSelectedMachineId(m.id);
            setActivePage('machine-detail');
            setSearchOpen(false);
            setGlobalSearch('');
          },
        });
      }
    }
    for (const a of state.alerts) {
      if (
        a.id.toLowerCase().includes(q) ||
        a.type.toLowerCase().includes(q) ||
        a.machineId.toLowerCase().includes(q)
      ) {
        results.push({
          type: 'Alert',
          id: a.id,
          title: `${a.id} · ${a.machineId} ${a.type}`,
          action: () => {
            setActivePage('alerts');
            setSearchOpen(false);
            setGlobalSearch('');
          },
        });
      }
    }
    for (const w of state.workOrders) {
      if (
        w.id.toLowerCase().includes(q) ||
        w.issue.toLowerCase().includes(q) ||
        w.machineId.toLowerCase().includes(q)
      ) {
        results.push({
          type: 'Work Order',
          id: w.id,
          title: `${w.id} · ${w.machineId} (${w.status})`,
          action: () => {
            setActivePage('maintenance');
            setSearchOpen(false);
            setGlobalSearch('');
          },
        });
      }
    }
    return results.slice(0, 7);
  }, [state, globalSearch]);

  if (!auth) {
    return (
      <LoginPage
        onLogin={(user, token) => {
          setAuth({ user, token });
          setActivePage('dashboard');
        }}
      />
    );
  }

  const refreshState = async () => {
    const res = await fetch('/api/state');
    if (res.ok) setState(await res.json());
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth.token}` },
    }).catch(() => {});
    setAuth(null);
    setState(null);
  };

  const navigate = (page: PageId) => {
    setActivePage(page);
    setMobileNavOpen(false);
    setNotifPopoverOpen(false);
  };

  const openMachineDetail = (machineId: string) => {
    setSelectedMachineId(machineId);
    setActivePage('machine-detail');
  };

  const openAssistantForMachine = (machineId: string) => {
    setSelectedMachineId(machineId);
    setAssistantPendingPrompt(`Investigate ${machineId}.`);
    setActivePage('assistant');
  };

  const unreadNotifications = state?.notifications.filter((n) => !n.read).length || 0;
  const activeAlertsCount = state?.alerts.filter((a) => a.status === 'Active').length || 0;

  const pageLabel =
    activePage === 'machine-detail'
      ? `Machines / ${selectedMachineId}`
      : NAV_ITEMS.find((n) => n.id === activePage)?.label || 'Dashboard';

  // API action helpers
  const apiPost = async (url: string, body?: unknown) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    await refreshState();
    return data;
  };

  const apiPatch = async (url: string, body: unknown) => {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    await refreshState();
    return data;
  };

  return (
    <div className="min-h-screen bg-[#F5F6F4] text-[#172334] flex">
      {/* Mobile Sidebar Backdrop */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-[#172B4D]/40 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Persistent White Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[252px] bg-white border-r border-[#D9E0E7] flex flex-col transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Block */}
        <div className="h-14 px-4 border-b border-[#D9E0E7] flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={() => navigate('dashboard')}
            className="flex items-center gap-2.5 text-left"
          >
            <div className="w-7 h-7 rounded bg-[#172B4D] text-white flex items-center justify-center font-mono text-xs font-semibold shrink-0">
              FT
            </div>
            <div className="leading-tight">
              <div className="text-sm font-bold text-[#172B4D] tracking-tight">
                ForgeTwin
              </div>
              <div className="text-[10px] text-[#667586]">
                Industrial Intelligence Platform
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            className="p-1 text-[#667586] lg:hidden"
            aria-label="Close sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-0.5" aria-label="Primary Navigation">
          {NAV_ITEMS.map(({ id, label, Icon }) => {
            const isActive =
              activePage === id || (id === 'machines' && activePage === 'machine-detail');
            return (
              <button
                key={id}
                type="button"
                onClick={() => navigate(id)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium rounded transition-colors ${
                  isActive
                    ? 'bg-[#EAF0F6] text-[#172B4D] font-semibold'
                    : 'text-[#667586] hover:bg-[#F5F6F4] hover:text-[#172334]'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0 truncate">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-[#2563A6]' : 'text-[#8A96A3]'
                    }`}
                  />
                  <span className="truncate">{label}</span>
                </span>
                {id === 'alerts' && activeAlertsCount > 0 && (
                  <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#C74747]/12 text-[#C74747]">
                    {activeAlertsCount}
                  </span>
                )}
                {id === 'notifications' && unreadNotifications > 0 && (
                  <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#2563A6]/12 text-[#2563A6]">
                    {unreadNotifications}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom User Profile & Logout */}
        <div className="p-3 border-t border-[#D9E0E7] bg-[#F5F6F4]/50 space-y-2.5 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-[#172B4D] text-white flex items-center justify-center text-xs font-semibold shrink-0">
              {auth.user.name
                .split(' ')
                .map((s) => s[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-[#172334] truncate">
                {auth.user.name}
              </div>
              <div className="text-[11px] text-[#667586] truncate">{auth.user.role}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => navigate('settings')}
              className="inline-flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-medium bg-white border border-[#D9E0E7] rounded text-[#172334] hover:bg-[#EAF0F6]"
            >
              <Settings className="w-3 h-3" />
              Settings
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-medium bg-white border border-[#D9E0E7] rounded text-[#C74747] hover:bg-[#C74747]/8"
            >
              <LogOut className="w-3 h-3" />
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Header */}
        <header className="h-14 bg-white border-b border-[#D9E0E7] px-4 lg:px-6 flex items-center justify-between gap-4 sticky top-0 z-30 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="p-1.5 border border-[#D9E0E7] rounded text-[#172B4D] lg:hidden"
              aria-label="Open navigation menu"
            >
              <Menu className="w-4 h-4" />
            </button>

            {/* Breadcrumbs */}
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs min-w-0">
              <button
                type="button"
                onClick={() => navigate('dashboard')}
                className="font-medium text-[#667586] hover:text-[#172B4D] whitespace-nowrap"
              >
                ForgeTwin
              </button>
              <span className="text-[#8A96A3]">/</span>
              <span className="font-semibold text-[#172B4D] truncate">{pageLabel}</span>
            </nav>

            {/* Current Factory Selector */}
            {state && (
              <select
                value={state.factory.id}
                onChange={(e) => apiPatch('/api/factory', { factoryId: e.target.value })}
                className="hidden md:block ml-2 px-2.5 py-1 text-xs bg-[#F5F6F4] border border-[#D9E0E7] rounded text-[#172B4D] font-medium max-w-[200px] truncate"
                aria-label="Current Factory Selector"
              >
                {state.factories.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {/* Global Search */}
            <div ref={searchBoxRef} className="relative hidden sm:block w-52 lg:w-64">
              <Search className="w-3.5 h-3.5 text-[#8A96A3] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={globalSearch}
                onFocus={() => setSearchOpen(true)}
                onChange={(e) => {
                  setGlobalSearch(e.target.value);
                  setSearchOpen(true);
                }}
                placeholder="Search M-101, alerts, WO..."
                className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-[#F5F6F4] border border-[#D9E0E7] rounded text-[#172334] focus:outline-none focus:bg-white focus:border-[#2563A6]"
              />
              {searchOpen && searchResults.length > 0 && (
                <div className="absolute right-0 mt-1 w-72 bg-white border border-[#D9E0E7] rounded-md shadow-lg z-40 divide-y divide-[#EAF0F6]">
                  {searchResults.map((res) => (
                    <button
                      key={`${res.type}-${res.id}`}
                      type="button"
                      onClick={res.action}
                      className="w-full px-3 py-2 text-left text-xs hover:bg-[#EAF0F6] flex items-center justify-between gap-2"
                    >
                      <span className="truncate font-medium text-[#172334]">{res.title}</span>
                      <span className="text-[10px] text-[#8A96A3] shrink-0">{res.type}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Live Stream Connection Status */}
            <div
              className={`hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium border rounded whitespace-nowrap ${
                streamConnected
                  ? 'bg-[#16836B]/8 border-[#16836B]/25 text-[#16836B]'
                  : 'bg-[#D99A25]/10 border-[#D99A25]/30 text-[#A6710E]'
              }`}
              title="Real-time backend SSE telemetry connection"
            >
              {streamConnected ? (
                <Wifi className="w-3.5 h-3.5" />
              ) : (
                <WifiOff className="w-3.5 h-3.5" />
              )}
              <span>{streamConnected ? 'Live Stream' : 'Connecting'}</span>
            </div>

            {/* Notification Bell */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifPopoverOpen((v) => !v)}
                className="relative p-2 text-[#667586] hover:text-[#172B4D] hover:bg-[#EAF0F6] rounded border border-[#D9E0E7]"
                aria-label="Open notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 px-1 min-w-[16px] h-4 text-[10px] font-mono font-semibold bg-[#C74747] text-white rounded flex items-center justify-center">
                    {unreadNotifications}
                  </span>
                )}
              </button>

              {notifPopoverOpen && state && (
                <div className="absolute right-0 mt-1.5 w-80 bg-white border border-[#D9E0E7] rounded-md shadow-lg z-40">
                  <div className="px-3.5 py-2.5 border-b border-[#D9E0E7] flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#172B4D]">Notifications</span>
                    <button
                      type="button"
                      onClick={() => navigate('notifications')}
                      className="text-[#2563A6] hover:underline"
                    >
                      View All
                    </button>
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-[#EAF0F6]">
                    {state.notifications.slice(0, 5).map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={async () => {
                          if (!n.read) await apiPost(`/api/notifications/${n.id}/read`);
                          navigate(n.targetPage);
                        }}
                        className={`w-full px-3.5 py-2.5 text-left text-xs hover:bg-[#F5F6F4] ${
                          n.read ? 'bg-white' : 'bg-[#EAF0F6]/50'
                        }`}
                      >
                        <div className="font-semibold text-[#172B4D] truncate">{n.title}</div>
                        <div className="text-[11px] text-[#667586] mt-0.5 line-clamp-2">
                          {n.message}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Header User Badge */}
            <div className="hidden xl:flex items-center gap-2 pl-2 border-l border-[#D9E0E7]">
              <div className="w-7 h-7 rounded bg-[#172B4D] text-white flex items-center justify-center text-[11px] font-semibold">
                {auth.user.name
                  .split(' ')
                  .map((s) => s[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div className="leading-tight">
                <div className="text-xs font-medium text-[#172334] whitespace-nowrap">
                  {auth.user.name}
                </div>
                <div className="text-[10px] text-[#667586] whitespace-nowrap">
                  {auth.user.role}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 lg:p-6 max-w-[1440px] w-full mx-auto">
          {!state ? (
            <div className="space-y-4">
              <div className="h-16 bg-white border border-[#D9E0E7] rounded-md animate-pulse" />
              <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-24 bg-white border border-[#D9E0E7] rounded-md animate-pulse"
                  />
                ))}
              </div>
              <div className="h-72 bg-white border border-[#D9E0E7] rounded-md animate-pulse" />
            </div>
          ) : (
            <>
              {activePage === 'dashboard' && (
                <DashboardPage
                  state={state}
                  onNavigate={navigate}
                  onSelectMachine={openMachineDetail}
                />
              )}

              {activePage === 'factory' && (
                <FactoryOverviewPage
                  state={state}
                  onNavigate={navigate}
                  onSelectMachine={openMachineDetail}
                />
              )}

              {activePage === 'machines' && (
                <MachinesListPage
                  state={state}
                  onSelectMachine={openMachineDetail}
                  onAddMachine={async (payload) => {
                    await apiPost('/api/machines', payload);
                  }}
                  onUpdateMachine={async (id, payload) => {
                    await apiPatch(`/api/machines/${id}`, payload);
                  }}
                />
              )}

              {activePage === 'machine-detail' && (
                <MachineDetailPage
                  state={state}
                  machineId={selectedMachineId}
                  onBack={() => navigate('machines')}
                  onNavigate={navigate}
                  onOpenAssistantForMachine={openAssistantForMachine}
                />
              )}

              {activePage === 'digital-twin' && (
                <DigitalTwinPage
                  state={state}
                  selectedMachineId={selectedMachineId}
                  onSelectMachineId={setSelectedMachineId}
                  onViewMachineDetails={openMachineDetail}
                  onOpenAssistantForMachine={openAssistantForMachine}
                  onApplyScenario={async (machineId: string, scenario: SimulationScenario) => {
                    await apiPost('/api/simulator/scenario', { machineId, scenario });
                  }}
                  onNavigate={navigate}
                />
              )}

              {activePage === 'predictive' && (
                <PredictiveMaintenancePage
                  state={state}
                  selectedMachineId={selectedMachineId}
                  onSelectMachineId={setSelectedMachineId}
                  onNavigate={navigate}
                  onOpenAssistantForMachine={openAssistantForMachine}
                  onCreateWorkOrder={async (payload) => {
                    await apiPost('/api/work-orders', payload);
                  }}
                />
              )}

              {activePage === 'quality' && (
                <QualityInspectionPage state={state} onInspectComplete={refreshState} />
              )}

              {activePage === 'assistant' && (
                <AIAssistantPage
                  state={state}
                  initialMachineId={selectedMachineId}
                  initialPrompt={assistantPendingPrompt}
                  onClearInitialPrompt={() => setAssistantPendingPrompt(undefined)}
                  onCreateWorkOrder={async (payload) =>
                    apiPost('/api/work-orders', payload)
                  }
                  onNavigate={navigate}
                />
              )}

              {activePage === 'alerts' && (
                <AlertsPage
                  state={state}
                  onAcknowledgeAlert={async (id) => {
                    await apiPost(`/api/alerts/${id}/acknowledge`, { user: auth.user.name });
                  }}
                  onResolveAlert={async (id) => {
                    await apiPost(`/api/alerts/${id}/resolve`);
                  }}
                  onSelectMachine={openMachineDetail}
                />
              )}

              {activePage === 'maintenance' && (
                <MaintenancePage
                  state={state}
                  onCreateWorkOrder={async (payload: {
                    machineId: string;
                    issue: string;
                    priority: WorkOrderPriority;
                    assignedEngineer: string;
                    dueDate?: string;
                    source: 'Manual';
                  }) => apiPost('/api/work-orders', payload)}
                  onUpdateWorkOrder={async (
                    id: string,
                    payload: { status?: WorkOrderStatus; assignedEngineer?: string }
                  ) => {
                    await apiPatch(`/api/work-orders/${id}`, payload);
                  }}
                  onAddNote={async (id, text) => {
                    await apiPost(`/api/work-orders/${id}/notes`, {
                      text,
                      author: auth.user.name,
                    });
                  }}
                />
              )}

              {activePage === 'analytics' && <AnalyticsPage state={state} />}

              {activePage === 'simulator' && (
                <SimulatorPage
                  state={state}
                  onControl={async (payload) => {
                    await apiPost('/api/simulator/control', payload);
                  }}
                  onApplyScenario={async (machineId, scenario) => {
                    await apiPost('/api/simulator/scenario', { machineId, scenario });
                  }}
                />
              )}

              {activePage === 'notifications' && (
                <NotificationsPage
                  state={state}
                  onMarkRead={async (id) => {
                    await apiPost(`/api/notifications/${id}/read`);
                  }}
                  onMarkAllRead={async () => {
                    await apiPost('/api/notifications/read-all');
                  }}
                  onNavigate={navigate}
                />
              )}

              {activePage === 'settings' && (
                <SettingsPage
                  state={state}
                  currentUser={auth.user}
                  onSelectFactory={async (factoryId) => {
                    await apiPatch('/api/factory', { factoryId });
                  }}
                  onUpdateThresholds={async (machineId: string, thresholds: MachineThresholds) => {
                    await apiPatch(`/api/machines/${machineId}`, { thresholds });
                  }}
                  onUpdateAiSettings={async (payload) => {
                    await apiPatch('/api/settings/ai', payload);
                  }}
                  onAddUser={async (payload: {
                    name: string;
                    email: string;
                    role: UserAccount['role'];
                    department: string;
                  }) => {
                    await apiPost('/api/users', payload);
                  }}
                  onUpdateUser={async (id, payload) => {
                    await apiPatch(`/api/users/${id}`, payload);
                  }}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
