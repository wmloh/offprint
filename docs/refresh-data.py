#!/usr/bin/env python3
"""Refresh the data wrappers for the DocForm documentation site."""

from pathlib import Path
from runpy import run_path


if __name__ == '__main__':
    site = Path(__file__).resolve().parent
    refresh = run_path(str(site.parent / 'docform/tools/refresh_data.py'))['refresh']
    raise SystemExit(refresh(site / 'assets/site.js', site_root=site))
