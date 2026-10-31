
## Verification recorded on 31 October 2026

- Production frontend/server/Electron build passed with strict offline asset verification. The subsequent first-run folder guard compiled and passed its dedicated regression tests.
- Full unit suite: 230 passed, 10 skipped. Coverage includes waiting for an explicit first-run folder choice, committing settings before the install marker, unique IDs, source checksums, preservation of edits/deletions and interrupted installation.
- Bundled OCR: all three language datasets loaded with network access blocked and an empty cache; the generated scanned English fixture was recognized.
- Bundled speech model: the public 6.625-second English fixture was transcribed locally using the bundled model files.
- Svelte diagnostics remain at the existing 194 errors and 60 warnings.
- The expanded desktop presentation flow passed from a fully local snapshot, including first-launch walkthrough, imports, trilingual search, layout isolation, suggestions, captions and following. Six screenshots are saved under `docs/screenshots/`.
- An unsigned Apple Silicon Mac app was packaged successfully. Its actual copied payload passed checksum checks and its packaged native speech runtime loaded successfully. Windows and Intel Mac installer execution, signing and notarization remain pending.
- iCloud file offloading initially caused read timeouts. Final checks ran from an exact staged snapshot in a temporary local checkout.

A test-isolation issue was corrected: temporary settings now point at a temporary data folder before Electron starts. Two unedited test additions in the existing library were moved to a reversible temporary backup; the library installer now waits for an explicit first-run folder choice or setup completion.
