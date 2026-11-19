// Condenses run.mjs's results.json into checks.json: each check's name, result and key figures.
//   node docs/qa/213-compare-stays/summarize.mjs <out>/results.json
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const results = JSON.parse(await readFile(process.argv[2], 'utf8'));
const KEEP = ['width', 'fontSize', 'vw', 'scrollWidth', 'layout', 'missing', 'unwanted', 'groupedOk', 'tablesOk', 'map', 'offenders', 'spilled', 'stops', 'hidden', 'outOfView',
  'unnamed', 'link', 'newTab', 'before', 'after', 'comparisonRequestsOnReturn', 'reloaded', 'chosen', 'writes', 'beforeAdd', 'afterAdd', 'announced', 'lodgingKept', 'focusAfter',
  'buttons', 'useDisabledUntilReplaceTicked', 'focusOnOpen', 'alert', 'unchangedByPreview', 'replaceTicked', 'peopleAfterReview', 'focusAfterReview', 'revision', 'bookings',
  'options', 'address', 'outside', 'focusAfterEscape', 'kept', 'tabOrder', 'wide', 'add', 'compareRequests', 'keyboard', 'headings'];
const checks = Object.entries(results).filter(([, value]) => Array.isArray(value)).flatMap(([group, entries]) => entries.filter((entry) => 'pass' in entry)
  .map((entry) => ({ group, name: entry.name, pass: entry.pass, ...Object.fromEntries(KEEP.filter((key) => key in entry).map((key) => [key, entry[key]])) })));
const out = resolve('docs/qa/213-compare-stays/checks.json');
await writeFile(out, `${JSON.stringify({ meta: results.meta, passed: checks.filter((check) => check.pass).length, total: checks.length, checks }, null, 2)}\n`);
console.log(`${checks.filter((check) => check.pass).length} of ${checks.length} passed → ${out}`);
