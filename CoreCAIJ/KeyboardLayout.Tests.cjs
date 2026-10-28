const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const app = fs.readFileSync(`${__dirname}/mac-ui/app.js`, 'utf8');
assert.match(app, /function applyState\(data\)[\s\S]*?renderSerialOsLookup\(\);\s*refreshKeyboardLayoutForDevice\(\);/);
const touchpadListeners = {};
const touchpadButton = { classList: { add(name) { this.pressed = name === 'pressed'; } } };
const touchpad = {
  querySelector(selector) { return /data-mouse-button="[012]"/.test(selector) ? touchpadButton : null; },
};
const keyboardMap = {
  addEventListener(name, handler) { touchpadListeners[name] = handler; },
  removeEventListener(name) { delete touchpadListeners[name]; },
  querySelector(selector) { return selector === '.windows-touchpad' ? touchpad : null; },
};
const bodyListeners = {};
const body = {
  innerHTML: '',
  addEventListener(name, handler) { bodyListeners[name] = handler; },
  removeEventListener(name) { delete bodyListeners[name]; },
  querySelector: (selector) => selector === '.windows-keyboard' ? keyboardMap : null,
  querySelectorAll: () => [...body.innerHTML.matchAll(/<kbd[^>]*data-key="([^"]+)"/g)]
    .map((match) => ({ dataset: { key: match[1] }, classList: { add() {}, remove() {} }, addEventListener() {} })),
};
const count = { textContent: '' };
const lastEvent = { textContent: '' };
const lastPointer = { textContent: '' };
const state = { info: { modelo: 'Lenovo ThinkPad E14 Gen 2' }, activeTest: 'keyboard' };
const context = vm.createContext({ state, isWindowsPreview: true, qs: (id) => id === 'keyboardCount' ? count : id === 'keyboardLastEvent' ? lastEvent : id === 'keyboardLastPointer' ? lastPointer : body, document: { addEventListener() {}, removeEventListener() {} } });
vm.runInContext(app.slice(app.indexOf('function normalizeKeyboardEvent('), app.indexOf('function playTestTone(')), context);
context.openKeyboardTest();
assert.match(body.innerHTML, /data-key="FN"[^>]*>Fn<\/kbd><kbd[^>]*data-key="CONTROLLEFT"[^>]*>CTRL<\/kbd><kbd[^>]*data-key="WINDOWSLEFT"/);
assert.match(body.innerHTML, /data-key="ALTRIGHT"[^>]*>ALT GR<\/kbd><kbd[^>]*data-key="PRINTSCREEN"[^>]*>Prt<br>Sc<\/kbd><kbd[^>]*data-key="INTLRO"[^>]*>\? \/ °<\/kbd><kbd[^>]*data-key="CONTROLRIGHT"/);
assert.match(body.innerHTML, /data-key="FN"[^>]*data-manual-confirm="true"/);
assert.match(body.innerHTML, /data-mouse-button="0"[\s\S]*data-mouse-button="1"[\s\S]*data-mouse-button="2"/);
touchpadListeners.contextmenu({ button: 2, target: {}, preventDefault() {} });
assert.equal(touchpadButton.classList.pressed, true);
assert.match(lastPointer.textContent, /direito detectado/);
assert.equal(context.normalizeKeyboardEvent({ code: 'AltRight', key: 'AltGraph' }), 'ALTRIGHT');
assert.equal(context.normalizeKeyboardEvent({ code: 'PrintScreen', key: 'PrintScreen' }), 'PRINTSCREEN');
for (const key of ['/', '?', '°']) assert.equal(context.normalizeKeyboardEvent({ code: 'IntlRo', key }), 'INTLRO');
assert.equal(context.normalizeKeyboardEvent({ code: 'Slash', key: '/' }), '/');
assert.match(body.innerHTML, /data-key="PRINTSCREEN"[^>]*data-manual-confirm="true"/);
state.keyboardHandler({ type: 'keydown', code: 'IntlRo', key: '/', preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} });
assert.match(lastEvent.textContent, /código físico IntlRo · caractere \/ · mapa INTLRO/);
assert.equal(state.keyboardPressed.has('INTLRO'), true);
state.keyboardPressed.delete('INTLRO');
state.info.modelo = 'Dell Latitude 5320';
context.openKeyboardTest();
assert.match(body.innerHTML, /class="windows-function-end"[\s\S]*data-key="HOME"[\s\S]*data-key="END"/);
assert.doesNotMatch(body.innerHTML, /data-key="WINDOWSRIGHT"/);
assert.match(body.innerHTML, /class="windows-keyboard-footer"[\s\S]*class="windows-touchpad"[\s\S]*class="windows-arrow-keys"/);
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
const values = Object.fromEntries(['trackLeft', 'trackMiddle', 'trackRight', 'trackMoves', 'trackScrolls', 'trackLastPointer'].map((id) => [id, { textContent: '0' }]));
const trackpadContext = vm.createContext({ state: {}, qs: (id) => ({ activeTestBody: body, trackpadZone: zone, trackPointer: pointer, ...values })[id] });
vm.runInContext(app.slice(app.indexOf('function listenForMouseButtons('), app.indexOf('function openKeyboardTest(')), trackpadContext);
vm.runInContext(app.slice(app.indexOf('function openTrackpadTest('), app.indexOf('async function openTest(')), trackpadContext);
trackpadContext.openTrackpadTest();
for (const [button, id] of [[0, 'trackLeft'], [1, 'trackMiddle'], [2, 'trackRight']]) {
  bodyListeners.pointerdown({ button, preventDefault() {} });
  assert.equal(values[id].textContent, 1);
}
assert.equal(values.trackLeft.textContent, 1);
assert.equal(values.trackMiddle.textContent, 1);
assert.equal(values.trackRight.textContent, 1);
console.log('E14 keyboard, Fn confirmation, and three touchpad buttons passed.');
