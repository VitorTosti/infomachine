const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, 'mac-ui/app.js'), 'utf8');
const start = source.indexOf('function normalizeKeyboardEvent(');
const end = source.indexOf('\nfunction listenForMouseButtons(', start);
assert.ok(start >= 0 && end > start);
const context = vm.createContext({ isWindowsPreview: true, state: { info: { modelo: 'Notebook' } } });
vm.runInContext(source.slice(start, end), context);
const normalize = event => context.normalizeKeyboardEvent(event);
for (const [event, expected] of [
  [{code:'Digit1',key:'!',shiftKey:true},'1'],
  [{code:'Digit2',key:'@',shiftKey:true},'2'],
  [{code:'KeyQ',key:'@',ctrlKey:true,altKey:true},'Q'],
  [{code:'KeyQ',key:'a'},'Q'],
  [{code:'KeyA',key:'q'},'A'],
  [{code:'KeyZ',key:'w'},'Z'],
  [{code:'KeyA',key:'A',repeat:true},'A'],
  [{code:'Semicolon',key:'ç'},';'],
  [{code:'Quote',key:'Dead'},"'"],
  [{code:'ShiftRight',key:'Shift'},'SHIFTRIGHT'],
  [{code:'AltRight',key:'AltGraph'},'ALTRIGHT'],
  [{code:'Numpad1',key:'End'},'NUM1'],
  [{code:'NumpadDecimal',key:','},'NUMDECIMAL'],
  [{code:'',key:'b'},'B'],
]) assert.equal(normalize(event), expected, JSON.stringify(event));
context.state.info.modelo = 'ThinkPad E14';
assert.equal(normalize({code:'IntlRo',key:'/'}), 'INTLRO');
context.isWindowsPreview = false;
assert.equal(normalize({code:'MetaLeft',key:'Meta'}), 'META');
assert.equal(normalize({code:'ShiftRight',key:'Shift'}), 'SHIFT');
assert.equal(normalize({code:'Digit1',key:'!'}), '1');
console.log('PASS: physical keyboard identity with Shift, AltGr, different layouts, dead keys, numpad, fallback and platform modifiers.');
