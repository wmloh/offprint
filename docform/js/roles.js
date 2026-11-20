(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm) {
    if (typeof console !== 'undefined') console.warn('[docform] roles.js needs core.js loaded before it.');
    return;
  }

  // Role names are already restricted by core to [a-z0-9_-], so they are safe in selectors and property names.
  function roleCss(roles) {
    var names = Object.keys(roles);
    if (!names.length) return '';
    var vars = names.map(function (name) {
      var c = roles[name];
      return '--df-role-' + name + ':var(--df-' + c + ');--df-role-' + name + '-bg:var(--df-' + c + '-bg);';
    }).join('');
    var rules = names.map(function (name) {
      return '[data-df-role][data-df-role="' + name + '" i]{--df-accent:var(--df-role-' + name +
        ');--df-accent-bg:var(--df-role-' + name + '-bg);}';
    }).join('\n');
    return ':root{' + vars + '}\n' + rules + '\n';
  }

  function roleLabel(name) {
    return name.replace(/[-_]+/g, ' ').trim();
  }

  // A legend entry's hover text: the role's manifest tip, or null so tooltips fall back and warn.
  function roleTip(name, site) {
    var tips = (site || DocForm.site || {}).roleTips || {};
    var key = String(name).trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(tips, key) ? tips[key] : null;
  }

  function renderLegend(el, roles, site) {
    var names = Object.keys(roles);
    el.classList.add('df-legend');
    if (!names.length) {
      DocForm.warnOnce('legend:empty', 'A data-df-legend element was found but the manifest defines no roles.');
      return;
    }
    el.textContent = '';
    var list = document.createElement('ul');
    list.className = 'df-legend-list';
    list.setAttribute('aria-label', 'Colour roles');
    names.forEach(function (name) {
      var item = document.createElement('li');
      var swatch = document.createElement('span');
      item.className = 'df-legend-item';
      item.setAttribute('data-df-role', name);
      var tip = roleTip(name, site);
      // Tooltips show the role tip as a DocForm hover card; without them, the native title stands in.
      if (DocForm.tooltips) {
        if (tip) item.setAttribute('data-df-tip', tip);
      } else item.title = tip || roleLabel(name);
      swatch.className = 'df-legend-swatch';
      swatch.setAttribute('aria-hidden', 'true');
      item.appendChild(swatch);
      item.appendChild(document.createTextNode(roleLabel(name)));
      list.appendChild(item);
    });
    el.appendChild(list);
  }

  function checkMarkup(site) {
    DocForm.all('[data-df-color]').forEach(function (el) {
      DocForm.color(el.getAttribute('data-df-color'));
    });
    DocForm.all('[data-df-role]').forEach(function (el) {
      if (el.hasAttribute('data-df-color')) return;
      DocForm.roleColor(el.getAttribute('data-df-role'), site);
    });
  }

  DocForm.roleCss = roleCss;
  DocForm.roles = {
    color: function (name, colors) {
      var map = colors === undefined ? (DocForm.site || {}).roles : DocForm._normalizeRoles(colors);
      var key = String(name).trim().toLowerCase();
      return map && Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
    },
    css: function (colors) { return roleCss(DocForm._normalizeRoles(colors)); },
    tip: roleTip,
    label: roleLabel
  };

  DocForm.register('roles', function (site) {
    var css = roleCss(site.roles);
    if (css) {
      var style = document.createElement('style');
      style.id = 'df-roles';
      style.textContent = css;
      document.head.appendChild(style);
    }
    DocForm.all('[data-df-legend]').forEach(function (el) {
      if (!DocForm._boot || DocForm._component.flag(el, 'legend', 'roles')) renderLegend(el, site.roles, site);
    });
    checkMarkup(site);
  });
})(typeof window !== 'undefined' ? window : globalThis);
