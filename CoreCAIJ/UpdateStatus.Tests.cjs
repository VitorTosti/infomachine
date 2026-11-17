const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const calls = [];
let manifest = { version: '2026.11.12.100000' };
const window = { location: { protocol: 'http:', origin: 'http://fixture.local:9100' }, CAIJ_NATIVE_RUNTIME: { platform: 'windows', serverUrl: 'http://fixture.local:9100' } };
vm.runInNewContext(fs.readFileSync('CoreCAIJ/mac-ui/portable.js', 'utf8'), {
  window, AbortController, setTimeout, clearTimeout, URLSearchParams,
  fetch: async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET', body: options.body });
    return { ok: true, json: async () => url.endsWith('/status') ? { status: 'ok' } : manifest };
  },
});
(async () => {
  assert.equal(calls.length, 0, 'nao consulta nem atualiza ao carregar o modulo');
  const result = await window.CAIJ_PORTABLE_API('/api/update-status');
  assert.equal(result.ok, true);
  assert.equal(result.latestVersion, manifest.version);
  assert.ok(calls.some(call => call.url.endsWith('/atualizacao/manifesto')));
  assert.ok(calls.every(call => call.method === 'GET' && call.body === undefined), 'consulta nao deve instalar ou escrever');
  manifest = {};
  assert.equal((await window.CAIJ_PORTABLE_API('/api/update-status')).ok, false, 'manifesto sem versao nao confirma atualizacao');
  console.log('PASS: consulta de atualizacao somente leitura, explicita e sem versao inventada.');
})().catch(error => { console.error(error); process.exitCode = 1; });
