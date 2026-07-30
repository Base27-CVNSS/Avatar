# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path

root = Path(SPECPATH)

datas = [
    (str(root / "index.html"), "."),
    (str(root / "styles.css"), "."),
    (str(root / "app.js"), "."),
    (str(root / "audio"), "audio"),
    (str(root / "characters.json"), "."),
    (str(root / "assets"), "assets"),
    (str(root / "icons"), "icons"),
    (str(root / "vendor"), "vendor"),
]

analysis = Analysis(
    [str(root / "cybergirl.py")],
    pathex=[str(root)],
    binaries=[],
    datas=datas,
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["numpy", "scipy", "torch", "qwen_tts"],
    noarchive=False,
)

pyz = PYZ(analysis.pure)

exe = EXE(
    pyz,
    analysis.scripts,
    analysis.binaries,
    analysis.datas,
    [],
    name="Cybergirl-Windows-x64",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=str(root / "icons" / "cybergirl.ico"),
)
