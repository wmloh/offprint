const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { load, file } = require('../support/export-runtime');

test('a cancelled two-page export rebuilds a shared bundle and reconstructs each page', async t => {
  function element(tag, text = '') {
    const attributes = new Map();
    return {
      children: [], dataset: {}, localName: tag, textContent: text,
      matches(selectors) { return selectors.split(',').includes(tag); },
      querySelectorAll(selector) {
        const descendants = this.children.flatMap(child => [child, ...child.querySelectorAll('*')]);
        if (selector === '*') return descendants;
        if (selector === 'script') return descendants.filter(child => child.localName === 'script');
        if (selector.startsWith('[data-op-source]:not(')) return descendants.filter(child =>
          child.localName !== 'script' && child.localName !== 'pre' && child.hasAttribute('data-op-source') ||
          child.hasAttribute('data-op-dropzone') && child.hasAttribute('data-op-target-source'));
        if (selector.startsWith('script:not([src])[data-op-source]')) return descendants.filter(child =>
          child.localName === 'pre' && child.hasAttribute('data-op-source'));
        if (selector === '[data-op-more-id]') return descendants.filter(child => child.hasAttribute('data-op-more-id'));
        if (selector === '[id],a[name]') return descendants.filter(child => child.id);
        if (selector === 'h1,h2,h3') return descendants.filter(child => /^h[123]$/.test(child.localName));
        if (selector.startsWith('a[href],area[href]')) return descendants.filter(child => child.localName === 'a' && child.href);
        return [];
      },
      closest(selector) {
        if (selector === '[data-op-no-pager]') return this.hasAttribute('data-op-no-pager') ? this : null;
        return this.getAttribute('data-op-no-outline') === 'true' ? this : null;
      },
      contains: () => true,
      hasAttribute(name) { return attributes.has(name); },
      setAttribute(name, value) { attributes.set(name, { name, value: String(value) }); },
      getAttribute(name) { return attributes.get(name)?.value ?? null; },
      removeAttribute(name) { attributes.delete(name); },
      removeAttributeNode(attr) { attributes.delete(attr.name); },
      getAttributeNode(name) { return attributes.get(name); },
      get attributes() { return attributes.values(); },
      set id(value) { this.setAttribute('id', value); },
      get id() { return this.getAttribute('id') || ''; },
      set href(value) { this.setAttribute('href', value); },
      get href() { return this.getAttribute('href'); },
      set hidden(value) { if (value) this.setAttribute('hidden', ''); else attributes.delete('hidden'); },
      set className(value) { this.setAttribute('class', value); },
      set type(value) { this.setAttribute('type', value); },
      set content(value) { this.setAttribute('content', value); },
      set rel(value) { this.setAttribute('rel', value); },
      set media(value) { this.setAttribute('media', value); },
      append(...children) { this.children.push(...children); },
      prepend(child) { this.children.unshift(child); },
      get outerHTML() {
        const attrs = Array.from(attributes.values(), attr =>
          ` ${attr.name}="${attr.value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"`).join('');
        const children = this.content?.children || this.children;
        return `<${tag}${attrs}>${this.textContent}${children.map(child => child.outerHTML).join('')}</${tag}>`;
      }
    };
  }
  function exportDocument(title) {
    const html = element('html');
    const head = element('head');
    const body = element('body');
    body.replaceWith = replacement => {
      html.children[1] = replacement;
      doc.body = replacement;
    };
    head.append(element('title', title));
    html.append(head, body);
    const doc = { documentElement: html, head, body, createElement: element, importNode(node) {
      [node, ...node.querySelectorAll('*')].forEach(child => { child.ownerDocument = doc; });
      return node;
    }, getElementById: id => doc.body.querySelectorAll('[id],a[name]').find(node => node.id === id),
    querySelector: selector => selector === 'meta[http-equiv]' ?
      head.children.find(node => node.getAttribute('http-equiv')) : null,
    querySelectorAll: selector => doc.body.querySelectorAll(selector) };
    return doc;
  }
  function asset(path, bytes) {
    return Object.assign(new Blob([bytes]), { webkitRelativePath: 'project/' + path });
  }
  function decodeSheet(url) {
    return Buffer.from(url.split(',')[1], 'base64').toString();
  }
  let authorCode = 'doNotPackageThisAuthorScript()';
  const runtime = load(new Map([
    ['home', { title: 'An example', manifest: 'site.js' }],
    ['nested', { title: 'Nested', manifest: '../site.js' }]
  ]), exportDocument, class {
    parseFromString(html) {
      const links = html === 'home' ? 'nested/index.html#caf%C3%A9%2Fmore' : '../index.html';
      const doc = exportDocument('Interactive input');
      const entry = element('script');
      entry.setAttribute('src', '/local/offprint.js');
      const link = element('a', 'Switch pages');
      link.href = links;
      const heading = element('h2', 'Café');
      heading.id = 'café/more';
      const custom = element('script', authorCode);
      custom.setAttribute('data-op-export-resources', JSON.stringify([html === 'home' ? 'author.txt' : '../author.txt']));
      const unavailable = element('script', 'unavailable()');
      unavailable.setAttribute('data-op-export-dependencies', '["missing.js"]');
      custom.remove = () => doc.body.children.splice(doc.body.children.indexOf(custom), 1);
      doc.body.append(heading, link, custom);
      const consumer = element('figure');
      consumer.id = 'runs-figure';
      consumer.setAttribute('data-op-chart', 'scatter');
      consumer.setAttribute('data-op-source', html === 'home' ? 'runs' : 'alias');
      const chartSpec = element('script', '{"x":"Run","y":"Value","brush":true}');
      chartSpec.type = 'application/json';
      chartSpec.namespaceURI = 'http://www.w3.org/1999/xhtml';
      const matchesSpec = chartSpec.matches;
      chartSpec.matches = selector => selector.startsWith('script:not([src])') || matchesSpec(selector);
      consumer.append(chartSpec);
      const inline = element('pre', 'id,value\ninline-record,7');
      inline.setAttribute('data-op-source', 'inline');
      const inlineView = element('div');
      inlineView.setAttribute('data-op-source', 'inline');
      doc.body.append(consumer, inline, inlineView);
      if (html === 'home') {
        const panel = element('div');
        panel.className = 'op-card-panel';
        const detail = element('section');
        detail.id = 'alternate-card';
        const figure = element('figure');
        const declaration = element('script', '{"steps":[{"key":"draw","actions":[]}]}');
        declaration.setAttribute('data-op-animation', '');
        declaration.type = 'application/json';
        declaration.namespaceURI = 'http://www.w3.org/1999/xhtml';
        const matches = declaration.matches;
        declaration.matches = selector => selector.startsWith('script:not([src])') || matches(selector);
        figure.append(declaration);
        const term = element('span', 'An annotated term');
        term.setAttribute('data-op-more-id', 'term-detail');
        const template = element('template');
        template.id = 'term-detail';
        Object.defineProperty(template, 'content', { value: element('fragment') });
        const image = element('img');
        image.setAttribute('src', 'detail.png');
        image.setAttribute('onload', 'sourceHandler()');
        const detailLink = element('a', 'Read the section');
        detailLink.href = links;
        template.content.append(image, detailLink);
        detail.append(figure, term, template);
        panel.append(detail);
        doc.body.append(panel);
        const pipeline = element('figure');
        pipeline.id = 'flow';
        pipeline.className = 'op-pipeline';
        const edge = element('a', 'Next block');
        edge.className = 'op-pipe-link';
        edge.href = '#flow-2';
        const matchesEdge = edge.matches;
        edge.matches = selector => selector === '.op-pipe-link' || matchesEdge(selector);
        edge.closest = selector => selector === '.op-pipeline' ? pipeline : null;
        const blocks = element('ol');
        blocks.className = 'op-pipe-blocks';
        const first = element('li');
        first.className = 'op-pipe-block';
        first.append(edge);
        const second = element('li', 'An unnamed block');
        second.className = 'op-pipe-block';
        blocks.append(first, second);
        const details = element('div');
        details.className = 'op-detail-pane';
        const overview = element('section', 'Pipeline overview');
        overview.setAttribute('data-op-key', 'flow-1');
        const alternate = element('section');
        alternate.setAttribute('data-op-key', 'flow-2');
        const alternateImage = element('img');
        alternateImage.setAttribute('src', 'detail.png');
        const alternateLink = element('a', 'Read the pipeline detail');
        alternateLink.href = links;
        alternate.append(alternateImage, alternateLink);
        details.append(overview, alternate);
        pipeline.append(blocks, details);
        doc.body.append(pipeline);
      }
      doc.querySelectorAll = selector => selector === 'script[src]' ? [entry] :
        selector === 'script' ? [entry, custom, unavailable] : doc.body.querySelectorAll(selector);
      return doc;
    }
  });
  runtime._boot.exportPlan = () => ({
    features: ['base', 'tabs', 'data'], styles: ['css/tabs.css'],
    scripts: ['offprint.js', 'js/core.js', 'js/reader-state.js', 'js/tabs.js']
  });
  runtime._readerState = { identify: () => new Map() };
  runtime._page = 'file:///work/project/index.html';
  runtime._site = { provided: true, base: 'file:///work/project/site.js' };
  const sharedCSS = '@font-face{font-family:Shared;src:url(font.woff2)} p{color:blue}';
  const overrideCSS = 'p{color:red;background:url(image.png)}';
  let css = 'p::before{content:"cancelled"}';
  let stepCount = 0;
  let committedImport = false;
  let staleImport = false;
  let noPager = false;
  let savedSibling = true;
  let revision = 1;
  const importText = 'id,name\n1,private full record café <script>';
  runtime._boot.loadExport('js/page-snapshot.js');
  const authoredText = 'id,name\n1,authored record';
  const wrapper = (name, path) => 'Object.defineProperty(window.OffPrintData || (window.OffPrintData = Object.create(null)), ' +
    JSON.stringify(name) + ', { configurable: true, enumerable: true, writable: true, value: ' +
    JSON.stringify({ format: 'offprint-data', version: 1, type: 'csv', text: authoredText, metadata: { output: path } }) + ' });';
  runtime._pageSnapshot.capture = async (page, options) => {
    const nested = page.url.endsWith('/nested/index.html');
    const body = element('body');
    if (noPager && nested) body.setAttribute('data-op-no-pager', '');
    const title = element('h1', 'Repeat');
    const section = element('h2', 'Repeat');
    const excluded = element('h3', 'Outline exclusion');
    excluded.setAttribute('data-op-no-outline', 'true');
    const crossLink = element('a', nested ? 'Back to home' : 'Go to café');
    crossLink.href = nested ? '../index.html#repeat-2' : 'nested/index.html#caf%C3%A9%2Fmore';
    const accented = element('h2', 'Café');
    accented.id = 'café/more';
    body.append(title, section, excluded, crossLink);
    if (nested) body.append(accented);
    const image = element('img');
    image.setAttribute('src', (nested ? '../copy.png' : 'image.png') + '#view&detail');
    image.setAttribute('srcset', 'image.png 2x, missing.png 3x');
    image.setAttribute('style', 'background:url(image.png); --marker:"</script> café"');
    image.setAttribute('onload', 'sourceHandler()');
    const svg = element('svg');
    const svgImage = element('image');
    svgImage.namespaceURI = 'http://www.w3.org/2000/svg';
    svgImage.setAttribute('href', 'image.png#svg-view');
    svg.append(svgImage);
    const script = element('script', 'sourceScript()');
    script.remove = () => body.children.splice(body.children.indexOf(script), 1);
    body.append(element('p', 'op-export-asset-0-ref &lt;/script&gt; café'), image, svg, script);
    if (committedImport && nested) body.append(element('p', 'Rendered chart data from import'));
    if (stepCount) {
      const options = Array.from({ length: stepCount }, (_, i) => [`step-${i}`, `Step ${i + 1}`, [i % 2], '']);
      const controls = element('div', 'Step 1');
      controls.setAttribute('data-op-reader-steps', JSON.stringify([0, 0, options]));
      const path = element('path');
      path.setAttribute('d', 'M 0 0' + ' l 2 2'.repeat(300));
      path.setAttribute('data-op-reader-step-svg', JSON.stringify([0, options.map((_, i) => [i, '.opacity', String(i % 2)])]));
      svg.append(path);
      const alternate = element('div');
      alternate.setAttribute('hidden', '');
      alternate.setAttribute('data-op-reader-step-detail', '0:1');
      const detailImage = element('img');
      detailImage.setAttribute('src', nested ? '../copy.png' : 'image.png');
      alternate.append(detailImage);
      body.append(controls, alternate);
    }
    return {
      view: nested ? (savedSibling ? 'saved' : 'default') : 'live',
      title: 'An example', issues: staleImport && nested ? [{ code: 'saved-import', target: 'shared', message: 'stale' }] : [],
      htmlAttributes: [], body, imports: [],
      committed: options.interactive && (!nested || savedSibling) ? {
        views: [['tabs', { value: nested ? 'results' : 'overview' }]],
        imports: committedImport && nested ? [['shared', { name: 'private.csv', revision: [revision],
          bytes: Buffer.byteLength(importText), target: '["source","alias"]' }]] : []
      } : undefined,
      importPayloads: new Map([['shared', importText]]),
      styles: [{ href: 'base.css' }, { text: overrideCSS }, { text: css, media: 'print' }]
    };
  };
  const signal = new AbortController();
  const files = [
    file('project/index.html', 'home'),
    file('project/nested/index.html', 'nested'),
    file('project/omitted.html', 'omitted'),
    file('project/site.js', 'window.OffPrintSite = {"title":"Example site","pages":[{"title":"Included group","pages":["index.html","nested/index.html"]},{"title":"Omitted group","pages":["omitted.html"]}],"assets":{"data":{"runs":{"output":"runs.js"},"alias":{"output":"alias.js"},"omitted":{"output":"unused.js"}}}};'),
    asset('runs.js', wrapper('runs', 'runs.js')),
    asset('alias.js', wrapper('alias', 'alias.js')),
    asset('base.css', sharedCSS),
    asset('nested/base.css', sharedCSS),
    asset('font.woff2', 'font bytes'),
    asset('nested/font.woff2', 'font bytes'),
    asset('image.png', 'shared image'),
    asset('copy.png', 'shared image'),
    asset('nested/image.png', 'local image'),
    asset('detail.png', 'detail image'),
    file('project/author.txt', 'author-only resource')
  ];
  const prepared = await runtime._exportPackage.prepare(files);
  const selected = prepared.tree[0].children.map(page => page.id);
  const phases = [];
  await assert.rejects(prepared.build(selected, { signal: signal.signal, onProgress(event) {
    phases.push(event.phase);
    if (event.phase === 'serialize') signal.abort();
  } }), { name: 'AbortError' });
  assert.deepEqual(phases, ['capture', 'capture', 'assets', 'assets', 'links', 'links', 'serialize']);

  css = 'p::before{content:"</script> café"}';
  const result = await prepared.build(selected);
  const html = await result.blob.text();
  assert.equal(result.bytes, result.blob.size);
  assert.equal(result.bytes, Buffer.byteLength(html));
  const serializedBundle = /<script id="export-bundle"[^>]*>(.*?)<\/script>/s.exec(html)[1];
  assert.doesNotMatch(serializedBundle, /</);
  const shell = html.split('<script id="export-bundle"')[0];
  assert.match(shell, /id="export-controls" class="op-controls-bar"/);
  assert.match(shell, /id="export-pill" class="op-controls"[^>]*aria-label="Page controls"/);
  assert.deepEqual(JSON.parse(serializedBundle).icons, { ...runtime._icons });
  assert.match(shell, /id="export-resize"[^>]*role="separator"/);
  assert.match(shell, /<details class="op-nav-page-group" open=""><summary class="op-nav-row">/);
  assert.match(shell, /class="op-nav-label">Included group<\/span>/);
  assert.match(shell, /class="op-nav-title" href="#page-1"[^>]*>Example site<\/a>/);
  assert.match(shell, /class="op-nav-link" href="#page-1"/);
  assert.match(shell, /\.op-outline-link\.is-active\s*\{/);
  assert.match(shell, /--op-bg-sidebar:\s*light-dark\(/);
  assert.doesNotMatch(shell, /Omitted group|Outline exclusion|Café/);
  const runtimeScript = /<script>\((function reader.*?)<\/script>/s.exec(html)[1];
  assert.doesNotThrow(() => new vm.Script('(' + runtimeScript));
  const bundle = JSON.parse(serializedBundle);
  assert.equal(bundle.pages.length, 2);
  assert.equal(bundle.assets.length, 10);
  const binaryAssets = bundle.assets.filter(value => typeof value === 'string');
  assert.deepEqual(binaryAssets, [
    'data:image/png;base64,' + Buffer.from('shared image').toString('base64'),
    'data:image/png;base64,' + Buffer.from('local image').toString('base64'),
    'data:font/woff2;base64,' + Buffer.from('font bytes').toString('base64')
  ]);
  assert.doesNotMatch(html, /cancelled|sourceScript|sourceHandler/);
  assert.deepEqual(Array.from(result.issues, issue => [issue.page, issue.code, issue.target]), [
    [selected[0], 'missing-resource', 'missing.png'],
    [selected[1], 'missing-resource', 'missing.png']
  ]);
  for (const [index, page] of bundle.pages.entries()) {
    const frame = runtime._exportReader.assemble(page.markup, bundle.assets);
    const [sharedImage, localImage, font] = binaryAssets;
    const image = index === 0 ? sharedImage : localImage;
    const sheets = [...frame.matchAll(/href="(data:text\/css[^"]+)"( media="print")?/g)];
    assert.equal(sheets.length, 6);
    assert.equal(decodeSheet(sheets[0][1]), sharedCSS.replace('font.woff2', `"${font}"`));
    assert.equal(decodeSheet(sheets[1][1]), overrideCSS.replace('image.png', `"${image}"`));
    assert.equal(decodeSheet(sheets[2][1]), css);
    assert.equal(sheets[2][2], ' media="print"');
    assert.match(decodeSheet(sheets[3][1]), /\.op-page \.op-pager-link/);
    const focusStyles = decodeSheet(sheets[4][1]);
    assert.match(focusStyles, /transition: filter 0\.35s ease, opacity 0\.35s ease/);
    assert.match(focusStyles, /filter: blur\(3px\);\s*opacity: 0\.45/);
    assert.match(decodeSheet(sheets[5][1]), /^\.op-export-pop/);
    const rel = index === 0 ? 'next' : 'prev';
    assert.ok(frame.includes('class="op-pager-link op-pager-' + rel + '" rel="' + rel +
      '" href="#page-' + (index === 0 ? '2' : '1') + '" data-export-destination=""'));
    assert.equal([...frame.matchAll(/class="op-pager-link /g)].length, 1);
    assert.ok(frame.includes(`src="${sharedImage}#view&amp;detail"`));
    assert.ok(frame.includes(`srcset="${image} 2x"`));
    assert.ok(frame.includes(`<image href="${image}#svg-view"`));
    assert.ok(frame.includes(`style="background:url(&quot;${image}&quot;); --marker:&quot;&lt;/script&gt; café&quot;"`));
    assert.ok(frame.includes('op-export-asset-0-ref &lt;/script&gt; café'));
    assert.match(frame, /<h1 id="repeat-2">Repeat<\/h1><h2 id="repeat">Repeat<\/h2>/);
    assert.match(frame, /<h3 data-op-no-outline="true">Outline exclusion<\/h3>/);
    assert.ok(frame.includes('href="' + (index === 0 ? '#page-2/caf%C3%A9%2Fmore' : '#page-1/repeat-2') + '"'));
    assert.equal(runtime._exportReader.assemble(page.markup, bundle.assets), frame);
  }
  assert.equal(await (await prepared.build(selected)).blob.text(), html);
  assert.match(shell, /id="export-page" data-initial="page-1"/);
  runtime._page = 'file:///work/project/nested/index.html';
  const fromNested = await runtime._exportPackage.prepare(files);
  assert.equal(fromNested.active, 'page-2');
  assert.match(await (await fromNested.build(selected)).blob.text(), /id="export-page" data-initial="page-1"/,
    'an export opens on its first page wherever it was started');
  runtime._page = 'file:///work/project/index.html';
  const one = await prepared.build([selected[0]]);
  const oneHTML = await one.blob.text();
  const oneBundle = JSON.parse(/<script id="export-bundle"[^>]*>(.*?)<\/script>/s.exec(oneHTML)[1]);
  assert.doesNotMatch(runtime._exportReader.assemble(oneBundle.pages[0].markup, oneBundle.assets), /class="op-pager"/);
  assert.equal(one.bytes, Buffer.byteLength(oneHTML));
  assert.ok(one.bytes < result.bytes);
  assert.equal(/<script>\((function reader.*?)<\/script>/s.exec(oneHTML)[1], runtimeScript);
  noPager = true;
  const optedOut = JSON.parse(/<script id="export-bundle"[^>]*>(.*?)<\/script>/s.exec(
    await (await prepared.build(selected)).blob.text())[1]);
  assert.equal(optedOut.pages[1].noPager, true);
  assert.doesNotMatch(runtime._exportReader.assemble(optedOut.pages[1].markup, optedOut.assets), /class="op-pager"/);
  noPager = false;
  t.diagnostic(`Reader fixture: ${one.bytes} bytes for one page, ${result.bytes} bytes for two ` +
    `(${result.bytes - one.bytes} additional bytes). Fixed shell JavaScript: ${Buffer.byteLength(runtimeScript)} bytes.`);
  const sizes = [];
  for (const count of [2, 8, 32]) {
    stepCount = count;
    const measured = await prepared.build(selected);
    sizes.push(measured.bytes);
    const measuredHTML = await measured.blob.text();
    assert.equal(measured.bytes, Buffer.byteLength(measuredHTML));
    const serialized = /<script id="export-bundle"[^>]*>(.*?)<\/script>/s.exec(measuredHTML)[1];
    const measuredBundle = JSON.parse(serialized);
    assert.equal(measuredBundle.assets.length, bundle.assets.length);
    for (const page of measuredBundle.pages) {
      const frame = runtime._exportReader.assemble(page.markup, measuredBundle.assets);
      assert.equal([...frame.matchAll(/<svg>/g)].length, 1);
      assert.equal([...frame.matchAll(/<path /g)].length, 1);
      assert.match(frame, /hidden="" data-op-reader-step-detail="0:1"><img src="data:image\/png;base64,/);
    }
  }
  const bytesPerStep = Math.round((sizes[2] - sizes[0]) / 60);
  assert.ok(bytesPerStep > 0 && bytesPerStep < 500, `${bytesPerStep} bytes per step`);
  t.diagnostic(`Two-page fixture at 2, 8 and 32 steps per page: ${sizes.join(', ')} bytes (${bytesPerStep} bytes per added step).`);

  stepCount = 0;
  const cancelInteractive = new AbortController();
  await assert.rejects(prepared.build(selected, { mode: 'interactive', signal: cancelInteractive.signal,
    onProgress(event) { if (event.phase === 'links') cancelInteractive.abort(); }
  }), { name: 'AbortError' });
  const interactive = await prepared.build(selected, { mode: 'interactive' });
  const interactiveHTML = await interactive.blob.text();
  const readBundle = html => JSON.parse(/<script id="export-bundle"[^>]*>(.*?)<\/script>/s.exec(html)[1]);
  const packed = readBundle(interactiveHTML);
  assert.equal(packed.version, 1);
  assert.equal(packed.mode, 'interactive');
  assert.deepEqual(Array.from(result.pages, page => page.view), ['live', 'saved']);
  assert.deepEqual(Array.from(interactive.pages, page => page.view), ['live', 'saved']);
  assert.deepEqual(packed.pages.map(page => runtime._exportReader.assemble(page.markup, packed.assets)),
    bundle.pages.map(page => runtime._exportReader.assemble(page.markup, bundle.assets)));
  assert.ok(packed.pages.every(page => page.interactive), JSON.stringify(interactive.issues));
  assert.equal(packed.shared.length, 7); // Manifest, four scripts, and two dataset revisions.
  assert.deepEqual(packed.pages[0].interactive.inlineData, packed.pages[1].interactive.inlineData);
  assert.equal(packed.shared[packed.pages[0].interactive.inlineData[0]], 'id,value\ninline-record,7');
  assert.equal(packed.pages[0].interactive.data[0][1], packed.pages[1].interactive.data[0][1]);
  assert.deepEqual(packed.pages.map(page => page.interactive.data.map(([name]) => name)), [['runs'], ['alias']]);
  assert.deepEqual(packed.pages[0].interactive.modules, packed.pages[1].interactive.modules);
  assert.equal(packed.pages[0].interactive.site, packed.pages[1].interactive.site);
  assert.equal(packed.pages[1].interactive.state.views[0][1].value, 'results');
  assert.equal(packed.pages[1].interactive.url, 'file:///work/project/nested/index.html');
  assert.deepEqual(packed.pages[0].interactive.styles, ['css/tabs.css']);
  assert.doesNotMatch(interactiveHTML, /doNotPackageThisAuthorScript|sourceScript|sourceHandler/);
  assert.doesNotThrow(() => new vm.Script('(' + /<script>\((function reader.*?)<\/script>/s.exec(interactiveHTML)[1]));
  const liveHTML = runtime._exportReader.assemble(packed.pages[0].interactive.markup, packed.assets);
  assert.match(liveHTML, /class="op-pager-link op-pager-next" rel="next" href="#page-2" data-export-destination=""/);
  assert.match(liveHTML, /data-op-chart="scatter" data-op-source="runs"><script type="application\/json">\{"x":"Run"/);
  assert.match(liveHTML, /class="op-pipe-link" href="#flow-2">Next block/);
  assert.ok(!interactive.issues.some(issue => issue.target === '#flow-2'));
  assert.match(liveHTML, /data-op-key="flow-2"><img src="data:image\/png;base64,ZGV0YWlsIGltYWdl"[^>]*>.*?#page-2\/caf%C3%A9%2Fmore[^>]*>Read the pipeline detail/);
  assert.match(liveHTML, /script-src 'nonce-op-export-nonce' 'unsafe-eval'/);
  assert.match(liveHTML, /href="#page-2\/caf%C3%A9%2Fmore"/);
  assert.match(liveHTML, /<section id="alternate-card"><figure><script data-op-animation="" type="application\/json">\{"steps":/);
  assert.match(liveHTML, /<template id="term-detail"><img src="data:image\/png;base64,ZGV0YWlsIGltYWdl"/);
  assert.match(liveHTML, /<a href="#page-2\/caf%C3%A9%2Fmore" data-export-destination="">Read the section<\/a><\/template>/);
  const interactiveOne = await prepared.build([selected[0]], { mode: 'interactive' });
  assert.equal(interactive.bytes, Buffer.byteLength(interactiveHTML));
  assert.deepEqual(readBundle(await interactiveOne.blob.text()).shared, packed.shared);
  const fallbackBytes = packed.pages.reduce((sum, page) =>
    sum + Buffer.byteLength(JSON.stringify(page.markup).replace(/</g, '\\u003c')), 0);
  const sharedBytes = Buffer.byteLength(JSON.stringify(packed.shared).replace(/</g, '\\u003c'));
  const interactiveScript = /<script>\((function reader.*?)<\/script>/s.exec(interactiveHTML)[1];
  t.diagnostic(`Interactive fixture: ${interactiveOne.bytes} bytes for one page, ${interactive.bytes} for two ` +
    `(${interactive.bytes - interactiveOne.bytes} additional bytes), including ${fallbackBytes} bytes of fallback markup. ` +
    `Fixed shell JavaScript: ${Buffer.byteLength(interactiveScript)} bytes. Identical shared payloads: ${sharedBytes} bytes.`);

  savedSibling = false;
  const authoredDefault = await prepared.build(selected, { mode: 'interactive' });
  assert.equal(authoredDefault.pages[1].view, 'default');
  assert.equal(readBundle(await authoredDefault.blob.text()).pages[1].interactive.state, null);
  savedSibling = true;

  const distinctText = authoredText.replace('authored record', 'distinct record');
  const distinctInput = files.map(input => input.webkitRelativePath === 'project/alias.js' ?
    asset('alias.js', wrapper('alias', 'alias.js').replace('authored record', 'distinct record')) : input);
  const distinctSite = await runtime._exportPackage.prepare(distinctInput);
  const distinct = await distinctSite.build(selected, { mode: 'interactive' });
  const distinctHTML = await distinct.blob.text();
  const distinctBundle = readBundle(distinctHTML);
  assert.equal(distinct.bytes, Buffer.byteLength(distinctHTML));
  assert.equal(distinctBundle.shared.length, packed.shared.length + 1);
  assert.equal(distinctBundle.shared[distinctBundle.pages[1].interactive.data[0][1]].text, distinctText);
  assert.equal(distinctBundle.shared[distinctBundle.pages[0].interactive.data[0][1]].text, authoredText);
  t.diagnostic(`Distinct authored dataset: ${distinct.bytes - interactive.bytes} additional HTML bytes.`);

  const scriptChoices = interactive.scriptChoices.filter(choice => choice.available);
  assert.equal(scriptChoices.length, 2);
  assert.ok(interactive.issues.some(issue => issue.code === 'author-script' && issue.message.includes('missing.js')));
  assert.ok(scriptChoices.every(choice => !choice.selected));
  assert.doesNotMatch(interactiveHTML, /author-only resource/);
  const scriptIDs = scriptChoices.map(choice => choice.id);
  const scriptExport = await prepared.build(selected, { mode: 'interactive', includeScripts: scriptIDs });
  const scriptHTML = await scriptExport.blob.text();
  const savedScripts = readBundle(scriptHTML);
  assert.match(scriptHTML, /script-src 'unsafe-inline' 'unsafe-eval' blob:; frame-src 'none'/);
  assert.doesNotThrow(() => new vm.Script('(' + /<script>\((function reader.*?)<\/script>/s.exec(scriptHTML)[1]));
  assert.equal(savedScripts.shared.filter(value => value === authorCode).length, 1);
  assert.equal(savedScripts.shared.filter(value => value === 'author-only resource').length, 1);
  assert.ok(savedScripts.pages.every(page => page.interactive.author.after.length === 1));
  assert.equal(scriptExport.scriptChoices.filter(choice => choice.included).length, 2);
  const oneScript = await prepared.build(selected, { mode: 'interactive', includeScripts: scriptIDs.slice(0, 1) });
  const oneScriptHTML = await oneScript.blob.text();
  assert.equal(oneScript.bytes, Buffer.byteLength(oneScriptHTML));
  assert.equal(scriptExport.bytes, Buffer.byteLength(scriptHTML));
  assert.deepEqual(readBundle(oneScriptHTML).shared, savedScripts.shared);
  assert.equal(await (await prepared.build(selected, { mode: 'interactive', includeScripts: [] })).blob.text(), interactiveHTML);
  t.diagnostic(`Author scripts: ${oneScript.bytes - interactive.bytes} additional HTML bytes for first opt-in, ` +
    `${scriptExport.bytes - oneScript.bytes} for a second page sharing its files.`);
  authorCode += ';';
  const changedScriptExport = await prepared.build(selected, { mode: 'interactive', includeScripts: scriptIDs });
  assert.ok(changedScriptExport.scriptChoices.every(choice => !choice.selected));
  assert.equal(await changedScriptExport.blob.text(), interactiveHTML);

  committedImport = true;
  const fallback = await prepared.build(selected, { mode: 'interactive' });
  const fallbackHTML = await fallback.blob.text();
  assert.equal(readBundle(fallbackHTML).pages[1].interactive, null);
  assert.doesNotMatch(fallbackHTML, /private\.csv/);
  assert.doesNotMatch(fallbackHTML, /private full record/);
  assert.match(fallbackHTML, /Rendered chart data from import/);
  assert.ok(fallback.issues.some(issue => issue.page === selected[1] && issue.code === 'interactive-fallback'));
  const [choice] = fallback.importChoices;
  assert.equal(choice.selected, false);
  assert.equal(choice.available, true);
  assert.equal(choice.bytes, Buffer.byteLength(importText));
  assert.deepEqual(Array.from(choice.consumers), ['#runs-figure']);
  const accepted = await prepared.build(selected, { mode: 'interactive', includeImports: [choice.id] });
  const acceptedHTML = await accepted.blob.text();
  const acceptedBundle = readBundle(acceptedHTML);
  assert.equal(accepted.importChoices[0].included, true);
  assert.equal(acceptedBundle.shared[acceptedBundle.pages[1].interactive.imports[0][1]], importText);
  assert.equal(accepted.bytes, Buffer.byteLength(acceptedHTML));
  assert.equal(fallback.bytes, Buffer.byteLength(fallbackHTML));
  assert.ok(accepted.bytes > fallback.bytes);
  const revoked = await prepared.build(selected, { mode: 'interactive', includeImports: [] });
  assert.equal(await revoked.blob.text(), fallbackHTML);
  revision++;
  const changed = await prepared.build(selected, { mode: 'interactive', includeImports: [choice.id] });
  assert.equal(changed.importChoices[0].selected, false);
  assert.equal(await changed.blob.text(), fallbackHTML);
  staleImport = true;
  const stale = await prepared.build(selected, { mode: 'interactive', includeImports: [changed.importChoices[0].id] });
  assert.equal(stale.importChoices[0].available, false);
  assert.doesNotMatch(await stale.blob.text(), /private full record/);
  t.diagnostic(`Consent preview: ${choice.bytes} import bytes, ${fallback.bytes} export bytes without inclusion, ${accepted.bytes} with inclusion.`);
});
