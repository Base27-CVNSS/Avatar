# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path

root = Path(SPECPATH)

analysis = Analysis(
    [str(root / "cybergirl_native_host.py")],
    pathex=[str(root)],
    binaries=[],
    datas=[],
    hiddenimports=[
        "numpy",
        "onnxruntime",
        "onnxruntime.capi._pybind_state",
        "sounddevice",
        "_sounddevice_data",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["torch", "torchaudio", "qwen_tts"],
    noarchive=False,
)

pyz = PYZ(analysis.pure)

exe = EXE(
    pyz,
    analysis.scripts,
    analysis.binaries,
    analysis.datas,
    [],
    name="Cybergirl-Companion",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=str(root / "icons" / "cybergirl.ico"),
)

