// A classic script (not a module) that runs before the daily's modules. If a module fails to load, which can happen
// in the minutes a deploy is mixed old and new files, reload the page once to get a matching set. The sessionStorage
// flag makes sure it can only reload once in a row: a second failure leaves the page as it is, never a loop.
(function () {
  var FLAG = 'gnome-sweet-gnome:daily:reloaded';
  var failed = false;
  function get() { try { return sessionStorage.getItem(FLAG); } catch (e) { return '1'; } } // no storage: never reload
  function set(v) { try { if (v) sessionStorage.setItem(FLAG, v); else sessionStorage.removeItem(FLAG); } catch (e) { /* ignore */ } }
  function reloadOnce() {
    failed = true;
    if (get()) return;
    set('1');
    location.reload();
  }
  // A static import that 404s fires `error` on the <script type="module"> element (resource errors do not bubble: capture).
  window.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t.tagName === 'SCRIPT' && t.type === 'module') reloadOnce();
  }, true);
  // A dynamic import() that fails rejects with a TypeError; a module that throws while loading is a plain error.
  window.addEventListener('unhandledrejection', function (e) {
    var m = String((e.reason && e.reason.message) || e.reason || '');
    if (/dynamically imported module|Importing a module script failed|error loading dynamically/i.test(m)) reloadOnce();
  });
  // A page that loaded cleanly forgets the flag, so the next mixed deploy can reload once again.
  window.addEventListener('load', function () {
    setTimeout(function () { if (!failed) set(''); }, 3000);
  });
})();
