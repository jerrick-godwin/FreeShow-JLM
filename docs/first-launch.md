# First launch and feature defaults

The first launch asks for the ministry branch, language, clock format, and library location. Completing setup opens a seven-step walkthrough with progress indicators, Back/Next controls, Skip, keyboard navigation, and a final Start presenting action. The same walkthrough can be replayed through the existing Help guide command. It introduces the included library, independent layouts, live Bible search, imports and OCR, captions, suggestions, Follow Live, output controls and branch settings. The tour does not create presentations or advance live outputs.

The bundled recognition engine defaults to multilingual Whisper with automatic language detection and the system microphone. Song/Bible suggestions and speech captions default to enabled. Defaults are applied when loading settings and during first-run setup, preserving explicit operator preferences, microphone choices, alternative models, and disabled settings.

Microphone capture starts only after an operator chooses Start listening or invokes the listening action. One accepted song or passage starts following; a different item requires confirmation. Manual navigation, output locks and stop/clear controls retain precedence.

## Screenshots

Set `JLM_CAPTURE_SCREENSHOTS=1` while running the desktop presentation-flow test to capture the first-launch screen, walkthrough, Follow Live explanation, ministry dashboard, local Bible search and independent layouts under `docs/screenshots/`. The test uses an isolated example branch and temporary library; it does not change the operator's existing settings or records.

Validation: production build and the full desktop flow passed; 230 unit tests passed with 10 optional integration tests skipped. The actual packaged Apple Silicon Mac app passed offline first-launch verification. Svelte checking retains the existing 194 errors and 60 warnings.
