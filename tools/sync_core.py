"""Copy the shared booking rules into the back office. Run after editing assets/core.js or assets/engine.js."""
import shutil, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
for f in ['core.js', 'engine.js']:
    shutil.copy(root / 'assets' / f, root / 'supabase' / 'functions' / '_shared' / f)
print('synced')
