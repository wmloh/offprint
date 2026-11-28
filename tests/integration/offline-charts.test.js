const test = require('node:test');
const assert = require('node:assert/strict');
const { descendants, page } = require('../support/offline-page');

test('Sankey charts mount named sources and preserve the fallback when flows contain a cycle', async () => {
  const config = { profile: 'none', features: { 'chart-sankey': true, data: true },
    options: { chart: { instances: { routes: { mapping: { source: 'From', target: 'To', value: 'Items' } } } } } };
  const warnings = [];
  const p = page({ config, globals: { console: { warn: message => warnings.push(message) } } });
  const source = p.body.appendChild(p.document.createElement('script'));
  source.setAttribute('data-op-source', 'Routes');
  source.setAttribute('type', 'text/csv');
  source.textContent = 'From,To,Items\nCollection,Sorting,80\nSorting,Reuse,25\nSorting,Recycling,55';
  function mount(id, spec, from) {
    const host = p.body.appendChild(p.document.createElement('div'));
    host.id = id;
    host.setAttribute('data-op-chart', 'sankey');
    if (from) host.setAttribute('data-op-source', from);
    const definition = host.appendChild(p.document.createElement('script'));
    definition.textContent = JSON.stringify(spec);
    const fallback = host.appendChild(p.document.createElement('table'));
    host.querySelector = selector => selector === ':scope > script[type="application/json"]' ? definition :
      selector === ':scope > table' ? fallback : null;
    return { host, fallback };
  }
  const routes = mount('routes', { linkColor: 'target' }, 'Routes');
  const invalid = mount('invalid-flow', { links: [
    { source: 'A', target: 'B', value: 1 }, { source: 'B', target: 'A', value: 1 }
  ] });
  p.body.querySelectorAll = selector => ({
    'script[data-op-source], pre[data-op-source]': [source], '[data-op-chart]': [routes.host, invalid.host]
  })[selector] || [];
  await p.start();
  const chart = p.OP._chart.get(routes.host);
  assert.ok(chart);
  assert.equal(chart.model().sankey.nodes[1].value, 80);
  const find = cls => descendants(routes.host).find(node => node.className === cls || node.getAttribute('class') === cls);
  const svg = descendants(routes.host).find(node => node.localName === 'svg');
  svg.getBoundingClientRect = () => ({ width: 400, left: 0, top: 0 });
  const ribbon = find('op-sankey-ribbon');
  assert.equal(ribbon.style.getPropertyValue('--op-series'), 'var(--op-chart-2)');
  const plot = find('op-chart-plot');
  plot.closest = selector => selector === '[data-op-sankey-index]' ? ribbon : null;
  plot.dispatchEvent(Object.assign(new Event('pointermove'), { clientX: 100, clientY: 100 }));
  assert.match(find('op-chart-tip').textContent, /Collection → Sorting80Items/);
  assert.equal(p.OP._chart.get(invalid.host), null);
  assert.equal(invalid.fallback.parentNode, invalid.host);
  assert.equal(invalid.host.classList.contains('op-chart'), false);
  assert.ok(warnings.some(message => /Sankey cycle: "A" → "B" → "A"/.test(message)));
});

test('Venn diagrams mount named counts and hatch empty regions in an impossible layout', async () => {
  const config = { profile: 'none', features: { 'chart-venn': true, data: true },
    options: { chart: { instances: { overlap: { mapping: { sets: 'Groups', count: 'Count' } } } } } };
  const warnings = [];
  const p = page({ config, globals: { console: { warn: message => warnings.push(message) } } });
  const source = p.body.appendChild(p.document.createElement('script'));
  source.setAttribute('data-op-source', 'Survey');
  source.setAttribute('type', 'text/csv');
  source.textContent = 'Groups,Count\nA,20\nB,12\nA|B|C,7';
  const host = p.body.appendChild(p.document.createElement('div'));
  host.id = 'overlap';
  host.setAttribute('data-op-source', 'Survey');
  host.setAttribute('data-op-chart', 'venn');
  const definition = host.appendChild(p.document.createElement('script'));
  definition.textContent = JSON.stringify({ sets: ['A', 'B', 'C'].map(key => ({ key })) });
  host.querySelector = selector => selector === ':scope > script[type="application/json"]' ? definition : null;
  p.body.querySelectorAll = selector => ({
    'script[data-op-source], pre[data-op-source]': [source], '[data-op-chart]': [host]
  })[selector] || [];
  await p.start();
  assert.equal(p.OP._chart.get(host).model().venn.layout.fallback, true);
  const nodes = descendants(host);
  const pattern = nodes.find(node => node.localName === 'pattern');
  const hatched = nodes.filter(node => node.getAttribute('fill') === 'url(#' + pattern.id + ')');
  assert.equal(hatched.length, 4);
  const labels = nodes.filter(node => node.getAttribute('class') === 'op-venn-count');
  assert.deepEqual(labels.map(label => label.textContent), ['20', '12', '0', '0', '0', '0', '7']);
  assert.ok(warnings.some(message => /Hatching marks empty regions/.test(message)));
});
