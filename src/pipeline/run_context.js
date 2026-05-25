const fs = require('fs');
const path = require('path');

function ensureDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function defaultWriteJson(file, value) {
  ensureDir(file);
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function createRunContext(input = {}) {
  const manifest = input.manifest;
  if (!manifest || typeof manifest !== 'object') throw new Error('manifest is required');
  const manifestFile = input.manifestFile || manifest.manifestFile;
  const summaryFile = input.summaryFile || manifest.outputFiles?.summaryFile;
  const buildSummary = input.buildSummary || (value => value);
  const writeJson = input.writeJson || defaultWriteJson;

  if (!Array.isArray(manifest.steps)) manifest.steps = [];
  if (!manifest.outputFiles) manifest.outputFiles = {};

  function persist() {
    if (manifestFile) writeJson(manifestFile, manifest);
    if (summaryFile) writeJson(summaryFile, buildSummary(manifest));
  }

  function latestStep(name) {
    const normalized = String(name || '').trim();
    return manifest.steps.slice().reverse().find(step => step.name === normalized) || null;
  }

  return {
    manifest,
    manifestFile,
    summaryFile,
    persist,
    latestStep,
  };
}

module.exports = {
  createRunContext,
};
