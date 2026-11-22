// Lazy reader controls for building and reviewing a standalone export.
(function (root) {
  'use strict';

  var DF = root.DocForm;
  var document = root.document;
  var dialog;
  var sizes = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
  var exact = new Intl.NumberFormat();

  function make(tag, text) {
    var node = document.createElement(tag);
    if (text != null) node.textContent = text;
    return node;
  }

  function button(label) {
    var node = make('button', label);
    node.type = 'button';
    node.className = 'df-button';
    return node;
  }

  function count(total, noun) {
    return total + ' ' + noun + (total === 1 ? '' : 's');
  }

  function formatSize(bytes) {
    if (bytes >= 1024 * 1024) return sizes.format(bytes / (1024 * 1024)) + ' MiB';
    if (bytes >= 1024) return sizes.format(bytes / 1024) + ' KiB';
    return count(bytes, 'byte');
  }

  function pagePicker(tree, active, onChange) {
    var groups = [];

    function render(nodes) {
      var list = make('ul');
      var leaves = [];
      for (var node of nodes) {
        if (!node.children.length && !node.available) continue;
        var branch = node.children.length ? render(node.children) : null;
        if (branch && !branch.leaves.length) continue;
        var item = make('li');
        var label = make('label');
        var check = make('input');
        check.type = 'checkbox';
        label.append(check, make('span', node.title));
        item.append(label);
        if (branch) {
          label.append(make('small', count(branch.leaves.length, 'page')));
          let group = { check: check, leaves: branch.leaves };
          groups.push(group);
          item.append(branch.list);
          check.addEventListener('change', function () {
            group.leaves.forEach(function (leaf) { leaf.check.checked = group.check.checked; });
            sync();
          });
          leaves.push(...branch.leaves);
        } else {
          check.checked = node.id === active;
          leaves.push({ check: check, id: node.id });
          check.addEventListener('change', sync);
        }
        list.append(item);
      }
      return { list: list, leaves: leaves };
    }

    var picker = render(tree);
    picker.ids = function () {
      return picker.leaves.filter(function (leaf) { return leaf.check.checked; })
        .map(function (leaf) { return leaf.id; });
    };
    function sync() {
      for (var group of groups) {
        var checked = group.leaves.filter(function (leaf) { return leaf.check.checked; }).length;
        group.check.checked = checked === group.leaves.length;
        group.check.indeterminate = checked > 0 && !group.check.checked;
      }
      onChange();
    }
    picker.sync = sync;
    return picker;
  }

  function addIssues(parent, label, issues) {
    if (!issues.length) return;
    var details = make('details');
    var list = make('ul');
    for (var issue of issues) {
      var item = make('li', issue.title + ' — ' + issue.message);
      if (issue.target) item.append(' ', make('code', issue.target));
      list.append(item);
    }
    details.append(make('summary', label), list);
    parent.append(details);
  }

  function viewLabel(view) {
    if (view === 'live') return 'Current view';
    if (view === 'saved') return 'Saved view';
    if (view === 'oversized') return 'Default or partial saved view · Saved data exceeds the storage limit';
    if (view === 'stale') return 'Default view · Saved view is out of date';
    if (view === 'unavailable') return 'Default view · Saved storage is unavailable';
    return 'Default view';
  }

  function showPreview(panel, result) {
    var pages = make('ul');
    for (var page of result.pages) {
      var item = make('li');
      item.append(make('strong', page.title), make('span', ' — ' + viewLabel(page.view)));
      if (page.interactive === false) item.append(make('span', ' · Reader fallback'));
      if (page.imports.length) {
        var imports = make('ul');
        for (var entry of page.imports) {
          imports.append(make('li', (entry.name || 'Unnamed import') + ' → ' + entry.target));
        }
        item.append(make('div', 'Includes rendered data from these imports'), imports);
      }
      pages.append(item);
    }
    var size = count(result.pages.length, 'page') + ' · ' + formatSize(result.bytes);
    if (result.bytes >= 1024) size += ' (' + exact.format(result.bytes) + ' bytes)';
    panel.append(make('p', size), pages);
    var links = result.issues.filter(function (issue) { return issue.code === 'unavailable-link'; });
    var gaps = result.issues.filter(function (issue) { return issue.code !== 'unavailable-link'; });
    addIssues(panel, count(links.length, 'disabled link'), links);
    addIssues(panel, count(gaps.length, 'content or resource issue'), gaps);
  }

  function folderRow(label, hint) {
    var row = make('div');
    row.className = 'df-export-source';
    var input = make('input');
    input.type = 'file';
    input.setAttribute('webkitdirectory', '');
    input.hidden = true;
    var name = make('span');
    name.className = 'df-export-folder';
    var help = make('small', hint);
    var choose = button(label);
    row.append(choose, input, name, help);
    choose.addEventListener('click', function () { input.click(); });
    return { row: row, button: choose, input: input, name: name, files: null,
      set: function (files) {
        this.files = files?.length ? files : null;
        name.textContent = this.files ? files[0].webkitRelativePath.split('/')[0] : '';
        help.hidden = !!this.files;
      } };
  }

  function open(opener) {
    if (dialog?.open) return;
    var modal = dialog = make('dialog');
    modal.className = 'df-export-dialog';
    modal.setAttribute('data-df-export-control', '');
    modal.setAttribute('aria-label', 'Export document');
    var header = make('header');
    var close = button('Close');
    header.append(make('h2', 'Export document'), close);

    var content = make('div');
    content.className = 'df-export-content';
    var intro = make('p', 'Chrome may ask to upload the folder’s files. DocForm reads them on this computer.');
    var documents = folderRow('Choose documentation folder', 'The folder with the site’s pages, manifest and assets');
    var modes = make('fieldset');
    modes.append(make('legend', 'Export mode'));
    var mode = 'reader';
    for (let [value, description] of [
      ['reader', 'Reader · Readable pages with discrete figure steps'],
      ['interactive', 'Interactive · Supported DocForm controls and figures']
    ]) {
      var label = make('label');
      var choice = make('input');
      choice.type = 'radio';
      choice.name = 'df-export-mode';
      choice.value = value;
      choice.checked = value === mode;
      choice.addEventListener('change', function () {
        mode = value;
        if (!preview.hidden) {
          clearPreview();
          status.textContent = 'Export mode changed. Build a new preview.';
          update();
        }
      });
      label.append(choice, make('span', description));
      modes.append(label);
    }
    var fieldset = make('fieldset');
    fieldset.hidden = true;
    fieldset.append(make('legend', 'Pages to export'));
    var countLabel = make('p');
    fieldset.append(countLabel);
    var preview = make('section');
    preview.hidden = true;
    var heading = make('h3', 'Preview');
    heading.tabIndex = -1;
    var summary = make('div');
    var importOptions = make('fieldset');
    importOptions.hidden = true;
    preview.append(heading, importOptions, summary);
    var saved = make('section');
    saved.className = 'df-export-saved';
    saved.hidden = !DF._readerState?.enabled?.();
    var forget = button('Clear saved views and imports');
    var confirmation = make('div');
    confirmation.className = 'df-export-confirm';
    confirmation.hidden = true;
    var confirmClear = button('Clear');
    var keep = button('Keep');
    confirmation.append(make('p', 'Clear them for every page of this document on this browser?'), confirmClear, keep);
    saved.append(make('h3', 'Saved reading data'), make('p', 'This browser keeps reading choices and accepted ' +
      'imports from this document so pages that are not open export with them. Without them, those pages ' +
      'export their starting view.'), forget, confirmation);
    content.append(intro, modes, documents.row, fieldset, preview, saved);

    var footer = make('footer');
    var status = make('p');
    status.setAttribute('role', 'status');
    var actions = make('div');
    var build = button('Build preview');
    var stop = button('Cancel');
    var download = button('Download HTML');
    actions.append(build, stop, download);
    footer.append(status, actions);
    modal.append(header, content, footer);

    var task, prepared, picker, result, clearing;
    var consent = new Set();

    function update() {
      var busy = !!task || !!clearing;
      var selected = picker?.ids().length || 0;
      documents.button.disabled = modes.disabled = fieldset.disabled = forget.disabled = importOptions.disabled = busy;
      build.hidden = !prepared || busy;
      build.disabled = !selected;
      stop.hidden = !task;
      download.hidden = !result || busy;
      if (picker) countLabel.textContent = count(selected, 'page') + ' selected';
    }

    function clearPreview(keepChoices) {
      result = null;
      summary.textContent = '';
      if (keepChoices) {
        importOptions.querySelectorAll('[data-df-import-included]').forEach(function (label) { label.remove(); });
      } else {
        consent.clear();
        importOptions.replaceChildren();
        importOptions.hidden = true;
      }
      preview.hidden = importOptions.hidden;
      build.textContent = 'Build preview';
    }

    function showImports(choices) {
      var list = make('ul');
      var current = new Set();
      for (let entry of choices) {
        let check = make('input');
        check.type = 'checkbox';
        check.checked = entry.selected;
        check.disabled = !entry.available;
        if (entry.selected) current.add(entry.id);
        var label = make('label');
        var size = Number.isSafeInteger(entry.bytes) ? exact.format(entry.bytes) +
          (entry.bytes === 1 ? ' byte' : ' bytes') : 'Size unavailable';
        label.append(check, make('span', (entry.name || 'Unnamed import') + ' · ' + size));
        var item = make('li');
        var detail = make('small', entry.title + ' · ' + entry.consumers.join(', ') +
          (entry.available ? '' : ' · Unavailable'));
        if (entry.included) {
          var included = make('span', ' · Included');
          included.setAttribute('data-df-import-included', '');
          detail.append(included);
        }
        item.append(label, detail);
        list.append(item);
        check.addEventListener('change', function () {
          if (check.checked) consent.add(entry.id);
          else consent.delete(entry.id);
          clearPreview(true);
          status.textContent = 'Import choices changed. Build a new preview.';
          update();
        });
      }
      consent = current;
      importOptions.replaceChildren(make('legend', 'Include full imported datasets'),
        make('p', 'Select the files to embed. Pages that need an omitted file use their captured Reader view.'), list);
      importOptions.hidden = !choices.length;
    }

    async function run(message, action, onFinish, onError, focusAfter) {
      var controller = task = new AbortController();
      status.textContent = message;
      update();
      stop.focus();
      try {
        var value = await action(controller.signal);
        controller.signal.throwIfAborted();
        onFinish(value);
      } catch (error) {
        if (!modal.open) return;
        if (controller.signal.aborted) status.textContent = 'Export cancelled.';
        else {
          status.textContent = error.message;
          onError?.(error);
        }
      } finally {
        task = null;
        stop.removeAttribute('aria-disabled');
        if (modal.open) {
          update();
          if (document.activeElement === stop || document.activeElement === document.body) focusAfter().focus();
        }
      }
    }

    function cancel() {
      if (!task || task.signal.aborted) return;
      status.textContent = 'Cancelling…';
      stop.setAttribute('aria-disabled', 'true');
      task.abort();
    }

    function checkFolder() {
      run('Checking the documentation folder…', async function (signal) {
        if (!DF._exportPackage) await DF._boot.loadExport('js/export-package.js');
        if (!DF._exportPackage) {
          throw Error('The export tools could not load. Check the local DocForm files and choose the documentation folder again.');
        }
        return DF._exportPackage.prepare(documents.files, { signal: signal });
      }, function (source) {
        prepared = source;
        picker = pagePicker(source.tree, source.active, function () {
          var hadPreview = !preview.hidden;
          clearPreview();
          status.textContent = hadPreview ? 'Selection changed. Build a new preview.' : count(picker.ids().length, 'page') + ' selected.';
          update();
        });
        picker.sync();
        fieldset.append(picker.list);
        fieldset.hidden = false;
        status.textContent = 'Folder ready. ' + count(picker.ids().length, 'page') + ' selected.';
      }, function (error) {
        if (error.folder === 'documents') documents.set(null);
      }, function () {
        return prepared ? build : documents.button;
      });
    }

    documents.input.addEventListener('cancel', function () { status.textContent = 'Folder selection cancelled.'; });
    documents.input.addEventListener('change', function () {
      var files = Array.from(documents.input.files);
      documents.input.value = '';
      picker?.list.remove();
      prepared = picker = null;
      fieldset.hidden = true;
      clearPreview();
      documents.set(files);
      if (files.length) checkFolder();
      else {
        status.textContent = 'The selected folder is empty.';
        update();
      }
    });

    forget.addEventListener('click', function () {
      forget.hidden = true;
      confirmation.hidden = false;
      confirmClear.focus();
    });
    keep.addEventListener('click', function () {
      confirmation.hidden = true;
      forget.hidden = false;
      forget.focus();
    });
    confirmClear.addEventListener('click', async function () {
      if (task || clearing) return;
      clearing = true;
      confirmClear.disabled = keep.disabled = true;
      update();
      var cleared = await DF._readerState.clear();
      clearing = false;
      if (!modal.open) return;
      var hadPreview = !preview.hidden;
      if (cleared && hadPreview) clearPreview();
      status.textContent = cleared ? 'Saved views and imports cleared.' + (hadPreview ? ' Build a new preview.' : '')
        : 'Saved views and imports could not be cleared.';
      confirmClear.disabled = keep.disabled = false;
      confirmation.hidden = true;
      forget.hidden = false;
      update();
      forget.focus();
    });

    build.addEventListener('click', function () {
      if (task || clearing || !prepared) return;
      clearPreview(true);
      run('Preparing the export…', function (signal) {
        return prepared.build(picker.ids(), { mode: mode, includeImports: consent, signal: signal, onProgress: function (event) {
          if (signal.aborted || event.phase === 'done') return;
          if (event.phase === 'capture') {
            status.textContent = 'Capturing page ' + (event.completed + 1) + ' of ' + event.total + ' · ' + event.title;
          } else if (event.phase === 'assets') status.textContent = 'Embedding assets · ' + event.title;
          else if (event.phase === 'links') status.textContent = 'Checking links and styles · ' + event.title;
          else status.textContent = 'Preparing the HTML file…';
          // Let the browser show progress and handle Cancel between build stages.
          return new Promise(function (resolve) { root.setTimeout(resolve, 0); });
        } });
      }, function (output) {
        showImports(output.importChoices);
        showPreview(summary, output);
        result = output;
        preview.hidden = false;
        status.textContent = 'Preview ready.';
      }, function (error) {
        build.textContent = 'Retry preview';
        if (error.issues?.length) {
          addIssues(summary, count(error.issues.length, 'issue'), error.issues);
          preview.hidden = false;
        }
      }, function () { return result ? heading : build; });
    });

    download.addEventListener('click', function () {
      if (!result || task || clearing) return;
      var link = make('a');
      var url = root.URL.createObjectURL(result.blob);
      link.href = url;
      link.download = result.filename;
      link.hidden = true;
      modal.append(link);
      try {
        link.click();
        status.textContent = 'Download requested.';
      } finally {
        link.remove();
        root.setTimeout(function () { root.URL.revokeObjectURL(url); }, 1000);
      }
    });
    stop.addEventListener('click', cancel);
    close.addEventListener('click', function () { cancel(); modal.close(); });
    modal.addEventListener('cancel', function (event) {
      if (!task) return;
      event.preventDefault();
      cancel();
    });
    modal.addEventListener('close', function () {
      task?.abort();
      prepared = picker = result = null;
      documents.set(null);
      if (dialog === modal) dialog = null;
      modal.remove();
      if (opener.isConnected) opener.focus({ preventScroll: true });
    });
    update();
    document.body.append(modal);
    modal.showModal();
    documents.button.focus();
  }

  DF._exportDialog = { open: open };
})(window);
