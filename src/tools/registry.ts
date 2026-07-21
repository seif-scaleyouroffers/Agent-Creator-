// Central lookup from tool name (as referenced in an agent's YAML config) to
// the tool implementation. To add a new integration: write a new file next
// to googleSheets.ts exporting Tool objects, then list them here. Nothing
// else in the engine needs to change.

import type { Tool } from "../types";
import { googleSheetsRead, googleSheetsWrite } from "./googleSheets";

const allTools: Tool[] = [googleSheetsRead, googleSheetsWrite];

export const toolRegistry: Record<string, Tool> = Object.fromEntries(
  allTools.map((tool) => [tool.name, tool])
);
