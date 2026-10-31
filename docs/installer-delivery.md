# Ministry installer delivery

The installed product is named **Jesus Lives Ministry**. The main window displays the supplied ministry logo, full ministry name and configured branch. Startup, profile selection, About, native import labels, stream defaults, translated brand labels and remote-client titles use the ministry branding. Existing file formats, application ID, source attribution and legacy data locations remain compatible.

## Included without a first-run download

All supported installer targets inherit the same `extraResources` payload:

- 930 songs/choruses and 5 saved Scripture presentations from the supplied archive.
- English World English Bible and the supplied Sinhala and Tamil Bibles.
- Whisper small multilingual speech recognition weights and tokens.
- English, Sinhala and Tamil OCR language data, with the packaged OCR engine.

The payload is approximately 401 MiB before installer compression. The library is seeded into the operator's chosen data folder after setup and never overwrites existing content. Model files are read from installed resources. Optional alternative speech/chat models and online services are not required for these offline features and are not all bundled.

## Packaging safeguards

`beforePack` validates every bundled file's size and SHA-256 checksum and requires the target-specific native speech addon and runtime libraries. Windows uses `sherpa-onnx-win-x64`; macOS uses its matching Darwin Intel or Apple Silicon package.

`afterPack` repeats verification on the actual copied resources, checks unpacked OCR engines and speech dependencies, and launches the packaged executable in Node mode to load its packaged speech runtime. Missing or incorrect assets fail the build before installer creation. Native runners are required for this verification.

The manual **Ministry installers** workflow builds Windows x64, Mac Intel and Mac Apple Silicon separately, and uploads the installer artifacts without publishing releases. Its Mac runner architectures follow [GitHub's runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners). Install dependencies with `npm ci --include=optional`, prepare assets with `npm run prepare:bundled`, build with `npm run build`, then package the host's target using `config/building/electron-builder.local.yaml` and `--publish never`.

Upstream automatic updating is disabled because upstream installers do not contain this ministry library. The updates dialog directs operators to their ministry administrator. Production distribution requires ministry-owned signing credentials and a separately configured ministry update channel; upstream signing credentials are not used.

## Verification

The complete source payload passed checksum validation. Packaging safeguard tests cover Windows/Mac resource locations, correct native package names, missing addons/libraries, absent languages/models and corrupted files. Existing library-installation tests verify preservation of operator data and explicit first-run folder choice.

Production build, 230 unit tests (10 optional integration tests skipped), three packaging safeguard tests, and the desktop presentation flow passed. Svelte checking retains its existing 194 errors and 60 warnings. An unsigned Apple Silicon Mac app was packaged successfully; the copied offline payload and packaged native speech runtime passed verification. The actual packaged app also passed an offline first-launch check of ministry branding, walkthrough, 935 bundled records and three Bibles.

Windows and Intel Mac installer execution, signing and notarization still need validation before distribution. The installer workflow has been prepared locally but has not been run remotely. Final checks ran from a fully local staged snapshot after iCloud repeatedly offloaded working files.
