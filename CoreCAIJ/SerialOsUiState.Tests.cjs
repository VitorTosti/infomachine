const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const helper = require('./mac-ui/serial-os.js');

const source = fs.readFileSync('CoreCAIJ/mac-ui/app.js', 'utf8');
const lookupSource = source.slice(source.indexOf('async function lookupExistingOs('), source.indexOf('\nfunction scheduleSerialOsLookup('));
const scheduleSource = source.slice(source.indexOf('function scheduleSerialOsLookup('), source.indexOf('\nfunction setEnvironmentStatus('));
const cpuSource = source.slice(source.indexOf('function compactCpu('), source.indexOf('\nfunction compactRam('));
assert.ok(lookupSource.startsWith('async function lookupExistingOs('));
assert.ok(scheduleSource.startsWith('function scheduleSerialOsLookup('));
assert.ok(cpuSource.startsWith('function compactCpu('));

let serial = '7NKF1G3';
let calls = 0;
let timers = 0;
const context = {
  state: { serialOsLookup: { status: 'searching', serial, orders: [], message: '' }, manualOsSet: false, osCreatedInSession: false },
  lastSerialOsLookup: serial,
  serialOsLookupRequest: 1,
  serialOsLookupActiveRequest: 1,
  serialOsLookupTimer: 0,
  currentLookupSerial: () => serial,
  normalizeSerial: (value) => String(value).replace(/\s+/g, '').toUpperCase(),
  renderSerialOsLookup: () => {},
  api: async () => { calls += 1; return { ordens: [] }; },
  osNumberFromInput: () => 3450,
  window: {
    CAIJ_SERIAL_OS: helper,
    clearTimeout: () => {},
    setTimeout: () => { timers += 1; return timers; },
  },
};
vm.createContext(context);
vm.runInContext(`${lookupSource}\n${scheduleSource}\n${cpuSource}`, context);

(async () => {
  context.scheduleSerialOsLookup();
  assert.equal(context.serialOsLookupRequest, 1, 'opening the create form must not cancel an active lookup for the same serial');
  assert.equal(timers, 0, 'same-serial navigation must not start a duplicate query');

  // Reproduce the old stuck state: request was invalidated, but serial marked queried.
  context.serialOsLookupRequest += 1;
  await context.lookupExistingOs();
  assert.equal(calls, 1, 'stale searching state must retry instead of displaying an infinite spinner');
  assert.equal(context.state.serialOsLookup.status, 'none');

  serial = 'NEW12345';
  context.scheduleSerialOsLookup();
  assert.equal(context.lastSerialOsLookup, '', 'new serial must invalidate the cached result');
  assert.equal(context.state.serialOsLookup.status, 'idle');
  assert.equal(timers, 1);
  assert.equal(context.compactCpu('12th Gen Intel(R) Core(TM) i5-1235U CPU'), 'i5-1235U');
  console.log('PASS: serial lookup survives navigation and retries stale searches.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
