# Roadmap

The POC proves the core loop: config-defined agent -> steps run in order ->
at least one step calls a real tool -> we see the output. Everything below is
proposed, not built — a shared plan for what comes next, roughly in order.

1. **Add a second tool integration (Fathom)**
   Write `src/tools/fathom.ts` implementing the `Tool` interface (e.g. "fetch
   a meeting's transcript/summary by ID"), register it in
   `src/tools/registry.ts`. This is the real test of whether the tool
   abstraction holds up without touching `engine.ts`.

2. **Error handling + step retries**
   Right now a failed step kills the whole run. Add per-step retry (e.g. 1-2
   retries with backoff for transient API errors) and clearer failure
   reporting (which step, why, what to do about it).

3. ~~**Conditional logic between steps**~~ — done. Agents are now a graph, not
   a flat list: any step's `next` (or a branch case's `next`) can point
   anywhere, and a `kind: branch` step asks Claude to classify a prior step's
   output into one of a fixed set of labels and routes accordingly (If/else).
   A `kind: user_input` step adds the human-in-the-loop version: it pauses
   the run and asks whoever is testing/using the agent something (a free
   question, or an Approve/Reject-style confirmation), then resumes — the
   engine returns a `waiting_for_input` result plus the context built up so
   far, and resuming means calling it again with that context and the
   answer, since there's no live process to keep paused between requests.
   Still missing: loops (`While`) — that remains future work.

4. ~~**Simple web UI / dashboard**~~ — done, as a node-graph canvas (Next.js,
   deployable to Vercel) rather than a plain form: drop nodes from a palette,
   drag connections between them, edit each node inline, and click **Test
   agent** to run it and see results. A landing screen now also offers a
   conversational "Create with AI" wizard as an alternative entry point — it
   restates the request, asks clarifying questions, verifies any Google
   Sheets it's asked to connect, and proposes (or revises) the graph live
   next to the chat, rather than the one-shot "describe it once, get a
   draft" generator alone. The landing screen's third option, **Knowledge
   agent**, is a deliberately different, much simpler kind of agent: no step
   graph at all, just a standing Q&A chat grounded in a pasted knowledge base
   about one topic (troubleshooting docs, FAQs) — for when the step-graph
   model is more machinery than the task needs. Still missing: persistence
   (below) and the execution-time-limit fix noted at the time — a multi-step
   run with several tool/model calls can be slow on Vercel's serverless
   functions and may eventually need a background job or streaming response.

5. **Persistence**
   Store agent definitions and run history somewhere durable (Postgres,
   SQLite, or similar) instead of local YAML files and console output —
   needed once there's a UI, so past runs aren't lost.

6. **Auth / multi-user support**
   Only if this needs to be shared beyond one person — login, per-user agent
   definitions, and access control to tool credentials.

Each milestone should stay small enough to check in on before moving to the
next, same as the POC.
