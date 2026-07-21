// Converts a GeneratedAgent (Claude's draft, keyed by step id) into canvas
// state (steps keyed by a fresh React/Flow node key, plus edges) — the same
// shapes the manual palette produces, so a generated agent is just as
// editable afterward as one built by hand.

import type { Edge } from "@xyflow/react";
import type { GeneratedAgent, GeneratedStep } from "../src/types";
import type { CanvasStep, ToolChoice } from "./uiTypes";
import { IDLE_SHEET_CHECK } from "./uiTypes";

// A generated step's outgoing paths, regardless of kind — a branch and a
// user_input step in "approval" mode both fan out via labeled cases; every
// other kind has at most one, via "next".
function outgoingOf(step: GeneratedStep): { handle?: string; nextId?: string }[] {
  if (step.kind === "branch" || (step.kind === "user_input" && step.mode === "approval")) {
    return (step.branches ?? []).map((b) => ({ handle: b.label, nextId: b.next }));
  }
  return [{ handle: undefined, nextId: step.next }];
}

const X_SPACING = 340;
const ROW_GAP = 60;

// Nodes vary a lot in rendered height (a branch step with several cases and
// a long instructions field is much taller than a plain prompt step), so a
// flat row spacing overlaps tall nodes with whatever comes after them in the
// same column. This is a rough estimate of each node's real height, used to
// space rows apart instead of a single fixed gap.
function estimateHeight(step: GeneratedStep): number {
  let height = 220; // header + prompt/instructions textarea baseline
  if (step.kind === "branch") {
    height += 120; // "classify based on" select + extra instructions room
    height += (step.branches?.length ?? 2) * 44; // one row per case
  } else if (step.kind === "user_input") {
    height += 60; // mode select
    if (step.mode === "approval") height += (step.branches?.length ?? 2) * 44;
  } else if (step.tool) {
    height += 170; // tool select + range + sheet URL/check row
  }
  return height;
}

export function generatedToCanvas(agent: GeneratedAgent): { steps: CanvasStep[]; edges: Edge[] } {
  const byId = new Map(agent.steps.map((s) => [s.id, s]));

  // Lay out left-to-right by distance (in hops) from the start step, so the
  // canvas reads the same direction the agent actually runs.
  const depth = new Map<string, number>();
  const queue: string[] = [];
  if (byId.has(agent.start)) {
    depth.set(agent.start, 0);
    queue.push(agent.start);
  }
  while (queue.length) {
    const id = queue.shift()!;
    const step = byId.get(id);
    if (!step) continue;
    const d = depth.get(id)!;
    const nextIds = outgoingOf(step)
      .map((o) => o.nextId)
      .filter((x): x is string => !!x);
    for (const nid of nextIds) {
      if (!depth.has(nid) && byId.has(nid)) {
        depth.set(nid, d + 1);
        queue.push(nid);
      }
    }
  }
  // Anything the traversal didn't reach (shouldn't normally happen) still
  // needs a position — just stack it after everything else.
  let maxDepth = 0;
  for (const d of depth.values()) maxDepth = Math.max(maxDepth, d);
  for (const step of agent.steps) {
    if (!depth.has(step.id)) depth.set(step.id, ++maxDepth);
  }

  const columns = new Map<number, string[]>();
  for (const step of agent.steps) {
    const d = depth.get(step.id)!;
    if (!columns.has(d)) columns.set(d, []);
    columns.get(d)!.push(step.id);
  }

  const keyOf = new Map<string, string>();
  agent.steps.forEach((s, i) => keyOf.set(s.id, `g${i + 1}`));

  const positions = new Map<string, { x: number; y: number }>();
  for (const [d, ids] of columns) {
    let cursorY = 0;
    for (const id of ids) {
      positions.set(id, { x: (d + 1) * X_SPACING, y: cursorY });
      cursorY += estimateHeight(byId.get(id)!) + ROW_GAP;
    }
  }

  const steps: CanvasStep[] = agent.steps.map((s) => {
    const key = keyOf.get(s.id)!;
    const position = positions.get(s.id) ?? { x: 0, y: 0 };
    if (s.kind === "branch") {
      return {
        kind: "branch",
        key,
        id: s.id,
        basedOn: s.basedOn ?? "",
        instructions: s.instructions ?? "",
        branches: (s.branches ?? []).map((b) => b.label),
        position,
      };
    }
    if (s.kind === "user_input") {
      const mode = s.mode ?? "text";
      return {
        kind: "user_input",
        key,
        id: s.id,
        mode,
        prompt: s.prompt ?? "",
        options: mode === "approval" ? (s.branches ?? []).map((b) => b.label) : ["Approve", "Reject"],
        position,
      };
    }
    return {
      kind: "agent",
      key,
      id: s.id,
      prompt: s.prompt ?? "",
      tool: (s.tool ?? "") as ToolChoice,
      range: s.range ?? "",
      sheetUrl: "",
      sheetCheck: IDLE_SHEET_CHECK,
      position,
    };
  });

  // Every path that doesn't lead to another real step gets its own End node,
  // so a generated graph never has a dangling, unexplained wire.
  const edges: Edge[] = [];
  const endNodes: CanvasStep[] = [];
  let endCounter = 1;

  if (keyOf.has(agent.start)) {
    edges.push({ id: `start-${keyOf.get(agent.start)}`, source: "start", target: keyOf.get(agent.start)! });
  }

  for (const s of agent.steps) {
    const key = keyOf.get(s.id)!;
    const depthHere = depth.get(s.id)!;
    const pos = positions.get(s.id)!;

    outgoingOf(s).forEach((out, i) => {
      if (out.nextId && keyOf.has(out.nextId)) {
        edges.push({
          id: `${key}-${out.handle ?? "out"}-${keyOf.get(out.nextId)}`,
          source: key,
          target: keyOf.get(out.nextId)!,
          ...(out.handle ? { sourceHandle: out.handle } : {}),
        });
      } else {
        const endKey = `ge${endCounter++}`;
        endNodes.push({
          kind: "end",
          key: endKey,
          position: { x: (depthHere + 2) * X_SPACING, y: pos.y + i * 80 },
        });
        edges.push({
          id: `${key}-${out.handle ?? "out"}-${endKey}`,
          source: key,
          target: endKey,
          ...(out.handle ? { sourceHandle: out.handle } : {}),
        });
      }
    });
  }

  return { steps: [...steps, ...endNodes], edges };
}
