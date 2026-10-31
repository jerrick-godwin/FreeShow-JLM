"""Publish verified, matching installer artifacts using a manually authorized CI job."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess


def run(*args, capture=False, check=True):
    return subprocess.run(args, text=True, capture_output=capture, check=check)


def data(*args):
    return json.loads(run(*args, capture=True).stdout)


def main():
    tag, build_id, repo = (os.environ[key] for key in ('RELEASE_TAG', 'ARTIFACT_RUN_ID', 'GITHUB_REPOSITORY'))
    if not re.fullmatch(r'v\d+\.\d+\.\d+', tag) or not build_id.isdecimal():
        raise ValueError('A stable version tag and numeric installer run ID are required')
    build = data('gh', 'api', f'repos/{repo}/actions/runs/{build_id}')
    if build['conclusion'] != 'success' or build['status'] != 'completed' or build['head_repository']['full_name'].lower() != repo.lower():
        raise ValueError('Only successful installer runs from this repository are accepted')
    jobs = data('gh', 'api', f'repos/{repo}/actions/runs/{build_id}/jobs?per_page=100')['jobs']
    if len(jobs) != 3 or any(job['conclusion'] != 'success' for job in jobs):
        raise ValueError('All three native installer jobs must pass')
    commit = run('git', 'rev-parse', f'refs/tags/{tag}^{{}}', capture=True).stdout.strip()
    run('git', 'merge-base', '--is-ancestor', commit, 'origin/main')
    version = tag[1:]
    if data('git', 'show', f'{commit}:package.json')['version'] != version:
        raise ValueError('Package version differs from the tag')
    changed = run('git', 'diff', '--name-only', build['head_sha'], commit, capture=True).stdout.splitlines()
    if any(path != '.github/workflows/winget.yml' for path in changed):
        raise ValueError('Installer inputs differ from the tagged release')
    expected_groups = {'Jesus-Lives-Ministry-win-x64', 'Jesus-Lives-Ministry-mac-x64', 'Jesus-Lives-Ministry-mac-arm64'}
    artifacts = data('gh', 'api', f'repos/{repo}/actions/runs/{build_id}/artifacts')['artifacts']
    if {item['name'] for item in artifacts if not item['expired']} != expected_groups:
        raise ValueError('The expected installer artifacts are missing or expired')
    run('gh', 'run', 'download', build_id, '--repo', repo, '--dir', 'release-artifacts')
    files = sorted(path for path in Path('release-artifacts').rglob('*') if path.is_file())
    prefix = f'Jesus-Lives-Ministry-{version}'
    expected = {f'{prefix}-win-x64.exe', *[f'{prefix}-mac-{arch}.{extension}' for arch in ('x64', 'arm64') for extension in ('dmg', 'zip')]}
    if len(files) != 5 or {path.name for path in files} != expected:
        raise ValueError('Unexpected installer files')
    hashes = []
    for path in files:
        if path.stat().st_size < 1_000_000:
            raise ValueError(f'Unexpectedly small installer: {path.name}')
        digest = hashlib.sha256()
        with path.open('rb') as stream:
            for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b''):
                digest.update(chunk)
        hashes.append(f'{digest.hexdigest()}  {path.name}')
    checksums = Path('SHA256SUMS')
    checksums.write_text('\n'.join(hashes) + '\n')
    notes = run('git', 'show', f'{commit}:CHANGELOG.md', capture=True).stdout
    notes += f'\n## Verified builds\n\nUnit tests, production builds, bundled asset checks, and native speech-runtime checks passed for Windows x64, Intel Mac, and Apple Silicon Mac. [Build results](https://github.com/{repo}/actions/runs/{build_id}).\n\nInstaller inputs were checked against `{tag}` at `{commit}`. The subsequent cleanup only removed the inherited upstream publisher. `SHA256SUMS` lists installer checksums.\n'
    Path('RELEASE_NOTES.md').write_text(notes)
    existing = run('gh', 'release', 'view', tag, '--repo', repo, '--json', 'isDraft', capture=True, check=False)
    if existing.returncode == 0:
        if not json.loads(existing.stdout)['isDraft']:
            raise ValueError('Published releases are never overwritten')
    else:
        run('gh', 'release', 'create', tag, '--repo', repo, '--verify-tag', '--draft', '--title', f'Jesus Lives Ministry {tag}', '--notes-file', 'RELEASE_NOTES.md')
    run('gh', 'release', 'upload', tag, '--repo', repo, '--clobber', *map(str, files), str(checksums))
    release = data('gh', 'api', f'repos/{repo}/releases/tags/{tag}')
    if {asset['name']: asset['size'] for asset in release['assets']} != {path.name: path.stat().st_size for path in [*files, checksums]}:
        raise ValueError('Uploaded assets differ from the expected files')
    run('gh', 'release', 'edit', tag, '--repo', repo, '--notes-file', 'RELEASE_NOTES.md', '--draft=false', '--prerelease=false', '--latest')
    print(f'Published https://github.com/{repo}/releases/tag/{tag}')


if __name__ == '__main__':
    main()
