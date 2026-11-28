const test = require('node:test');
const assert = require('node:assert/strict');
const { descendants, page } = require('../support/offline-page');

test('the lazy export dialog handles folder recovery, mixed groups, cancellation and the reviewed download', async () => {
  const downloads = [];
  const blobs = new Map();
  class PreviewURL extends URL {
    static createObjectURL(blob) {
      const url = URL.createObjectURL(blob);
      blobs.set(url, blob);
      return url;
    }
  }
  const p = page({ entryProfile: 'none', globals: { URL: PreviewURL },
    download: link => downloads.push([link.download, link.href]) });
  const settle = () => new Promise(resolve => setImmediate(resolve));
  await p.start();
  const opener = descendants(p.body).find(el => el.textContent === 'Export' && el.tagName === 'BUTTON');
  assert.ok(opener);
  assert.equal(p.loads.some(path => path.includes('export-')), false);
  opener.click();
  await settle();
  const modal = p.body.children.find(el => el.tagName === 'DIALOG');
  assert.ok(modal.open);
  assert.deepEqual(p.loads.filter(path => path.includes('export-')),
    ['offprint/js/export-dialog.js', 'offprint/css/export-dialog.css']);

  const find = (tag, title) => descendants(modal).find(el => el.tagName === tag &&
    (title === undefined || el.textContent === title));
  const [docsInput] = descendants(modal).filter(el => el.type === 'file');
  const [reader, interactive] = descendants(modal).filter(el => el.type === 'radio');
  assert.equal(reader.checked, true);
  assert.equal(interactive.checked, false);
  const choose = find('BUTTON', 'Choose site folder');
  const build = find('BUTTON', 'Build preview');
  const stop = find('BUTTON', 'Cancel');
  const download = find('BUTTON', 'Download HTML');
  const status = descendants(modal).find(el => el.getAttribute('role') === 'status');
  assert.equal(p.document.activeElement, choose);
  docsInput.dispatchEvent(new Event('cancel'));
  assert.match(status.textContent, /Folder selection cancelled/);
  const leaf = (id, title, available = true) => ({ id, title, available, children: [] });
  const selected = [];
  const modes = [];
  const consents = [];
  let blob;
  async function verifyDownload() {
    const previous = downloads.length;
    assert.ok(modal.textContent.includes(`${blob.size} bytes`));
    download.click();
    assert.equal(downloads.length, previous + 1);
    const [name, href] = downloads.at(-1);
    assert.equal(name, 'Book.html');
    assert.match(href, /^blob:/);
    assert.equal(blobs.get(href), blob);
    return blobs.get(href).text();
  }
  p.OP._exportPackage = {
    async prepare(files) {
      if (!files[0].webkitRelativePath.startsWith('source/')) {
        throw Object.assign(new Error('Wrong folder'), { folder: 'documents' });
      }
      return {
        active: 'home',
        tree: [{ title: 'Book', children: [leaf('home', 'Home'), {
          title: 'Part', children: [leaf('chapter', 'Chapter'), leaf('missing', 'Hidden page', false)]
        }] }],
        async build(ids, { signal, mode, includeImports, includeScripts }) {
          selected.push(Array.from(ids));
          modes.push(mode);
          consents.push(Array.from(includeImports));
          if (selected.length === 1) throw new Error('Build failed');
          if (selected.length === 2) {
            await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
            signal.throwIfAborted();
          }
          const embedImport = includeImports.has('accepted-revision');
          const embedScript = includeScripts.has('approved-script');
          blob = new Blob(['<!doctype html>', embedImport ? 'données' : '', embedScript ? 'script' : '']);
          return { filename: 'Book.html', blob, bytes: blob.size,
            importChoices: mode === 'interactive' ? [{ id: 'accepted-revision', name: 'input.csv', bytes: 22,
              title: 'Home', consumers: ['#runs'], available: true,
              selected: embedImport, included: embedImport }] : [],
            scriptChoices: mode === 'interactive' ? [{ id: 'approved-script', name: 'widgets.js', title: 'Chapter',
              dependencies: ['helpers.js'], resources: [], available: true, selected: embedScript, included: embedScript }] : [],
            pages: [{ title: 'Home', view: 'live', imports: [{ name: 'input.csv', target: 'runs' }] },
              { title: 'Chapter', view: 'saved', imports: [] }],
            issues: [{ title: 'Home', code: 'unavailable-link', target: 'omitted.html', message: 'Unavailable.' }] };
        }
      };
    }
  };
  const selectFolder = async (input, path) => {
    input.files = [{ webkitRelativePath: path + '/index.html' }];
    input.dispatchEvent(new Event('change'));
    await settle();
  };
  await selectFolder(docsInput, 'wrong');
  assert.match(status.textContent, /Wrong folder/);
  assert.equal(build.hidden, true);
  assert.equal(p.document.activeElement, choose);
  await selectFolder(docsInput, 'source');
  assert.match(modal.textContent, /source/);
  const picker = descendants(modal).find(el => el.tagName === 'FIELDSET' && el.firstChild.textContent === 'Pages to export');
  const [group, home, part, chapter] = descendants(picker).filter(el => el.type === 'checkbox');
  assert.equal(home.checked, true);
  assert.equal(chapter.checked, false);
  assert.equal(group.indeterminate, true);
  assert.equal(part.checked, false);
  assert.doesNotMatch(picker.textContent, /Hidden page/);
  group.checked = true;
  group.dispatchEvent(new Event('change'));
  assert.equal(part.checked, true);
  assert.equal(chapter.checked, true);
  assert.equal(group.indeterminate, false);
  build.click();
  await settle();
  assert.match(status.textContent, /Build failed/);
  assert.equal(build.textContent, 'Retry preview');
  build.click();
  stop.click();
  await settle();
  assert.match(status.textContent, /Export cancelled/);
  assert.equal(download.hidden, true);
  build.click();
  await settle();
  assert.deepEqual(selected, Array.from({ length: 3 }, () => ['home', 'chapter']));
  assert.equal(p.OP._readerState.enabled(), true);
  assert.equal(download.hidden, false);
  assert.match(modal.textContent, /Current view/);
  assert.match(modal.textContent, /Saved view/);
  assert.match(modal.textContent, /input\.csv/);
  assert.match(modal.textContent, /1 disabled link/);
  assert.match(modal.textContent, /omitted\.html/);
  assert.match(modal.textContent, /15 bytes/);
  assert.equal(await verifyDownload(), '<!doctype html>');
  assert.deepEqual(modes, ['reader', 'reader', 'reader']);
  interactive.checked = true;
  interactive.dispatchEvent(new Event('change'));
  assert.equal(download.hidden, true);
  assert.match(status.textContent, /Export mode changed/);
  build.click();
  await settle();
  assert.equal(modes.at(-1), 'interactive');
  assert.equal(download.hidden, false);
  const importOptions = descendants(modal).find(el => el.tagName === 'FIELDSET' &&
    el.firstChild?.textContent === 'Include full imported datasets');
  const importCheck = () => descendants(importOptions).find(el => el.type === 'checkbox');
  const scriptOptions = descendants(modal).find(el => el.tagName === 'FIELDSET' &&
    el.firstChild?.textContent === 'Include local author scripts');
  const scriptCheck = () => descendants(scriptOptions).find(el => el.type === 'checkbox');
  assert.equal(scriptCheck().checked, false);
  assert.match(scriptOptions.textContent, /widgets\.js.*Chapter.*helpers\.js/);
  assert.equal(importCheck().checked, false);
  assert.match(importOptions.textContent, /input\.csv · 22 bytes.*Home · #runs/);
  assert.equal(await verifyDownload(), '<!doctype html>');
  scriptCheck().checked = true;
  scriptCheck().dispatchEvent(new Event('change'));
  assert.match(status.textContent, /Script choices changed/);
  importCheck().checked = true;
  importCheck().dispatchEvent(new Event('change'));
  assert.equal(download.hidden, true);
  download.click();
  assert.equal(downloads.length, 2);
  build.click();
  await settle();
  assert.deepEqual(consents.at(-1), ['accepted-revision']);
  assert.equal(importCheck().checked, true);
  assert.equal(scriptCheck().checked, true);
  assert.equal(download.hidden, false);
  assert.equal(await verifyDownload(), '<!doctype html>donnéesscript');
  importCheck().checked = false;
  importCheck().dispatchEvent(new Event('change'));
  assert.equal(download.hidden, true);
  build.click();
  await settle();
  assert.deepEqual(consents.at(-1), []);
  assert.equal(await verifyDownload(), '<!doctype html>script');
  scriptCheck().checked = false;
  scriptCheck().dispatchEvent(new Event('change'));
  assert.equal(download.hidden, true);
  download.click();
  assert.equal(downloads.length, 4);
  build.click();
  await settle();
  assert.equal(await verifyDownload(), '<!doctype html>');
  assert.match(modal.textContent, /Saved reading data/);
  const cleared = [];
  p.OP._readerState.clear = async () => cleared.push(true) && true;
  find('BUTTON', 'Clear saved views and imports').click();
  find('BUTTON', 'Keep').click();
  assert.equal(cleared.length, 0);
  find('BUTTON', 'Clear saved views and imports').click();
  find('BUTTON', 'Clear').click();
  await settle();
  assert.equal(cleared.length, 1);
  assert.match(status.textContent, /cleared\. Build a new preview/);
  assert.equal(download.hidden, true);
  build.click();
  await settle();
  chapter.checked = false;
  chapter.dispatchEvent(new Event('change'));
  assert.equal(download.hidden, true);
  assert.equal(group.indeterminate, true);
  find('BUTTON', 'Close').click();
  assert.equal(p.document.activeElement, opener);
  assert.equal(modal.isConnected, false);
});
