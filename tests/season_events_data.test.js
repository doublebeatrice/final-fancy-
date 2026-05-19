const assert = require('assert');
const events = require('../data/season_events_2026.json');

assert.ok(Array.isArray(events));
assert.ok(events.length >= 100);

const fathersDay = events.find(event => event.key === 'fathers_day' || event.name === "Father's Day");
assert.ok(fathersDay);
assert.strictEqual(fathersDay.nodeStart, '2026-06-21');
assert.ok(fathersDay.coreTerm.includes('dad') || fathersDay.coreTerm.includes('father'));

const christmas = events.find(event => event.name === 'Christmas');
assert.ok(christmas);
assert.ok(christmas.nodeEnd >= '2026-12-25');

console.log('season events data tests passed');
