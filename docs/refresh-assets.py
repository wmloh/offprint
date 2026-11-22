#!/usr/bin/env python3
"""Check or refresh this documentation site's data wrappers and search index. Pass --check to change nothing."""

from pathlib import Path
from runpy import run_path


if __name__ == '__main__':
    site = Path(__file__).resolve().parent
    main = run_path(str(site.parent / 'docform/tools/refresh_assets.py'))['main']
    raise SystemExit(main(site / 'assets/site.js', site_root=site))
