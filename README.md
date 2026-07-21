# SA Agent Creator

A plug-and-play agent runner powered by Claude. An **agent** is a config file
(YAML) defining a graph of **steps** — each step is a prompt, plus an
optional call to a **tool** (a pluggable integration like Google Sheets) or,
for a **branch** step, a Claude-powered classification that routes to a
different next step depending on the result (If/else logic).

This started as a CLI-only proof of concept and now also has a minimal web UI
(Next.js, deployable to Vercel) for building and running agents in the
browser. Still no database, no auth, no persistence — agents built in the UI
only live in that browser tab; see `ROADMAP.md` for what comes after this.

## How it works

```
agents/*.yaml        <- you define an agent: its steps, prompts, tools, branches
       |
src/engine.ts         <- loads the config, walks the step graph from `start`
       |
       |-- regular step, no tool  -> sends the prompt straight to Claude, stores the reply
       |
       |-- regular step, has tool -> tells Claude to call it (via Claude's tool-use /
       |                             function-calling), runs the real integration,
       |                             stores the result
       |
       `-- branch step            -> asks Claude to classify a prior step's output
                                      into one of a fixed set of labels, then jumps
                                      to that label's `next` step
       |
src/tools/*.ts        <- one file per integration (currently: Google Sheets)
```

Step outputs are kept in memory and can be referenced by later steps via
`{{step_id.output}}` placeholders in a prompt. Each step (and each branch
case) has a `next` pointing at the following step's id — omit it to end the
agent there. This is what lets the graph fan out and merge instead of just
running top-to-bottom.

Adding a new integration later (Fathom, Slack, email, calendar, ...) means
writing one new file in `src/tools/` that implements the `Tool` interface in
`src/types.ts`, then adding one line to `src/tools/registry.ts`. Nothing in
`engine.ts` needs to change.

## Setup

1. **Install dependencies**
   ```
   npm install
   ```

2. **Anthropic API key**
   Get one from https://console.anthropic.com/settings/keys.

3. **Google Sheets service account**
   - In [Google Cloud Console](https://console.cloud.google.com/), create/select a project.
   - Enable the **Google Sheets API** for it.
   - Create a **Service Account**, then create a JSON key for it and open the file.
   - You'll need its `client_email` and `private_key` values.

4. **Configure secrets**
   ```
   cp .env.example .env
   ```
   Fill in `ANTHROPIC_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, and
   `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (see comments in `.env.example`).
   `.env` is gitignored — never commit it.

5. **Prepare a Google Sheet**
   - Create a spreadsheet with a tab named `Sheet1` containing a few sample
     rows in `A2:D` (e.g. columns: name, deal size, status, notes).
   - Add a second, empty tab named `Results`.
   - Click **Share** on the sheet and share it with your service account's
     `client_email` address, with **Editor** access — without this, every
     Sheets API call will fail with a permissions error.
   - Copy the spreadsheet ID from its URL (`.../d/<THIS PART>/edit`).

6. **Point the example agent at your sheet**
   Edit `agents/example_agent.yaml` and replace both
   `YOUR_SPREADSHEET_ID_HERE` values with your real spreadsheet ID.

## Running the example agent

```
npm run agent -- agents/example_agent.yaml
```

This runs a 3-step agent:
1. `read_rows` — calls the `google_sheets_read` tool to fetch rows from `Sheet1`.
2. `analyze` — sends those rows to Claude with no tool, asking for a summary.
3. `write_result` — calls the `google_sheets_write` tool, with Claude deciding
   the actual row content to write into the `Results` tab.

Each step's tool calls and outputs are printed to the console as they happen.

## Running the web UI

```
npm run dev
```

Open http://localhost:3000. You're asked how you want to build the agent:

- **Create with AI** — a chat, not a form. Describe what you want; Claude
  restates its understanding, asks whatever clarifying questions it actually
  needs (what a confirm step should check, what should trigger a branch,
  etc.), and — if the agent needs a Google Sheet — asks for its URL and
  verifies access itself before finalizing anything that depends on it. Once
  it has enough to work with, it proposes the full step graph, which appears
  live in a preview pane next to the chat; keep chatting to revise it. Click
  **Switch to manual editing** any time to hand the current draft off to the
  canvas below.
- **Create manually** — the node-graph canvas. Click a palette item to drop
  a new step, branch, or End node, then drag from a node's edge (the small
  circle) to connect it to whatever runs next. Drag a node itself (its
  background/header, not its input fields) to reposition it. Nothing
  auto-connects except the starter example.
- **Knowledge agent** — a completely different, much simpler kind of agent:
  no step graph at all, just a standing chat about one topic. Give it a
  topic/name, paste in a knowledge base, optionally add extra instructions
  (tone, when to escalate, etc.), and chat with it on the right. The
  knowledge base can be either: reference info to answer questions from
  (docs, FAQs, troubleshooting steps) — it answers only from what you
  pasted and says so when something isn't covered, rather than guessing;
  or a process/template to walk through (e.g. what to ask for and what
  format to write a job description in) — it'll ask what it needs one
  question at a time and then actually produce the thing described, not
  just explain the process. Unlike the step-agent test chat (a fresh run
  per message), this genuinely remembers the conversation turn to turn,
  like a normal chat assistant. Editing the knowledge base mid-conversation
  takes effect on the next message. Two more optional fields: **Tone
  reference** — paste a sample of copy and the agent mimics that voice for
  anything it writes, without treating it as factual knowledge; and
  **Resources** — Google Docs/Sheets links (one per line), fetched fresh via
  the same service account as the Sheets tool (share each with its
  `client_email` first, Viewer access is enough) and pulled in as extra
  context alongside the knowledge base.

The manual canvas has its own one-shot **✨ Generate with AI** panel too (top
of the palette) — type a description and click **Generate with AI** for an
instant draft in one shot, no back-and-forth. Reach for the chat-based wizard
from the landing screen instead when you want it to ask about anything
ambiguous or connect a sheet for you along the way.

Either way, for a step that uses a Google Sheet, paste its URL into that step
and click **Check** to confirm the service account can reach it (share the
sheet with its `client_email` first) — a generated step only suggests the
tool and range, it can't fill in your actual sheet. For an **If/else** node,
pick which step's output to classify, give the classifier instructions, and
drag each case's own handle to wherever that case should lead.

Every prompt/instructions/question field has a **✨ Clean up with AI** button
underneath it — type something rough and click it to have Claude tighten it
into clearer wording for that field (it preserves `{{...}}` placeholders).

A **User input** node pauses the agent mid-run and asks whoever is testing it
something, then continues once they answer. Its question automatically
includes the output of whatever step is wired into it on the canvas — no
`{{step_id.output}}` placeholder needed, just write the question itself (e.g.
"does this summary look correct?"). Reference a specific step by hand only if
you need something other than the one directly connected.
- **Ask a question** — a free-form question; the answer becomes this step's
  output, referenceable as `{{step_id.output}}` in later prompts (e.g. "what
  English level should this candidate have?").
- **Approve / reject** — a fixed set of labeled options (edit or add your
  own), each its own connectable path — like an If/else node, but a person
  decides instead of Claude (e.g. "does this summary look correct?").

Click **Test agent** to open a chat panel as a sidebar on the right — type a
message and it runs the graph for real. If it hits a User input step, the question appears as an
agent message and the run pauses; your next message (or button click, for
Approve/reject) resumes it rather than starting over. Once the run finishes,
the reply shows the final step's output as the agent's answer, with a "Show
steps" toggle for the full tool-call/branch-decision detail across the whole
run. Each new message you send (when nothing is pending) starts a fresh run
with no memory of earlier ones. What you type is available to any step's
prompt as `{{user_input.output}}` — a step that doesn't reference it will
ignore what you typed and just run as configured. Uses the same `.env` as
the CLI.

### Deploying to Vercel

1. Push this repo to GitHub (already done if you're reading this from the repo).
2. Go to https://vercel.com/new and import the repository — Vercel
   auto-detects Next.js, no config needed.
3. Before the first deploy (or right after, then redeploy), add these
   Environment Variables in the Vercel project settings: `ANTHROPIC_API_KEY`,
   `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (same
   values as your local `.env`).
4. Deploy. Note: Vercel serverless functions have execution time limits: a
   multi-step run with several tool calls can be slow — see `ROADMAP.md`
   item 4 for the planned fix.

## Defining your own agent

Copy `agents/example_agent.yaml` and edit `start` plus the `steps` list.
A regular step:

```yaml
- id: some_step_name
  tool: google_sheets_read        # optional — omit for a plain prompt step
  tool_params:                    # optional — values already known ahead of time
    spreadsheetId: "..."
    range: "Sheet1!A2:D"
  prompt: "What Claude should do this step, referencing {{other_step.output}} if needed."
  next: another_step_name         # omit to end the agent here
```

A branch step (If/else):

```yaml
- id: route_by_sentiment
  kind: branch
  basedOn: some_step_name         # classify that step's output
  instructions: "Positive if upbeat, Negative if concerning, else Else."
  branches:
    - label: Positive
      next: handle_positive
    - label: Negative
      next: handle_negative
    - label: Else
      next: handle_other
```

Available tools live in `src/tools/registry.ts`.

## Project structure

```
agents/example_agent.yaml   agent definition (config, not code)
src/types.ts                shared types: Tool, Step, Agent config
src/engine.ts                core loop: config -> steps -> Claude -> tool calls (pausable on user_input)
src/tools/registry.ts       tool name -> tool module lookup
src/tools/googleSheets.ts   Google Sheets tool (read + write, + URL parsing)
src/generateAgent.ts        asks Claude to draft a step graph from a description (one shot)
src/agentWizard.ts          the conversational "Create with AI" wizard — multi-turn, can verify Sheets
src/knowledgeAgent.ts       the Knowledge agent's chat — no step graph, just Q&A/process-following grounded in pasted text + linked resources
src/tools/googleResources.ts  fetches Google Docs/Sheets links as read-only Knowledge agent "Resources"
src/refineText.ts           asks Claude to tighten up a rough prompt/instructions/question
src/run_agent.ts            CLI entrypoint
app/page.tsx                web UI: landing choice, node-graph canvas, wiring, chat test, view results
app/components/nodes/       canvas node types: agent step, branch (If/else), user input, Start/End
app/components/LandingChoice.tsx    the landing screen: Create with AI / Create manually / Knowledge agent
app/components/WizardChat.tsx       shared chat panel for both the wizard and the Knowledge agent
app/components/AIGeneratePanel.tsx  the manual canvas's one-shot "Generate with AI" panel
app/components/RefineButton.tsx     the "Clean up with AI" button used in each node
app/generatedToCanvas.ts    lays a generated draft out as canvas steps + edges (height-aware, no overlap)
app/api/run-agent/route.ts  API route: runs an agent config via engine.ts
app/api/sheets/check/route.ts  API route: validates a pasted Sheet URL
app/api/generate-agent/route.ts  API route: drafts an agent from a description (one shot)
app/api/wizard/route.ts     API route: one turn of the conversational wizard
app/api/knowledge-chat/route.ts  API route: one turn of the Knowledge agent's chat
app/api/refine-text/route.ts     API route: cleans up a rough field's text
```

See `ROADMAP.md` for planned next steps beyond this POC.
