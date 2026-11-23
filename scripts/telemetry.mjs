#!/usr/bin/env node
// Reads the claude-code-action execution file and reports usage, cost and turns.
//   - appends one line to telemetry.jsonl
//   - writes a markdown table to the GitHub step summary
//   - sets output over_budget=true and exits 1 when cost exceeds MAX_COST_USD
//
// Usage: node scripts/telemetry.mjs <execution_file> <job-label>
// Field names (total_cost_usd, usage, modelUsage, num_turns, duration_ms) are read defensively;
// verify against the pinned claude-code-action version in the pilot.

import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const [file, job = 'unknown'] = process.argv.slice(2);
const maxCost = Number(process.env.MAX_COST_USD ?? 0);

if (!file || !existsSync(file)) {
  console.log(`::warning::No execution file for job ${job}; telemetry skipped.`);
  process.exit(0);
}

const raw = JSON.parse(readFileSync(file, 'utf8'));
const messages = Array.isArray(raw) ? raw : [raw];
const result = [...messages].reverse().find((m) => m?.type === 'result') ?? {};

const toolCalls = {};
for (const m of messages) {
  if (m?.type !== 'assistant') continue;
  for (const block of m.message?.content ?? []) {
    if (block.type === 'tool_use') toolCalls[block.name] = (toolCalls[block.name] ?? 0) + 1;
  }
}

const u = result.usage ?? {};
const input = u.input_tokens ?? 0;
const cacheRead = u.cache_read_input_tokens ?? 0;
const cacheCreate = u.cache_creation_input_tokens ?? 0;
const totalIn = input + cacheRead + cacheCreate;

const record = {
  ts: new Date().toISOString(),
  job,
  run_id: process.env.GITHUB_RUN_ID,
  ref: process.env.GITHUB_REF_NAME,
  cost_usd: result.total_cost_usd ?? 0,
  turns: result.num_turns ?? 0,
  duration_ms: result.duration_ms ?? 0,
  input_tokens: input,
  output_tokens: u.output_tokens ?? 0,
  cache_read_tokens: cacheRead,
  cache_creation_tokens: cacheCreate,
  cache_hit_ratio: totalIn > 0 ? Number((cacheRead / totalIn).toFixed(3)) : 0,
  cost_by_model: Object.fromEntries(
    Object.entries(result.modelUsage ?? {}).map(([model, v]) => [model, v.costUSD ?? 0]),
  ),
  tool_calls: toolCalls,
  is_error: Boolean(result.is_error),
};

appendFileSync('telemetry.jsonl', JSON.stringify(record) + '\n');

const rows = [
  ['Cost (USD)', record.cost_usd.toFixed(4)],
  ['Turns', record.turns],
  ['Duration (s)', Math.round(record.duration_ms / 1000)],
  ['Input / output tokens', `${record.input_tokens} / ${record.output_tokens}`],
  ['Cache read / creation tokens', `${record.cache_read_tokens} / ${record.cache_creation_tokens}`],
  ['Cache hit ratio', record.cache_hit_ratio],
  ...Object.entries(record.cost_by_model).map(([m, c]) => [`Cost ${m}`, Number(c).toFixed(4)]),
  ...Object.entries(toolCalls).map(([t, n]) => [`Tool calls ${t}`, n]),
];
const summary = [
  `### Telemetry: ${job}`,
  '',
  '| Metric | Value |',
  '| --- | --- |',
  ...rows.map(([k, v]) => `| ${k} | ${v} |`),
  '',
].join('\n');
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
else console.log(summary);

if (maxCost > 0 && record.cost_usd > maxCost) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'over_budget=true\n');
  console.log(`::error::Cost ${record.cost_usd} USD exceeds budget ${maxCost} USD.`);
  process.exit(1);
}
