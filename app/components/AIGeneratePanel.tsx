"use client";

// Swaps into the palette's spot (left side) when "Generate with AI" is
// clicked — same idea as the test chat sidebar on the right, just for
// describing an agent instead of testing one.
export function AIGeneratePanel({
  description,
  setDescription,
  onGenerate,
  generating,
  error,
  onClose,
}: {
  description: string;
  setDescription: (value: string) => void;
  onGenerate: () => void;
  generating: boolean;
  error: string | null;
  onClose: () => void;
}) {
  return (
    <div className="card ai-generate-panel">
      <div className="ai-panel-header">
        <span className="field-label" style={{ marginBottom: 0 }}>
          ✨ Generate with AI
        </span>
        <button className="button-secondary" onClick={onClose} style={{ padding: "0.2rem 0.5rem" }}>
          ✕
        </button>
      </div>
      <p style={{ fontSize: "0.82rem", color: "rgba(254,242,222,0.5)", marginTop: "0.5rem" }}>
        Describe what you want the agent to do — Claude drafts the step graph for you to review.
      </p>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="e.g. Read new rows from a Sheet, summarize each one, and write the summary to another tab."
        style={{ flex: 1, width: "100%", resize: "none" }}
      />
      <button
        className="button-primary"
        onClick={onGenerate}
        disabled={!description.trim() || generating}
        style={{ marginTop: "0.75rem" }}
      >
        {generating ? "Generating..." : "Generate with AI"}
      </button>
      <p style={{ fontSize: "0.75rem", color: "rgba(254,242,222,0.4)", marginTop: "0.5rem", marginBottom: 0 }}>
        This replaces the current canvas with a draft — nothing runs automatically.
      </p>
      {error && (
        <div className="status-badge status-error" style={{ marginTop: "0.6rem" }}>
          {error}
        </div>
      )}
    </div>
  );
}
