const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const code = fs.readFileSync(path.join(__dirname, 'mac-ui', 'storage.js'), 'utf8');
const context = { window: {} };
vm.runInNewContext(code, context);
const { normalize } = context.window.CAIJ_STORAGE;
assert.equal(normalize('256GB SSD + 500GB HDD'), '256GB SSD + 500GB HDD');
assert.equal(normalize('320GB HDD'), '320GB HDD');
assert.equal(normalize('1TB HDD'), '1TB HDD');
assert.equal(normalize('256GB SSD; 500GB HD'), '256GB SSD + 500GB HDD');
assert.equal(normalize('256GB SSD + 1TB HDD'), '256GB SSD + 1TB HDD');
assert.equal(normalize('1TB Disco'), '1TB Disco');
assert.equal(normalize(''), 'N/A');
console.log('PASS: capacidade e tipo de cada disco sobrevivem a edicao e impressao.');
