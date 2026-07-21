"use client";

// The very first screen. The first two choices both build a step-graph agent
// (Claude walks through building it via conversation, or you build it
// yourself on the canvas) — either way you end up at the same editable step
// graph. "Knowledge agent" is a different, much simpler kind of thing
// entirely: no steps, just a standing Q&A chat grounded in a knowledge base.
export function LandingChoice({
  onCreateWithAI,
  onCreateManually,
  onCreateKnowledgeAgent,
}: {
  onCreateWithAI: () => void;
  onCreateManually: () => void;
  onCreateKnowledgeAgent: () => void;
}) {
  return (
    <div className="landing-shell">
      <h1 style={{ marginBottom: "0.4rem" }}>Agent Builder</h1>
      <p style={{ color: "rgba(254,242,222,0.6)", marginTop: 0, marginBottom: "2rem" }}>
        How do you want to build this agent?
      </p>
      <div className="landing-cards">
        <button className="landing-card" onClick={onCreateWithAI}>
          <span className="landing-card-icon">✨</span>
          <span className="landing-card-title">Create with AI</span>
          <span className="landing-card-desc">
            Describe what you want in a chat. Claude asks what it needs to know, verifies any
            Google Sheets you connect, and builds the agent as you go.
          </span>
        </button>
        <button className="landing-card" onClick={onCreateManually}>
          <span className="landing-card-icon">🛠️</span>
          <span className="landing-card-title">Create manually</span>
          <span className="landing-card-desc">
            Build the step graph yourself on the canvas — full control over every step, branch,
            and connection.
          </span>
        </button>
        <button className="landing-card" onClick={onCreateKnowledgeAgent}>
          <span className="landing-card-icon">📚</span>
          <span className="landing-card-title">Knowledge agent</span>
          <span className="landing-card-desc">
            Paste in a knowledge base about one topic — reference info to answer questions from
            (FAQs, troubleshooting docs), or a process to walk through and produce something from
            (a job description, a template). No steps or graph, just a chat.
          </span>
        </button>
      </div>
    </div>
  );
}
