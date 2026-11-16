const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, 'mac-ui', name), 'utf8');
const requests = [];
const window = {
  location: { protocol: 'http:', origin: 'http://fixture.invalid' },
  CAIJ_NATIVE_RUNTIME: { platform: 'windows', osNumero: 235, info: { serial: 'QA-D-001' }, serverUrl: 'http://fixture.invalid' },
};
for (const name of ['storage.js', 'observation.js']) vm.runInNewContext(read(name), { window });
const context = { window, AbortController, setTimeout, clearTimeout, URLSearchParams,
  fetch: async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push({ url, body });
    return { ok: true, json: async () => ({ status: 'ok', osNumero: 236, proximoDisponivel: 237 }) };
  },
};
vm.runInNewContext(read('portable.js'), context);
const create = { tecnico: 'Vitor', serial: 'QA-D-001', referencia: 'GRADE D', produto: { idProduto: 1, codigo: 'QA1', descricao: 'Fixture' }, observacao: 'Servicos realizados: Testes aprovados', servicos: ['tests'] };
const print = { grade: 'D', obs: 'Servicos: Testes aprovados', includeOs: false };
(async () => {
  for (const detalheGrade of [undefined, '', ' \t\n ']) {
    for (const [route, body] of [['/api/create-os', create], ['/api/print', print]]) {
      const before = requests.length;
      await assert.rejects(window.CAIJ_PORTABLE_API(route, { ...body, detalheGrade }), /[Oo]bserv|[Dd]etalh|Grade D/);
      assert.equal(requests.length, before, 'D sem detalhe deve bloquear antes de qualquer chamada de rede');
    }
  }
  const detalheGrade = 'Risco profundo na tampa';
  await window.CAIJ_PORTABLE_API('/api/create-os', { ...create, detalheGrade });
  const created = requests.find(r => r.url.endsWith('/criar-os-altertag')).body;
  assert.equal(created.referencia, 'GRADE D');
  assert.equal(created.detalheGrade, detalheGrade);
  assert.ok(created.observacao.includes(detalheGrade));
  const printed = await window.CAIJ_PORTABLE_API('/api/print', { ...print, detalheGrade });
  assert.equal(printed.payload.grade, 'D');
  const sent = requests.find(r => r.url.endsWith('/imprimir')).body;
  assert.equal(sent.grade, 'D');
  assert.equal(sent.detalheGrade, detalheGrade);
  assert.ok(sent.obs.includes(detalheGrade));
  for (const grade of ['B', 'C']) await assert.rejects(window.CAIJ_PORTABLE_API('/api/print', { grade, obs: ' ', includeOs: false }));
  for (const grade of ['A', 'RMA']) assert.equal((await window.CAIJ_PORTABLE_API('/api/print', { grade, obs: '', includeOs: false })).payload.grade, grade);
  console.log('PASS: Grade D exige detalhe livre antes da rede e preserva cadastro/etiqueta; outras grades mantidas.');
})().catch(error => { console.error(error); process.exitCode = 1; });
