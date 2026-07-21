"use client";

import { useState } from "react";

// Sits under a prompt/instructions/question textarea: sends its current
// text to Claude to be tightened up, then replaces the field with the
// result. `kind` picks the rewrite style (see src/refineText.ts).
export function RefineButton({
  text,
  kind,
  onRefined,
}: {
  text: string;
  kind: "agent_prompt" | "branch_instructions" | "user_input_question";
  onRefined: (text: string) => void;
}) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (!text.trim() || loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/refine-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, kind }),
      });
      const data = await res.json();
      if (data.ok) onRefined(data.text);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button className="refine-button nodrag" onClick={handleClick} disabled={!text.trim() || loading}>
      {loading ? "Cleaning up..." : "✨ Clean up with AI"}
    </button>
  );
}
