"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { AgentStepDraft } from "../../uiTypes";

export interface StepNodeData {
  step: AgentStepDraft;
  selected: boolean;
  onSelect: () => void;
  [key: string]: unknown;
}

const TOOL_LABELS: Record<string, string> = {
  google_sheets_read: "Read Google Sheet",
  google_sheets_write: "Write Google Sheet",
};

// A step, rendered as a compact chip — click it to edit its prompt/tool/sheet
// in the inspector panel instead of inline, so a graph of many steps still
// fits on screen at a glance.
export function StepNode({ data }: NodeProps & { data: StepNodeData }) {
  const { step, selected, onSelect } = data;

  return (
    <div className={`node-chip${selected ? " node-chip-selected" : ""}`} onClick={onSelect}>
      <div className="node-chip-row">
        <span className="node-chip-icon">{step.tool ? "📊" : "🤖"}</span>
        <div className="node-chip-text">
          <div className="node-chip-title">{step.id}</div>
          <div className="node-chip-subtitle">{step.tool ? TOOL_LABELS[step.tool] : "Agent step"}</div>
        </div>
      </div>

      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
