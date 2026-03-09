(function () {
  var version = window.__SPEEDARR_VERSION__;
  var repo = window.__SPEEDARR_GITHUB_REPO__;
  if (!version || !repo) return;
  var banner = document.getElementById('version-banner');
  if (!banner) return;
  fetch('https://api.github.com/repos/' + repo + '/releases/latest', { headers: { Accept: 'application/vnd.github.v3+json' } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      if (!data || !data.tag_name) return;
      var latest = data.tag_name.replace(/^v/, '');
      var cur = (version + '').replace(/^v/, '');
      if (compareVersions(latest, cur) > 0) {
        banner.textContent = 'A new version (' + data.tag_name + ') is available. Update by pulling the new image: docker pull ...';
        banner.classList.remove('hidden');
        banner.setAttribute('aria-hidden', 'false');
      }
    })
    .catch(function () {});
  function compareVersions(a, b) {
    var pa = a.split('.').map(Number);
    var pb = b.split('.').map(Number);
    for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
      var na = pa[i] || 0, nb = pb[i] || 0;
      if (na > nb) return 1;
      if (na < nb) return -1;
    }
    return 0;
  }
})();
