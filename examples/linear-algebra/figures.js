// Example-only helpers for drawing coordinate planes and arrows in inline SVG figures.
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  function el(parent, tag, attrs) {
    var node = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(node);
    return node;
  }

  // A y-up plane with its origin at pixel (ox, oy) and `unit` pixels per step; draws grid and axes first in the svg.
  function plane(svg, ox, oy, unit) {
    var box = svg.viewBox.baseVal;
    var g = el(null, 'g', { 'aria-hidden': 'true' });
    svg.insertBefore(g, svg.firstChild);
    var x0 = Math.ceil((box.x - ox) / unit);
    var x1 = Math.floor((box.x + box.width - ox) / unit);
    var y0 = Math.ceil((oy - box.y - box.height) / unit);
    var y1 = Math.floor((oy - box.y) / unit);
    for (var i = x0; i <= x1; i++) {
      el(g, 'line', { class: i ? 'df-grid' : 'df-axis', x1: ox + i * unit, x2: ox + i * unit, y1: box.y, y2: box.y + box.height });
    }
    for (var j = y0; j <= y1; j++) {
      el(g, 'line', { class: j ? 'df-grid' : 'df-axis', y1: oy - j * unit, y2: oy - j * unit, x1: box.x, x2: box.x + box.width });
    }
    return {
      pt: function (v) { return [ox + v[0] * unit, oy - v[1] * unit]; },
      ox: ox,
      oy: oy,
      unit: unit
    };
  }

  // Path data for an arrow from p to q (pixels) with an open chevron head.
  function arrow(p, q, size) {
    size = size || 10;
    var dx = q[0] - p[0];
    var dy = q[1] - p[1];
    var len = Math.hypot(dx, dy);
    if (len < 1e-6) return 'M' + p[0] + ' ' + p[1];
    var h = Math.min(size, len * 0.45);
    var ux = dx / len;
    var uy = dy / len;
    var bx = q[0] - ux * h;
    var by = q[1] - uy * h;
    var w = h * 0.55;
    var r = function (n) { return Math.round(n * 100) / 100; };
    return 'M' + r(p[0]) + ' ' + r(p[1]) + ' L' + r(q[0]) + ' ' + r(q[1]) +
      ' M' + r(bx - uy * w) + ' ' + r(by + ux * w) + ' L' + r(q[0]) + ' ' + r(q[1]) + ' L' + r(bx + uy * w) + ' ' + r(by - ux * w);
  }

  // SVG transform that applies the 2x2 matrix [[a, b], [c, d]] to a y-up plane drawn with plane().
  function matrix(m, P) {
    var a = m[0], b = m[1], c = m[2], d = m[3];
    var r = function (n) { return Math.round(n * 1000) / 1000; };
    return 'matrix(' + [a, -c, -b, d, P.ox - a * P.ox + b * P.oy, P.oy + c * P.ox - d * P.oy].map(r).join(' ') + ')';
  }

  window.LA = { el: el, plane: plane, arrow: arrow, matrix: matrix };
})();
