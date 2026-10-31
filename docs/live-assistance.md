# Live speech, captions, and following

This is an experimental operator-assisted feature. Confirm a song or Bible chapter once, then let finalized recognized text select its slides or verses. Keep the operator controls available during a service.

## Setup

1. Assistance, local speech recognition, suggestions, and captions are enabled by default. Open Settings → Smart (AI) to adjust them or inspect **Set up speech model**.
2. Choose **Multilingual local recognition**. Its model is pre-bundled with the desktop installer (about 375 MB); no first-use download is needed. Choose English, Sinhala, Tamil, or automatic language detection. Recognition runs locally; it does not send microphone audio to an online service. The existing Nemotron engine remains available for English.
3. The system microphone is selected by default. Choose a different microphone or mixer input if needed. A direct mixer feed usually gives cleaner input than a room microphone.
4. Under **Live presentation assistance**, select a local Bible and the outputs for following and captions. An empty output selection uses active presentation outputs; stage outputs are excluded.
5. Choose **Start listening** using the microphone control. Captions start enabled; turn them off if wanted. Suggestions work while captions are off. Microphone capture does not start automatically.

The bundled model is a pinned quantized Whisper small ONNX export used through the existing optional sherpa-onnx desktop runtime. Missing models, unsupported systems, microphone errors, and recognition overload are reported. The default speech model is read directly from the installed app's resources; optional downloaded models remain in the app's local data folder; no subscription or per-minute speech service is required.

## During a service

The floating panel suggests local songs from titles, aliases, or recognizable lyric phrases, and Bible passages from references or verse text. Unicode text is preserved. Select **Follow …** to start projection. A suggestion alone never projects anything.

Following stays within the accepted song layout or Bible chapter and translation. A different song, chapter, or translation needs another acceptance. Adjacent positions can advance on a strong finalized phrase; skipped or backward positions need repeated evidence. Identical choruses hold the current position when their location is ambiguous. Silence, instrumental annotations, and uncertain matches hold the display. This is transcript alignment, not a musical beat tracker or guaranteed word-perfect karaoke timing.

**Pause following**, **Resume following**, and **Stop following** remain visible during the session. Manual navigation pauses following. Resuming waits for fresh matching speech before changing the display. Output locks, missing outputs, recognition failure, and edited/deleted accepted content prevent further automatic updates. Content changes require a fresh acceptance. Clearing all output stops following; clearing text pauses it. Clearing text/all output or locking output also turns captions off; turn them back on explicitly when ready.

Caption revisions update their own text instead of accumulating duplicate interim results. Captions use a separate font/size, up to two lines, and expire after seven seconds without new text. Choose fonts installed on the presentation computer that contain Sinhala/Tamil characters. Captions can be shown independently of following; stopping following does not stop captions or the microphone.

## Finding a missing song

Choose **Find another song online** to search song titles using the app's existing search providers, or open a Google search. Online search is operator-initiated and requires the internet. Open the source to verify the song, then paste and review lyrics you have permission to use. **Add to library and follow** saves a native local song and starts a confirmed session. Duplicate songs are rejected with an explanation.

This feature does not automatically copy full lyrics from search results. Search availability or a source link does not establish permission to reuse complete lyrics. Automatic licensed-lyrics retrieval requires a provider with explicit reuse terms and is not configured here.

## What has been verified

The focused unit tests exercise matching, Tamil/Sinhala Unicode, reference detection, confirmation boundaries, adjacent/skipped/backward movement, repeated choruses, interim/final handling, stale sessions, manual pause, lock/clear behavior, Bible rendering, PCM conversion, overload, and late decoding after stop. The desktop test injects transcript events through the actual IPC path using temporary library/settings data; it does not request a real microphone.

On 31 October 2026, the native Whisper driver transcribed the model repository's public English `0.wav` (6.625 seconds). Model loading took about 0.9 seconds and decoding about 1.8 seconds on the development Apple Silicon Mac. The decoded words matched the supplied transcript after punctuation/case normalization. The actual Electron utility process also decoded this fixture and shut down successfully. This is a single speech fixture, not a live-service or singing benchmark; the fixture was delivered in one buffer. In normal streaming capture, partial decoding starts after about two seconds and finalized segments use silence endpoints or roughly six-second windows, plus decoding time.

Run the optional real-model check after `npm run build:electron:dev`:

```sh
node scripts/testLiveSpeech.js /path/to/verified/model /path/to/16kHz-recording.wav
```

Real singing with accompaniment/congregation noise, mixed-language speech, Sinhala and Tamil recordings, low-powered computers, microphone hardware, and packaged Windows/Linux/Intel Mac builds remain validation gaps. See [the implementation and feasibility record](live-presentation-assistance-assessment.md).

Final checks on 31 October 2026: production frontend/server/Electron build passed; unit suite 230 passed and 10 skipped; desktop integration passed; native speech-driver and Electron utility-process checks passed. Svelte checking remains at the pre-existing 194 errors and 60 warnings from the preceding feature delivery, with no diagnostic in the new live-assistance files.

Large-library indexing reads native records without loading every song into the presentation cache, reuses unchanged records, and preserves operator edits. A regression test covers 200 uncached songs; the full bundled-library desktop flow also passes.
