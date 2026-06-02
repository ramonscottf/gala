/* ============================================================
   WICKO PILL NAV — v1.1
   Auto-wires every .wpn element. Idempotent — safe to call init()
   multiple times. Adapters that insert .wpn dynamically can call
   window.WickoPillNav.init() after insertion.
   ============================================================ */
(function () {
  'use strict';

  var INITIALIZED = '__wpnInitialized';

  function initOne(root) {
    if (root[INITIALIZED]) return;
    var toggle = root.querySelector('.wpn__toggle');
    var links  = root.querySelector('.wpn__links');
    if (!toggle || !links) return;

    function open()  { toggle.classList.add('is-open');    links.classList.add('is-open');    toggle.setAttribute('aria-expanded', 'true'); }
    function close() { toggle.classList.remove('is-open'); links.classList.remove('is-open'); toggle.setAttribute('aria-expanded', 'false'); }

    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      links.classList.contains('is-open') ? close() : open();
    });

    document.addEventListener('click', function (e) {
      if (!links.classList.contains('is-open')) return;
      if (links.contains(e.target) || toggle.contains(e.target)) return;
      close();
    });

    links.querySelectorAll('a:not(.wpn__group-row > a)').forEach(function (a) {
      a.addEventListener('click', function () { close(); });
    });

    links.querySelectorAll('.wpn__group').forEach(function (group) {
      var groupToggle = group.querySelector('.wpn__group-toggle');
      if (!groupToggle) return;
      groupToggle.setAttribute('aria-expanded', 'false');
      groupToggle.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var expanded = group.classList.toggle('is-expanded');
        groupToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      });
    });

    window.addEventListener('scroll', function () {
      root.classList.toggle('is-scrolled', window.scrollY > 60);
    }, { passive: true });

    root[INITIALIZED] = true;
  }

  function init() {
    document.querySelectorAll('.wpn').forEach(initOne);
  }

  // Auto-init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Public API for adapters that insert .wpn dynamically
  window.WickoPillNav = { init: init, initOne: initOne };
})();
