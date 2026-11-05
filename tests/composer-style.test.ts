import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM, VirtualConsole } from 'jsdom';

test('composer textarea retains full grid-cell width regardless of stylesheet chunk order', async () => {
  const styles = await Promise.all(['../src/DesktopChat.css', '../src/ui/astryx-bito.css'].map(path => readFile(new URL(path, import.meta.url), 'utf8')));
  for (const order of [styles, [...styles].reverse()]) {
    const dom = new JSDOM(`<style>${order.join('\n')}</style><div class="desktop-chat"><form class="desktop-composer"><div class="bito-chat-composer"><textarea placeholder="Tulis pesan…"></textarea></div></form></div>`, { virtualConsole: new VirtualConsole() });
    try {
      const field = dom.window.document.querySelector('textarea')!;
      assert.equal(dom.window.getComputedStyle(field).width, '100%', 'flex-era zero width must not override the grid input in production chunks');
      assert.equal(dom.window.getComputedStyle(field).gridColumn, '2');
    } finally { dom.window.close(); }
  }
});
