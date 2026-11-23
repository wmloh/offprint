window.OffPrint.ready(function (OP) {
  'use strict';

  var build = OP._assetBuild;
  var folder = document.getElementById('folder');
  var open = document.getElementById('open');
  var recheck = document.getElementById('recheck');
  var manifest = document.getElementById('manifest');
  var manifestRow = document.getElementById('manifest-row');
  var status = document.getElementById('status');
  var diagnostics = document.getElementById('diagnostics');
  var exports = document.getElementById('exports');
  var results = document.getElementById('outputs');
  var downloadButton = document.getElementById('download');
  var saveButton = document.getElementById('save');
  var files = new Map();
  var paths = [];
  var folderName = '';
  var directory = null;
  var jobs = [];
  var choices = new Set();
  var epoch = 0;
  var saving = false;
  var folderDiagnostics = [];

  function element(tag, text) {
    var el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function showDiagnostics(messages) {
    diagnostics.replaceChildren.apply(diagnostics, messages.map(function (message) { return element('li', message); }));
    diagnostics.hidden = !messages.length;
  }

  function updateActions() {
    var hasSelection = choices.size > 0;
    downloadButton.disabled = saving || !hasSelection;
    saveButton.disabled = saving || !hasSelection;
  }

  function download(path, script) {
    var url = URL.createObjectURL(new Blob([script], { type: 'text/javascript' }));
    var link = element('a');
    link.href = url;
    link.download = path.split('/').pop();
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function render(job) {
    var section = element('section');
    var heading = element('h2');
    if (job.script && job.status !== 'blocked') {
      var label = element('label');
      var check = element('input');
      check.type = 'checkbox';
      check.checked = choices.has(job.output);
      check.addEventListener('change', function () {
        if (check.checked) choices.add(job.output);
        else choices.delete(job.output);
        updateActions();
      });
      label.append(check, ' ' + job.label);
      heading.appendChild(label);
    } else heading.textContent = job.label;
    section.appendChild(heading);
    section.appendChild(element('p', job.status[0].toUpperCase() + job.status.slice(1)));
    if (job.output) {
      var dest = element('p', 'Destination ');
      dest.appendChild(element('code', folderName + '/' + job.output));
      section.appendChild(dest);
    }
    if (job.inputs.length) {
      var list = element('ul');
      job.inputs.forEach(function (input) {
        var item = element('li');
        item.appendChild(element('code', input.file));
        list.appendChild(item);
      });
      var inputs = element('details');
      inputs.append(element('summary', 'Inputs (' + job.inputs.length + ')'), list);
      section.appendChild(inputs);
    }
    job.errors.concat(job.warnings).forEach(function (message) { section.appendChild(element('p', message)); });

    var script = job.draft || (job.status !== 'blocked' && job.script);
    if (script) {
      var preview = element('details');
      preview.appendChild(element('summary', job.draft ? 'Draft script' : 'Generated script'));
      var area = element('textarea');
      area.value = script;
      area.readOnly = true;
      area.spellcheck = false;
      area.setAttribute('aria-label', 'Script for ' + job.label);
      preview.appendChild(area);
      var actions = element('div');
      actions.className = 'actions';
      var copy = element('button', job.draft ? 'Copy draft' : 'Copy script');
      var file = element('button', job.draft ? 'Download draft' : 'Download script');
      file.addEventListener('click', function () { download(job.output, script); });
      copy.addEventListener('click', async function () {
        try {
          await OP.util.copyText(script);
          status.textContent = 'Copied ' + job.label + '.';
        } catch (error) {
          area.focus();
          area.select();
          status.textContent = 'Clipboard access was blocked. Copy the selected text.';
        }
      });
      actions.append(copy, file);
      preview.appendChild(actions);
      section.appendChild(preview);
    }
    results.appendChild(section);
  }

  function clear(message) {
    epoch++;
    choices.clear();
    jobs = [];
    exports.hidden = true;
    results.replaceChildren();
    showDiagnostics([]);
    status.textContent = message;
    updateActions();
    return epoch;
  }

  async function check() {
    var request = clear('Checking ' + folderName + '…');
    showDiagnostics(folderDiagnostics);
    manifest.disabled = true;
    try {
      var path = manifest.value;
      if (!path) {
        status.textContent = 'Select the manifest for the site you want to check.';
        return;
      }
      var file = files.get(path);
      if (!file) throw Error('Missing manifest ' + path + '. Restore the file or correct the marked script path.');
      var site = build.parseManifest(await file.text());
      var report = await build.inspect(files, site, path, paths);
      if (request !== epoch) return;
      jobs = report.jobs;
      jobs.forEach(render);
      exports.hidden = !jobs.some(function (job) { return job.status !== 'blocked'; });
      saveButton.hidden = !directory;
      showDiagnostics(folderDiagnostics.concat(report.diagnostics));
      status.textContent = jobs.length ? 'Checked ' + jobs.length + ' outputs for ' + path + '.' :
        'No outputs configured. Add assets.search or entries under assets.data in ' + path + '.';
      updateActions();
    } catch (error) {
      if (request === epoch) status.textContent = 'Cannot check ' + manifest.value + ' — ' + error.message;
    } finally {
      if (request === epoch) manifest.disabled = false;
    }
  }

  async function load(getFiles, name, handle, preferred) {
    var request = clear('Reading ' + name + '…');
    folderName = name;
    directory = handle;
    manifestRow.hidden = true;
    recheck.hidden = !handle;
    try {
      var found = await getFiles();
      var discovery = await build.discover(found);
      if (request !== epoch) return;
      files = found;
      paths = discovery.paths;
      folderDiagnostics = discovery.diagnostics;
      if (!paths.length) {
        status.textContent = 'No manifest found in ' + name + '. Add a site.js file or reference a manifest from a page with data-op-site.';
        showDiagnostics(discovery.diagnostics);
        return;
      }
      manifest.replaceChildren(new Option('Choose a manifest…', ''));
      paths.forEach(function (path) { manifest.add(new Option(path, path)); });
      manifest.value = paths.includes(preferred) ? preferred : paths.length === 1 ? paths[0] : '';
      manifestRow.hidden = false;
      await check();
    } catch (error) {
      if (request === epoch) status.textContent = 'Cannot read ' + name + ' — ' + error.message;
    }
  }

  async function readFolder(handle, prefix, found) {
    for await (let entry of handle.values()) {
      var path = prefix + entry.name;
      if (entry.kind === 'directory') await readFolder(entry, path + '/', found);
      else {
        let snapshot;
        let read = () => snapshot || (snapshot = entry.getFile());
        found.set(path, {
          text: async function () { return (await read()).text(); },
          arrayBuffer: async function () { return (await read()).arrayBuffer(); }
        });
      }
    }
    return found;
  }

  async function write(handle, job) {
    var path = job.output.split('/');
    var leaf = path.pop();
    for (var name of path) handle = await handle.getDirectoryHandle(name, { create: true });

    // Check the selected snapshot before overwriting a file that may have changed on disk.
    var target;
    try { target = await handle.getFileHandle(leaf); }
    catch (error) { if (error.name !== 'NotFoundError') throw error; }
    var existing = target ? await (await target.getFile()).text() : null;
    if (existing !== job.existing) throw Error('Output changed on disk. Check the folder again before saving.');
    if (existing === job.script) return;
    target = target || await handle.getFileHandle(leaf, { create: true });
    var stream = await target.createWritable();
    try {
      await stream.write(job.script);
      await stream.close();
    } catch (error) {
      await stream.abort().catch(function () {});
      throw error;
    }
  }

  folder.addEventListener('change', function () {
    var chosen = Array.from(folder.files);
    folder.value = '';
    if (!chosen.length) return;
    if (!chosen[0].webkitRelativePath) {
      status.textContent = 'Choose a site folder in a browser that supports folder selection.';
      return;
    }
    var name = chosen[0].webkitRelativePath.split('/')[0];
    var found = new Map(chosen.map(function (file) {
      return [file.webkitRelativePath.slice(name.length + 1), file];
    }));
    load(function () { return found; }, name, null);
  });

  open.hidden = typeof window.showDirectoryPicker !== 'function';
  open.addEventListener('click', async function () {
    try {
      var handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      await load(function () { return readFolder(handle, '', new Map()); }, handle.name, handle);
    } catch (error) {
      if (error.name !== 'AbortError') status.textContent = 'Cannot open folder with save access. Use the folder input to check and download outputs.';
    }
  });
  recheck.addEventListener('click', function () {
    var handle = directory;
    load(function () { return readFolder(handle, '', new Map()); }, handle.name, handle, manifest.value);
  });
  manifest.addEventListener('change', function () { check(); });

  downloadButton.addEventListener('click', function () {
    build.selected(jobs, choices).forEach(function (job) { download(job.output, job.script); });
  });

  saveButton.addEventListener('click', async function () {
    var handle = directory;
    var selected = build.selected(jobs, choices);
    var manifestPath = manifest.value;
    saving = true;
    folder.disabled = open.disabled = recheck.disabled = manifest.disabled = true;
    updateActions();
    status.textContent = 'Saving selected outputs…';
    var saved = 0;
    var failures = [];
    try {
      var latest = await readFolder(handle, '', new Map());
      if (!latest.has(manifestPath)) throw Error('Missing manifest ' + manifestPath + '.');
      var site = build.parseManifest(await latest.get(manifestPath).text());
      var report = await build.inspect(latest, site, manifestPath, paths);
      for (var job of selected) {
        try {
          var fresh = report.jobs.find(function (item) { return item.output === job.output && item.label === job.label; });
          if (!fresh || fresh.status === 'blocked' || fresh.script !== job.script) {
            throw Error('Configuration or input changed. Review the refreshed results before saving.');
          }
          await write(handle, job);
          saved++;
        } catch (error) {
          failures.push(job.output + ' — ' + error.message);
        }
      }
    } catch (error) {
      failures.push('Cannot verify the selected outputs — ' + error.message);
    } finally {
      await load(function () { return readFolder(handle, '', new Map()); }, handle.name, handle, manifestPath);
      saving = false;
      folder.disabled = open.disabled = recheck.disabled = manifest.disabled = false;
      updateActions();
      if (failures.length) showDiagnostics(failures.concat(Array.from(diagnostics.children, function (item) { return item.textContent; })));
      status.textContent = 'Saved ' + saved + ' of ' + selected.length + ' selected outputs in ' + handle.name + '.';
    }
  });
});
