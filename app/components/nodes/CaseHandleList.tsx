"use client";

import { Handle, Position } from "@xyflow/react";

// Editable list of case labels (add/rename/remove) — used in the inspector
// panel, which lives outside the canvas, so no Handles here.
export function EditableCaseList({
  labels,
  onChange,
  addLabel,
}: {
  labels: string[];
  onChange: (labels: string[]) => void;
  addLabel: string;
}) {
  function update(index: number, value: string) {
    onChange(labels.map((l, i) => (i === index ? value : l)));
  }

  function add() {
    onChange([...labels, `Case ${labels.length + 1}`]);
  }

  function remove(index: number) {
    onChange(labels.filter((_, i) => i !== index));
  }

  return (
    <>
      <div className="branch-case-list">
        {labels.map((label, i) => (
          <div key={i} className="branch-case-row">
            <input value={label} onChange={(e) => update(i, e.target.value)} />
            <button
              className="button-secondary"
              onClick={() => remove(i)}
              style={{ padding: "0.1rem 0.4rem", fontSize: "0.75rem" }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button className="button-secondary" onClick={add} style={{ marginTop: "0.4rem" }}>
        {addLabel}
      </button>
    </>
  );
}

// Read-only case labels, each with its own connectable source handle — used
// on the compact canvas chip. Renaming/adding/removing cases happens in the
// inspector instead; this just shows where each one connects.
export function CaseHandles({ labels }: { labels: string[] }) {
  return (
    <div className="branch-case-list node-chip-cases">
      {labels.map((label) => (
        <div key={label} className="branch-case-row node-chip-case-row">
          <span className="node-chip-case-label">{label}</span>
          <Handle type="source" position={Position.Right} id={label} />
        </div>
      ))}
    </div>
  );
}
