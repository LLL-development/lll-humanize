import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Import the Pages ESM function without changing the CommonJS frontend tests.
const source = await readFile(new URL('../functions/api/humanize.js', import.meta.url), 'utf8');
const { onRequestPost } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const configured = { ANTHROPIC_API_KEY: 'local-transport-test-only' };
function request(body) {
  return new Request('http://localhost/api/humanize', { method: 'POST', body: JSON.stringify(body) });
}
async function withTransport(transport, callback) {
  const original = globalThis.fetch;
  globalThis.fetch = transport;
  try { await callback(); } finally { globalThis.fetch = original; }
}

test('missing key is a structured configuration error', async () => {
  const response = await onRequestPost({ request: request({ text: 'hello' }), env: {} });
  assert.equal(response.status, 500);
  assert.match((await response.json()).error, /missing API key/);
});
test('invalid JSON is rejected', async () => {
  const response = await onRequestPost({ request: new Request('http://localhost', { method: 'POST', body: '{' }), env: configured });
  assert.equal(response.status, 400);
});
for (const body of [null, [], { text: 42 }, { text: {} }, { text: ['hello'] }, { text: '  ' }, { text: 'x'.repeat(5001) }]) {
  test(`invalid input returns JSON 400: ${JSON.stringify(body).slice(0, 60)}`, async () => {
    await withTransport(() => { throw new Error('invalid input must not call provider'); }, async () => {
      const response = await onRequestPost({ request: request(body), env: configured });
      assert.equal(response.status, 400);
      assert.equal(typeof (await response.json()).error, 'string');
    });
  });
}
test('5000 characters are accepted and unknown strength uses medium', async () => {
  await withTransport(async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.messages[0].content.length, 5000);
    assert.match(body.system, /natural, human rhythm/);
    return Response.json({ content: [{ type: 'text', text: ' local transport result ' }] });
  }, async () => {
    const response = await onRequestPost({ request: request({ text: 'x'.repeat(5000), strength: 'unknown' }), env: configured });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { rewritten: 'local transport result' });
  });
});
for (const strength of ['constructor', { toString: null }, { toString: {} }]) {
  test(`unsupported strength uses medium: ${JSON.stringify(strength)}`, async () => {
    await withTransport(async (_url, init) => {
      assert.match(JSON.parse(init.body).system, /natural, human rhythm/);
      return Response.json({ content: [{ type: 'text', text: 'result' }] });
    }, async () => {
      assert.equal((await onRequestPost({ request: request({ text: 'hello', strength }), env: configured })).status, 200);
    });
  });
}

for (const [name, transport] of [
  ['HTTP failure', async () => new Response('unavailable', { status: 503 })],
  ['network rejection', async () => { throw new TypeError('connection refused'); }],
  ['invalid upstream JSON', async () => new Response('invalid')],
  ['invalid upstream content', async () => Response.json({ content: 'invalid' })],
  ['missing upstream text', async () => Response.json({ content: [] })],
]) {
  test(`${name} returns JSON 502`, async () => {
    await withTransport(transport, async () => {
      const response = await onRequestPost({ request: request({ text: 'hello' }), env: configured });
      assert.equal(response.status, 502);
      assert.equal(typeof (await response.json()).error, 'string');
    });
  });
}
