(function (root) {
  'use strict';

  var OffPrint = root.OffPrint;
  if (!OffPrint) {
    if (typeof console !== 'undefined') console.warn('[offprint] roles.js needs core.js loaded before it.');
    return;
  }

  // Role names are already restricted by core to [a-z0-9_-], so they are safe in selectors and property names.
  function roleCss(roles) {
    var names = Object.keys(roles);
    if (!names.length) return '';
    var vars = names.map(function (name) {
      var c = roles[name];
      return '--op-role-' + name + ':var(--op-' + c + ');--op-role-' + name + '-bg:var(--op-' + c + '-bg);';
    }).join('');
    var rules = names.map(function (name) {
      return '[data-op-role][data-op-role="' + name + '" i]{--op-accent:var(--op-role-' + name +
        ');--op-accent-bg:var(--op-role-' + name + '-bg);}';
    }).join('\n');
    return ':root{' + vars + '}\n' + rules + '\n';
  }

  function roleLabel(name) {
    return name.replace(/[-_]+/g, ' ').trim();
  }

  // A legend entry's hover text: the role's manifest tip, or null so tooltips fall back and warn.
  function roleTip(name, site) {
    var tips = (site || OffPrint._site || {}).roleTips || {};
    var key = String(name).trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(tips, key) ? tips[key] : null;
  }

  function renderLegend(el, roles, site) {
    var names = Object.keys(roles);
    el.classList.add('op-legend');
    if (!names.length) {
      OffPrint._warnOnce('legend:empty', 'A data-op-legend element was found but the manifest defines no roles.');
      return;
    }
    el.textContent = '';
    var list = document.createElement('ul');
    list.className = 'op-legend-list';
    list.setAttribute('aria-label', 'Colour roles');
    names.forEach(function (name) {
      var item = document.createElement('li');
      var swatch = document.createElement('span');
      item.className = 'op-legend-item';
      item.setAttribute('data-op-role', name);
      var tip = roleTip(name, site);
      // Tooltips show the role tip as an OffPrint hover card; without them, the native title stands in.
      if (OffPrint._tooltips) {
        if (tip) item.setAttribute('data-op-tip', tip);
      } else item.title = tip || roleLabel(name);
      swatch.className = 'op-legend-swatch';
      swatch.setAttribute('aria-hidden', 'true');
      item.appendChild(swatch);
      item.appendChild(document.createTextNode(roleLabel(name)));
      list.appendChild(item);
    });
    el.appendChild(list);
  }

  function checkMarkup(site) {
    OffPrint._all('[data-op-color]').forEach(function (el) {
      OffPrint._color(el.getAttribute('data-op-color'));
    });
    OffPrint._all('[data-op-role]').forEach(function (el) {
      if (el.hasAttribute('data-op-color')) return;
      OffPrint._roleColor(el.getAttribute('data-op-role'), site);
    });
  }

  OffPrint._roles = {
    color: function (name, colors) {
      var map = colors === undefined ? (OffPrint._site || {}).roles : OffPrint._normalizeRoles(colors);
      var key = String(name).trim().toLowerCase();
      return map && Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
    },
    css: function (colors) { return roleCss(OffPrint._normalizeRoles(colors)); },
    tip: roleTip,
    label: roleLabel
  };

  OffPrint.register('roles', function (site) {
    var css = roleCss(site.roles);
    if (css) {
      var style = document.createElement('style');
      style.id = 'op-roles';
      style.textContent = css;
      document.head.appendChild(style);
    }
    OffPrint._all('[data-op-legend]').forEach(function (el) {
      if (!OffPrint._boot || OffPrint._component.flag(el, 'legend', 'roles')) renderLegend(el, site.roles, site);
    });
    checkMarkup(site);
  });
})(typeof window !== 'undefined' ? window : globalThis);
