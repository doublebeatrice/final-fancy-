#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function listPackageScripts(options = {}) {
  const scripts = options.scripts || {};
  const prefix = options.prefix || '';
  const query = (options.query || '').toLowerCase();
  return Object.entries(scripts)
    .map(([name, command]) => ({ name, command }))
    .filter(item => !prefix || item.name.startsWith(prefix))
    .filter(item => {
      if (!query) return true;
      return item.name.toLowerCase().includes(query) || item.command.toLowerCase().includes(query);
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function readPackageScripts(root = ROOT) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  return packageJson.scripts || {};
}

function printScripts(items) {
  for (const item of items) {
    process.stdout.write(`${item.name}\n  ${item.command}\n`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const scripts = readPackageScripts();
  const items = listPackageScripts({
    scripts,
    prefix: args.prefix || '',
    query: args.query || '',
  });
  printScripts(items);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`${err.stack || err.message}\n`);
    process.exit(1);
  }
}

module.exports = {
  listPackageScripts,
};
