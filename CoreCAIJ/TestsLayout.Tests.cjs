const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const checklist = require('./mac-ui/test-checklist.js');
const appSource = fs.readFileSync(`${__dirname}/mac-ui/app.js`, 'utf8');
const element = () => ({ innerHTML: '', textContent: '', classList: { toggle() {}, add() {}, remove() {} } });
const elements = {};
const uiState = { activeTest: 'usb', testChecklist: [], checklistNotesOpen: new Set() };
const testSequence = ['camera', 'keyboard', 'audio', 'screen', 'trackpad', 'usb', 'charger', 'network', 'hdmi'];
const testLabels = { camera: 'Câmera', keyboard: 'Teclado', audio: 'Som', screen: 'Tela', trackpad: 'Trackpad', usb: 'USB', charger: 'Carregador', network: 'Rede', hdmi: 'HDMI' };
const ui = vm.createContext({ state: uiState, qs: id => elements[id] ||= element(), escapeHtml: value => String(value),
  window: { CAIJ_TEST_CHECKLIST: checklist }, testSequence, testLabels });
vm.runInContext(appSource.slice(appSource.indexOf('const evidenceRequiredItems'), appSource.indexOf('function renderTestConfirmation(')), ui);
const run = code => vm.runInContext(code, ui);
const items = () => checklist.createChecklist({ usbPorts: ['USB 1', 'USB 2'] });
const set = (id, patch) => Object.assign(uiState.testChecklist.find(i => i.id === id), patch);
const label = id => checklist.createChecklist().find(i => i.id === id).label;

// Task 1: pendências e estado
uiState.testChecklist = items();
assert.equal(ui.testRailState('usb'), 'pending');
assert.deepEqual(ui.testBlockers('usb').map(b => b.reason), ['pending', 'pending', 'pending']);
set('usb.inventory', { result: 'passed' });
assert.equal(ui.testRailState('usb'), 'incomplete');
assert.equal(ui.testBlockers('usb').length, 2);
uiState.testChecklist.push({ id: 'usb.port-3', testId: 'usb', label: 'USB-C 1', result: 'pending', notes: '' });
assert.equal(ui.testBlockers('usb').length, 3, 'porta adicionada entra na contagem');
uiState.testChecklist.filter(i => i.testId === 'usb').forEach(i => i.result = 'passed');
assert.equal(ui.testRailState('usb'), 'passed');
set('usb.port-1', { result: 'failed', notes: ' \t ' });
assert.deepEqual(ui.testBlockers('usb').map(b => [b.id, b.reason]), [['usb.port-1', 'justification']]);
assert.equal(ui.testRailState('usb'), 'incomplete');
set('usb.port-1', { notes: 'Porta sem contato' });
assert.equal(ui.testRailState('usb'), 'failed');
set('usb.port-1', { result: 'untested' });
assert.equal(ui.testRailState('usb'), 'untested');
uiState.testChecklist.filter(i => i.testId === 'usb').forEach(i => { i.result = 'not_applicable'; i.notes = ''; });
assert.equal(ui.testRailState('usb'), 'not_applicable');
assert.deepEqual(ui.testBlockers('audio').map(b => b.reason), ['evidence']);
set('audio.speakers', { evidence: { source: 'auto', detail: 'Tom reproduzido nos lados esquerdo e direito', at: '2026-11-16T12:00:00Z' } });
assert.deepEqual(ui.testBlockers('audio').map(b => b.reason), ['pending']);

// Task 2: lista lateral
uiState.testChecklist = items(); uiState.activeTest = 'usb';
set('usb.inventory', { result: 'passed' });
ui.renderTestRail();
const rail = elements.testRail.innerHTML;
assert.match(rail, /data-state="incomplete" aria-current="step"><button type="button" data-rail-test="usb"/);
assert.match(rail, /Falta 2/);
assert.equal((rail.match(/data-rail-test="/g) || []).length, 10, 'nove testes e a revisão');
assert.match(rail, /data-rail-test="review"/);
assert.match(rail, /data-state="pending"><button type="button" data-rail-test="camera"/);

console.log('PASS: estado da lista lateral e pendencias por teste.');
