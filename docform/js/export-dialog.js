// Lazy reader controls for building and reviewing a standalone export.
(function (root) {
  'use strict';

  var DF = root.DocForm;
  var document = root.document;
  var dialog;
  var sizes = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

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
      if (page.imports.length) {
        var imports = make('ul');
        for (var entry of page.imports) {
          imports.append(make('li', (entry.name || 'Unnamed import') + ' → ' + entry.target));
        }
        item.append(make('div', 'Includes rendered data from these imports'), imports);
      }
      pages.append(item);
    }
    var size = make('p', count(result.pages.length, 'page') + ' · ' + formatSize(result.bytes));
    size.title = count(result.bytes, 'byte');
    panel.append(size, pages);
    var links = result.issues.filter(function (issue) { return issue.code === 'unavailable-link'; });
    var gaps = result.issues.filter(function (issue) { return issue.code !== 'unavailable-link'; });
    addIssues(panel, count(links.length, 'disabled link'), links);
    addIssues(panel, count(gaps.length, 'content or resource issue'), gaps);
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
    var intro = make('p', 'Choose the source folder that contains this page, the DocForm library, and any assets to include.');
    var choose = button('Choose source folder');
    var folderInput = make('input');
    folderInput.type = 'file';
    folderInput.setAttribute('webkitdirectory', '');
    folderInput.hidden = true;
    var folderName = make('span');
    folderName.className = 'df-export-folder';
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
    preview.append(heading, summary);
    content.append(intro, choose, folderInput, folderName, fieldset, preview);

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

    var task, prepared, picker, result;

    function update() {
      var busy = !!task;
      var selected = picker?.ids().length || 0;
      choose.disabled = fieldset.disabled = busy;
      build.hidden = !prepared || busy;
      build.disabled = !selected;
      stop.hidden = !busy;
      download.hidden = !result || busy;
      if (picker) countLabel.textContent = count(selected, 'page') + ' selected';
    }

    function clearPreview() {
      result = null;
      summary.textContent = '';
      preview.hidden = true;
      build.textContent = 'Build preview';
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

    choose.addEventListener('click', function () { folderInput.click(); });
    folderInput.addEventListener('cancel', function () { status.textContent = 'Folder selection cancelled.'; });
    folderInput.addEventListener('change', function () {
      var files = Array.from(folderInput.files);
      folderInput.value = '';
      picker?.list.remove();
      prepared = picker = null;
      fieldset.hidden = true;
      folderName.textContent = '';
      clearPreview();
      if (!files.length) {
        status.textContent = 'The selected folder is empty.';
        update();
        return;
      }
      run('Checking the source folder…', async function (signal) {
        if (!DF._exportPackage) await DF._boot.loadExport('js/export-package.js');
        if (!DF._exportPackage) {
          throw Error('The export tools could not load. Check the local DocForm files and choose the folder again.');
        }
        return DF._exportPackage.prepare(files, { signal: signal });
      }, function (source) {
        prepared = source;
        folderName.textContent = files[0].webkitRelativePath.split('/')[0];
        picker = pagePicker(source.tree, source.active, function () {
          var hadPreview = !preview.hidden;
          clearPreview();
          status.textContent = hadPreview ? 'Selection changed. Build a new preview.' : count(picker.ids().length, 'page') + ' selected.';
          update();
        });
        picker.sync();
        fieldset.append(picker.list);
        fieldset.hidden = false;
        status.textContent = 'Source folder ready. ' + count(picker.ids().length, 'page') + ' selected.';
      }, null, function () { return prepared ? build : choose; });
    });

    build.addEventListener('click', function () {
      if (task || !prepared) return;
      clearPreview();
      run('Preparing the export…', function (signal) {
        return prepared.build(picker.ids(), { signal: signal, onProgress: function (event) {
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
      if (!result) return;
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
      if (dialog === modal) dialog = null;
      modal.remove();
      if (opener.isConnected) opener.focus({ preventScroll: true });
    });
    update();
    document.body.append(modal);
    modal.showModal();
    choose.focus();
  }

  DF._exportDialog = { open: open };
})(window);
