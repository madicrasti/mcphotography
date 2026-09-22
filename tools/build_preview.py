"""Builds one self-contained preview page (client site + admin side by side) for sharing before go-live."""
import base64, json, pathlib, re
root = pathlib.Path(__file__).resolve().parent.parent
logo = 'data:image/png;base64,' + base64.b64encode((root / 'assets/logo.png').read_bytes()).decode()
FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap">'
def read(p): return (root / p).read_text()
def js(*files): return ''.join('<script>' + read(f).replace('</script', '<\\/script') + '</script>\n' for f in files)
cfg = "<script>window.MC_CONFIG={supabaseUrl:'',supabaseAnonKey:'',adminEmail:'madicrasti@gmail.com',portfolioUrl:'https://madicrasti.mypixieset.com/',instagram:'mads.crasti',logo:%s,clientUrl:'https://madicrasti.github.io/mcphotography/'};</script>" % json.dumps(logo)
def doc(css, app):
    return ('<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' + FONTS +
            '<style>' + read(css) + '</style></head><body><div id="app"></div>' + cfg + js('assets/core.js', 'assets/engine.js', 'assets/api.js', 'assets/ui.js', app) + '</body></html>')
client = doc('assets/client.css', 'assets/client.js')
admin = doc('assets/admin.css', 'assets/admin.js')
page = '''<title>Madi Crasti Booking Site</title>
<style>
:root { --bar:#001a5b; --ink:#ffffff; --pill:#384870; --ground:#f4f4f4; color-scheme: light; }
html, body { height: 100%; background: var(--ground); margin: 0; }
body { font: 500 13px/1.2 'DM Sans', system-ui, sans-serif; display: flex; flex-direction: column; }
.pv-bar { background: var(--bar); color: var(--ink); display: flex; align-items: center; gap: 10px; padding: 8px 16px; flex-wrap: wrap; }
.pv-bar b { font: italic 500 18px/1 'Cormorant Garamond', Georgia, serif; margin-right: auto; letter-spacing: .01em; }
.pv-bar button { border: 1px solid rgba(255,255,255,.35); background: transparent; color: #fff; border-radius: 999px; padding: 7px 14px; cursor: pointer; font: inherit; }
.pv-bar button[aria-pressed="true"] { background: #fff; color: var(--bar); border-color: #fff; }
.pv-bar small { color: rgba(255,255,255,.7); font-weight: 400; width: 100%; }
.pv-frames { flex: 1; position: relative; min-height: 0; }
.pv-frames iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: var(--ground); }
@media (min-width: 700px) { .pv-bar small { width: auto; } }
</style>
<div class="pv-bar" role="toolbar" aria-label="Choose which side to preview">
  <b>Madi Crasti · booking site preview</b>
  <button type="button" id="pv-client" aria-pressed="true">Client booking site</button>
  <button type="button" id="pv-admin" aria-pressed="false">Your admin</button>
  <small>Preview mode: payments, emails and calendars are pretend. Bookings you make on the client side show up in admin.</small>
</div>
<div class="pv-frames"><iframe id="f-client" title="Client booking site"></iframe><iframe id="f-admin" title="Admin" hidden></iframe></div>
<script>
(function(){
  var docs = ''' + json.dumps({'client': client, 'admin': admin}).replace('</', '<\\/') + ''';
  var fc = document.getElementById('f-client'), fa = document.getElementById('f-admin');
  fc.srcdoc = docs.client;
  var adminLoaded = false;
  function show(which){
    var a = which === 'admin';
    if (a && !adminLoaded) { fa.srcdoc = docs.admin; adminLoaded = true; }
    else if (a) { try { fa.contentWindow.MCadmin && fa.contentWindow.location.reload(); } catch (e) { fa.srcdoc = docs.admin; } }
    fa.hidden = !a; fc.hidden = a;
    document.getElementById('pv-client').setAttribute('aria-pressed', String(!a));
    document.getElementById('pv-admin').setAttribute('aria-pressed', String(a));
  }
  document.getElementById('pv-client').onclick = function(){ show('client'); };
  document.getElementById('pv-admin').onclick = function(){ show('admin'); };
})();
</script>
'''
out = root.parent / 'dist'; out.mkdir(exist_ok=True)
(out / 'preview.html').write_text(page)
print('preview', round(len(page) / 1024), 'KB')
