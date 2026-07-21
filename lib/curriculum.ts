/**
 * CURRICULUM REFERENCE — Scale Your Offers Boardroom
 *
 * This is reference context, not a script. It helps the agent understand
 * where a client might be in the program, and connect a coaching topic to
 * the right module vocabulary/framework Patrick already teaches — so the
 * plan it generates reinforces what the client has already seen, instead of
 * introducing a conflicting framework.
 *
 * Update this list as the curriculum evolves.
 */

export const CURRICULUM = [
  {
    module: "00",
    title: "Start Here",
    summary:
      "Orientation. How the community works (Classroom / Community feed / Calendar), where the live calls are (Tue & Thu, 7:30 PM ET), and what to do in the first 48 hours.",
  },
  {
    module: "01",
    title: "The Identity Shift",
    summary:
      "Why the closer/service-provider identity caps income, and what it looks like to show up as an AI Growth Operator instead. Foundational — nothing else works until this clicks.",
  },
  {
    module: "02",
    title: "Positioning & Offer Design",
    summary:
      "Building a premium operator offer: clear deliverables, real pricing, retainer vs. performance structure. Includes the 'offer layer stack' framework (entry point / build / optimize / buy back their time).",
  },
  {
    module: "03",
    title: "Client Acquisition",
    summary:
      "Finding operators worth working with (ICP), how to open the conversation, and how to qualify fast. Staying in one lane: business-opportunity offers with a calculable ROI, avoiding 'selling hope' offers.",
  },
  {
    module: "04",
    title: "The Discovery Call",
    summary:
      "The discovery call is a vetting call, not a sales call. Diagnosing operational gaps in real time, presenting value so the proposal becomes the obvious next step.",
  },
  {
    module: "05",
    title: "Your AI Tool Stack",
    summary:
      "Which tools to use (Claude, Codex, GHL, Zapier) and how to chain them to move fast without hiring a team.",
  },
  {
    module: "06",
    title: "Building Infrastructure",
    summary:
      "What to actually build inside a client's business: dashboards, automations, SOPs, reporting systems, and in what order.",
  },
  {
    module: "07",
    title: "Delivering & Retaining Clients",
    summary:
      "Clean onboarding, building trust over time, proving value before renewal ever comes up (e.g. the anonymous monthly survey), and shifting performance percentage toward retainer stability.",
  },
  {
    module: "08",
    title: "Scaling Yourself",
    summary:
      "Going from one retainer to three or five. Structuring rev share, performance deals, and equity arrangements for real upside.",
  },
  {
    module: "09",
    title: "The Inner Circle — Guest Speaker Series",
    summary:
      "Recurring guest sessions with operators, sales leaders, copywriters, media buyers, founders who've scaled solo to multi-6/7-figure agencies.",
  },
  {
    module: "BONUS",
    title: "Templates & Swipe Files",
    summary:
      "Outreach scripts, proposal templates, SOP frameworks, Claude prompts, onboarding docs.",
  },
  {
    module: "ROLODEX",
    title: "Patrick's Rolodex",
    summary:
      "Vetted network of software partners, payment processors, white-label providers.",
  },
] as const;

export function curriculumAsText(): string {
  return CURRICULUM.map(
    (m) => `Module ${m.module} — ${m.title}: ${m.summary}`
  ).join("\n");
}
