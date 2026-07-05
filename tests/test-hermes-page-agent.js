#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  dehydrateDOM,
  translateCommand,
  generateInjectionJS,
  parseAttributes,
  cleanText
} = require('../tools/hermes-page-agent');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

// 1. Test Attribute Parsing
test('parseAttributes', () => {
  const result1 = parseAttributes('class="btn btn-primary" id="submit-btn" disabled');
  assert.strictEqual(result1.class, 'btn btn-primary');
  assert.strictEqual(result1.id, 'submit-btn');
  assert.strictEqual(result1.disabled, '');

  const result2 = parseAttributes("type='text' name='username' value=admin");
  assert.strictEqual(result2.type, 'text');
  assert.strictEqual(result2.name, 'username');
  assert.strictEqual(result2.value, 'admin');
});

// 2. Test Text Cleanup
test('cleanText', () => {
  assert.strictEqual(cleanText('  <span>Submit Form</span>  '), 'Submit Form');
  assert.strictEqual(cleanText('Click <br/> Here'), 'Click Here');
});

// 3. Test DOM Dehydration
test('dehydrateDOM', () => {
  const sampleHtml = `
    <div>
      <a href="/login" class="nav-link">Log In</a>
      <input type="hidden" name="csrf" value="12345" />
      <input type="text" id="username-field" name="username" placeholder="Enter username" />
      <button type="submit" id="submit-button">Submit &amp; Continue</button>
    </div>
  `;
  
  const dehydrated = dehydrateDOM(sampleHtml);
  
  assert.strictEqual(dehydrated.version, '1.0');
  assert.ok(dehydrated.elements.length >= 3); // link, username input, submit button (hidden input skipped)
  
  const linkEl = dehydrated.elements[0];
  assert.strictEqual(linkEl.tag, 'a');
  assert.strictEqual(linkEl.text, 'Log In');
  assert.strictEqual(linkEl.attributes.href, '/login');
  
  const inputEl = dehydrated.elements[1];
  assert.strictEqual(inputEl.tag, 'input');
  assert.strictEqual(inputEl.attributes.id, 'username-field');
  assert.strictEqual(inputEl.attributes.placeholder, 'Enter username');
  
  const buttonEl = dehydrated.elements[2];
  assert.strictEqual(buttonEl.tag, 'button');
  assert.strictEqual(buttonEl.text, 'Submit &amp; Continue');
  assert.strictEqual(buttonEl.attributes.id, 'submit-button');
});

// 4. Test Command Translation
test('translateCommand - Click', () => {
  const dom = {
    elements: [
      { id: 'pa-1', tag: 'button', text: 'Log In', attributes: { id: 'btn-login' } },
      { id: 'pa-2', tag: 'input', text: '', attributes: { name: 'email', placeholder: 'Email' } }
    ]
  };

  const action = translateCommand('Click on the Log In button', dom);
  assert.strictEqual(action.action, 'click');
  assert.strictEqual(action.targetId, 'pa-1');
});

test('translateCommand - Input/Type', () => {
  const dom = {
    elements: [
      { id: 'pa-1', tag: 'button', text: 'Log In', attributes: { id: 'btn-login' } },
      { id: 'pa-2', tag: 'input', text: '', attributes: { name: 'email', placeholder: 'Email Address' } }
    ]
  };

  const action = translateCommand('Type test@example.com in Email Address', dom);
  assert.strictEqual(action.action, 'input');
  assert.strictEqual(action.targetId, 'pa-2');
  assert.strictEqual(action.value, 'test@example.com');
});

test('translateCommand - Unknown', () => {
  const dom = { elements: [] };
  const action = translateCommand('Jump over the fence', dom);
  assert.strictEqual(action.action, 'unknown');
});

// 5. Test Injection JS Generation
test('generateInjectionJS - Click', () => {
  const dom = {
    elements: [
      { id: 'pa-1', tag: 'button', text: 'Log In', attributes: { id: 'btn-login' } }
    ]
  };
  const action = { action: 'click', targetId: 'pa-1' };
  const js = generateInjectionJS(action, dom);
  
  assert.ok(js.includes('document.querySelector("button[id=\\"btn-login\\"]")'));
  assert.ok(js.includes('el.click()'));
});

test('generateInjectionJS - Input', () => {
  const dom = {
    elements: [
      { id: 'pa-2', tag: 'input', text: '', attributes: { name: 'email' } }
    ]
  };
  const action = { action: 'input', targetId: 'pa-2', value: 'hello@world.com' };
  const js = generateInjectionJS(action, dom);
  
  assert.ok(js.includes('document.querySelector("input[name=\\"email\\"]")'));
  assert.ok(js.includes('el.value = "hello@world.com"'));
  assert.ok(js.includes("dispatchEvent(new Event('input'"));
});
