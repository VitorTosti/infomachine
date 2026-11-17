const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(`${__dirname}/mac-ui/app.js`, 'utf8');
const openTestSource = source.slice(source.indexOf('async function openTest('), source.indexOf('function closeScreenTest('));

async function scenario(test, pendingReads) {
  const listeners = {};
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, {
      textContent: '', disabled: false, scrollTop: 0, innerHTML: '',
      classList: { add() {}, remove() {} },
      addEventListener(name, callback) { listeners[id + ':' + name] = callback; },
      insertAdjacentHTML() {},
      contains(child) { return !this.removed && child === elements.get(test === 'network' ? 'networkStatus' : 'powerStatus'); },
      scrollIntoView() {},
    });
    return elements.get(id);
  };
  const checklist = [{ id: 'network.ethernet' }, { id: 'network.wifi' }, { id: 'charger.connectors' }];
  const state = { info: { serial: 'OLD' }, testSessionSerial: 'OLD', testChecklist: checklist, activeTest: null };
  let invalidations = 0;
  const context = vm.createContext({
    state, qs: element, testLabels: { network: 'Rede', charger: 'Carregador' }, isWindowsPreview: true,
    stopActiveTest() {}, renderHardwareChecklist() {}, renderActiveTestNavigation() {}, renderTests() {},
    invalidateTestConfirmation() { invalidations++; },
    api() { return new Promise((resolve, reject) => pendingReads.push({ resolve, reject })); },
  });
  vm.runInContext(openTestSource, context);
  await context.openTest(test);
  return { state, checklist, listeners, pendingReads, elements, get invalidations() { return invalidations; } };
}

(async () => {
  const network = await scenario('network', []);
  const request = network.listeners['detectNetwork:click']();
  network.state.info.serial = 'NEW';
  network.state.testSessionSerial = 'NEW';
  network.state.testChecklist = [{ id: 'network.ethernet' }];
  network.state.activeTest = 'charger';
  network.elements.get('activeTestBody').removed = true;
  network.pendingReads[0].resolve({ interfaces: [{ kind: 'ethernet', connected: true, name: 'Old NIC', ip: '192.0.2.10' }] });
  await request;
  assert.equal(network.state.testChecklist[0].evidence, undefined, 'Leitura antiga não pode contaminar outra serial');
  assert.equal(network.invalidations, 0);

  const closedPanel = await scenario('network', []);
  const closedRequest = closedPanel.listeners['detectNetwork:click']();
  closedPanel.state.activeTest = 'keyboard';
  closedPanel.elements.get('activeTestBody').removed = true;
  closedPanel.pendingReads[0].reject(new Error('Leitura cancelada'));
  await closedRequest;
  assert.equal(closedPanel.invalidations, 0, 'Erro de painel antigo não deve alterar a tela atual');

  const power = await scenario('charger', []);
  const disconnected = power.listeners['powerDisconnected:click']();
  power.pendingReads[0].resolve({ lineStatus: 'Offline' });
  await disconnected;
  const connected = power.listeners['powerConnected:click']();
  power.state.info.serial = 'NEW';
  power.state.testSessionSerial = 'NEW';
  power.state.testChecklist = [{ id: 'charger.connectors' }];
  power.elements.get('activeTestBody').removed = true;
  power.pendingReads[1].resolve({ lineStatus: 'Online' });
  await connected;
  assert.equal(power.state.testChecklist[0].evidence, undefined);
  assert.equal(power.invalidations, 0);
  console.log('PASS: leituras atrasadas de rede e carregador não alteram outra sessão.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
