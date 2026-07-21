"use client";

import type { ToolChoice } from "../uiTypes";

interface PaletteItem {
  tool: ToolChoice;
  label: string;
  swatch: string;
}

const CORE: PaletteItem[] = [{ tool: "", label: "Agent step", swatch: "#6b7fd7" }];

const TOOLS: PaletteItem[] = [
  { tool: "google_sheets_read", label: "Read Google Sheet", swatch: "#e8b923" },
  { tool: "google_sheets_write", label: "Write Google Sheet", swatch: "#e8b923" },
];

// Deliberately only lists node types the engine can actually execute today.
// Other logic node types (While, ...) shown in some reference UIs aren't
// wired up yet — adding them here would look clickable but do nothing.
export function NodePalette({
  onAdd,
  onAddBranch,
  onAddUserInput,
  onAddEnd,
  onOpenAI,
}: {
  onAdd: (tool: ToolChoice) => void;
  onAddBranch: () => void;
  onAddUserInput: () => void;
  onAddEnd: () => void;
  onOpenAI: () => void;
}) {
  return (
    <div className="card palette">
      <button className="palette-item ai-toggle-item" onClick={onOpenAI}>
        ✨ Generate with AI
      </button>

      <div className="palette-section-label">Core</div>
      {CORE.map((item) => (
        <button key={item.label} className="palette-item" onClick={() => onAdd(item.tool)}>
          <span className="palette-swatch" style={{ background: item.swatch }} />
          {item.label}
        </button>
      ))}
      <button className="palette-item" onClick={onAddEnd}>
        <span className="palette-swatch" style={{ background: "#4fd1c5" }} />
        End
      </button>

      <div className="palette-section-label">Tools</div>
      {TOOLS.map((item) => (
        <button key={item.label} className="palette-item" onClick={() => onAdd(item.tool)}>
          <span className="palette-swatch" style={{ background: item.swatch }} />
          {item.label}
        </button>
      ))}

      <div className="palette-section-label">Logic</div>
      <button className="palette-item" onClick={onAddBranch}>
        <span className="palette-swatch" style={{ background: "#e8b923" }} />
        If / else
      </button>
      <button className="palette-item" onClick={onAddUserInput}>
        <span className="palette-swatch" style={{ background: "#4fd1c5" }} />
        User input
      </button>
    </div>
  );
}
