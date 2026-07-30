"use client";

import { useState, useRef, useEffect } from "react";
import SlideViewer, { Slide } from "./SlideViewer";

interface ApiMessage {
  role: "user" | "assistant";
  content: string;
}

interface FinalizedSession {
  group_name: string;
  session_day: string;
  primary_topic: string;
  context: string;
  goals_for_session: string;
  related_modules?: string[];
  slides_needed: boolean;
  slides_reason?: string;
}

interface GeneratedOutput {
  plan_markdown: string;
  slides?: Slide[];
}

const GREETING =
  "Hey — who's this session for, and what's actually going on with them right now?";

export default function ChatUI() {
  const [display, setDisplay] = useState
    { role: "user" | "assistant"; text: string }[]
  >([{ role: "assistant", text: GREETING }]);
  const [apiHistory, setApiHistory] = useState<ApiMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [finalized, setFinalized] = useState<FinalizedSession | null>(null);
  const [output, setOutput] = useState<GeneratedOutput | null>(null);
  const [generating, setGenerating] = useState(false);
  const [tab, setTab] = useState<"plan" | "slides">("plan");

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [display, loading]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading || finalized) return;

    const newHistory: ApiMessage[] = [
      ...apiHistory,
      { role: "user", content: text },
    ];
    setDisplay((d) => [...d, { role: "user", text }]);
    setApiHistory(newHistory);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newHistory }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");

      if (data.reply) {
        setDisplay((d) => [...d, { role: "assistant", text: data.reply }]);
        setApiHistory((h) => [
          ...h,
          { role: "assistant", content: data.reply },
        ]);
      }

      if (data.finalized) {
        setFinalized(data.finalized as FinalizedSession);
      }
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function generatePlan() {
    if (!finalized) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalized),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setOutput(data);
      setTab("plan");
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
    } finally {
      setGenerating(false);
    }
  }

  async function downloadDocx() {
    if (!output || !finalized) return;
    const res = await fetch("/api/docx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan_markdown: output.plan_markdown,
        group_name: finalized.group_name,
        session_day: finalized.session_day,
      }),
    });
    if (!res.ok) {
      setError("Could not generate the Word doc.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `session-plan-${finalized.group_name
      .toLowerCase()
      .replace(/\s+/g, "-")}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function startOver() {
    setDisplay([{ role: "assistant", text: GREETING }]);
    setApiHistory([]);
    setFinalized(null);
    setOutput(null);
    setError(null);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
      {/* LEFT: INTAKE */}
      <div
        className="flex flex-col border rounded-sm overflow-hidden"
        style={{ borderColor: "var(--line)", background: "#fff" }}
      >
        <div
          className="font-mono-tab text-[11px] px-5 py-3 border-b flex items-center justify-between"
          style={{ borderColor: "var(--line)", color: "var(--brass)" }}
        >
          <span>TAB 01 — INTAKE</span>
          {finalized && (
            <button
              onClick={startOver}
              className="underline"
              style={{ color: "var(--slate)" }}
            >
              start over
            </button>
          )}
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {display.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className="max-w-[85%] px-4 py-2.5 rounded-sm text-[15px] leading-snug"
                style={{
                  background: m.role === "user" ? "var(--ink)" : "#F1EEE5",
                  color: m.role === "user" ? "var(--paper)" : "var(--ink)",
                }}
              >
                {m.text}
              </div>
            </div>
          ))}
          {loading && (
            <div
              className="text-sm font-mono-tab"
              style={{ color: "var(--slate)" }}
            >
              thinking…
            </div>
          )}
        </div>

        {finalized ? (
          <div
            className="border-t px-5 py-4 space-y-3"
            style={{ borderColor: "var(--line)", background: "#F7F5F0" }}
          >
            <p className="text-sm" style={{ color: "var(--slate)" }}>
              Got what I need for <strong>{finalized.group_name}</strong>'s{" "}
              {finalized.session_day} session
              {finalized.slides_needed ? " — slides included." : "."}
            </p>
            <button
              onClick={generatePlan}
              disabled={generating}
              className="w-full py-3 rounded-sm text-sm font-mono-tab disabled:opacity-50"
              style={{ background: "var(--forest)", color: "var(--paper)" }}
            >
              {generating ? "GENERATING…" : "GENERATE SESSION PLAN →"}
            </button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
            className="border-t px-4 py-3 flex gap-2"
            style={{ borderColor: "var(--line)" }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your answer…"
              className="flex-1 px-3 py-2 rounded-sm border text-[15px] outline-none"
              style={{ borderColor: "var(--line)" }}
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="px-4 py-2 rounded-sm text-sm font-mono-tab disabled:opacity-40"
              style={{ background: "var(--ink)", color: "var(--paper)" }}
            >
              SEND
            </button>
          </form>
        )}
      </div>

      {/* RIGHT: OUTPUT */}
      <div
        className="flex flex-col border rounded-sm overflow-hidden"
        style={{ borderColor: "var(--line)", background: "#fff" }}
      >
        <div
          className="font-mono-tab text-[11px] px-5 py-3 border-b flex gap-5"
          style={{ borderColor: "var(--line)" }}
        >
          <button
            onClick={() => setTab("plan")}
            style={{ color: tab === "plan" ? "var(--brass)" : "var(--slate)" }}
          >
            TAB 02 — PLAN
          </button>
          {output?.slides && output.slides.length > 0 && (
            <button
              onClick={() => setTab("slides")}
              style={{
                color: tab === "slides" ? "var(--brass)" : "var(--slate)",
              }}
            >
              TAB 03 — SLIDES
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-8">
          {!output && !generating && (
            <div
              className="h-full flex flex-col items-center justify-center text-center gap-2"
              style={{ color: "var(--slate)" }}
            >
              <p style={{ fontFamily: "var(--font-display)" }} className="text-xl">
                Nothing here yet
              </p>
              <p className="text-sm max-w-xs">
                Finish the intake on the left and the session plan will show up here.
              </p>
            </div>
          )}

          {generating && (
            <div
              className="h-full flex items-center justify-center font-mono-tab text-sm"
              style={{ color: "var(--slate)" }}
            >
              drafting in Patrick's voice…
            </div>
          )}

          {output && tab === "plan" && (
            <div className="space-y-4">
              <pre
                className="whitespace-pre-wrap text-[15px] leading-relaxed"
                style={{ fontFamily: "var(--font-body)" }}
              >
                {output.plan_markdown}
              </pre>
              <button
                onClick={downloadDocx}
                className="font-mono-tab text-xs px-4 py-2.5 rounded-sm border"
                style={{ borderColor: "var(--brass)", color: "var(--brass)" }}
              >
                ↓ DOWNLOAD AS .DOCX
              </button>
            </div>
          )}

          {output && tab === "slides" && output.slides && (
            <SlideViewer slides={output.slides} />
          )}
        </div>
      </div>

      {error && (
        <div
          className="lg:col-span-2 text-sm px-4 py-3 rounded-sm"
          style={{ background: "#F6E4E0", color: "#8A2E1E" }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
