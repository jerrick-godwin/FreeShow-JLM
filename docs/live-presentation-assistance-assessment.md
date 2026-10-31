# Live presentation assistance: implementation and feasibility record

Updated 31 October 2026. The speech features are now implemented experimentally. No church-service recordings or target presentation computers were supplied. The implemented contracts are defined in `src/types/ai/Live.ts`; current behavior is documented in [the operator guide](live-assistance.md).

## Implemented delivery

- Local Whisper small multilingual recognition through sherpa-onnx, in an isolated Electron utility process; pinned files, checksum verification, downloadable setup, cancellation, explicit language selection, microphone lifecycle and stale-session suppression. Existing Nemotron remains available.
- Timed transcript segments with session/segment identities and revisions. Interim revisions feed captions; finalized segments feed local matching and following. The earlier overlapping-chunk Scripture autoplay call is removed from the active transcript path.
- Local song title/alias/lyric and Bible reference/verse matching. Confirmation pins one song layout or Bible chapter/translation and its output selection. Subsequent alignment does not silently switch content.
- Guarded output commits, pause/resume/stop, manual-navigation pause, locks/clear handling, unavailable output and changed-content handling, caption expiry, independent caption output/font controls.
- Explicit online title discovery, Google/source search links, editable user-provided lyric review and add-to-library-and-follow. Automatic full-lyrics retrieval is not enabled because reuse permission is not established by the existing scraping integrations.

## Current language/platform matrix

| Language | New local engine | Apple Silicon development run | Intel macOS / Windows / Linux | Live-service accuracy |
|---|---|---|---|---|
| English | Whisper small, explicit `en` or auto | Native speech fixture passed | Runtime platform packages exist; packaged flow unverified | Unmeasured |
| Sinhala | Whisper language token `si`, explicit or auto | Unicode matching/caption path tested; no Sinhala recording | Integration present; packaged flow unverified | Unmeasured |
| Tamil | Whisper language token `ta`, explicit or auto | Unicode matching/caption path tested; no Tamil recording | Integration present; packaged flow unverified | Unmeasured |

The [Whisper tokenizer language table](https://github.com/openai/whisper/blob/main/whisper/tokenizer.py) includes all three languages. Language coverage does not establish useful singing accuracy. Model files come from the [sherpa-onnx Whisper small export](https://huggingface.co/csukuangfj/sherpa-onnx-whisper-small/tree/8f3c18b358db4d1f2fc1eae49d75cd20989e4309), about 375 MB total, using CPU inference with two threads. Offline recognition has no per-minute API cost. Working-set RAM and production CPU/frame impact have not been profiled; targets must accommodate model weights plus runtime/audio buffers. Native integration uses the app's existing optional sherpa runtime and packaging rules; no cloud account is required.

A native public English fixture (6.625 seconds) decoded in approximately 1.8 seconds after 0.9-second model loading on the development Mac. The words matched the supplied reference after case/punctuation normalization. This is a one-buffer smoke test. Configured streaming partial windows begin at two seconds; finalization uses 0.55 seconds of silence or six-second windows, plus inference. It is not measured real-time end-to-end service latency. Full singing and mixed-language benchmarks remain required.

Recognition/matching/control unit tests and actual renderer IPC tests cover integration effort already completed. Remaining effort is field evaluation, platform packaging validation, threshold calibration, and potentially a dedicated sung-lyric alignment model if speech transcripts prove inadequate. Online licensed full-lyrics retrieval remains a separate provider integration. Recommended release staging: supervised English speech first; recorded Sinhala/Tamil speech evaluation next; accompanied singing last, retaining manual controls throughout.

## Interfaces and validation boundaries

`TimedTranscriptSegment` carries session ID, segment ID, monotonic revision, final/interim flag, text, timestamps, language, optional music flag and confidence. `LiveCandidate` identifies an indexed document and position, excerpt, match reason, heuristic score, and expiry timestamp. The score is not a calibrated probability. `FollowSession` pins document, position, output IDs and following/paused state. `CaptionCue` carries revision-aware text, seven-second expiry and independent typography. These contracts live in `src/types/ai/Live.ts`.

Song documents use actual flattened layout references, including child slides and repeated sections. Bible documents pin one local chapter. New content remains a suggestion. Repeated identical chorus text holds rather than inventing a position; stronger repeated evidence permits skipped/backward movement. Short or heavily misrecognized phrases can fail to advance. There is no independent detection of singing onset, accompaniment separation, translation of displayed text, or musical timing model. A recognized lyric phrase can suggest a song whether spoken or sung.

Captions use partial text; projection uses finalized segments. Pausing or stopping invalidates pending renders. Session identities reject old audio results after restarts; output locks and clear controls prevent automatic repopulation. Content edits require renewed acceptance. The earlier automatic Scripture detector is no longer called from the active transcript pipeline.

## Required field evaluation

For English, Sinhala and Tamil separately, record clean speech, spoken references, verse quotations, actual singing, repeated choruses, skipped/backward stanzas, instrumental breaks, pauses, corrections, accompaniment, congregation noise and mixed-language switching. Label reference transcripts and intended slide timings. Measure word/character error, candidate precision, false transitions, missed transitions, end-to-end caption/slide latency, model loading, CPU/RAM, audio backlog and presentation frame impact. Include both direct mixer feeds and room recordings. No representative user recordings were supplied, so these cells remain unmeasured.

Repeat model download/cancellation/integrity, offline restart, permission denial, microphone disconnect, crash recovery, manual override, locks and multi-output flows in packaged native builds on each target platform. The desktop integration test uses injected transcript events; the native smoke test uses recorded speech. Neither proves live microphone acoustics or singing quality. No online full-lyrics reuse permission/provider account has been configured. Online discovery remains subject to source availability; no online service latency or cost has been benchmarked.
