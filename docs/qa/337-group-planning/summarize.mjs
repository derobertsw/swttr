// Turns run.mjs's full results.json into the compact checks.json kept in
// this folder: one line of numbers per page load, plus the journey, failure
// and focus records as they were.
//
//   node docs/qa/337-group-planning/summarize.mjs <results.json> [checks.json]
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const [input, output = resolve(process.cwd(), 'docs/qa/337-group-planning/checks.json')] = process.argv.slice(2);
const results = JSON.parse(await readFile(input, 'utf8'));
const touch = (row) => row.width < 1280;
const names = (list, key = 'name') => [...new Set(list.map((entry) => entry[key]))];

const checks = {
  meta: results.meta,
  layout: results.layout.map((row) => ({
    journey: row.journey, role: row.role, page: row.page, width: row.width, scheme: row.scheme, pointer: touch(row) ? 'touch' : 'mouse',
    pageOverflow: row.pageOverflow, contentCards: row.cards.filter((card) => card.kind === 'content').map((card) => card.text),
    editorBlocks: row.cards.filter((card) => card.kind === 'editor').length, controls: row.controls,
    under44: names(row.small.filter((entry) => !entry.inline)), inlineLinksUnder44: row.small.filter((entry) => entry.inline).length,
    spilled: names(row.spilled ?? [], 'text'), consoleErrors: row.console?.length ?? 0,
  })),
  a11y: (results.a11y ?? []).map((row) => ({
    journey: row.journey, role: row.role, page: row.page, width: row.width, interactive: row.interactive, unnamed: row.unnamed,
    tabStops: row.keyboard.stops, focusNotVisible: row.keyboard.hidden, focusOutOfView: row.keyboard.outOfView, focusCovered: row.keyboard.covered,
    h1: row.headings.filter((heading) => heading.startsWith('1:')), repeatedNames: row.repeated,
  })),
  text: (results.text ?? []).map((row) => ({
    journey: row.journey, role: row.role, page: row.page, mode: row.mode, rootFontSize: row.rootFontSize, pageOverflow: row.pageOverflow,
    scrollWidth: row.scrollWidth, offenders: row.offenders.map((entry) => entry.text), spilled: names(row.spilled ?? [], 'text'),
    truncated: names(row.truncated ?? [], 'text'), contentCards: row.cards.filter((card) => card.kind === 'content').map((card) => card.text),
  })),
  motion: results.motion,
  journeys: (results.journeys ?? []).map(({ excerpt, ...row }) => ({ ...row, ...(excerpt ? { excerpt: excerpt.slice(0, 1200) } : {}) })),
  failures: results.failures,
  focus: results.focus,
  shots: (results.shots ?? []).map((shot) => ({ name: shot.name, width: shot.width, scheme: shot.scheme, fontSize: shot.fontSize })),
};
await writeFile(output, `${JSON.stringify(checks, null, 1)}\n`);
console.log(`Wrote ${output}`);
