const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const app = fs.readFileSync(`${__dirname}/mac-ui/app.js`, 'utf8');
assert.match(app, /function applyState\(data\)[\s\S]*?renderSerialOsLookup\(\);\s*refreshKeyboardLayoutForDevice\(\);/);
const keyboardMap = {
  addEventListener() {},
  removeEventListener() {},
  querySelector() { return null; },
  querySelectorAll() { return []; },
  setAttribute(name, value) { this[name] = value; },
  focus() { this.focused = true; },
};
const bodyListeners = {};
const body = {
  innerHTML: '',
  addEventListener(name, handler) { bodyListeners[name] = handler; },
  removeEventListener(name) { delete bodyListeners[name]; },
  querySelector: (selector) => ['.windows-keyboard', '.keyboard-map'].includes(selector) ? keyboardMap : null,
  querySelectorAll: () => [...body.innerHTML.matchAll(/<kbd[^>]*data-key="([^"]+)"/g)]
    .map((match) => ({ dataset: { key: match[1] }, classList: { add() {}, remove() {} }, addEventListener() {} })),
};
const count = { textContent: '' };
const lastEvent = { textContent: '' };
const recentLine = { innerHTML: '', scrollLeft: 0, scrollWidth: 100 };
const state = { info: { modelo: 'Lenovo ThinkPad E14 Gen 2' }, activeTest: 'keyboard' };
const captureStatus = { textContent: '' };
const focusCaptureButton = { addEventListener() {}, focus() {} };
const elementsById = { keyboardCount: count, keyboardLastEvent: lastEvent, keyboardRecentKeys: recentLine, keyboardCaptureStatus: captureStatus, focusKeyboardCapture: focusCaptureButton };
const listenerTarget = { addEventListener() {}, removeEventListener() {} };
const context = vm.createContext({
  state,
  isWindowsPreview: true,
  escapeHtml: value => String(value),
  qs: (id) => elementsById[id] || body,
  window: listenerTarget,
  document: { ...listenerTarget, hasFocus: () => true, activeElement: null, hidden: false },
});
vm.runInContext(app.slice(app.indexOf('function normalizeKeyboardEvent('), app.search(/(?:async\s+)?function playTestTone\(/)), context);
context.openKeyboardTest();
assert.match(body.innerHTML, /data-key="FN"[^>]*>Fn<\/kbd><kbd[^>]*data-key="CONTROLLEFT"[^>]*>CTRL<\/kbd><kbd[^>]*data-key="WINDOWSLEFT"/);
assert.match(body.innerHTML, /data-key="ALTRIGHT"[^>]*>ALT GR<\/kbd><kbd[^>]*data-key="PRINTSCREEN"[^>]*>Prt<br>Sc<\/kbd><kbd[^>]*data-key="INTLRO"[^>]*>\? \/ °<\/kbd><kbd[^>]*data-key="CONTROLRIGHT"/);
assert.match(body.innerHTML, /data-key="FN"[^>]*data-manual-confirm="true"/);
assert.doesNotMatch(body.innerHTML, /data-mouse-button|windows-touchpad|Último clique/);
assert.match(body.innerHTML, /Últimas teclas recebidas/);
assert.equal(context.normalizeKeyboardEvent({ code: 'AltRight', key: 'AltGraph' }), 'ALTRIGHT');
assert.equal(context.normalizeKeyboardEvent({ code: 'PrintScreen', key: 'PrintScreen' }), 'PRINTSCREEN');
for (const key of ['/', '?', '°']) assert.equal(context.normalizeKeyboardEvent({ code: 'IntlRo', key }), 'INTLRO');
assert.equal(context.normalizeKeyboardEvent({ code: 'Slash', key: '/' }), '/');
assert.match(body.innerHTML, /data-key="PRINTSCREEN"[^>]*data-manual-confirm="true"/);
state.keyboardHandler({ type: 'keydown', code: 'IntlRo', key: '/', preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} });
assert.match(lastEvent.textContent, /código físico IntlRo · caractere \/ · mapa INTLRO/);
assert.equal(state.keyboardPressed.has('INTLRO'), true);
state.keyboardHandler({ type: 'keydown', code: 'KeyA', key: 'a', repeat: false, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} });
state.keyboardHandler({ type: 'keydown', code: 'KeyA', key: 'a', repeat: false, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} });
assert.match(recentLine.innerHTML, /class="keyboard-recent-key"[^>]*>A<\/span><span class="keyboard-recent-key rapid"[^>]*>A<\/span>/, 'Dois acionamentos aparecem em sequência');
state.keyboardPressed.delete('INTLRO');
state.info.modelo = 'Dell Latitude 5320';
context.openKeyboardTest();
assert.match(body.innerHTML, /class="windows-function-end"[\s\S]*data-key="HOME"[\s\S]*data-key="END"/);
assert.doesNotMatch(body.innerHTML, /data-key="WINDOWSRIGHT"/);
assert.match(body.innerHTML, /class="windows-keyboard-footer"[\s\S]*class="windows-arrow-keys"/);
assert.equal(context.normalizeKeyboardEvent({ code: 'IntlRo', key: '/' }), '/');
state.info.modelo = '';
state.keyboardPressed = new Set(['A']);
context.openKeyboardTest();
assert.match(body.innerHTML, /data-key="MENU"/);
state.info.modelo = 'Lenovo ThinkPad E14 Gen 2';
context.refreshKeyboardLayoutForDevice();
assert.match(body.innerHTML, /data-key="ALTRIGHT"[^>]*>ALT GR<\/kbd><kbd[^>]*data-key="PRINTSCREEN"[^>]*>Prt<br>Sc<\/kbd><kbd[^>]*data-key="INTLRO"/);
assert.equal(count.textContent, '1 / 104');
assert.equal(state.keyboardPressed.has('A'), true);
const zoneListeners = {};
const zone = { addEventListener(name, handler) { zoneListeners[name] = handler; }, getBoundingClientRect() { return { left: 0, top: 0 }; } };
const pointer = { style: {} };
const values = Object.fromEntries(['trackLeft', 'trackMiddle', 'trackRight', 'trackMoves', 'trackScrolls', 'trackLastPointer'].map((id) => [id, { textContent: '0', parentElement: { classList: { observed: false, add(name) { if (name === 'observed') this.observed = true; } } } }]));
const trackpadState = { testChecklist: [{ id: 'trackpad.movement' }, { id: 'trackpad.buttons' }] };
const trackpadContext = vm.createContext({ state: trackpadState, qs: (id) => ({ activeTestBody: body, trackpadZone: zone, trackPointer: pointer, ...values })[id], invalidateTestConfirmation() {}, renderHardwareChecklist() {}, renderTests() {} });
vm.runInContext(app.slice(app.indexOf('function listenForMouseButtons('), app.indexOf('function openKeyboardTest(')), trackpadContext);
vm.runInContext(app.slice(app.indexOf('function openTrackpadTest('), app.indexOf('async function openTest(')), trackpadContext);
trackpadContext.openTrackpadTest();
bodyListeners.click({ type: 'click', detail: 0, preventDefault() {} });
bodyListeners.contextmenu({ type: 'contextmenu', button: 2, preventDefault() {} });
assert.equal(values.trackLeft.textContent, '0', 'Enter/espaço não conta como clique esquerdo');
assert.equal(values.trackRight.textContent, '0', 'Menu/Shift+F10 não conta como clique direito');
for (const [button, id] of [[0, 'trackLeft'], [1, 'trackMiddle'], [2, 'trackRight']]) {
  bodyListeners.pointerdown({ type: 'pointerdown', button, preventDefault() {} });
  assert.equal(values[id].textContent, 1);
  assert.equal(values[id].parentElement.classList.observed, true);
}
assert.equal(values.trackLeft.textContent, 1);
assert.equal(values.trackMiddle.textContent, 1);
assert.equal(values.trackRight.textContent, 1);
for (let i = 0; i < 19; i++) zoneListeners.pointermove({ clientX: i, clientY: i });
assert.equal(trackpadState.testChecklist[0].evidence, undefined, '19 movimentos não bastam');
zoneListeners.pointermove({ clientX: 20, clientY: 20 });
assert.match(trackpadState.testChecklist[0].evidence.detail, /^20 movimentos detectados/);
assert.match(trackpadState.testChecklist[1].evidence.detail, /esquerdo 1, direito 1/);
console.log('E14 keyboard, Fn confirmation, and three touchpad buttons passed.');
