"use client";

import { useState } from "react";
import { Markdown } from "./Markdown";

export interface StatusCheck {
  url: string;
  ok: boolean;
  message: string;
}

export interface WizardChatMessage {
  role: "user" | "assistant";
  text: string;
  statusChecks?: StatusCheck[];
  isError?: boolean;
}

// A plain back-and-forth chat — no pending-approval buttons here, since this
// is either a design discussion (the "Create with AI" wizard) or a standing
// Q&A conversation (the Knowledge agent), not a graph run. `statusChecks`
// shows as small badges under a reply — the wizard uses it for Google
// Sheets it verifies mid-conversation, the Knowledge agent for linked
// Docs/Sheets resources.
export function WizardChat({
  messages,
  sending,
  onSend,
  disabled = false,
  disabledReason,
  placeholder = "Describe what you want, or answer the question above...",
  emptyStateText = "Tell me what you want this agent to do — as much or as little detail as you have. I'll ask about anything else I need to know.",
}: {
  messages: WizardChatMessage[];
  sending: boolean;
  onSend: (message: string) => void;
  disabled?: boolean;
  disabledReason?: string;
  placeholder?: string;
  emptyStateText?: string;
}) {
  const [input, setInput] = useState("");

  function submit() {
    const trimmed = input.trim();
    if (!trimmed || sending || disabled) return;
    onSend(trimmed);
    setInput("");
  }

  return (
    <div className="card chat-panel">
      <div className="chat-messages">
        {messages.length === 0 && (
          <p style={{ color: "rgba(254,242,222,0.4)", fontSize: "0.9rem" }}>{emptyStateText}</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-bubble chat-bubble-${m.role === "user" ? "user" : "agent"}`}>
            <div className="chat-bubble-label">{m.role === "user" ? "You" : "Agent"}</div>
            <div className={m.isError ? "status-error" : ""}>
              <Markdown text={m.text} />
            </div>
            {m.statusChecks && m.statusChecks.length > 0 && (
              <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                {m.statusChecks.map((c, j) => (
                  <div
                    key={j}
                    className={`status-badge ${c.ok ? "status-ok" : "status-error"}`}
                    style={{ fontSize: "0.75rem" }}
                  >
                    {c.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {sending && <div className="chat-bubble chat-bubble-agent">Thinking...</div>}
      </div>

      <div className="chat-input-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder={disabled ? disabledReason : placeholder}
          disabled={sending || disabled}
          style={{ flex: 1 }}
        />
        <button className="button-primary" onClick={submit} disabled={sending || disabled || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}
