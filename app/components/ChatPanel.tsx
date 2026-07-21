"use client";

import { useState } from "react";
import type { ChatMessage } from "../uiTypes";
import { Markdown } from "./Markdown";

// A chat-style tester: type a message, it becomes {{user_input.output}} for
// the agent's start step, and the graph runs (no memory between separate
// messages — each new message starts a fresh run, same as the CLI). If the
// agent hits a user_input step, it pauses mid-run: the question appears as
// an agent message, and the next message you send (or button you click, for
// an approval step) resumes the same run rather than starting over. Once a
// run finishes, the reply shows the final step's output as the "answer",
// with a toggle to see every step across the whole run underneath.
export function ChatPanel({
  messages,
  sending,
  canSend,
  disabledReason,
  onSend,
  pendingOptions,
  onApprove,
}: {
  messages: ChatMessage[];
  sending: boolean;
  canSend: boolean;
  disabledReason?: string;
  onSend: (message: string) => void;
  pendingOptions?: string[];
  onApprove: (label: string) => void;
}) {
  const [input, setInput] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  function toggle(index: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function submit() {
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    onSend(trimmed);
    setInput("");
  }

  return (
    <div className="card chat-panel">
      <div className="chat-messages">
        {messages.length === 0 && (
          <p style={{ color: "rgba(254,242,222,0.4)", fontSize: "0.9rem" }}>
            Send a message below to test the agent — it runs the graph you built above, start to
            finish, treating your message as the input.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-bubble chat-bubble-${m.role}${m.isPending ? " chat-bubble-pending" : ""}`}>
            <div className="chat-bubble-label">{m.role === "user" ? "You" : "Agent"}</div>
            <div className={m.isError ? "status-error" : ""}>
              <Markdown text={m.text} />
            </div>
            {m.steps && m.steps.length > 0 && (
              <>
                <button className="chat-steps-toggle" onClick={() => toggle(i)}>
                  {expanded.has(i) ? "Hide steps" : "Show steps"}
                </button>
                {expanded.has(i) && (
                  <div style={{ marginTop: "0.5rem" }}>
                    {m.steps.map((s) => (
                      <div key={s.id} style={{ marginBottom: "0.5rem" }}>
                        <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                          {s.id}
                          {s.tool && (
                            <span style={{ fontWeight: 400, color: "rgba(254,242,222,0.5)" }}>
                              {" "}
                              — called {s.tool}
                            </span>
                          )}
                        </div>
                        <pre className="output-block">{s.output}</pre>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
        {sending && <div className="chat-bubble chat-bubble-agent">Thinking...</div>}
      </div>

      {pendingOptions && pendingOptions.length > 0 ? (
        <div className="chat-input-row">
          {pendingOptions.map((label) => {
            const lower = label.toLowerCase();
            const isApprove = /approve|accept|yes|confirm/.test(lower);
            const isReject = /reject|decline|no\b/.test(lower);
            const icon = isApprove ? "✓" : isReject ? "✗" : null;
            return (
              <button
                key={label}
                className={`button-primary${isReject ? " chat-option-reject" : ""}`}
                onClick={() => onApprove(label)}
                disabled={sending}
                style={{ flex: 1 }}
              >
                {icon ? `${icon} ${label}` : label}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="chat-input-row">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder={canSend ? "Message the agent..." : disabledReason}
            disabled={!canSend || sending}
            style={{ flex: 1 }}
          />
          <button className="button-primary" onClick={submit} disabled={!canSend || sending || !input.trim()}>
            Send
          </button>
        </div>
      )}
    </div>
  );
}
