#!/usr/bin/env python3
"""Non-secret environment/graphics fixture for a bounded remote Codex probe.

Run with exactly two output paths: machine-report.json and generated-view.png.
This is capability evidence only; it does not certify the Creator runtime.
"""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import zlib


def command_result(arguments):
    if shutil.which(arguments[0]) is None:
        return {"available": False}
    try:
        result = subprocess.run(arguments, capture_output=True, text=True, timeout=20)
        return {"available": True, "exitCode": result.returncode,
                "stdout": result.stdout[:2000], "stderr": result.stderr[:1000]}
    except subprocess.TimeoutExpired:
        return {"available": True, "timedOut": True}


def main():
    report_path, image_path = map(Path, sys.argv[1:])
    for path in (report_path, image_path):
        path.parent.mkdir(parents=True, exist_ok=True)
    report = {
        "kind": "creator-environment-probe", "schemaVersion": 1,
        "commands": {name: command_result(args) for name, args in {
            "node": ["node", "--version"], "pnpm": ["pnpm", "--version"],
            "codex": ["codex", "--version"], "ffmpeg": ["ffmpeg", "-version"],
            "ffprobe": ["ffprobe", "-version"], "chromium": ["chromium", "--version"],
            "chromiumBrowser": ["chromium-browser", "--version"],
            "googleChrome": ["google-chrome", "--version"],
        }.items()},
        "pythonModules": {name: importlib.util.find_spec(name) is not None
                          for name in ["PIL", "playwright", "numpy"]},
        "installedRuntimeRoots": {path: Path(path).is_dir()
                                  for path in ["/opt/worldkit", "/opt/worldkit-assets"]},
    }
    report["nodeExecution"] = command_result(["node", "-e", "console.log(JSON.stringify({sum:[2,3,5].reduce((a,b)=>a+b,0),platform:process.platform,architecture:process.arch}))"])
    report["nodeModules"] = command_result(["node", "-e", "const names=['playwright','playwright-core','@babylonjs/core','@babylonjs/havok','@whitebox-world/runtime-babylon','@whitebox-world/native-world-babylon'];const out={};for(const name of names){try{require.resolve(name);out[name]=true}catch{out[name]=false}}console.log(JSON.stringify(out))"])
    width, height = 640, 360
    pixels = bytearray([242, 245, 249] * width * height)
    # A fresh, asymmetrical graphics fixture; never claimed to be a Runtime view.
    shapes = [(75, 85, 35, (220, 35, 50)), (210, 80, 50, (25, 175, 210)),
              (520, 265, 60, (245, 175, 20))]
    for center_x, center_y, radius, color in shapes:
        for y in range(height):
            for x in range(width):
                if (x-center_x)**2 + (y-center_y)**2 <= radius**2:
                    offset = (y*width+x)*3
                    pixels[offset:offset+3] = bytes(color)
    for y in range(195, 295):
        for x in range(85, 260):
            offset = (y*width+x)*3
            pixels[offset:offset+3] = bytes((125, 60, 190))
    raw = b''.join(b'\0' + pixels[y*width*3:(y+1)*width*3] for y in range(height))
    def chunk(kind, data):
        return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind+data) & 0xffffffff)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', width, height, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')
    image_path.write_bytes(png)
    report["generatedImage"] = {"width": width, "height": height, "byteLength": len(png)}
    report_path.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({"probeExecuted": True, "machineReport": str(report_path), "generatedImage": str(image_path)}))


if __name__ == '__main__':
    main()
