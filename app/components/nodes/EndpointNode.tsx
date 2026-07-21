"use client";

import { Handle, Position } from "@xyflow/react";

// The fixed Start/End pills that bookend the step chain — not editable, just
// visual anchors so the canvas reads as a flow rather than a bare list.
export function StartNode() {
  return (
    <div className="endpoint-node">
      Start
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export function EndNode() {
  return (
    <div className="endpoint-node">
      <Handle type="target" position={Position.Left} />
      End
    </div>
  );
}
