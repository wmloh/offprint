(function (root) {
  'use strict';

  var mime = {
    avif: 'image/avif', bmp: 'image/bmp', gif: 'image/gif', ico: 'image/x-icon',
    jpeg: 'image/jpeg', jpg: 'image/jpeg', png: 'image/png', svg: 'image/svg+xml',
    webp: 'image/webp', apng: 'image/apng',
    otf: 'font/otf', ttf: 'font/ttf', woff: 'font/woff', woff2: 'font/woff2'
  };
  var cssString = /"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/;
  var cssURL = /url\(\s*(?:"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|(?:\\[\s\S]|[^)\\])*)\)/i;
  var cssTokens = new RegExp('/\\*[\\s\\S]*?\\*/|@import\\b(?:\\s|/\\*[\\s\\S]*?\\*/)*(?:' +
    cssString.source + '|' + cssURL.source + ')|' + cssString.source +
    '|' + cssURL.source + '|[\\w-]+\\(|[()]|[\\w-]+', 'gi');

  function unquote(value) {
    value = value.trim();
    if (value[0] === '"' || value[0] === "'") value = value.slice(1, -1);
    return value.replace(/\\([\da-f]{1,6})(?:\r\n|[\t\n\r\f ])?|\\(\r\n|[\n\r\f])|\\([\s\S])/gi,
      function (_, hex, newline, escaped) {
        if (!hex) return newline ? '' : escaped;
        var point = parseInt(hex, 16);
        return String.fromCodePoint(point && point <= 0x10ffff && (point < 0xd800 || point > 0xdfff) ? point : 0xfffd);
      });
  }

  function binaryString(bytes) {
    var chunks = [];
    for (var offset = 0; offset < bytes.length; offset += 8192) {
      chunks.push(String.fromCharCode.apply(null, bytes.subarray(offset, offset + 8192)));
    }
    return chunks.join('');
  }

  function imageOrFontDataURL(value) {
    var comma = value.indexOf(',');
    if (comma < 0) return value;
    var type = value.slice(5, comma);
    var base64 = /;base64$/i.test(type);
    if (base64) type = type.slice(0, -7);
    type = type.replace(/^[^;]+/, function (mime) { return mime.toLowerCase(); });
    var payload = value.slice(comma + 1).replace(/%([\da-f]{2})|[^\x00-\x7f]+/gi, function (match, hex) {
      return hex ? String.fromCharCode(parseInt(hex, 16)) : binaryString(new TextEncoder().encode(match));
    });
    try { return 'data:' + type + ';base64,' + root.btoa(base64 ? root.atob(payload) : payload); }
    catch (error) { return value; }
  }

  function candidates(value) {
    var out = [];
    var rest = value.trim();
    while (rest) {
      rest = rest.replace(/^[\s,]+/, '');
      var match = /^(\S+)([\s\S]*)$/.exec(rest);
      if (!match) break;
      var url = match[1];
      rest = match[2];
      if (url.endsWith(',')) {
        out.push([url.replace(/,+$/, ''), '']);
        continue;
      }
      var comma = rest.indexOf(',');
      out.push([url, (comma < 0 ? rest : rest.slice(0, comma)).trim()]);
      rest = comma < 0 ? '' : rest.slice(comma + 1);
    }
    return out;
  }

  function setup(folder, signal) {
    var embedded = new Map();
    var sheets = new Map();
    var assetIDs = new Map();
    var assets = [];

    function store(payload, suffix) {
      var key = typeof payload === 'string' ? payload : JSON.stringify(payload);
      if (!assetIDs.has(key)) {
        assetIDs.set(key, assets.length);
        assets.push(payload);
      }
      return [assetIDs.get(key), suffix || ''];
    }

    function resolve(value, base, report) {
      try { return new URL(value, base); }
      catch (error) { report('invalid-resource', value, 'The resource URL is invalid.'); }
    }

    async function resource(value, base, report, kind) {
      if (value.startsWith('#')) return value;
      var url = resolve(value, base, report);
      if (!url) return null;
      if (/^data:(?:image\/|font\/|application\/(?:font-|vnd\.ms-fontobject))/i.test(url.href) &&
          (kind !== 'image' || /^data:image\//i.test(url.href))) {
        var data = url.href.split('#', 1)[0];
        return [store(imageOrFontDataURL(data), url.href.slice(data.length))];
      }
      var type = mime[/\.([^.\/]+)$/.exec(url.pathname.toLowerCase())?.[1]];
      if (url.protocol !== 'file:') {
        report('unsupported-resource', value, 'Only local images and fonts can be embedded.');
      } else if (!type || kind === 'image' && !type.startsWith('image/')) {
        report('unsupported-resource', value, 'This resource format is unavailable in the export.');
      } else {
        var file = folder.file(url);
        if (file) {
          try {
            if (!embedded.has(file)) {
              var bytes = new Uint8Array(await file.arrayBuffer());
              signal?.throwIfAborted();
              embedded.set(file, 'data:' + type + ';base64,' + root.btoa(binaryString(bytes)));
            }
            signal?.throwIfAborted();
            return [store(embedded.get(file), url.hash)];
          } catch (error) {
            signal?.throwIfAborted();
            report('unreadable-resource', value, 'The resource could not be read.');
            return null;
          }
        }
        report('missing-resource', value, 'The resource was not found in the selected folders.');
      }
      return null;
    }

    async function stylesheet(value, base, report, parents) {
      var url = resolve(value, base, report);
      if (!url) return null;
      if (url.protocol !== 'file:') {
        report('unsupported-stylesheet', value, 'Only local stylesheets can be embedded.');
        return null;
      }
      var file = folder.file(url);
      if (!file) {
        report('missing-stylesheet', value, 'The stylesheet was not found in the selected folders.');
        return null;
      }
      if (parents.has(file)) {
        report('stylesheet-cycle', value, 'A circular stylesheet import was skipped.');
        return null;
      }
      var text;
      try {
        if (!sheets.has(file)) sheets.set(file, file.text());
        text = await sheets.get(file);
      } catch (error) {
        report('unreadable-stylesheet', value, 'The stylesheet could not be read.');
        return null;
      }
      signal?.throwIfAborted();
      return [store(await css(text, url.href, report, new Set([...parents, file])))];
    }

    async function css(text, base, report, parents, ids) {
      var parts = [];
      var literal = '';
      var end = 0;
      var functions = [];
      for (var match of text.matchAll(cssTokens)) {
        signal?.throwIfAborted();
        var token = match[0];
        var replacement = null;
        if (/^@import\b/i.test(token)) {
          var address = new RegExp(cssString.source + '|' + cssURL.source, 'i')
            .exec(token.replace(/^@import\b(?:\s|\/\*[\s\S]*?\*\/)*/i, ''))[0];
          var imported = await stylesheet(unquote(address.replace(/^url\(([\s\S]*)\)$/i, '$1')),
            base, report, parents);
          replacement = ['@import url(', ...(imported || ['"data:text/css,"']), ')'];
        } else if (/^url\(/i.test(token)) {
          var value = unquote(token.slice(4, -1));
          var embeddedURL;
          if (ids && value.startsWith('#')) {
            var id = ids.get(value.slice(1));
            embeddedURL = id ? '#' + id : null;
          } else embeddedURL = await resource(value, base, report);
          replacement = ['url(', ...cssURLParts(embeddedURL), ')'];
        } else if (/^["']/.test(token) && /^(?:-webkit-)?image-set\($/i.test(functions.at(-1))) {
          replacement = cssURLParts(await resource(unquote(token), base, report, 'image'));
        } else if (token.endsWith('(')) functions.push(token);
        else if (token === ')') functions.pop();
        if (!replacement) continue;
        literal += text.slice(end, match.index);
        for (var part of replacement) {
          if (typeof part === 'string') literal += part;
          else {
            parts.push(literal, part);
            literal = '';
          }
        }
        end = match.index + token.length;
      }
      parts.push(literal + text.slice(end));
      return parts;
    }

    async function srcset(value, base, report) {
      var result = [];
      for (var [url, descriptor] of candidates(value)) {
        var address = await resource(url, base, report, 'image');
        if (!address) continue;
        if (result.length) result.push(', ');
        if (typeof address === 'string') result.push(address);
        else result.push(...address);
        if (descriptor) result.push(' ' + descriptor);
      }
      return result.length ? result : null;
    }

    return { assets: assets, resource: resource, srcset: srcset,
      css: function (value, base, report, ids) { return css(value, base, report, new Set(), ids); },
      inlineStylesheet: async function (value, base, report) {
        return [store(await css(value, base, report, new Set()))];
      },
      stylesheet: function (value, base, report) { return stylesheet(value, base, report, new Set()); }
    };
  }

  function cssURLParts(value) {
    if (Array.isArray(value)) return value;
    return ['"' + (value || 'data:,').replace(/["\\\n\r\f]/g, function (character) {
      return '\\' + character.codePointAt(0).toString(16) + ' ';
    }) + '"'];
  }

  root.DocForm._exportResources = { setup: setup };
})(window);
