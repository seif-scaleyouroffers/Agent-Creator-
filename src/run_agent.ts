// CLI entrypoint. Usage:
//   npm run agent -- agents/example_agent.yaml
//   npm run agent -- agents/example_agent.yaml "some user input"

import "dotenv/config";
import { loadAgentConfig, runAgent } from "./engine";

async function main() {
  const configPath = process.argv[2];
  if (!configPath) {
    console.error("Usage: npm run agent -- <path-to-agent-config.yaml> [user input]");
    process.exit(1);
  }
  const input = process.argv[3];

  const config = loadAgentConfig(configPath);
  console.log(`Running agent "${config.name}" (${config.steps.length} steps)`);

  const result = await runAgent(config, input);
  if (result.status === "waiting_for_input") {
    console.log(`\nPaused — agent is waiting for input: ${result.pending.prompt}`);
    console.log("(The CLI can't resume a paused run yet — this is a web-UI-only feature for now.)");
  } else {
    console.log("\nDone.");
  }
}

main().catch((err) => {
  console.error("\nAgent run failed:", err);
  process.exit(1);
});
