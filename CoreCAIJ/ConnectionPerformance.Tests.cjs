const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
const source = fs.readFileSync(`${__dirname}/mac-ui/portable.js`, 'utf8')
  .replace('window.CAIJ_PORTABLE_API = portableApi;', 'window.testConnection = { central, findReachableServer }; window.CAIJ_PORTABLE_API = portableApi;');
const reply = (data, ok = true) => ({ ok, json: async () => data });
function setup(fetch) {
  const window = { CAIJ_NATIVE_RUNTIME: { serverUrl: 'http://ready:9100' }, location: { protocol: 'file:' } };
  vm.runInNewContext(source, { window, fetch, AbortController, setTimeout, clearTimeout, console });
  return window.testConnection;
}
async function main() {
  const connection = setup(async (url) => {
    await new Promise(resolve => setTimeout(resolve, url.includes('ready:') ? 15 : 250));
    return reply({ status: url.includes('ready:') ? 'ok' : 'erro' });
  });
  const start = performance.now();
  await connection.findReachableServer();
  const duration = Math.round(performance.now() - start);
  console.log(`Discovery with one healthy and slow alternatives: ${duration}ms`);
  if (process.argv.includes('--baseline')) return;
  assert.ok(duration < 150, 'Healthy server must not wait for slow alternatives');
  let posts = 0;
  const mutation = setup(async (url, options) => {
    if (url.endsWith('/status')) return reply({ status: 'ok' });
    if (options.method === 'POST') posts++;
    throw new Error('Connection lost after request');
  });
  await assert.rejects(mutation.central('/criar-os-altertag', { serial: 'test' }, 50));
  assert.equal(posts, 1, 'Never replay a mutation on another hostname');
  let probes = 0;
  const shared = setup(async (url) => {
    if (url.endsWith('/status')) probes++;
    return reply({ status: 'ok' });
  });
  await Promise.all([shared.central('/one'), shared.central('/two')]);
  const initialProbes = probes;
  await shared.central('/three');
  assert.equal(probes, initialProbes, 'Reuse the reachable server');
  let businessCalls = 0;
  const denied = setup(async (url) => {
    if (url.endsWith('/status')) return reply({ status: 'ok' });
    businessCalls++;
    return reply({ mensagem: 'Acesso negado' }, false);
  });
  await assert.rejects(denied.central('/protected'), /Acesso negado/);
  assert.equal(businessCalls, 1, 'Application errors must not trigger fallback');
  let reads = 0;
  const deduped = setup(async (url) => {
    if (!url.endsWith('/status')) reads++;
    return reply({ status: 'ok' });
  });
  await Promise.all([deduped.central('/same'), deduped.central('/same')]);
  assert.equal(reads, 1, 'Concurrent identical reads share one request');
  await deduped.central('/same');
  assert.equal(reads, 2, 'Completed reads are not cached as stale OS data');
  const stalled = setup(async (url, options) => {
    if (url.endsWith('/status')) return reply({ status: 'ok' });
    return { ok: true, json: () => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }) };
  });
  await assert.rejects(stalled.central('/write', {}, 20), /tempo limite/);
  console.log('Connection safety and performance tests passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
