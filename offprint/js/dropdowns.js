// Style native popovers and position them at their trigger, including inside scroll panes.
(function (root) {
  'use strict';

  var OffPrint = root.OffPrint;
  var component = OffPrint._component;
  var mounted = new WeakMap();
  var gutter = 8;
  var gap = 6;

  // Places an open top-layer panel below its trigger, or above when there is more room; false when the
  // trigger is out of view.
  function place(trigger, panel) {
    var viewport = document.documentElement;
    var rect = trigger.getBoundingClientRect();
    var width = viewport.clientWidth;
    var height = viewport.clientHeight;
    if (!trigger.getClientRects().length || rect.bottom <= 0 || rect.top >= height) return false;
    var above = rect.top - gap - gutter;
    var below = height - rect.bottom - gap - gutter;
    var upwards = below < 240 && above > below;
    var rtl = root.getComputedStyle(trigger).direction === 'rtl';
    var left = rtl ? rect.right - panel.offsetWidth : rect.left;
    panel.style.left = Math.max(gutter, Math.min(left, width - panel.offsetWidth - gutter)) + 'px';
    panel.style.top = upwards ? 'auto' : Math.max(gutter, rect.bottom + gap) + 'px';
    panel.style.bottom = upwards ? Math.max(gutter, height - rect.top + gap) + 'px' : 'auto';
    panel.style.maxHeight = Math.max(0, upwards ? above : below) + 'px';
    panel.classList.toggle('op-dropdown-up', upwards);
    return true;
  }

  // Keeps an open popover panel at its trigger through scrolling and resizing, and hides it once the trigger
  // leaves the viewport. Returns a function that stops following.
  function follow(trigger, panel) {
    function update() {
      if (!place(trigger, panel) && panel.matches(':popover-open')) panel.hidePopover();
    }
    var resize = root.ResizeObserver && new root.ResizeObserver(update);
    panel.classList.add('op-dropdown-positioned');
    root.addEventListener('scroll', update, true);
    root.addEventListener('resize', update);
    if (resize) resize.observe(panel);
    update();
    return function () {
      root.removeEventListener('scroll', update, true);
      root.removeEventListener('resize', update);
      if (resize) resize.disconnect();
    };
  }

  function mount(target) {
    var host = component.target(target, 'dropdowns', true);
    if (!host) return null;
    if (mounted.has(host)) return mounted.get(host);
    var trigger = host.querySelector(':scope > button[popovertarget]');
    var panel = host.querySelector(':scope > .op-dropdown-panel[popover="auto"]');
    if (!trigger || !panel || !panel.id || trigger.getAttribute('popovertarget') !== panel.id) {
      component.issue('dropdowns', host, 'A dropdown needs a button targeting its popover.',
        'Use a unique ID on the direct .op-dropdown-panel and match it in the button’s popovertarget.');
      return null;
    }
    if (typeof panel.showPopover !== 'function') return null;
    var stop = null;

    panel.addEventListener('beforetoggle', function (event) {
      if (event.newState === 'open') {
        panel.querySelectorAll('details[open]').forEach(function (branch) { branch.open = false; });
        // Position before the first paint, once the popover has an intrinsic width.
        root.requestAnimationFrame(function () {
          if (panel.matches(':popover-open')) place(trigger, panel);
        });
      } else if (stop) {
        stop();
        stop = null;
      }
    });
    panel.addEventListener('toggle', function () {
      if (panel.matches(':popover-open') && !stop) stop = follow(trigger, panel);
    });
    panel.addEventListener('click', function (event) {
      if (event.target.closest('a[href], button:not(:disabled)') && panel.matches(':popover-open')) {
        panel.hidePopover();
      }
    });
    panel.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      var branch = event.target.closest('details[open]');
      if (branch && panel.contains(branch)) {
        event.preventDefault();
        branch.open = false;
        branch.querySelector(':scope > summary').focus({ preventScroll: true });
      }
    });

    panel.classList.add('op-dropdown-positioned');
    mounted.set(host, panel);
    return panel;
  }

  OffPrint._dropdowns = { mount: mount, follow: follow };
  OffPrint.register('dropdowns', function () {
    OffPrint._all('.op-dropdown').forEach(mount);
  });
})(typeof window !== 'undefined' ? window : globalThis);
