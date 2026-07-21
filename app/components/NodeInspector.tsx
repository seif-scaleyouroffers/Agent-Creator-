"use client";

import type { AgentStepDraft, BranchStepDraft, CanvasStep, ToolChoice, UserInputStepDraft } from "../uiTypes";
import { EditableCaseList } from "./nodes/CaseHandleList";
import { RefineButton } from "./RefineButton";

// The full editable form for whichever step is selected on the canvas —
// pops into the side panel (replacing the test chat there) instead of
// living inline on the node, so the canvas itself can stay a row of compact
// chips even for a graph with many steps.
export function NodeInspector({
  step,
  stepIdOptions,
  autoIncludedStepId,
  onChange,
  onRemove,
  onCheckSheet,
  onClose,
}: {
  step: CanvasStep;
  stepIdOptions: string[];
  autoIncludedStepId?: string;
  onChange: (patch: Record<string, unknown>) => void;
  onRemove: () => void;
  onCheckSheet: () => void;
  onClose: () => void;
}) {
  return (
    <div className="inspector-panel card">
      <div className="inspector-header">
        {step.kind === "end" ? (
          <span className="field-label" style={{ marginBottom: 0 }}>
            End
          </span>
        ) : (
          <input value={step.id} onChange={(e) => onChange({ id: e.target.value })} />
        )}
        <div style={{ display: "flex", gap: "0.4rem", flexShrink: 0 }}>
          <button className="button-secondary" onClick={onRemove} style={{ padding: "0.2rem 0.5rem" }}>
            ✕ Remove
          </button>
          <button className="button-secondary" onClick={onClose} style={{ padding: "0.2rem 0.5rem" }}>
            Close
          </button>
        </div>
      </div>

      {step.kind === "end" && (
        <p style={{ fontSize: "0.85rem", color: "rgba(254,242,222,0.5)" }}>
          Marks a path as finished — nothing to configure.
        </p>
      )}
      {step.kind === "agent" && <AgentFields step={step} onChange={onChange} onCheckSheet={onCheckSheet} />}
      {step.kind === "branch" && (
        <BranchFields step={step} stepIdOptions={stepIdOptions} onChange={onChange} />
      )}
      {step.kind === "user_input" && (
        <UserInputFields step={step} onChange={onChange} autoIncludedStepId={autoIncludedStepId} />
      )}
    </div>
  );
}

function AgentFields({
  step,
  onChange,
  onCheckSheet,
}: {
  step: AgentStepDraft;
  onChange: (patch: Record<string, unknown>) => void;
  onCheckSheet: () => void;
}) {
  const { sheetCheck } = step;

  return (
    <>
      <label className="field-label">Prompt</label>
      <textarea value={step.prompt} onChange={(e) => onChange({ prompt: e.target.value })} rows={6} />
      <RefineButton text={step.prompt} kind="agent_prompt" onRefined={(prompt) => onChange({ prompt })} />

      <label className="field-label">Tool</label>
      <select value={step.tool} onChange={(e) => onChange({ tool: e.target.value as ToolChoice })}>
        <option value="">None (just ask Claude)</option>
        <option value="google_sheets_read">Read Google Sheet</option>
        <option value="google_sheets_write">Write Google Sheet</option>
      </select>

      {step.tool && (
        <>
          <label className="field-label">Range (A1 notation)</label>
          <input
            value={step.range}
            onChange={(e) => onChange({ range: e.target.value })}
            placeholder="Sheet1!A2:D"
          />

          <label className="field-label">Google Sheet URL</label>
          <div style={{ display: "flex", gap: "0.4rem" }}>
            <input
              value={step.sheetUrl}
              onChange={(e) => onChange({ sheetUrl: e.target.value })}
              placeholder="Paste sheet URL"
              style={{ flex: 1, minWidth: 0 }}
            />
            <button
              className="button-secondary"
              onClick={onCheckSheet}
              disabled={!step.sheetUrl || sheetCheck.status === "checking"}
              style={{ padding: "0.4rem 0.6rem", fontSize: "0.8rem" }}
            >
              Check
            </button>
          </div>
          {sheetCheck.status !== "idle" && (
            <div
              className={`status-badge ${sheetCheck.status === "ok" ? "status-ok" : sheetCheck.status === "error" ? "status-error" : ""}`}
              style={{ marginTop: "0.4rem", fontSize: "0.75rem" }}
            >
              {sheetCheck.message}
            </div>
          )}
        </>
      )}
    </>
  );
}

function BranchFields({
  step,
  stepIdOptions,
  onChange,
}: {
  step: BranchStepDraft;
  stepIdOptions: string[];
  onChange: (patch: Record<string, unknown>) => void;
}) {
  return (
    <>
      <label className="field-label">Classify based on</label>
      <select value={step.basedOn} onChange={(e) => onChange({ basedOn: e.target.value })}>
        <option value="">Select a step...</option>
        {stepIdOptions.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>

      <label className="field-label">Instructions</label>
      <textarea
        value={step.instructions}
        onChange={(e) => onChange({ instructions: e.target.value })}
        rows={3}
        placeholder="What each case means, e.g. 'Sales if about pricing/deals, Support if about a problem, else Other.'"
      />
      <RefineButton
        text={step.instructions}
        kind="branch_instructions"
        onRefined={(instructions) => onChange({ instructions })}
      />

      <label className="field-label">Cases</label>
      <EditableCaseList labels={step.branches} onChange={(branches) => onChange({ branches })} addLabel="+ Add case" />
    </>
  );
}

function UserInputFields({
  step,
  autoIncludedStepId,
  onChange,
}: {
  step: UserInputStepDraft;
  autoIncludedStepId?: string;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  return (
    <>
      <label className="field-label">Mode</label>
      <select value={step.mode} onChange={(e) => onChange({ mode: e.target.value as "text" | "approval" })}>
        <option value="text">Ask a question</option>
        <option value="approval">Approve / reject</option>
      </select>

      <label className="field-label">{step.mode === "approval" ? "Confirmation message" : "Question"}</label>
      <textarea
        value={step.prompt}
        onChange={(e) => onChange({ prompt: e.target.value })}
        rows={3}
        placeholder={step.mode === "approval" ? "e.g. Does this look correct?" : "e.g. What English level should this candidate have?"}
      />
      <RefineButton text={step.prompt} kind="user_input_question" onRefined={(prompt) => onChange({ prompt })} />
      <p style={{ fontSize: "0.78rem", color: "rgba(254,242,222,0.45)", marginTop: "0.35rem" }}>
        {autoIncludedStepId
          ? `The output of "${autoIncludedStepId}" (connected on the canvas) is added automatically — no need to reference it by hand.`
          : "Connect a step into this one on the canvas and its output is added automatically."}
      </p>

      {step.mode === "approval" && (
        <>
          <label className="field-label">Options</label>
          <EditableCaseList labels={step.options} onChange={(options) => onChange({ options })} addLabel="+ Add option" />
        </>
      )}
    </>
  );
}
