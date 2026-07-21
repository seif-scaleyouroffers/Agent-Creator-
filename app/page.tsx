"use client";

import { useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type ReactFlowInstance,
} from "@xyflow/react";
import type {
  CanvasStep,
  AgentStepDraft,
  BranchStepDraft,
  UserInputStepDraft,
  ToolChoice,
  ChatMessage,
  RunStepResult,
} from "./uiTypes";
import { IDLE_SHEET_CHECK } from "./uiTypes";
import { StepNode, type StepNodeData } from "./components/nodes/StepNode";
import { BranchNode, type BranchNodeData } from "./components/nodes/BranchNode";
import { UserInputNode, type UserInputNodeData } from "./components/nodes/UserInputNode";
import { StartNode, EndNode } from "./components/nodes/EndpointNode";
import { NodePalette } from "./components/NodePalette";
import { AIGeneratePanel } from "./components/AIGeneratePanel";
import { ChatPanel } from "./components/ChatPanel";
import { NodeInspector } from "./components/NodeInspector";
import { LandingChoice } from "./components/LandingChoice";
import { WizardChat, type WizardChatMessage } from "./components/WizardChat";
import { generatedToCanvas } from "./generatedToCanvas";

const DEFAULT_STEPS: CanvasStep[] = [
  {
    kind: "agent",
    key: "s1",
    id: "read_rows",
    prompt: "Fetch the raw rows from the sheet.",
    tool: "google_sheets_read",
    range: "Sheet1!A2:D",
    sheetUrl: "",
    sheetCheck: IDLE_SHEET_CHECK,
    position: { x: 340, y: 0 },
  },
  {
    kind: "agent",
    key: "s2",
    id: "analyze",
    prompt:
      'Here are rows from a spreadsheet (as JSON): {{read_rows.output}}\n\nSummarize the key patterns in 2-3 sentences, then list each row as "name: one-line insight".',
    tool: "",
    range: "",
    sheetUrl: "",
    sheetCheck: IDLE_SHEET_CHECK,
    position: { x: 680, y: 0 },
  },
  {
    kind: "agent",
    key: "s3",
    id: "write_result",
    prompt:
      'Take this analysis: {{analyze.output}}\n\nTurn it into rows to write to the sheet: the first row is the header ["Summary"], followed by one row per line of the analysis.',
    tool: "google_sheets_write",
    range: "Results!A1",
    sheetUrl: "",
    sheetCheck: IDLE_SHEET_CHECK,
    position: { x: 1020, y: 0 },
  },
];

const DEFAULT_EDGES: Edge[] = [
  { id: "start-s1", source: "start", target: "s1" },
  { id: "s1-s2", source: "s1", target: "s2" },
  { id: "s2-s3", source: "s2", target: "s3" },
];

const START_POSITION = { x: 0, y: 30 };
const nodeTypes = {
  step: StepNode,
  branch: BranchNode,
  user_input: UserInputNode,
  start: StartNode,
  end: EndNode,
};

export default function Home() {
  // The landing screen decides how the rest of the session builds the
  // agent — "manual" is today's palette-and-canvas builder, unchanged;
  // "wizard" is the conversational "Create with AI" flow, sharing the same
  // steps/edges state below so whatever it proposes is just as editable
  // afterward as anything built by hand. "knowledge" is a different, much
  // simpler kind of agent entirely — no step graph, just a standing Q&A
  // chat grounded in a pasted knowledge base.
  const [mode, setMode] = useState<"landing" | "manual" | "wizard" | "knowledge">("landing");
  const [agentName, setAgentName] = useState("sheet-analysis-demo");
  const [steps, setSteps] = useState<CanvasStep[]>(DEFAULT_STEPS);
  const [edges, setEdges] = useState<Edge[]>(DEFAULT_EDGES);
  const [wizardMessages, setWizardMessages] = useState<WizardChatMessage[]>([]);
  const [wizardSending, setWizardSending] = useState(false);
  const [knowledgeTopic, setKnowledgeTopic] = useState("");
  const [knowledgeBase, setKnowledgeBase] = useState("");
  const [knowledgeInstructions, setKnowledgeInstructions] = useState("");
  const [knowledgeTone, setKnowledgeTone] = useState("");
  const [knowledgeResources, setKnowledgeResources] = useState("");
  const [knowledgeMessages, setKnowledgeMessages] = useState<WizardChatMessage[]>([]);
  const [knowledgeSending, setKnowledgeSending] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiDescription, setAiDescription] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [pendingResume, setPendingResume] = useState<{
    stepId: string;
    context: Record<string, string>;
    mode: "text" | "approval";
    options?: string[];
  } | null>(null);
  const nextKey = useRef(DEFAULT_STEPS.length + 1);
  const rfInstance = useRef<ReactFlowInstance | null>(null);

  const toolSteps = steps.filter((s): s is AgentStepDraft => s.kind === "agent" && !!s.tool);
  const sheetsOk = toolSteps.every((s) => s.sheetCheck.status === "ok");

  // Catches a common mistake before it ever reaches the test chat: a prompt
  // that still has a literal `{{step_id.output}}` placeholder (copied from
  // documentation) instead of an actual step's id. The engine would only
  // discover this deep into a run — checking every prompt against the ids
  // that actually exist on the canvas surfaces it immediately instead.
  const validReferenceIds = new Set<string>([
    "user_input",
    ...steps
      .filter((s): s is AgentStepDraft | BranchStepDraft | UserInputStepDraft => s.kind !== "end")
      .map((s) => s.id),
  ]);
  // Only agent-step prompts and user_input questions are actually rendered
  // with {{step_id.output}} substitution today — branch instructions aren't
  // templated, so checking those would flag text the engine never touches.
  const promptIssues: { stepId: string; badRef: string }[] = [];
  for (const s of steps) {
    if (s.kind !== "agent" && s.kind !== "user_input") continue;
    for (const match of s.prompt.matchAll(/\{\{\s*(\w+)\.output\s*\}\}/g)) {
      const ref = match[1];
      if (!validReferenceIds.has(ref)) {
        promptIssues.push({ stepId: s.id, badRef: ref });
      }
    }
  }

  const canRun = sheetsOk && promptIssues.length === 0;
  const disabledReason = promptIssues.length > 0
    ? `Fix step "${promptIssues[0].stepId}" — it references "{{${promptIssues[0].badRef}.output}}", but no step has that id.`
    : "Check the sheet connection on every step that uses one first.";

  function updateStep(key: string, patch: Record<string, unknown>) {
    setSteps((prev) => prev.map((s) => (s.key === key ? ({ ...s, ...patch } as CanvasStep) : s)));

    // If a branch's cases (or a user_input node's approval options) changed,
    // drop any edges wired to a label that no longer exists — otherwise a
    // stale connection would silently vanish from the UI but still look
    // "wired" until the next reload.
    const labels = (patch.branches ?? patch.options) as string[] | undefined;
    if (Array.isArray(labels)) {
      setEdges((prev) =>
        prev.filter((e) => e.source !== key || (e.sourceHandle && labels.includes(e.sourceHandle)))
      );
    }
  }

  function removeStep(key: string) {
    setSteps((prev) => prev.filter((s) => s.key !== key));
    setEdges((prev) => prev.filter((e) => e.source !== key && e.target !== key));
    setSelectedKey((prev) => (prev === key ? null : prev));
  }

  // Selecting a node opens its editor in the side panel — same spot the test
  // chat uses, so only one is ever open at a time.
  function selectNode(key: string) {
    setSelectedKey(key);
    setChatOpen(false);
  }

  function nextPosition() {
    const maxX = Math.max(0, ...steps.map((s) => s.position.x));
    return { x: maxX + 340, y: 0 };
  }

  function addStep(tool: ToolChoice) {
    const key = `s${nextKey.current++}`;
    setSteps((prev) => [
      ...prev,
      {
        kind: "agent",
        key,
        id: `step_${prev.length + 1}`,
        prompt: "",
        tool,
        range: tool ? "Sheet1!A1" : "",
        sheetUrl: "",
        sheetCheck: IDLE_SHEET_CHECK,
        position: nextPosition(),
      },
    ]);
    selectNode(key);
  }

  function addBranch() {
    const key = `b${nextKey.current++}`;
    setSteps((prev) => [
      ...prev,
      {
        kind: "branch",
        key,
        id: `branch_${prev.length + 1}`,
        basedOn: "",
        instructions: "",
        branches: ["Case 1", "Else"],
        position: nextPosition(),
      },
    ]);
    selectNode(key);
  }

  function addUserInput() {
    const key = `u${nextKey.current++}`;
    setSteps((prev) => [
      ...prev,
      {
        kind: "user_input",
        key,
        id: `ask_${prev.length + 1}`,
        mode: "text",
        prompt: "",
        options: ["Approve", "Reject"],
        position: nextPosition(),
      },
    ]);
    selectNode(key);
  }

  function addEnd() {
    const key = `e${nextKey.current++}`;
    setSteps((prev) => [...prev, { kind: "end", key, position: nextPosition() }]);
    selectNode(key);
  }

  // The landing screen's entry points. "Create manually" just switches to
  // the existing builder, keeping the demo canvas as a starting point.
  // "Create with AI" clears it — the wizard builds the graph up from
  // nothing as the conversation progresses, so starting from the demo would
  // look like it had already done something before the chat even began.
  // "Knowledge agent" resets its own separate setup+chat state.
  function chooseManual() {
    setMode("manual");
  }
  function chooseWizard() {
    setSteps([]);
    setEdges([]);
    setAgentName("new-agent");
    setWizardMessages([]);
    setSelectedKey(null);
    setChatOpen(false);
    setMode("wizard");
  }
  function chooseKnowledgeAgent() {
    setKnowledgeTopic("");
    setKnowledgeBase("");
    setKnowledgeInstructions("");
    setKnowledgeTone("");
    setKnowledgeResources("");
    setKnowledgeMessages([]);
    setMode("knowledge");
  }

  // One turn of the Knowledge agent's chat — resends the whole conversation
  // plus the current knowledge base/instructions/tone/resource links each
  // time (no server-side session), so editing any of them mid-conversation
  // takes effect on the very next message. Linked Google Docs/Sheets are
  // fetched fresh server-side on every turn, same reasoning.
  async function sendKnowledgeMessage(text: string) {
    const history = [...knowledgeMessages, { role: "user" as const, text }];
    setKnowledgeMessages(history);
    setKnowledgeSending(true);
    try {
      const res = await fetch("/api/knowledge-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: knowledgeTopic,
          knowledgeBase,
          instructions: knowledgeInstructions,
          toneReference: knowledgeTone,
          resourceLinks: knowledgeResources,
          messages: history.map((m) => ({ role: m.role, content: m.text })),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setKnowledgeMessages((prev) => [
          ...prev,
          { role: "assistant", text: data.reply, statusChecks: data.resourceChecks },
        ]);
      } else {
        setKnowledgeMessages((prev) => [
          ...prev,
          { role: "assistant", text: data.error ?? "Something went wrong.", isError: true },
        ]);
      }
    } catch (err) {
      setKnowledgeMessages((prev) => [
        ...prev,
        { role: "assistant", text: err instanceof Error ? err.message : "Request failed.", isError: true },
      ]);
    } finally {
      setKnowledgeSending(false);
    }
  }

  // One wizard turn: send the whole conversation so far (no server-side
  // session, same stateless pattern as the run-agent/generate-agent APIs),
  // append whatever it says back, and — if it proposed or revised the
  // agent this turn — replace the canvas with the new draft, same shape a
  // manual edit or the one-shot generator would produce.
  async function sendWizardMessage(text: string) {
    const history = [...wizardMessages, { role: "user" as const, text }];
    setWizardMessages(history);
    setWizardSending(true);
    try {
      const res = await fetch("/api/wizard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.map((m) => ({ role: m.role, content: m.text })) }),
      });
      const data = await res.json();
      if (data.ok) {
        setWizardMessages((prev) => [
          ...prev,
          { role: "assistant", text: data.reply, statusChecks: data.sheetChecks },
        ]);
        if (data.agent) {
          const { steps: newSteps, edges: newEdges } = generatedToCanvas(data.agent);
          setAgentName(data.agent.name || agentName);
          setSteps(newSteps);
          setEdges(newEdges);
          setSelectedKey(null);
        }
      } else {
        setWizardMessages((prev) => [
          ...prev,
          { role: "assistant", text: data.error ?? "Something went wrong.", isError: true },
        ]);
      }
    } catch (err) {
      setWizardMessages((prev) => [
        ...prev,
        { role: "assistant", text: err instanceof Error ? err.message : "Request failed.", isError: true },
      ]);
    } finally {
      setWizardSending(false);
    }
  }

  // Replaces the whole canvas with Claude's draft for the given description
  // — same steps/edges shapes the manual palette produces, so the result is
  // just as editable afterward (nothing here runs on its own).
  async function generateWithAI() {
    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await fetch("/api/generate-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: aiDescription }),
      });
      const data = await res.json();
      if (data.ok) {
        const { steps: newSteps, edges: newEdges } = generatedToCanvas(data.agent);
        setAgentName(data.agent.name || agentName);
        setSteps(newSteps);
        setEdges(newEdges);
        setChatOpen(false);
        setSelectedKey(null);
        setMessages([]);
        setAiPanelOpen(false);
      } else {
        setGenerateError(data.error ?? "Generation failed.");
      }
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setGenerating(false);
    }
  }

  async function checkSheet(key: string) {
    const step = steps.find((s) => s.key === key);
    if (!step || step.kind !== "agent") return;
    updateStep(key, { sheetCheck: { status: "checking", message: "Checking..." } });
    try {
      const res = await fetch("/api/sheets/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: step.sheetUrl }),
      });
      const data = await res.json();
      if (data.ok) {
        updateStep(key, {
          sheetCheck: {
            status: "ok",
            message: `Connected: "${data.title}" (tabs: ${data.tabs.join(", ")})`,
            spreadsheetId: data.spreadsheetId,
            title: data.title,
            tabs: data.tabs,
          },
        });
      } else {
        updateStep(key, {
          sheetCheck: { status: "error", message: data.error ?? "Couldn't connect." },
        });
      }
    } catch (err) {
      updateStep(key, {
        sheetCheck: {
          status: "error",
          message: err instanceof Error ? err.message : "Request failed.",
        },
      });
    }
  }

  // Builds the canvas nodes from `steps` — position and content both live on
  // each step. This only reruns when a step's content/selection actually
  // changes (add/remove/edit/select), NOT on every drag frame — see `nodes`
  // state and onNodesChange below for how dragging stays smooth.
  function buildNodes(currentSteps: CanvasStep[], currentSelectedKey: string | null): Node[] {
    return [
      { id: "start", type: "start", position: START_POSITION, data: {}, draggable: false },
      ...currentSteps.map((step) => {
        if (step.kind === "end") {
          return { id: step.key, type: "end", position: step.position, data: {} };
        }
        if (step.kind === "branch") {
          return {
            id: step.key,
            type: "branch",
            position: step.position,
            data: {
              step,
              selected: currentSelectedKey === step.key,
              onSelect: () => selectNode(step.key),
            } satisfies BranchNodeData,
          };
        }
        if (step.kind === "user_input") {
          return {
            id: step.key,
            type: "user_input",
            position: step.position,
            data: {
              step,
              selected: currentSelectedKey === step.key,
              onSelect: () => selectNode(step.key),
            } satisfies UserInputNodeData,
          };
        }
        return {
          id: step.key,
          type: "step",
          position: step.position,
          data: {
            step,
            selected: currentSelectedKey === step.key,
            onSelect: () => selectNode(step.key),
          } satisfies StepNodeData,
        };
      }),
    ];
  }

  const [nodes, setNodes] = useState<Node[]>(() => buildNodes(steps, null));

  // Rebuilds the node list whenever a step's content or the selection
  // actually changes. Dragging doesn't touch `steps` until the gesture ends
  // (see onNodesChange), so this doesn't run on every drag frame.
  useEffect(() => {
    setNodes(buildNodes(steps, selectedKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, selectedKey]);

  // Applying every change (including intermediate drag frames) straight to
  // `nodes` state via `applyNodeChanges` is what makes a node track the
  // cursor 1:1 while it's being dragged — React Flow is a controlled
  // component here, so without this the node wouldn't move at all until the
  // gesture ends. This only patches the moved node, so it's cheap even
  // though it runs on every frame. `steps` (the source of truth used
  // elsewhere — running the agent, rebuilding `nodes` on content edits,
  // laying out new nodes) only needs the final position, committed once the
  // drag ends (`dragging: false`).
  function onNodesChange(changes: NodeChange[]) {
    setNodes((nds) => applyNodeChanges(changes, nds));
    for (const change of changes) {
      if (change.type === "position" && change.position && change.id !== "start" && change.dragging === false) {
        const pos = change.position;
        setSteps((prev) => prev.map((s) => (s.key === change.id ? { ...s, position: pos } : s)));
      }
      if (change.type === "remove" && change.id !== "start") {
        removeStep(change.id);
      }
    }
  }

  function onEdgesChange(changes: EdgeChange[]) {
    setEdges((prev) => applyEdgeChanges(changes, prev));
  }

  // A source handle (a node's default output, or one labeled branch case)
  // can only lead to one place — connecting it elsewhere replaces the old
  // wire rather than adding a second path out of the same handle.
  function onConnect(connection: Connection) {
    setEdges((prev) => {
      const filtered = prev.filter(
        (e) => !(e.source === connection.source && e.sourceHandle === connection.sourceHandle)
      );
      return addEdge(connection, filtered);
    });
  }

  // Re-center the canvas whenever a node is added/removed, or the side panel
  // (chat or inspector) opens/closes (which resizes the canvas but doesn't
  // itself re-fit it) — React Flow's `fitView` prop only fits on the initial
  // render.
  useEffect(() => {
    rfInstance.current?.fitView({ padding: 0.2, duration: 300 });
  }, [steps.length, chatOpen, aiPanelOpen, selectedKey]);

  function buildRunConfig() {
    const keyToId = new Map(
      steps
        .filter((s): s is AgentStepDraft | BranchStepDraft | UserInputStepDraft => s.kind !== "end")
        .map((s) => [s.key, s.id])
    );

    function nextFor(sourceKey: string, sourceHandle: string | null | undefined) {
      const edge = edges.find(
        (e) => e.source === sourceKey && (e.sourceHandle ?? null) === (sourceHandle ?? null)
      );
      if (!edge) return undefined;
      return keyToId.get(edge.target); // undefined if target is an End node -> naturally terminal
    }

    // The step feeding into `targetKey`, via whatever's actually wired to its
    // incoming edge — this is what lets a user_input step use that step's
    // output without anyone having to type a {{step_id.output}} placeholder.
    function incomingIdFor(targetKey: string) {
      const edge = edges.find((e) => e.target === targetKey);
      return edge ? keyToId.get(edge.source) : undefined;
    }

    const startEdge = edges.find((e) => e.source === "start");
    const start = startEdge ? keyToId.get(startEdge.target) : undefined;

    const configSteps = steps
      .filter((s): s is AgentStepDraft | BranchStepDraft | UserInputStepDraft => s.kind !== "end")
      .map((s) => {
        if (s.kind === "branch") {
          return {
            id: s.id,
            kind: "branch" as const,
            basedOn: s.basedOn,
            instructions: s.instructions,
            branches: s.branches.map((label) => ({ label, next: nextFor(s.key, label) })),
          };
        }
        if (s.kind === "user_input") {
          // If the question doesn't already reference a step's output by
          // hand, fall back to whatever step actually feeds this one on the
          // canvas — so the common case (write a plain question, wire it to
          // the step it's confirming) just works with no placeholder typing.
          const incomingId = incomingIdFor(s.key);
          const hasManualReference = /\{\{\s*\w+\.output\s*\}\}/.test(s.prompt);
          const prompt =
            incomingId && !hasManualReference ? `${s.prompt}\n\n{{${incomingId}.output}}` : s.prompt;
          return {
            id: s.id,
            kind: "user_input" as const,
            mode: s.mode,
            prompt,
            ...(s.mode === "approval"
              ? { branches: s.options.map((label) => ({ label, next: nextFor(s.key, label) })) }
              : { next: nextFor(s.key, undefined) }),
          };
        }
        return {
          id: s.id,
          prompt: s.prompt,
          ...(s.tool
            ? {
                tool: s.tool,
                tool_params: { spreadsheetId: s.sheetCheck.spreadsheetId, range: s.range },
              }
            : {}),
          next: nextFor(s.key, undefined),
        };
      });

    return { name: agentName, model: "claude-sonnet-5", start, steps: configSteps };
  }

  function openChat() {
    setChatOpen(true);
    setSelectedKey(null);
    setMessages([]);
    setPendingResume(null);
    turnStepsRef.current = [];
  }

  // One "turn" (from the user's message to a final reply) can span several
  // requests if the agent pauses on a user_input step along the way — each
  // leg's steps accumulate here so the final reply's "Show steps" toggle
  // shows the whole turn, not just its last leg.
  const turnStepsRef = useRef<RunStepResult[]>([]);

  async function runTurn(body: {
    config: ReturnType<typeof buildRunConfig>;
    input?: string;
    resume?: { stepId: string; context: Record<string, string>; answer: string };
  }) {
    setSending(true);
    try {
      const res = await fetch("/api/run-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!data.ok) {
        setMessages((prev) => [...prev, { role: "agent", text: data.error ?? "Run failed.", isError: true }]);
        setPendingResume(null);
        return;
      }

      turnStepsRef.current = [...turnStepsRef.current, ...(data.steps ?? [])];

      if (data.status === "waiting_for_input") {
        setMessages((prev) => [...prev, { role: "agent", text: data.pending.prompt, isPending: true }]);
        setPendingResume({
          stepId: data.pending.stepId,
          context: data.context,
          mode: data.pending.mode,
          options: data.pending.options,
        });
      } else {
        const stepsSoFar = data.steps as { id: string; output: string }[];
        const reply = stepsSoFar.length
          ? stepsSoFar[stepsSoFar.length - 1].output
          : "(the agent produced no output)";
        setMessages((prev) => [...prev, { role: "agent", text: reply, steps: [...turnStepsRef.current] }]);
        setPendingResume(null);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "agent", text: err instanceof Error ? err.message : "Request failed.", isError: true },
      ]);
      setPendingResume(null);
    } finally {
      setSending(false);
    }
  }

  async function sendMessage(message: string) {
    setMessages((prev) => [...prev, { role: "user", text: message }]);

    const config = buildRunConfig();
    if (!config.start) {
      setMessages((prev) => [
        ...prev,
        { role: "agent", text: "Connect the Start node to a step first (drag from its edge).", isError: true },
      ]);
      return;
    }

    if (pendingResume) {
      await runTurn({
        config,
        resume: { stepId: pendingResume.stepId, context: pendingResume.context, answer: message },
      });
    } else {
      turnStepsRef.current = [];
      await runTurn({ config, input: message });
    }
  }

  async function sendApproval(label: string) {
    if (!pendingResume) return;
    setMessages((prev) => [...prev, { role: "user", text: label }]);
    const config = buildRunConfig();
    await runTurn({
      config,
      resume: { stepId: pendingResume.stepId, context: pendingResume.context, answer: label },
    });
  }

  const selectedStep = steps.find((s) => s.key === selectedKey) ?? null;
  const stepIdOptionsForInspector =
    selectedStep && selectedStep.kind !== "end"
      ? steps
          .filter((s): s is AgentStepDraft | BranchStepDraft | UserInputStepDraft => s.kind !== "end")
          .map((s) => s.id)
          .filter((id) => id !== selectedStep.id)
      : [];
  // Which step's output a user_input step will automatically include (see
  // buildRunConfig) — shown in the inspector so it's obvious without needing
  // to type anything.
  const autoIncludedStepId = (() => {
    if (!selectedStep || selectedStep.kind !== "user_input") return undefined;
    const edge = edges.find((e) => e.target === selectedStep.key);
    if (!edge) return undefined;
    const source = steps.find((s) => s.key === edge.source);
    return source && source.kind !== "end" ? source.id : undefined;
  })();

  // Shared between the manual builder and the wizard's live preview pane —
  // both just render whatever's in `steps`/`edges` right now, however it
  // got there.
  const flowCanvas = (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onInit={(instance) => {
        rfInstance.current = instance;
      }}
      onPaneClick={() => setSelectedKey(null)}
      fitView
      proOptions={{ hideAttribution: true }}
    >
      <Background color="rgba(254,242,222,0.15)" gap={24} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );

  if (mode === "landing") {
    return (
      <main>
        <LandingChoice
          onCreateWithAI={chooseWizard}
          onCreateManually={chooseManual}
          onCreateKnowledgeAgent={chooseKnowledgeAgent}
        />
      </main>
    );
  }

  if (mode === "wizard") {
    return (
      <main>
        <div className="wizard-layout">
          <div className="wizard-chat-pane">
            <button className="button-secondary" onClick={() => setMode("landing")} style={{ marginBottom: "1rem" }}>
              ← Back
            </button>
            <h1 style={{ marginBottom: "0.25rem" }}>Create with AI</h1>
            <p style={{ color: "rgba(254,242,222,0.6)", marginTop: 0, marginBottom: "1rem" }}>
              Describe what you want — I&apos;ll ask what I need to know, verify any sheets you
              connect, and build the agent as we go.
            </p>
            <WizardChat messages={wizardMessages} sending={wizardSending} onSend={sendWizardMessage} />
          </div>

          <div className="wizard-preview-pane">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <h2 style={{ margin: 0 }}>{steps.length === 0 ? "Preview" : agentName}</h2>
              <button className="button-primary" onClick={() => setMode("manual")} disabled={steps.length === 0}>
                Switch to manual editing
              </button>
            </div>
            <div className="flow-canvas">
              {steps.length === 0 ? (
                <div className="wizard-empty-canvas">
                  Nothing built yet — answer a few questions to get started.
                </div>
              ) : (
                flowCanvas
              )}
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (mode === "knowledge") {
    const canChat = knowledgeBase.trim().length > 0;
    return (
      <main>
        <div className="wizard-layout">
          <div className="knowledge-setup-pane">
            <button className="button-secondary" onClick={() => setMode("landing")} style={{ marginBottom: "1rem" }}>
              ← Back
            </button>
            <h1 style={{ marginBottom: "0.25rem" }}>Knowledge agent</h1>
            <p style={{ color: "rgba(254,242,222,0.6)", marginTop: 0, marginBottom: "1rem" }}>
              Paste in either reference info to answer questions from, or a process/template to
              walk through and produce something from (a job description, a checklist, etc.).
            </p>

            <label className="field-label" htmlFor="knowledge-topic">
              Topic / name
            </label>
            <input
              id="knowledge-topic"
              value={knowledgeTopic}
              onChange={(e) => setKnowledgeTopic(e.target.value)}
              placeholder="e.g. Printer troubleshooting, or Job description writer"
              style={{ width: "100%", marginBottom: "0.85rem" }}
            />

            <label className="field-label" htmlFor="knowledge-base">
              Knowledge base
            </label>
            <textarea
              id="knowledge-base"
              className="knowledge-base-textarea"
              value={knowledgeBase}
              onChange={(e) => setKnowledgeBase(e.target.value)}
              placeholder="Docs/FAQs to answer from, or a process to follow — e.g. what to ask for and what format to write a job description in."
              rows={14}
              style={{ width: "100%", marginBottom: "0.85rem" }}
            />

            <label className="field-label" htmlFor="knowledge-instructions">
              Extra instructions (optional)
            </label>
            <textarea
              id="knowledge-instructions"
              value={knowledgeInstructions}
              onChange={(e) => setKnowledgeInstructions(e.target.value)}
              placeholder="e.g. Keep answers short. Always suggest contacting support if the issue involves hardware damage."
              rows={3}
              style={{ width: "100%", marginBottom: "0.85rem" }}
            />

            <label className="field-label" htmlFor="knowledge-tone">
              Tone reference (optional)
            </label>
            <textarea
              id="knowledge-tone"
              value={knowledgeTone}
              onChange={(e) => setKnowledgeTone(e.target.value)}
              placeholder="Paste a sample of copy written in the voice you want — the agent mimics this style for anything it writes, without treating it as factual knowledge."
              rows={5}
              style={{ width: "100%", marginBottom: "0.85rem" }}
            />

            <label className="field-label" htmlFor="knowledge-resources">
              Resources (optional)
            </label>
            <textarea
              id="knowledge-resources"
              value={knowledgeResources}
              onChange={(e) => setKnowledgeResources(e.target.value)}
              placeholder={"Google Docs or Sheets links, one per line — fetched fresh each message.\nhttps://docs.google.com/document/d/...\nhttps://docs.google.com/spreadsheets/d/..."}
              rows={3}
              style={{ width: "100%" }}
            />
          </div>

          <div className="knowledge-chat-pane">
            <h2 style={{ marginTop: 0, marginBottom: "0.75rem" }}>{knowledgeTopic || "Test chat"}</h2>
            <WizardChat
              messages={knowledgeMessages}
              sending={knowledgeSending}
              onSend={sendKnowledgeMessage}
              disabled={!canChat}
              disabledReason="Paste in a knowledge base first."
              placeholder="Ask a question..."
              emptyStateText="Paste in a knowledge base on the left, then ask it anything about that topic."
            />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="builder-layout">
        <div className="builder-main">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "1rem" }}>
            <div>
              <h1 style={{ marginBottom: "0.25rem" }}>Agent Builder</h1>
              <p style={{ color: "rgba(254,242,222,0.6)", marginTop: 0 }}>
                Build a graph of steps — drag from a node&apos;s edge to connect it to what runs next.
              </p>
            </div>
            <div style={{ minWidth: 260 }}>
              <label className="field-label" htmlFor="agent-name">
                Agent name
              </label>
              <input
                id="agent-name"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>
          </div>

          <div className="canvas-shell">
            {aiPanelOpen ? (
              <AIGeneratePanel
                description={aiDescription}
                setDescription={setAiDescription}
                onGenerate={generateWithAI}
                generating={generating}
                error={generateError}
                onClose={() => setAiPanelOpen(false)}
              />
            ) : (
              <NodePalette
                onAdd={addStep}
                onAddBranch={addBranch}
                onAddUserInput={addUserInput}
                onAddEnd={addEnd}
                onOpenAI={() => setAiPanelOpen(true)}
              />
            )}
            <div className="flow-canvas">{flowCanvas}</div>
          </div>

          <div style={{ margin: "1.5rem 0" }}>
            <button className="button-primary" onClick={chatOpen ? () => setChatOpen(false) : openChat} disabled={!canRun}>
              {chatOpen ? "Close test chat" : "Test agent"}
            </button>
            {!canRun && (
              <span style={{ marginLeft: "0.75rem", color: "rgba(254,242,222,0.5)", fontSize: "0.85rem" }}>
                {disabledReason}
              </span>
            )}
          </div>

          <p style={{ fontSize: "0.8rem", color: "rgba(254,242,222,0.4)" }}>
            Reference <code>{"{{user_input.output}}"}</code> in a step&apos;s prompt to use
            whatever gets typed in the test chat. A user input step automatically includes
            whatever step feeds into it — no need to type a placeholder for that. Agents built
            here aren&apos;t saved between visits yet — that&apos;s the next milestone (see
            ROADMAP.md). While loops aren&apos;t wired up yet either — the palette only shows
            what actually runs today.
          </p>
        </div>

        {selectedStep && (
          <div className="side-panel">
            <NodeInspector
              step={selectedStep}
              stepIdOptions={stepIdOptionsForInspector}
              autoIncludedStepId={autoIncludedStepId}
              onChange={(patch) => updateStep(selectedStep.key, patch)}
              onRemove={() => removeStep(selectedStep.key)}
              onCheckSheet={() => checkSheet(selectedStep.key)}
              onClose={() => setSelectedKey(null)}
            />
          </div>
        )}

        {chatOpen && (
          <div className="side-panel chat-sidebar">
            <h2 style={{ marginTop: 0, marginBottom: "0.75rem" }}>Test chat</h2>
            <ChatPanel
              messages={messages}
              sending={sending}
              canSend={canRun}
              disabledReason={disabledReason}
              onSend={sendMessage}
              pendingOptions={pendingResume?.mode === "approval" ? pendingResume.options : undefined}
              onApprove={sendApproval}
            />
          </div>
        )}
      </div>
    </main>
  );
}
