(function() {
  var AUTH_KEY = 'site-authenticated';
  var PASS = 'duarbdhks';

  if (sessionStorage.getItem(AUTH_KEY) === 'true') {
    var s = document.createElement('style');
    s.textContent = 'body{display:block!important}';
    document.documentElement.appendChild(s);
    return;
  }

  var overlay = document.createElement('div');
  overlay.id = 'auth-overlay';
  overlay.innerHTML =
    '<div style="position:fixed;inset:0;background:#0a0a0f;display:flex;align-items:center;justify-content:center;z-index:99999;font-family:system-ui,sans-serif">' +
      '<div style="text-align:center;padding:2rem">' +
        '<h2 style="color:#e5e7eb;font-size:1.5rem;margin-bottom:1.5rem">Access Required</h2>' +
        '<input id="auth-input" type="password" placeholder="Password" autocomplete="off" ' +
          'style="padding:0.75rem 1rem;width:240px;border-radius:0.5rem;border:1px solid #374151;background:#1f2937;color:#f3f4f6;font-size:1rem;outline:none">' +
        '<br>' +
        '<button id="auth-btn" style="margin-top:1rem;padding:0.6rem 2rem;border-radius:0.5rem;border:none;background:#6366f1;color:#fff;font-size:0.95rem;cursor:pointer">Enter</button>' +
        '<p id="auth-error" style="color:#ef4444;margin-top:0.75rem;font-size:0.875rem;display:none">Incorrect password</p>' +
      '</div>' +
    '</div>';

  document.documentElement.appendChild(overlay);

  function tryAuth() {
    var input = document.getElementById('auth-input');
    if (input.value === PASS) {
      sessionStorage.setItem(AUTH_KEY, 'true');
      overlay.remove();
      document.body.style.display = '';
    } else {
      document.getElementById('auth-error').style.display = 'block';
      input.value = '';
      input.focus();
    }
  }

  overlay.querySelector('#auth-btn').addEventListener('click', tryAuth);
  overlay.querySelector('#auth-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') tryAuth();
  });

  setTimeout(function() {
    var input = document.getElementById('auth-input');
    if (input) input.focus();
  }, 100);
})();
