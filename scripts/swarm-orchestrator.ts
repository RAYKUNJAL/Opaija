/**
 * scripts/swarm-orchestrator.ts — OPAIJA Swarm Orchestrator
 *
 * Polling loop that reads EPISODE_STATE.json and fires the next agent
 * whose gate condition is met. Each agent is an independent process
 * (Goose run, CLI call, or API handler) that follows the 6-step
 * memory loop:
 *
 *   1. LOAD context (CANON_MEMORY, LEARNINGS, MESSAGE_BUS, EPISODE_STATE)
 *   2. DO the job
 *   3. WRITE outputs to episodes/epNN/
 *   4. POST to MESSAGE_BUS.jsonl
 *   5. LEARN (if corrected, append to LEARNINGS.jsonl)
 *   6. UPDATE EPISODE_STATE.json stage/flags
 *
 * The orchestrator itself only does:
 *   - Read EPISODE_STATE.json
 *   - Match 'stage' to AGENT_ROSTER.yaml
 *   - Check gate condition
 *   - Fire the agent (print command, or call handler)
 *   - Wait for agent to update EPISODE_STATE.json
 *   - Repeat
 *
 * Usage:
 *   npx tsx scripts/swarm-orchestrator.ts EP001
 *   npx tsx scripts/swarm-orchestrator.ts EP001 --dry-run
 *   npx tsx scripts/swarm-orchestrator.ts EP001 --once  # fire one agent and exit
 */

import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ---------- types ----------

type EpisodeState = {
  episode_id: string;
  title: string;
  stage: string;
  prev_stage: string | null;
  stage_history: { stage: string; agent: string; ts: string; status: string }[];
  flags: Record<string, boolean>;
  gate_conditions: Record<string, string>;
  active_agent: string | null;
  agent_history: { agent: string; start_ts: string; end_ts: string | null; status: string }[];
  blockers: { agent: string; reason: string; ts: string }[];
  assets: Record<string, string | null>;
  retry_count: number;
  max_retries: number;
};

type AgentDef = {
  id: string;
  name: string;
  stage: string | null;
  gate: string | null;
  role: string;
  on_complete?: {
    set_stage?: string;
    set_flags?: Record<string, boolean>;
  };
};

// ---------- helpers ----------

function log(episodeId: string, stage: string, msg: string) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${episodeId}] [${stage}] ${msg}`;
  console.log(line);
  return line;
}

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

async function appendJsonl(filePath: string, record: Record<string, unknown>): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, JSON.stringify(record) + "\n", "utf-8");
}

/**
 * Evaluate a gate condition string against episode state flags.
 * Gate format: "flag_name == true" or "flag_name == false"
 * Multiple conditions joined by " && ".
 */
function evaluateGate(gate: string | null, flags: Record<string, boolean>): boolean {
  if (!gate || gate === "null") return true;

  const conditions = gate.split("&&").map((c) => c.trim());
  for (const cond of conditions) {
    const parts = cond.split("==").map((p) => p.trim());
    if (parts.length !== 2) continue;
    const flagName = parts[0];
    const expected = parts[1] === "true";
    const actual = flags[flagName] ?? false;
    if (actual !== expected) return false;
  }
  return true;
}

/**
 * Parse the AGENT_ROSTER.yaml to find which agent handles a given stage.
 * This is a minimal YAML parser — handles the specific structure we use.
 * For production, swap with a proper YAML parser (js-yaml).
 */
function findAgentForStage(rosterText: string, stage: string): { id: string; name: string; gate: string | null; role: string } | null {
  // Split on "- id:" to get agent blocks
  const agentBlocks = rosterText.split(/^- id:\s/m);
  for (const block of agentBlocks) {
    if (!block.trim()) continue;
    const idMatch = block.match(/^(\S+)/);
    const nameMatch = block.match(/name:\s*"([^"]+)"/);
    const stageMatch = block.match(/stage:\s*(\S+)/);
    const gateMatch = block.match(/gate:\s*"([^"]*)"/);
    const roleMatch = block.match(/role:\s*>?\s*([\s\S]*?)(?=\n\s{4}(inputs|outputs|on_complete|on_block|learnings_trigger)|$)/);

    if (stageMatch && stageMatch[1] === stage) {
      return {
        id: idMatch ? idMatch[1] : "unknown",
        name: nameMatch ? nameMatch[1] : "Unknown",
        gate: gateMatch ? gateMatch[1] : null,
        role: roleMatch ? roleMatch[1].trim() : "",
      };
    }
  }
  return null;
}

// ---------- main loop ----------

async function main() {
  const episodeId = process.argv[2];
  if (!episodeId) {
    console.error("Usage: tsx scripts/swarm-orchestrator.ts <EPxxx> [--dry-run] [--once]");
    process.exit(1);
  }

  const dryRun = process.argv.includes("--dry-run");
  const once = process.argv.includes("--once");

  const episodeDir = path.join(ROOT, "episodes", episodeId.toLowerCase());
  const statePath = path.join(episodeDir, "EPISODE_STATE.json");
  const rosterPath = path.join(ROOT, "ops", "agents", "AGENT_ROSTER.yaml");
  const orchestratorLogPath = path.join(episodeDir, "orchestrator.log.jsonl");

  // Load roster
  if (!existsSync(rosterPath)) {
    console.error(`[orchestrator] AGENT_ROSTER.yaml not found at ${rosterPath}`);
    process.exit(1);
  }
  const rosterText = await readFile(rosterPath, "utf-8");

  // Load or create episode state
  if (!existsSync(statePath)) {
    console.error(`[orchestrator] EPISODE_STATE.json not found at ${statePath}`);
    console.error(`[orchestrator] Create it first using the template in episodes/ep01/EPISODE_STATE.json`);
    process.exit(1);
  }

  log(episodeId, "orchestrator", "Starting swarm orchestrator");
  log(episodeId, "orchestrator", dryRun ? "DRY RUN mode — no agents will be fired" : "LIVE mode");
  log(episodeId, "orchestrator", once ? "ONCE mode — fire one agent and exit" : "CONTINUOUS mode — loop until done");

  let maxIterations = 20; // safety limit
  let iteration = 0;

  while (iteration < maxIterations) {
    iteration++;
    log(episodeId, "orchestrator", `--- Iteration ${iteration} ---`);

    const state = await readJson<EpisodeState>(statePath);

    // Check if episode is done
    if (state.stage === "done") {
      log(episodeId, "orchestrator", "Episode complete! Stage = done");
      await appendJsonl(orchestratorLogPath, {
        ts: new Date().toISOString(),
        episode: episodeId,
        event: "episode_complete",
      });
      break;
    }

    // Check for blockers
    if (state.blockers && state.blockers.length > 0) {
      log(episodeId, "orchestrator", `BLOCKED: ${state.blockers.length} blocker(s) active`);
      for (const b of state.blockers) {
        log(episodeId, "orchestrator", `  - ${b.agent}: ${b.reason}`);
      }
      log(episodeId, "orchestrator", "Resolve blockers and update EPISODE_STATE.json, then restart orchestrator");
      break;
    }

    // Find the agent for the current stage
    const agent = findAgentForStage(rosterText, state.stage);
    if (!agent) {
      log(episodeId, "orchestrator", `No agent found for stage '${state.stage}'. Check AGENT_ROSTER.yaml.`);
      break;
    }

    log(episodeId, "orchestrator", `Stage: ${state.stage} → Agent: ${agent.name} (${agent.id})`);

    // Check gate condition
    const gatePassed = evaluateGate(agent.gate, state.flags);
    if (!gatePassed) {
      log(episodeId, "orchestrator", `Gate condition NOT met: "${agent.gate}"`);
      log(episodeId, "orchestrator", "Flags: " + JSON.stringify(state.flags));

      // Check if we're stuck
      if (state.retry_count >= state.max_retries) {
        log(episodeId, "orchestrator", `MAX RETRIES (${state.max_retries}) reached. Halting.`);
        await appendJsonl(orchestratorLogPath, {
          ts: new Date().toISOString(),
          episode: episodeId,
          event: "max_retries_exceeded",
          stage: state.stage,
          agent: agent.name,
        });
        break;
      }

      log(episodeId, "orchestrator", "Waiting for gate condition to be met. Retrying in next iteration.");
      break;
    }

    log(episodeId, "orchestrator", `Gate PASSED. Firing agent: ${agent.name}`);

    // Log the agent fire event
    await appendJsonl(orchestratorLogPath, {
      ts: new Date().toISOString(),
      episode: episodeId,
      event: "agent_fired",
      stage: state.stage,
      agent: agent.name,
      agent_id: agent.id,
      dry_run: dryRun,
    });

    // Post a message to MESSAGE_BUS that the orchestrator is firing this agent
    const messageBusPath = path.join(ROOT, "memory", "MESSAGE_BUS.jsonl");
    await appendJsonl(messageBusPath, {
      ts: new Date().toISOString(),
      from: "Orchestrator",
      to: agent.name,
      topic: `${state.episode_id?.toLowerCase()}.${state.stage}.start`,
      body: `Orchestrator firing ${agent.name} for stage ${state.stage}. Gate conditions met.`,
      episode: state.episode_id?.toLowerCase() ?? episodeId.toLowerCase(),
      severity: "info",
    });

    if (dryRun) {
      log(episodeId, "orchestrator", `[DRY RUN] Would fire: ${agent.name}`);
      log(episodeId, "orchestrator", `  Role: ${agent.role.slice(0, 200)}...`);
      log(episodeId, "orchestrator", "  (In live mode, this is where Goose/CLI agent invocation happens)");

      // In dry run, simulate stage progression
      const newState = { ...state };
      newState.prev_stage = state.stage;
      newState.stage_history = [
        ...state.stage_history,
        { stage: state.stage, agent: agent.name, ts: new Date().toISOString(), status: "dry_run_complete" },
      ];

      // Auto-advance to next stage based on known pipeline
      const stageOrder = ["script_draft", "canon_review", "visual_prep", "voice", "clips", "manifest", "render", "qa", "publish", "done"];
      const currentIdx = stageOrder.indexOf(state.stage);
      if (currentIdx >= 0 && currentIdx < stageOrder.length - 1) {
        newState.stage = stageOrder[currentIdx + 1];
      }

      // Set flags for the completed stage
      const stageFlags: Record<string, string> = {
        script_draft: "script_approved",
        canon_review: "canon_checked",
        visual_prep: "visual_refs_locked",
        voice: "voice_generated",
        clips: "clips_generated",
        manifest: "manifest_built",
        render: "render_complete",
        qa: "qa_passed",
      };
      const flagForStage = stageFlags[state.stage];
      if (flagForStage) {
        newState.flags[flagForStage] = true;
      }

      await writeJson(statePath, newState);
      log(episodeId, "orchestrator", `[DRY RUN] Advanced to stage: ${newState.stage}`);
    } else {
      // LIVE MODE: This is where you integrate with your actual agent runner
      //
      // Option A (Goose): spawn `goose run --agent <agent-id> --episode <episodeId>`
      // Option B (HTTP):   POST to your server's agent endpoint
      // Option C (Manual): Print the command and wait for human to run it
      //
      // For now, we print the instruction and wait for the agent to update
      // EPISODE_STATE.json externally. The orchestrator will pick up the
      // change on the next iteration.

      log(episodeId, "orchestrator", "");
      log(episodeId, "orchestrator", "═══════════════════════════════════════════════════════");
      log(episodeId, "orchestrator", `  FIRE AGENT: ${agent.name}`);
      log(episodeId, "orchestrator", `  Stage: ${state.stage}`);
      log(episodeId, "orchestrator", `  Episode: ${episodeId}`);
      log(episodeId, "orchestrator", "");
      log(episodeId, "orchestrator", "  Agent should:");
      log(episodeId, "orchestrator", "  1. Read CANON_MEMORY.json, LEARNINGS.jsonl, MESSAGE_BUS.jsonl");
      log(episodeId, "orchestrator", "  2. Read EPISODE_STATE.json (this file)");
      log(episodeId, "orchestrator", "  3. Perform: " + agent.role.slice(0, 300).replace(/\n/g, " ") + "...");
      log(episodeId, "orchestrator", "  4. Write outputs to episodes/" + episodeId.toLowerCase() + "/");
      log(episodeId, "orchestrator", "  5. Post to MESSAGE_BUS.jsonl");
      log(episodeId, "orchestrator", "  6. Update EPISODE_STATE.json (stage + flags)");
      log(episodeId, "orchestrator", "═══════════════════════════════════════════════════════");
      log(episodeId, "orchestrator", "");

      log(episodeId, "orchestrator", "Waiting for agent to complete and update EPISODE_STATE.json...");
      log(episodeId, "orchestrator", "(In automated mode, the orchestrator would poll for state changes here)");

      await appendJsonl(orchestratorLogPath, {
        ts: new Date().toISOString(),
        episode: episodeId,
        event: "waiting_for_agent",
        stage: state.stage,
        agent: agent.name,
      });

      if (once) {
        log(episodeId, "orchestrator", "ONCE mode: exiting after firing one agent");
        break;
      }

      // In a real automated system, you'd poll EPISODE_STATE.json for changes
      // here and break when the stage changes. For now, we exit and let the
      // user re-run the orchestrator after the agent has completed.
      log(episodeId, "orchestrator", "Agent fired. Re-run orchestrator after agent completes to continue.");
      break;
    }

    if (once) {
      log(episodeId, "orchestrator", "ONCE mode: exiting after one iteration");
      break;
    }
  }

  if (iteration >= maxIterations) {
    log(episodeId, "orchestrator", `MAX ITERATIONS (${maxIterations}) reached. Halting for safety.`);
  }

  log(episodeId, "orchestrator", "Orchestrator session ended.");
}

main().catch((err) => {
  console.error("[orchestrator] FATAL:", err);
  process.exit(1);
});
