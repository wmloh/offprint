const fs = require('node:fs');
const vm = require('node:vm');

function load(sourceDocs = new Map(), createExportDocument, DOMParser) {
  const document = {
    implementation: {
      createHTMLDocument(title) {
        if (title && createExportDocument) return createExportDocument(title);
        return {
          documentElement: {},
          get title() { return sourceDocs.get(this.documentElement.innerHTML)?.title || ''; },
          querySelectorAll(selector) {
            return DOMParser ? new DOMParser().parseFromString(this.documentElement.innerHTML).querySelectorAll(selector) : [];
          },
          querySelector(selector) {
            const source = sourceDocs.get(this.documentElement.innerHTML);
            return selector === 'script[data-op-site]' && source?.manifest ?
              { getAttribute: () => source.manifest } : null;
          }
        };
      }
    }
  };
  const context = vm.createContext({ URL, TextEncoder, atob, btoa, Blob, document, DOMParser, crypto });
  context.window = context;
  function loadScript(path) {
    vm.runInContext(fs.readFileSync(new URL('../../offprint/' + path, 'file://' + __filename), 'utf8'),
      context, { filename: path });
  }
  context.OffPrint = {
    _boot: { entryURL: 'file:///opt/shared/OffPrint%20library/offprint.js', loadExport: loadScript },
    _pageSnapshot: { capture() { throw new Error('Unexpected page capture.'); } }
  };
  for (const path of ['js/core.js', 'tools/asset-build.js', 'js/export-resources.js',
    'js/export-reader.js', 'js/export-package.js']) {
    loadScript(path);
  }
  return context.OffPrint;
}

function file(path, text) {
  return { webkitRelativePath: path, text: async () => text };
}

module.exports = { load, file };
