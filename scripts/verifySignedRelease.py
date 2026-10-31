"""Native OS trust checks; run after packaging, before uploading any release artifact."""
import argparse
import json
import os
from pathlib import Path
import plistlib
import subprocess
import tempfile


def run(*args, env=None):
    result = subprocess.run(args, text=True, capture_output=True, check=True, env=env)
    return result.stdout + result.stderr


def verify_mac_app(app, version, arch):
    with (app / 'Contents/Info.plist').open('rb') as stream:
        info = plistlib.load(stream)
    if info['CFBundleShortVersionString'] != version:
        raise ValueError('Mac app version does not match release')
    executable = app / 'Contents/MacOS' / info['CFBundleExecutable']
    architectures = run('lipo', '-archs', str(executable)).strip().split()
    if architectures != [{'arm64': 'arm64', 'x64': 'x86_64'}[arch]]:
        raise ValueError('Mac app architecture does not match release')
    run('codesign', '--verify', '--deep', '--strict', str(app))
    details = run('codesign', '-d', '--verbose=4', str(app))
    if 'Authority=Developer ID Application:' not in details or 'TeamIdentifier=not set' in details or 'runtime' not in details:
        raise ValueError('Developer ID signature with hardened runtime is required')
    run('xcrun', 'stapler', 'validate', str(app))
    run('spctl', '--assess', '--type', 'execute', '--verbose=2', str(app))


def verify_mac(dist, prefix, version, arch):
    app = dist / f'mac{"-arm64" if arch == "arm64" else ""}' / 'Jesus Lives Ministry.app'
    verify_mac_app(app, version, arch)
    archive = dist / f'{prefix}.zip'
    image = dist / f'{prefix}.dmg'
    if not archive.is_file() or not image.is_file():
        raise ValueError('Both Mac disk image and archive are required')
    with tempfile.TemporaryDirectory() as scratch:
        run('ditto', '-x', '-k', str(archive), scratch)
        verify_mac_app(Path(scratch) / 'Jesus Lives Ministry.app', version, arch)
    run('codesign', '--verify', '--strict', str(image))
    run('xcrun', 'stapler', 'staple', str(image))
    run('xcrun', 'stapler', 'validate', str(image))
    run('spctl', '--assess', '--type', 'open', '--context', 'context:primary-signature', '--verbose=2', str(image))


def verify_windows(dist, prefix):
    paths = [dist / f'{prefix}.exe', dist / 'win-unpacked/Jesus Lives Ministry.exe']
    for path in paths:
        if not path.is_file():
            raise ValueError(f'Missing Windows executable: {path}')
        # Constant script; path passed through the environment, never interpolated into PowerShell source.
        run('powershell', '-NoProfile', '-NonInteractive', '-Command',
            '$ErrorActionPreference = "Stop"; $s = Get-AuthenticodeSignature -LiteralPath $env:SIGNED_FILE; '
            'if ($s.Status -ne "Valid" -or !$s.SignerCertificate -or !$s.TimeStamperCertificate) '
            '{ throw "A trusted timestamped Authenticode signature is required" }',
            env={**os.environ, 'SIGNED_FILE': str(path.resolve())})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--platform', choices=['mac', 'win'], required=True)
    parser.add_argument('--arch', choices=['arm64', 'x64'], required=True)
    args = parser.parse_args()
    version = json.loads(Path('package.json').read_text())['version']
    prefix = f'Jesus-Lives-Ministry-{version}-{args.platform}-{args.arch}'
    if args.platform == 'mac':
        verify_mac(Path('dist'), prefix, version, args.arch)
    else:
        if args.arch != 'x64':
            raise ValueError('Only Windows x64 is supported')
        verify_windows(Path('dist'), prefix)
    print(f'Passed native release trust checks: {args.platform} {args.arch}')


if __name__ == '__main__':
    main()
