"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { BranchStepDraft } from "../../uiTypes";
import { CaseHandles } from "./CaseHandleList";

export interface BranchNodeData {
  step: BranchStepDraft;
  selected: boolean;
  onSelect: () => void;
  [key: string]: unknown;
}

// An If/else node, rendered as a compact chip — click it to edit which step
// to classify on and each case's instructions in the inspector panel. Each
// case still gets its own connectable handle here, since that's what a wire
// on the canvas actually attaches to.
export function BranchNode({ data }: NodeProps & { data: BranchNodeData }) {
  const { step, selected, onSelect } = data;

  return (
    <div className={`node-chip branch-node${selected ? " node-chip-selected" : ""}`} onClick={onSelect}>
      <div className="node-chip-row">
        <span className="node-chip-icon">🔀</span>
        <div className="node-chip-text">
          <div className="node-chip-title">{step.id}</div>
          <div className="node-chip-subtitle">If / else</div>
        </div>
      </div>

      <CaseHandles labels={step.branches} />

      <Handle type="target" position={Position.Left} />
    </div>
  );
}
