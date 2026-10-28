const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(`${__dirname}/mac-ui/portable.js`, 'utf8');
async function main() {
  let polls = 0;
  let writes = 0;
  const window = { CAIJ_NATIVE_RUNTIME: {
    platform: 'windows', deviceReading: 'pending', info: {},
    localBridgeUrl: 'http://127.0.0.1:1234', serverUrl: 'http://ready:9100',
  }, location: { protocol: 'file:' } };
  const fetch = async (url, options) => {
    if (url.endsWith('/device-info')) {
      polls++;
      const data = polls === 1 ? { pending: true } : { ok: true, info: { serial: 'TEST', ram: '8GB' } };
      return { ok: true, json: async () => data };
    }
    if (options.method === 'POST') writes++;
    return { ok: true, json: async () => ({ status: 'ok' }) };
  };
  vm.runInNewContext(source, { window, fetch, AbortController, setTimeout, clearTimeout, console });
  const api = window.CAIJ_PORTABLE_API;
  await assert.rejects(api('/api/print', {}), /nao esta pronta/);
  await assert.rejects(api('/api/create-os', {}), /nao esta pronta/);
  await assert.rejects(api('/api/info', { info: { serial: 'OLD' } }), /Aguarde/);
  assert.equal(writes, 0, 'No remote mutations while the device is loading');
  assert.equal((await api('/api/state')).deviceReading, 'pending');
  const ready = await api('/api/state');
  assert.equal(ready.deviceReading, 'ready');
  assert.equal(ready.info.serial, 'TEST');
  await api('/api/state');
  assert.equal(polls, 2, 'Read the completed device once, without repeated hardware collection');
  await api('/api/info', { info: { serial: 'MANUAL' } });
  assert.equal((await api('/api/state')).info.serial, 'MANUAL', 'Manual edits are not overwritten later');
  console.log('Progressive startup safety tests passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
