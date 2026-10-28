const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const requests = [];
const sent = [];
const window = {
  location: { protocol: 'http:', origin: 'http://nas-caij:9100' },
  CAIJ_NATIVE_RUNTIME: { platform: 'windows', osNumero: 3450, info: { serial: '7NKF1G3' }, serverUrl: 'http://nas-caij:9100' },
};
vm.runInNewContext(fs.readFileSync('CoreCAIJ/mac-ui/storage.js', 'utf8'), { window });
async function fetch(url, options = {}) {
  requests.push(url);
  if (options.body) sent.push({ url, body: JSON.parse(options.body) });
  const data = url.endsWith('/status')
    ? { status: 'ok' }
    : { status: 'ok', ordens: [{ numero: 1164, osCodigo: 'C001164', garantia: '7NKF1G3' }] };
  return { ok: true, json: async () => data };
}
vm.runInNewContext(fs.readFileSync('CoreCAIJ/mac-ui/portable.js', 'utf8'), {
  window, fetch, AbortController, setTimeout, clearTimeout, URLSearchParams,
});
(async () => {
  const found = await window.CAIJ_PORTABLE_API('/api/os-by-serial', { serial: '7NKF1G3' });
  assert.equal(found.ordens[0].osCodigo, 'C001164');
  assert.ok(requests.some((url) => url.includes('/os-por-serial?serial=7NKF1G3')));
  const printed = await window.CAIJ_PORTABLE_API('/api/print', {
    grade: 'A', obs: '', includeOs: false, equipmentType: 'Notebook',
    info: { serial: '7NKF1G3', cpu: '12th Gen Intel(R) Core(TM) i5-1235U CPU @ 1.30GHz', disco: '256GB SSD + 500GB HDD' },
  });
  assert.equal(printed.payload.cpu, 'i5-1235U');
  assert.equal(sent.find((item) => item.url.endsWith('/imprimir')).body.cpu, 'i5-1235U');
  assert.equal(printed.payload.disco, '256GB SSD + 500GB HDD');
  assert.equal(sent.find((item) => item.url.endsWith('/imprimir')).body.fichaDisco, '256GB SSD + 500GB HDD');
  console.log('PASS: app portatil consulta o NAS pela serial sem alterar OS.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
