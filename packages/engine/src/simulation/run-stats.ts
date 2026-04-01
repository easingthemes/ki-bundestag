/**
 * Run statistics — prints timing, cost, and error summaries to stdout.
 * Used by both runner.ts and runner-auto.ts for actionable log output.
 */

import { getSqlite } from "../db/connection.js";

interface DayTiming {
  day: number;
  durationMs: number;
}

interface PrintOptions {
  periodic?: boolean;
  totalDays?: number;
}

/**
 * Print a summary of the simulation run to stdout.
 * Combines wall-clock timing from the runner with DB-sourced cost/error data.
 */
export function printRunSummary(
  dayTimings: DayTiming[],
  totalElapsedMs: number,
  opts?: PrintOptions,
): void {
  if (dayTimings.length === 0) return;

  const label = opts?.periodic ? "PERIODIC SUMMARY" : "RUN SUMMARY";
  const days = dayTimings.map(d => d.day);
  const minDay = Math.min(...days);
  const maxDay = Math.max(...days);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${label} (Days ${minDay}–${maxDay})`);
  console.log(`${"=".repeat(60)}`);

  // --- Timing ---
  const durations = dayTimings.map(d => d.durationMs);
  const avgMs = durations.reduce((a, b) => a + b, 0) / durations.length;
  const minMs = Math.min(...durations);
  const maxMs = Math.max(...durations);
  const totalSec = (totalElapsedMs / 1000).toFixed(0);

  console.log(`\n  Timing:`);
  console.log(`    Days processed:  ${dayTimings.length}${opts?.totalDays ? ` (${opts.totalDays} total this run)` : ""}`);
  console.log(`    Total elapsed:   ${formatDuration(totalElapsedMs)}`);
  console.log(`    Avg per day:     ${formatDuration(avgMs)}`);
  console.log(`    Min / Max:       ${formatDuration(minMs)} / ${formatDuration(maxMs)}`);

  // Slowest / fastest days
  const sorted = [...dayTimings].sort((a, b) => b.durationMs - a.durationMs);
  if (sorted.length >= 3) {
    console.log(`    Slowest days:    ${sorted.slice(0, 3).map(d => `Day ${d.day} (${formatDuration(d.durationMs)})`).join(", ")}`);
  }

  // --- DB-sourced stats for these days ---
  try {
    const sqlite = getSqlite();

    // Cost summary
    const costRow = sqlite.prepare(`
      SELECT
        COUNT(*) as calls,
        COALESCE(SUM(input_tokens), 0) as input_tok,
        COALESCE(SUM(output_tokens), 0) as output_tok,
        COALESCE(SUM(cost_usd), 0) as cost_usd,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed
      FROM ai_calls
      WHERE day_number BETWEEN ? AND ?
    `).get(minDay, maxDay) as {
      calls: number;
      input_tok: number;
      output_tok: number;
      cost_usd: number;
      failed: number;
    };

    if (costRow && costRow.calls > 0) {
      const avgCost = costRow.cost_usd / dayTimings.length;
      console.log(`\n  AI Costs (Days ${minDay}–${maxDay}):`);
      console.log(`    Total calls:     ${costRow.calls} (${costRow.failed} failed)`);
      console.log(`    Total tokens:    ${formatTokens(costRow.input_tok)} in / ${formatTokens(costRow.output_tok)} out`);
      console.log(`    Total cost:      $${costRow.cost_usd.toFixed(4)}`);
      console.log(`    Avg cost/day:    $${avgCost.toFixed(4)}`);
      if (costRow.failed > 0) {
        const failRate = ((costRow.failed / costRow.calls) * 100).toFixed(1);
        console.log(`    Fail rate:       ${failRate}%`);
      }
    }

    // Per-model breakdown
    const modelRows = sqlite.prepare(`
      SELECT
        provider, model,
        COUNT(*) as calls,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed,
        ROUND(SUM(cost_usd), 4) as cost_usd,
        ROUND(AVG(input_tokens)) as avg_input,
        ROUND(AVG(output_tokens)) as avg_output
      FROM ai_calls
      WHERE day_number BETWEEN ? AND ?
      GROUP BY provider, model
      ORDER BY cost_usd DESC
    `).all(minDay, maxDay) as Array<{
      provider: string;
      model: string;
      calls: number;
      failed: number;
      cost_usd: number;
      avg_input: number;
      avg_output: number;
    }>;

    if (modelRows.length > 0) {
      console.log(`\n  By Model:`);
      for (const m of modelRows) {
        const shortModel = m.model.replace("claude-", "").replace("-20251001", "").replace("-20250929", "");
        const failStr = m.failed > 0 ? ` (${m.failed} failed)` : "";
        console.log(`    ${m.provider}/${shortModel}: ${m.calls} calls${failStr}, $${m.cost_usd}, avg ${m.avg_input}/${m.avg_output} tok`);
      }
    }

    // Per-task breakdown (top tasks by cost)
    const taskRows = sqlite.prepare(`
      SELECT
        task,
        COUNT(*) as calls,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed,
        ROUND(SUM(cost_usd), 4) as cost_usd
      FROM ai_calls
      WHERE day_number BETWEEN ? AND ?
      GROUP BY task
      ORDER BY cost_usd DESC
      LIMIT 8
    `).all(minDay, maxDay) as Array<{
      task: string;
      calls: number;
      failed: number;
      cost_usd: number;
    }>;

    if (taskRows.length > 0) {
      console.log(`\n  By Task (top ${taskRows.length}):`);
      for (const t of taskRows) {
        const failStr = t.failed > 0 ? ` (${t.failed} failed)` : "";
        console.log(`    ${t.task}: ${t.calls} calls${failStr}, $${t.cost_usd}`);
      }
    }

    // Per-day cost + timing table (compact)
    if (dayTimings.length > 1) {
      const dayCostRows = sqlite.prepare(`
        SELECT
          day_number as day,
          COUNT(*) as calls,
          SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed,
          ROUND(SUM(cost_usd), 4) as cost_usd
        FROM ai_calls
        WHERE day_number BETWEEN ? AND ?
        GROUP BY day_number
        ORDER BY day_number ASC
      `).all(minDay, maxDay) as Array<{
        day: number;
        calls: number;
        failed: number;
        cost_usd: number;
      }>;

      const costMap = new Map(dayCostRows.map(r => [r.day, r]));

      console.log(`\n  Day-by-Day:`);
      console.log(`    ${"Day".padStart(5)} | ${"Time".padStart(7)} | ${"Calls".padStart(5)} | ${"Fail".padStart(4)} | ${"Cost".padStart(7)}`);
      console.log(`    ${"-".repeat(5)} | ${"-".repeat(7)} | ${"-".repeat(5)} | ${"-".repeat(4)} | ${"-".repeat(7)}`);
      for (const dt of dayTimings) {
        const cost = costMap.get(dt.day);
        const timeSec = (dt.durationMs / 1000).toFixed(0) + "s";
        const calls = cost?.calls ?? 0;
        const failed = cost?.failed ?? 0;
        const costStr = cost ? `$${cost.cost_usd}` : "-";
        console.log(`    ${String(dt.day).padStart(5)} | ${timeSec.padStart(7)} | ${String(calls).padStart(5)} | ${String(failed).padStart(4)} | ${costStr.padStart(7)}`);
      }
    }
  } catch {
    // DB not available — just print timing
  }

  console.log(`\n${"=".repeat(60)}\n`);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return `${mins}m${secs}s`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}
