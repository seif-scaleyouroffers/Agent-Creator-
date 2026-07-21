"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { UserInputStepDraft } from "../../uiTypes";
import { CaseHandles } from "./CaseHandleList";

export interface UserInputNodeData {
  step: UserInputStepDraft;
  selected: boolean;
  onSelect: () => void;
  [key: string]: unknown;
}

// A human-in-the-loop node, rendered as a compact chip — click it to edit
// its mode/question/options in the inspector panel. "Approve / reject" gets
// one handle per option, same idea as an If/else node's cases.
export function UserInputNode({ data }: NodeProps & { data: UserInputNodeData }) {
  const { step, selected, onSelect } = data;

  return (
    <div className={`node-chip user-input-node${selected ? " node-chip-selected" : ""}`} onClick={onSelect}>
      <div className="node-chip-row">
        <span className="node-chip-icon">🙋</span>
        <div className="node-chip-text">
          <div className="node-chip-title">{step.id}</div>
          <div className="node-chip-subtitle">
            {step.mode === "approval" ? "Approve / reject" : "Ask a question"}
          </div>
        </div>
      </div>

      {step.mode === "approval" ? (
        <CaseHandles labels={step.options} />
      ) : (
        <Handle type="source" position={Position.Right} />
      )}

      <Handle type="target" position={Position.Left} />
    </div>
  );
}
