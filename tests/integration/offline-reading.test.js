const test = require('node:test');
const assert = require('node:assert/strict');
const { repo, element, page } = require('../support/offline-page');

test('floating page links match the bottom pager and respect page boundaries and opt-out', async () => {
  const home = { path: 'index.html', title: 'Home' };
  const current = { path: 'pages/chapter.html', title: 'Chapter' };
  const end = { path: 'end.html', title: 'End' };
  const prev = ['prev', new URL(home.path, repo).href];
  const next = ['next', new URL(end.path, repo).href];
  const links = pager => pager?.children.map(link => [link.rel, link.href]);

  for (const { pages, noPager, controls = true, expected } of [
    { pages: [home, current, end], expected: [prev, next] },
    { pages: [current, end], expected: [next] },
    { pages: [home, current], expected: [prev] },
    { pages: [home, current, end], noPager: true },
    { pages: [home, end] },
    { pages: [current] },
    { pages: [home, current, end], controls: false, expected: [prev, next] }
  ]) {
    const p = page({ nested: true, site: { pages, features: { controls } } });
    const main = p.body.appendChild(element('main'));
    const query = p.document.querySelector;
    p.document.querySelector = selector => {
      if (selector === 'main') return main;
      if (selector === '.op-sidebar') return p.body.children.find(el => el.className === 'op-sidebar') || null;
      return query(selector);
    };
    if (noPager) main.setAttribute('data-op-no-pager', '');
    await p.start();

    const bar = p.body.children.find(el => el.className === 'op-controls-bar');
    const quick = bar?.children[1];
    const bottom = main.children.find(el => el.className === 'op-pager');
    assert.equal(bar?.firstChild.className, controls ? 'op-controls' : undefined);
    assert.deepEqual(links(bottom), expected);
    assert.deepEqual(links(quick), controls ? expected : undefined);
    if (quick) {
      assert.equal(quick.className, 'op-controls-pager');
      assert.deepEqual(quick.children.map(link => link.getAttribute('aria-label')),
        expected.map(([rel]) => rel === 'prev' ? 'Previous page: Home' : 'Next page: End'));
    }
    assert.equal(p.OP.diagnostics.list().length, 0);
  }
});

test('floating controls show shared tooltip cards with current labels and effective shortcuts', async () => {
  const p = page({
    site: { pages: ['index.html', { path: 'next.html', title: 'Next chapter' }] },
    config: { options: { shortcuts: { 'controls.theme': 'y' } } }
  });
  const heading = p.body.appendChild(element('h2'));
  p.body.querySelectorAll = selector => selector === 'h2, h3' ? [heading] : [];
  const query = p.document.querySelector;
  p.document.querySelector = selector => selector === '.op-sidebar'
    ? p.body.children.find(el => el.className === 'op-sidebar') || null
    : query(selector);
  await p.start();

  const [pill, pager] = p.body.children.find(el => el.className === 'op-controls-bar').children;
  const [progress, nav, focus, search, theme, exportButton] = pill.children;
  const next = pager.firstChild;
  const showHint = el => {
    assert.equal(el.hasAttribute('title'), false);
    el.dispatchEvent(new Event('focus'));
    const card = p.body.children.find(child => String(child.className).split(' ').includes('op-tooltip') && !child.hidden);
    assert.equal(card?.getAttribute('role'), 'tooltip');
    return card;
  };
  assert.equal(showHint(nav).textContent, 'Navigation shown. Select to hide (N)');
  const focusCard = showHint(focus);
  assert.equal(focusCard.textContent, 'Turn on focus mode (F)');
  p.OP._controls.setFocus(true);
  assert.equal(focusCard.textContent, 'Turn off focus mode (F)');
  assert.equal(showHint(search).textContent, 'Search (S)');
  const themeCard = showHint(theme);
  assert.equal(themeCard.textContent, 'Theme: Light. Switch to Dark. (Y)');
  assert.equal(theme.getAttribute('aria-keyshortcuts'), 'Y');
  p.OP._theme.set('dark');
  assert.equal(themeCard.textContent, 'Theme: Dark. Switch to Light. (Y)');
  assert.equal(theme.hasAttribute('title'), false);
  assert.equal(showHint(next).textContent, 'Next page: Next chapter');
  assert.equal(exportButton.getAttribute('aria-label'), 'Export');
  assert.equal(showHint(exportButton).textContent, 'Export');
  assert.equal(pill.children.length, 6);
  assert.equal(progress.tabIndex, undefined);
  assert.equal(progress.hasAttribute('title'), false);
  progress.dispatchEvent(new Event('mouseenter'));
  await new Promise(resolve => setTimeout(resolve, 150));
  const progressCard = p.body.children.find(child => String(child.className).split(' ').includes('op-tooltip') && !child.hidden);
  assert.equal(progressCard?.textContent, 'Read 100%');

  const fallback = page({ config: { profile: 'none', features: { controls: true, theme: true } } });
  await fallback.start();
  const fallbackPill = fallback.body.children.find(el => el.className === 'op-controls-bar').firstChild;
  assert.equal(fallbackPill.firstChild.title, 'Read 100%');
  assert.equal(fallbackPill.children[1].title, 'Turn on focus mode (F)', 'focus mode needs no headings');
  assert.equal(fallbackPill.children[2].title, 'Theme: Light. Switch to Dark. (T)');
  const fallbackExport = fallbackPill.children.find(el => el.getAttribute('aria-label') === 'Export');
  assert.ok(fallbackExport);
  assert.equal(fallbackExport.hasAttribute('title'), false);
  assert.ok(!fallbackPill.children.some(el => el.getAttribute('aria-label') === 'Clear saved views and imports'));
});

test('theme changes commit before listeners and queue writes requested by subscribers', async () => {
  const p = page({ config: { profile: 'none', features: { theme: true }, options: { theme: { mode: 'light' } } } });
  const seen = [];
  const host = p.body.appendChild(element('button'));
  p.ids.set('theme:toggle', host);
  await p.start();
  const theme = p.OP._theme;
  assert.equal(theme.mount('theme:toggle'), host);
  assert.equal(theme.mount(host), host);
  const unsubscribe = theme.subscribe((state, meta) => {
    seen.push([state.mode, meta.origin, p.html.getAttribute('data-op-theme'), host.getAttribute('aria-label')]);
    if (state.mode === 'dark') theme.set('light');
  }, { immediate: true });
  host.dispatchEvent(new Event('click'));
  assert.deepEqual(seen.map(([mode, origin, applied]) => [mode, origin, applied]),
    [['light', 'init', 'light'], ['dark', 'user', 'dark'], ['light', 'api', 'light']]);
  assert.match(seen[1][3], /Theme: Dark/);
  assert.deepEqual(p.events.map(event => [event.type, event.detail.current.mode]),
    [['op:theme:change', 'dark'], ['op:theme:change', 'light']]);
  unsubscribe();
  unsubscribe();
  assert.equal(theme.set('light'), true);
  assert.equal(theme.set('system'), false);
  assert.equal(seen.length, 3);
});

test('drawer and controls use committed state and retain valid options from the site', async () => {
  const p = page({ site: { options: { controls: { focus: true, navMode: 'auto' }, roles: { colors: { definition: 'blue' } } } },
    config: { options: { controls: { focus: 'invalid' }, roles: { colors: { definition: 'invalid' } } } } });
  const sidebar = p.body.appendChild(element('nav'));
  const opener = p.body.appendChild(element('button'));
  const querySelector = p.document.querySelector;
  p.document.querySelector = selector => selector === '.op-sidebar' ? sidebar : querySelector(selector);
  p.ids.set('open:nav', opener);
  await p.start();
  const { drawer } = p.OP._navigation;
  const seen = [];
  drawer.subscribe((state, meta) => seen.push([state.open, meta.origin]), { immediate: true });
  assert.equal(drawer.toggle('open:nav'), true);
  assert.equal(sidebar.focused, true);
  assert.equal(drawer.close(), true);
  assert.equal(drawer.close(), true);
  assert.equal(opener.focused, true);
  assert.deepEqual(seen, [[false, 'init'], [true, 'api'], [false, 'api']]);
  assert.deepEqual(p.events.filter(event => event.type === 'op:navigation:drawer').map(event => event.detail.current.open),
    [true, false]);
  const controls = p.OP._controls;
  assert.equal(p.OP._roles.color('definition'), 'blue');
  assert.deepEqual({ ...controls.snapshot() }, { focus: true, nav: false, navMode: 'auto' });
  assert.equal(controls.setFocus(false), true);
  assert.equal(controls.setNavMode('shown'), true);
  assert.equal(controls.setNavMode('invalid'), false);
  assert.deepEqual({ ...controls.snapshot() }, { focus: false, nav: true, navMode: 'shown' });
});

test('custom reading extensions mount code once, dispose tooltips, and resolve literal IDs', async () => {
  const p = page({ config: { profile: 'none', features: { code: true, tooltips: true, math: true, roles: true },
    options: { roles: { colors: { example: 'green' } } } } });
  await p.start();
  const OP = p.OP;
  const pre = p.body.appendChild(element('pre'));
  pre.textContent = 'const x = 1;';
  p.ids.set('sample:code', pre);
  assert.equal(OP._code.mount('sample:code'), pre);
  assert.equal(OP._code.mount(pre), pre);
  assert.equal(pre.parentNode.className, 'op-code');
  assert.equal(pre.parentNode.childNodes.length, 2);
  const term = p.body.appendChild(element('span'));
  term.setAttribute('aria-describedby', 'prior');
  p.ids.set('term:example', term);
  const dispose = OP._tooltips.attach('term:example', '', 'An example.');
  assert.match(term.getAttribute('aria-describedby'), /^prior op-tip-/);
  dispose();
  dispose();
  assert.equal(term.getAttribute('aria-describedby'), 'prior');
  assert.equal(p.body.childNodes.filter(node => !node.hasAttribute('data-op-reader-state-control')).length, 2);
  const math = p.body.appendChild(element('span'));
  p.ids.set('math:x', math);
  assert.equal(OP._math.set('math:x', 'x^2'), true);
  assert.equal(OP._math.source('math:x'), 'x^2');
  assert.equal(OP._roles.color('example'), 'green');
  assert.match(OP._roles.css({ warning: 'red' }), /--op-role-warning:var\(--op-red\)/);
});

test('shortcuts use a single capture listener and route to the innermost active scope', async () => {
  const p = page({ entryProfile: 'none' });
  const outer = p.body.appendChild(element('div'));
  const inner = outer.appendChild(element('div'));
  const button = inner.appendChild(element('button'));
  const calls = [];
  let opened = false;
  let remove;
  p.OP.setup(({ shortcuts }) => {
    const register = (id, scope, active) => shortcuts.register({ id, key: 'A', scope, active, run: () => calls.push(id) });
    register('global');
    register('outer', outer);
    remove = register('inner', inner, () => opened);
  });
  await p.start();
  assert.deepEqual(p.keyboards.map(({ capture }) => capture), [true]);
  assert.equal(p.key('a', button).defaultPrevented, true);
  p.key('a', outer);
  p.key('a');
  opened = true;
  p.key('a', outer);
  remove();
  p.key('A', button, { shiftKey: true });
  assert.deepEqual(calls, ['inner', 'outer', 'global', 'inner', 'outer']);
  assert.equal(p.OP.diagnostics.list().length, 0);
});

test('shortcuts preserve editable, composed, handled and unbound modifier keystrokes', async () => {
  const p = page({ entryProfile: 'none' });
  const textbox = p.body.appendChild(element('input'));
  textbox.closest = selector => selector.startsWith('input,') ? textbox : null;
  const editor = p.body.appendChild(element('div'));
  editor.isContentEditable = true;
  const calls = [];
  p.OP.setup(({ shortcuts }) => {
    shortcuts.register({ id: 'plain', key: 'X', run: () => calls.push('plain') });
    shortcuts.register({ id: 'chord', key: 'Ctrl+Shift+X', run: () => calls.push('chord') });
  });
  await p.start();
  p.key('x', textbox);
  p.key('x', editor);
  p.key('x', p.body, { composedPath: () => [textbox, p.body] });
  p.key('x', p.body, { isComposing: true });
  p.key('x', p.body, { getModifierState: key => key === 'AltGraph' });
  p.key('x', p.body, { handled: true });
  p.key('x', p.body, { ctrlKey: true });
  p.key('x', p.body, { metaKey: true });
  p.key('x', p.body, { altKey: true });
  p.key('x', textbox, { ctrlKey: true, shiftKey: true });
  assert.deepEqual(calls, []);
  p.key('X', p.body, { ctrlKey: true, shiftKey: true });
  p.key('x');
  assert.deepEqual(calls, ['chord', 'plain']);
});

test('shortcut options merge per ID and report a duplicate effective key in the same scope', async () => {
  const p = page({
    site: { profile: 'none', options: { shortcuts: { primary: 'x', secondary: 'z', hidden: 'b' } } },
    config: { options: { shortcuts: { secondary: 'X', hidden: null, chord: 'Ctrl++', invalid: false } } }
  });
  const calls = [];
  p.OP.setup(({ shortcuts }) => {
    for (const [id, key] of Object.entries({ primary: 'p', secondary: 's', hidden: 'h', chord: 'C', invalid: 'I' })) {
      shortcuts.register({ id, key, run: () => calls.push(id) });
    }
  });
  await p.start();
  assert.deepEqual([...p.OP.shortcuts.keys('primary')], ['X']);
  assert.deepEqual([...p.OP.shortcuts.keys('secondary')], []);
  assert.deepEqual([...p.OP.shortcuts.keys('hidden')], []);
  assert.deepEqual([...p.OP.shortcuts.keys('chord')], ['Control++']);
  for (const key of ['p', 's', 'z', 'b', 'h', '+']) assert.equal(p.key(key).defaultPrevented, false);
  assert.equal(p.key('X').defaultPrevented, true);
  assert.equal(p.key('+', p.body, { ctrlKey: true }).defaultPrevented, true);
  assert.equal(p.key('i').defaultPrevented, true);
  assert.deepEqual(calls, ['primary', 'chord', 'invalid']);
  const reports = p.OP.diagnostics.list();
  assert.deepEqual(Array.from(reports, report => [report.code, report.feature]),
    [['shortcut-conflict', 'shortcuts'], ['shortcut-key', 'shortcuts']]);
  assert.match(reports[0].message, /primary.*secondary/);
  assert.equal(p.events.filter(event => event.type === 'op:diagnostic').length, 2);
});

test('search remaps its opening key and honors a disabled Escape while the typing field is focused', async () => {
  const p = page({
    site: { profile: 'none', features: { search: true }, options: { shortcuts: { 'search.open': 'g' } } },
    config: { options: { shortcuts: { 'search.close': null } } }
  });
  let dialog;
  let input;
  p.document.createTreeWalker = () => ({ nextNode: () => null });
  const create = p.document.createElement;
  p.document.createElement = tag => {
    const el = create(tag);
    el.scrollIntoView = () => {};
    if (tag === 'dialog') {
      dialog = el;
      el.showModal = () => { el.open = true; };
      el.close = () => { el.open = false; };
    }
    if (tag === 'input') {
      input = el;
      el.value = '';
      el.select = () => {};
      el.closest = selector => selector.startsWith('input,') ? el : selector === 'dialog:modal' ? dialog : null;
    }
    return el;
  };
  await p.start();
  assert.equal(p.key('s').defaultPrevented, false);
  assert.equal(p.key('g').defaultPrevented, true);
  assert.equal(dialog.open, true);
  assert.equal(p.key('g', input).defaultPrevented, false);
  assert.equal(p.key('Escape', input).defaultPrevented, false);
  const cancel = new Event('cancel', { cancelable: true });
  dialog.dispatchEvent(cancel);
  assert.equal(cancel.defaultPrevented, true);
  assert.equal(dialog.open, true);
  const closeButton = dialog.lastChild.lastChild;
  assert.equal(closeButton.getAttribute('aria-keyshortcuts'), null);
  closeButton.dispatchEvent(new Event('click'));
  assert.equal(dialog.open, false);
});
