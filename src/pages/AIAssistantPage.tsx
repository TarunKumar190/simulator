import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  Bot,
  CheckCircle2,
  Cpu,
  Database,
  Loader2,
  Plus,
  Send,
  Wrench,
} from 'lucide-react';
import type {
  AssistantConversation,
  AssistantMessage,
  PageId,
  PlatformState,
  WorkOrderDraft,
} from '../types';
import {
  ModalDialog,
  PageHeader,
  Panel,
  RiskBadge,
  SeverityBadge,
  StatusBadge,
} from '../components/ui/DesignSystem';

const SUGGESTED_QUESTIONS = [
  'Investigate M-101.',
  'Which machines are currently critical?',
  'Why is M-102 showing a warning?',
  'Show the latest vibration readings.',
  'Which machines require maintenance?',
  "Summarize today's factory condition.",
  'Show pending maintenance work orders.',
];

export function AIAssistantPage({
  state,
  initialMachineId,
  initialPrompt,
  onClearInitialPrompt,
  onCreateWorkOrder,
  onNavigate,
}: {
  state: PlatformState;
  initialMachineId?: string;
  initialPrompt?: string;
  onClearInitialPrompt?: () => void;
  onCreateWorkOrder: (payload: {
    machineId: string;
    issue: string;
    priority: 'Critical' | 'High' | 'Medium' | 'Low';
    assignedEngineer: string;
    source: 'AI Assistant';
  }) => Promise<{ id: string }>;
  onNavigate: (page: PageId) => void;
}) {
  const [conversations, setConversations] = useState<AssistantConversation[]>([
    {
      id: 'CONV-01',
      title: 'Plant Operations Shift Briefing',
      createdAt: 'Today · Shift B',
      saved: true,
      messages: [
        {
          id: 'MSG-WELCOME',
          role: 'assistant',
          timestamp: '11:40:00',
          content:
            'ForgeTwin Operations AI is connected to live machine telemetry, anomaly scoring, active alerts, and work orders. Select a suggested query or ask me to investigate any machine.',
          observedFacts: [
            `Monitoring ${state.machines.length} machines in ${state.factory.name}.`,
            `${state.alerts.filter((a) => a.status === 'Active').length} active alert(s) currently open.`,
          ],
          recommendations: [
            'Use "Investigate M-101." after triggering an Excessive Vibration scenario in the Simulator to generate and review a grounded maintenance work order.',
          ],
        },
      ],
    },
  ]);
  const [activeConvId, setActiveConvId] = useState('CONV-01');
  const [selectedContextMachineId, setSelectedContextMachineId] = useState(
    initialMachineId || 'M-101'
  );
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  // Review screen modal before creating work order
  const [reviewDraft, setReviewDraft] = useState<{
    messageId: string;
    draft: WorkOrderDraft;
  } | null>(null);
  const [approving, setApproving] = useState(false);

  const activeConv =
    conversations.find((c) => c.id === activeConvId) || conversations[0];
  const contextMachine =
    state.machines.find((m) => m.id === selectedContextMachineId) || state.machines[0];
  const activeAlerts = state.alerts.filter((a) => a.status !== 'Resolved');

  const sendMessage = async (textOverride?: string) => {
    const prompt = (textOverride ?? input).trim();
    if (!prompt || sending) return;

    if (!textOverride) setInput('');
    const userMsg: AssistantMessage = {
      id: `MSG-${Date.now()}`,
      role: 'user',
      timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
      content: prompt,
    };

    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConv.id
          ? {
              ...c,
              title: c.messages.length <= 1 ? prompt.slice(0, 34) : c.title,
              messages: [...c.messages, userMsg],
            }
          : c
      )
    );
    setSending(true);

    try {
      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          selectedMachineId: selectedContextMachineId,
        }),
      });
      const data = await res.json();

      const assistantMsg: AssistantMessage = res.ok
        ? {
            id: `MSG-${Date.now() + 1}`,
            role: 'assistant',
            timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
            content: data.answer,
            observedFacts: data.observedFacts,
            recommendations: data.recommendations,
            toolTraces: data.toolTraces,
            referencedMachineIds: data.referencedMachineIds,
            workOrderDraft: data.workOrderDraft,
          }
        : {
            id: `MSG-${Date.now() + 1}`,
            role: 'assistant',
            timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
            content: 'Unable to complete AI analysis.',
            toolTraces: data.toolTraces,
            error: data.error || 'Assistant service unavailable.',
          };

      if (data.referencedMachineIds?.[0]) {
        setSelectedContextMachineId(data.referencedMachineIds[0]);
      }

      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeConv.id
            ? { ...c, messages: [...c.messages, assistantMsg] }
            : c
        )
      );
    } catch {
      const errMsg: AssistantMessage = {
        id: `MSG-${Date.now() + 1}`,
        role: 'assistant',
        timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
        content: 'Network error communicating with AI assistant endpoint.',
        error: 'Unable to reach /api/assistant/chat.',
      };
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeConv.id
            ? { ...c, messages: [...c.messages, errMsg] }
            : c
        )
      );
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (initialPrompt) {
      if (initialMachineId) setSelectedContextMachineId(initialMachineId);
      sendMessage(initialPrompt);
      onClearInitialPrompt?.();
    }
  }, [initialPrompt]);

  const startNewConversation = () => {
    const newId = `CONV-${String(conversations.length + 1).padStart(2, '0')}`;
    const fresh: AssistantConversation = {
      id: newId,
      title: 'New Investigation',
      createdAt: new Date().toLocaleTimeString('en-GB', { hour12: false }),
      saved: false,
      messages: [
        {
          id: `MSG-${Date.now()}`,
          role: 'assistant',
          timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
          content:
            'New investigation session initialized. Ask about machine health, vibration trends, alerts, or maintenance readiness.',
        },
      ],
    };
    setConversations((prev) => [fresh, ...prev]);
    setActiveConvId(newId);
  };

  const toggleSaveConversation = (id: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, saved: !c.saved } : c))
    );
  };

  const handleApproveWorkOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewDraft) return;
    setApproving(true);
    try {
      const created = await onCreateWorkOrder({
        machineId: reviewDraft.draft.machineId,
        issue: reviewDraft.draft.issue,
        priority: reviewDraft.draft.priority,
        assignedEngineer: reviewDraft.draft.assignedEngineer,
        source: 'AI Assistant',
      });
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeConv.id
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === reviewDraft.messageId
                    ? { ...m, workOrderApprovedId: created.id }
                    : m
                ),
              }
            : c
        )
      );
      setReviewDraft(null);
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Agentic AI Factory Assistant"
        description="Backend tool-grounded industrial operations copilot with human-in-the-loop work order approval"
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Left Sidebar: Conversations */}
        <Panel
          title="Investigations"
          className="lg:col-span-3 flex flex-col"
          action={
            <button
              type="button"
              onClick={startNewConversation}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-[#172B4D] text-white rounded hover:bg-[#2563A6]"
            >
              <Plus className="w-3.5 h-3.5" />
              New
            </button>
          }
        >
          <div className="space-y-2">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={`p-2.5 rounded border text-xs flex items-start justify-between gap-2 cursor-pointer transition-colors ${
                  conv.id === activeConv.id
                    ? 'border-[#2563A6] bg-[#EAF0F6]/80'
                    : 'border-[#D9E0E7] bg-white hover:bg-[#F5F6F4]'
                }`}
                onClick={() => setActiveConvId(conv.id)}
              >
                <div className="min-w-0">
                  <div className="font-semibold text-[#172B4D] truncate">{conv.title}</div>
                  <div className="text-[11px] text-[#8A96A3] mt-0.5">{conv.createdAt}</div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSaveConversation(conv.id);
                  }}
                  title={conv.saved ? 'Saved investigation' : 'Save investigation'}
                  className={`p-1 rounded ${
                    conv.saved ? 'text-[#2563A6]' : 'text-[#8A96A3] hover:text-[#172B4D]'
                  }`}
                >
                  <Bookmark className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-5 pt-4 border-t border-[#D9E0E7]">
            <div className="text-xs font-semibold text-[#172B4D] mb-2">
              Suggested Operational Queries
            </div>
            <div className="flex flex-col gap-1.5">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={sending}
                  onClick={() => sendMessage(q)}
                  className="text-left px-2.5 py-1.5 text-xs border border-[#D9E0E7] rounded bg-[#F5F6F4]/70 hover:bg-[#EAF0F6] hover:border-[#2563A6]/50 text-[#172334] transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </Panel>

        {/* Center: Active AI Operations Conversation */}
        <Panel
          title={activeConv.title}
          subtitle="Distinguishes verified machine telemetry from AI-generated engineering recommendations"
          className="lg:col-span-6 flex flex-col"
          noPadding
        >
          <div className="flex-1 p-4 space-y-4 max-h-[540px] min-h-[420px] overflow-y-auto bg-[#F5F6F4]/50">
            {activeConv.messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-[92%] rounded-md border p-3.5 text-xs space-y-3 ${
                    msg.role === 'user'
                      ? 'bg-[#172B4D] text-white border-[#172B4D]'
                      : 'bg-white text-[#172334] border-[#D9E0E7]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4 text-[11px] opacity-80">
                    <span className="font-semibold flex items-center gap-1.5">
                      {msg.role === 'assistant' && <Bot className="w-3.5 h-3.5 text-[#2563A6]" />}
                      {msg.role === 'user' ? 'Operations Manager' : 'ForgeTwin Operations AI'}
                    </span>
                    <span className="font-mono">{msg.timestamp}</span>
                  </div>

                  {/* Tool execution steps */}
                  {msg.toolTraces && msg.toolTraces.length > 0 && (
                    <div className="p-2.5 bg-[#EAF0F6]/70 border border-[#D9E0E7] rounded space-y-1.5">
                      <div className="text-[11px] font-semibold text-[#172B4D] flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5 text-[#2563A6]" />
                        Backend Tool Execution Trace
                      </div>
                      {msg.toolTraces.map((trace, i) => (
                        <div key={i} className="flex items-start gap-2 text-[11px] text-[#172334]">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#16836B] shrink-0 mt-0.5" />
                          <span>
                            <span className="font-mono font-medium">{trace.tool}</span> — {trace.summary}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {msg.error && (
                    <div className="p-2.5 bg-[#C74747]/10 border border-[#C74747]/30 rounded text-[#C74747]">
                      {msg.error}
                    </div>
                  )}

                  <p className="leading-relaxed text-[13px]">{msg.content}</p>

                  {/* Observed Facts vs AI Recommendations */}
                  {msg.observedFacts && msg.observedFacts.length > 0 && (
                    <div className="p-2.5 bg-[#F5F6F4] border border-[#D9E0E7] rounded space-y-1">
                      <div className="text-[11px] font-semibold text-[#172B4D]">
                        Observed Machine Readings &amp; Backend Facts
                      </div>
                      <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-[#172334]">
                        {msg.observedFacts.map((fact, idx) => (
                          <li key={idx}>{fact}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {msg.recommendations && msg.recommendations.length > 0 && (
                    <div className="p-2.5 bg-[#2563A6]/6 border border-[#2563A6]/25 rounded space-y-1">
                      <div className="text-[11px] font-semibold text-[#2563A6]">
                        AI-Generated Maintenance Recommendations
                      </div>
                      <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-[#172334]">
                        {msg.recommendations.map((rec, idx) => (
                          <li key={idx}>{rec}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Referenced machine cards */}
                  {msg.referencedMachineIds && msg.referencedMachineIds.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {msg.referencedMachineIds.map((mId) => {
                        const m = state.machines.find((item) => item.id === mId);
                        if (!m) return null;
                        return (
                          <div
                            key={m.id}
                            className="px-2.5 py-1.5 border border-[#D9E0E7] rounded bg-[#F5F6F4] flex items-center gap-2.5 text-[11px]"
                          >
                            <span className="font-mono font-semibold text-[#172B4D]">{m.id}</span>
                            <StatusBadge status={m.status} />
                            <span className="font-mono text-[#667586]">
                              {m.temperature}°C · {m.vibration} mm/s
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Proposed Work Order Draft */}
                  {msg.workOrderDraft && (
                    <div className="p-3 border border-[#D97736]/40 bg-[#D97736]/8 rounded space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[#B85B1C] flex items-center gap-1.5">
                          <Wrench className="w-3.5 h-3.5" />
                          Prepared Work Order Draft ({msg.workOrderDraft.machineId})
                        </span>
                        <span className="font-mono text-[11px] text-[#172B4D]">
                          Priority: {msg.workOrderDraft.priority}
                        </span>
                      </div>
                      <p className="text-[#172334]">{msg.workOrderDraft.issue}</p>
                      <div className="text-[11px] text-[#667586]">
                        Suggested Engineer: {msg.workOrderDraft.assignedEngineer}
                      </div>

                      {msg.workOrderApprovedId ? (
                        <div className="flex items-center justify-between pt-1">
                          <span className="inline-flex items-center gap-1.5 text-[#16836B] font-semibold">
                            <CheckCircle2 className="w-4 h-4" />
                            Approved &amp; Created ({msg.workOrderApprovedId})
                          </span>
                          <button
                            type="button"
                            onClick={() => onNavigate('maintenance')}
                            className="text-xs font-medium text-[#2563A6] hover:underline"
                          >
                            View in Maintenance
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setReviewDraft({
                              messageId: msg.id,
                              draft: msg.workOrderDraft!,
                            })
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#172B4D] text-white rounded hover:bg-[#2563A6]"
                        >
                          Review &amp; Approve Maintenance Work Order
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {sending && (
              <div className="p-3 bg-white border border-[#D9E0E7] rounded-md text-xs space-y-2 max-w-md">
                <div className="flex items-center gap-2 font-semibold text-[#172B4D]">
                  <Loader2 className="w-4 h-4 animate-spin text-[#2563A6]" />
                  <span>Executing backend diagnostic tools...</span>
                </div>
                <div className="text-[11px] text-[#667586] space-y-0.5 pl-6">
                  <div>• Retrieving machine information</div>
                  <div>• Checking sensor history &amp; thresholds</div>
                  <div>• Analyzing active alerts &amp; open work orders</div>
                  <div>• Preparing maintenance recommendation</div>
                </div>
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
            className="p-3 border-t border-[#D9E0E7] bg-white flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Ask ForgeTwin AI about ${selectedContextMachineId}, alerts, or maintenance...`}
              className="flex-1 px-3 py-2 text-xs bg-[#F5F6F4] border border-[#D9E0E7] rounded focus:outline-none focus:border-[#2563A6] focus:bg-white"
            />
            <button
              type="submit"
              disabled={!input.trim() || sending}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-[#172B4D] text-white rounded hover:bg-[#2563A6] disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              Send
            </button>
          </form>
        </Panel>

        {/* Right Side: Live Factory & Selected Machine Context */}
        <div className="lg:col-span-3 space-y-4">
          <Panel title="Selected Machine Context">
            <div className="space-y-3 text-xs">
              <select
                value={selectedContextMachineId}
                onChange={(e) => setSelectedContextMachineId(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#D9E0E7] rounded font-medium"
                aria-label="Context machine selector"
              >
                {state.machines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id} — {m.name}
                  </option>
                ))}
              </select>

              {contextMachine && (
                <div className="space-y-2.5 pt-1">
                  <div className="flex items-center justify-between">
                    <StatusBadge status={contextMachine.status} />
                    <RiskBadge risk={contextMachine.riskCategory} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 font-mono tabular-nums">
                    <div className="p-2 bg-[#F5F6F4] border border-[#D9E0E7] rounded">
                      <div className="text-[10px] text-[#667586] font-sans">Temp</div>
                      <div className="font-semibold text-[#172B4D]">{contextMachine.temperature}°C</div>
                    </div>
                    <div className="p-2 bg-[#F5F6F4] border border-[#D9E0E7] rounded">
                      <div className="text-[10px] text-[#667586] font-sans">Vibration</div>
                      <div className="font-semibold text-[#172B4D]">{contextMachine.vibration} mm/s</div>
                    </div>
                    <div className="p-2 bg-[#F5F6F4] border border-[#D9E0E7] rounded">
                      <div className="text-[10px] text-[#667586] font-sans">Pressure</div>
                      <div className="font-semibold text-[#172B4D]">{contextMachine.pressure} bar</div>
                    </div>
                    <div className="p-2 bg-[#F5F6F4] border border-[#D9E0E7] rounded">
                      <div className="text-[10px] text-[#667586] font-sans">Health</div>
                      <div className="font-semibold text-[#172B4D]">{contextMachine.healthScore}%</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Panel>

          <Panel title={`Active Alerts (${activeAlerts.length})`}>
            {activeAlerts.length === 0 ? (
              <p className="text-xs text-[#667586]">No active alerts.</p>
            ) : (
              <div className="space-y-2 text-xs">
                {activeAlerts.slice(0, 4).map((a) => (
                  <div key={a.id} className="p-2 border border-[#D9E0E7] rounded">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono font-semibold text-[#172B4D] flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-[#D97736]" />
                        {a.machineId}
                      </span>
                      <SeverityBadge severity={a.severity} />
                    </div>
                    <div className="text-[11px] text-[#667586] mt-1">{a.type}</div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="System Context">
            <div className="space-y-1.5 text-xs text-[#667586]">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-[#2563A6]" /> AI Assistant
                </span>
                <span className="font-mono text-[#172B4D]">{state.systemHealth.assistantAi}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Simulator</span>
                <span className="font-mono text-[#172B4D]">{state.systemHealth.simulator}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Telemetry Stream</span>
                <span className="font-mono text-[#172B4D]">{state.systemHealth.stream}</span>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      {/* Review Screen Before Creating Work Order */}
      <ModalDialog
        open={!!reviewDraft}
        title="Review & Approve Maintenance Work Order"
        subtitle="Human authorization required before dispatching AI-prepared work order"
        onClose={() => setReviewDraft(null)}
      >
        {reviewDraft && (
          <form onSubmit={handleApproveWorkOrder} className="space-y-4 text-xs">
            <div className="p-3 bg-[#EAF0F6] border border-[#D9E0E7] rounded">
              <div className="font-semibold text-[#172B4D]">AI Engineering Rationale</div>
              <p className="text-[#172334] mt-1">{reviewDraft.draft.rationale}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-[#172334] mb-1">Target Machine</label>
                <input
                  type="text"
                  value={reviewDraft.draft.machineId}
                  onChange={(e) =>
                    setReviewDraft({
                      ...reviewDraft,
                      draft: { ...reviewDraft.draft, machineId: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 border border-[#D9E0E7] rounded font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-[#172334] mb-1">Priority</label>
                <select
                  value={reviewDraft.draft.priority}
                  onChange={(e) =>
                    setReviewDraft({
                      ...reviewDraft,
                      draft: {
                        ...reviewDraft.draft,
                        priority: e.target.value as WorkOrderDraft['priority'],
                      },
                    })
                  }
                  className="w-full px-3 py-2 border border-[#D9E0E7] rounded bg-white"
                >
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block font-medium text-[#172334] mb-1">Assigned Engineer</label>
              <select
                value={reviewDraft.draft.assignedEngineer}
                onChange={(e) =>
                  setReviewDraft({
                    ...reviewDraft,
                    draft: { ...reviewDraft.draft, assignedEngineer: e.target.value },
                  })
                }
                className="w-full px-3 py-2 border border-[#D9E0E7] rounded bg-white"
              >
                <option value="Arjun Deshmukh">Arjun Deshmukh (Mechanical Maintenance)</option>
                <option value="Priya Nair">Priya Nair (Utilities &amp; Pneumatics)</option>
                <option value="Rohan Kulkarni">Rohan Kulkarni (Automation QA)</option>
              </select>
            </div>
            <div>
              <label className="block font-medium text-[#172334] mb-1">
                Maintenance Issue &amp; Scope
              </label>
              <textarea
                rows={3}
                value={reviewDraft.draft.issue}
                onChange={(e) =>
                  setReviewDraft({
                    ...reviewDraft,
                    draft: { ...reviewDraft.draft, issue: e.target.value },
                  })
                }
                className="w-full px-3 py-2 border border-[#D9E0E7] rounded"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReviewDraft(null)}
                className="px-3.5 py-2 border border-[#D9E0E7] rounded text-[#667586]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={approving}
                className="px-4 py-2 bg-[#16836B] text-white font-medium rounded hover:bg-[#126b57]"
              >
                {approving ? 'Dispatching...' : 'Approve & Create Work Order'}
              </button>
            </div>
          </form>
        )}
      </ModalDialog>
    </div>
  );
}
