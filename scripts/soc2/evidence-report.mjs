#!/usr/bin/env node
// SOC 2 evidence report (WP-5.6): reads the JUnit files the soc2-evidence CI job wrote and checks that every control in
// scripts/soc2/controls.json has each of its tests passing (not failed, not skipped). Writes summary.json and summary.md
// next to the JUnit files and exits 1 when any control lacks evidence.
// Usage: node scripts/soc2/evidence-report.mjs <evidence-dir> <junit.xml>...
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const registry = JSON.parse(readFileSync(join(here, 'controls.json'), 'utf8'));
const [outDir, ...junitFiles] = process.argv.slice(2);
if (!outDir || junitFiles.length === 0) {
  process.stderr.write('Usage: node scripts/soc2/evidence-report.mjs <evidence-dir> <junit.xml>...\n');
  process.exit(2);
}

const decode = (value) => value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const attr = (tag, name) => {
  const match = new RegExp(String.raw`\s${name}="([^"]*)"`).exec(tag);
  return match ? decode(match[1]) : '';
};

/** Every <testcase>: file (classname), title (name), outcome. */
function parseJunit(xml, source) {
  const cases = [];
  const pattern = /<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g;
  for (let match = pattern.exec(xml); match; match = pattern.exec(xml)) {
    const head = match[1];
    const body = match[3] ?? '';
    const outcome = /<(failure|error)\b/.test(body) ? 'failed' : /<skipped\b/.test(body) ? 'skipped' : 'passed';
    cases.push({ source, file: attr(head, 'classname'), title: attr(head, 'name'), outcome });
  }
  return cases;
}

function matcher(entry) {
  if (entry.startsWith('file:')) {
    const file = entry.slice(5);
    return (test) => {
      const path = test.file.split(String.fromCharCode(92)).join('/');
      return basename(path) === file || path.endsWith(`/${file}`);
    };
  }
  // Plain substring match; ACC ids must not be followed by another digit (ACC-IAM-1 is not ACC-IAM-10).
  const isId = entry.startsWith('ACC-');
  return (test) => {
    let from = test.title.indexOf(entry);
    while (from !== -1) {
      const next = test.title.charAt(from + entry.length);
      if (!isId || !/[0-9]/.test(next)) return true;
      from = test.title.indexOf(entry, from + 1);
    }
    return false;
  };
}

// A step that crashed before writing its JUnit file leaves its controls without evidence (they FAIL); the report still runs.
const missingFiles = junitFiles.filter((file) => !existsSync(file));
const cases = junitFiles.filter((file) => existsSync(file)).flatMap((file) => parseJunit(readFileSync(file, 'utf8'), basename(file)));
const generatedAt = new Date().toISOString();
const controls = registry.controls.map((control) => {
  const evidence = control.tests.map((entry) => {
    const matches = cases.filter(matcher(entry));
    const passed = matches.filter((test) => test.outcome === 'passed').length;
    const failed = matches.filter((test) => test.outcome === 'failed').length;
    const skipped = matches.filter((test) => test.outcome === 'skipped').length;
    return { test: entry, passed, failed, skipped, ok: passed > 0 && failed === 0 && skipped === 0, cases: matches.map((test) => `${test.file} › ${test.title} [${test.outcome}]`) };
  });
  return { id: control.id, name: control.name, ok: evidence.every((item) => item.ok), evidence };
});
const ok = controls.every((control) => control.ok);
const totals = { cases: cases.length, passed: cases.filter((test) => test.outcome === 'passed').length, failed: cases.filter((test) => test.outcome === 'failed').length, skipped: cases.filter((test) => test.outcome === 'skipped').length };

writeFileSync(join(outDir, 'summary.json'), `${JSON.stringify({ generatedAt, commit: process.env.GITHUB_SHA ?? null, runId: process.env.GITHUB_RUN_ID ?? null, ok, totals, missingFiles, controls }, null, 2)}\n`);
const lines = [
  `# SOC 2 evidence — ${generatedAt.slice(0, 10)}`,
  '',
  `Commit ${process.env.GITHUB_SHA ?? 'local'} · run ${process.env.GITHUB_RUN_ID ?? 'local'} · ${totals.passed} passed, ${totals.failed} failed, ${totals.skipped} skipped across ${junitFiles.length - missingFiles.length} JUnit file(s)${missingFiles.length ? ` (missing: ${missingFiles.map((file) => basename(file)).join(', ')})` : ''}.`,
  '',
  '| Control | Result | Tests (passing cases) |',
  '|---|---|---|',
  ...controls.map((control) => `| ${control.id} ${control.name} | ${control.ok ? 'PASS' : 'FAIL'} | ${control.evidence.map((item) => `${item.test} (${item.passed}${item.failed ? `, ${item.failed} failed` : ''}${item.skipped ? `, ${item.skipped} skipped` : ''})`).join(' · ')} |`)
];
writeFileSync(join(outDir, 'summary.md'), `${lines.join('\n')}\n`);
process.stdout.write(`${lines.join('\n')}\n`);
if (!ok) process.exit(1);
