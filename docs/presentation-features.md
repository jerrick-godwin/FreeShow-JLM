# Song and Bible presentation features

## Separate layouts

Open Settings → Styles. Use **Song Lyrics layout** and **Bible Verses layout** to select or edit their templates. A template shared by both is copied for Bible use so changing one does not change the other. Existing output appearance is retained during migration.

Select **Song Lyrics background** or **Bible Verses background** to change that content's color or media. **Use shared background** restores the previous output background as the fallback. Output connections and screen dimensions remain common. Existing multi-translation Bible templates are retained.

## Live Bible lookup

Open the Bible drawer. The visible search box accepts a book name, an abbreviation, a reference such as `Psalms 3:4`, a range such as `Psalms 3:4-5`, or words from a verse. Results refresh after a 150 ms typing pause. English, Sinhala, Tamil, custom book names, and Tamil digits are supported for local Bibles.

Book results open the book. Select a verse result to preview it, then use Play to project. Typing never starts projection. Enter/Ctrl+Enter retain the existing Bible keyboard preference for adding a presentation or projecting. In a Bible collection, lookup searches the selected preview translation. Online Bibles retain reference navigation; unavailable verse-text search displays a message suggesting a local Bible.

## Import songbooks and Bibles

Open Import and select **Import Songbook** or **Import Bible**. Bible import is also available in the existing Bible import dialog. Use **Existing app exports** for the original FreeShow, OpenLP/OpenSong, EasyWorship, Bible XML, and other supported conversion options.

Choose PDF, Word (`.doc`/`.docx`), CSV, or text documents. PDF reading and OCR run in a separate background process. Select the OCR languages before choosing files. Scanned pages download their recognition data on first use; cached data is reused offline. Text never needs to be uploaded for OCR. Image-bearing PDF pages are OCR-processed so a selectable header does not conceal scanned verse/lyric content.

Clearly structured items import automatically. OCR pages, suspected columns, uncertain song boundaries, unassigned document text, and unresolved Bible references are shown for review. Edit titles and content before importing; skip items you do not want. The original files are unchanged. Cancel stops background conversion. A failed file does not discard successfully converted files.

For text songbooks, use explicit headings:

```text
# First Song
[Verse]
First verse lyrics

[Chorus]
Chorus lyrics

# Second Song
Second song lyrics
```

CSV songbooks use a header row and columns such as `title,lyrics,author`. Quoted lyrics can contain line breaks and escaped quotes. Additional populated columns are retained as song metadata. Choose column mappings when headers use other names. CSV Bible imports map `book,chapter,verse,text`. Optional `translation`/`version` columns separate versions into different Bibles; consistent `language` and `copyright` columns are retained.

Bible text uses one complete verse per line, for example:

```text
Psalms 3:4 Verse text here
John 3:16 Verse text here
```

Book headings followed by `Chapter 3` and numbered verse lines are also recognized. The built-in English/Sinhala/Tamil alias table uses the existing converters' 66-book numbering. Unknown books or missing references require correction; the importer does not manufacture them. Documents using another canon/book-numbering scheme should use an existing supported Bible export converter.

Existing titles or identical cached song text are flagged as duplicates and skipped. **Import as copy** adds a separate item after review. **Undo this import** removes newly imported items from the current batch and preserves items edited since import. Starting a new batch replaces the batch undo list; normal song history remains available. Bible records use the existing native persistence format, and undo removes their library entries without deleting unrelated source documents.

## Live speech and automatic following

Experimental local speech recognition, song/Bible suggestions, output captions, and confirmed automatic following are now implemented. See [setup and operator controls](live-assistance.md) and [the implementation and feasibility record](live-presentation-assistance-assessment.md). Online discovery opens source searches; reviewed user-provided lyrics can be added and followed.

## Developer verification

- `npm run test:unit`: unit suite, including layout isolation, multilingual lookup, structured document parsing, duplicate/undo behavior, and import-job cancellation.
- `npm run test:document-imports`: builds the Electron code and exercises PDF text, DOCX Unicode, CSV, duplicate filenames, and malformed-file handling in the actual conversion process.
- `node scripts/testDocumentImports.js --ocr`: additionally downloads English/Sinhala/Tamil OCR data into a temporary folder, recognizes a generated scanned page, and repeats with networking blocked. The test removes its temporary files afterward.
- `npm run test:playwright`: desktop startup/presentation checks plus document import, undo, and multilingual Bible lookup, using temporary settings/data folders.
- `npm run build`: production frontend, server, and Electron builds.

Real-world scan quality, speech/singing accuracy, and packaged cross-platform behavior still require representative documents, recordings, and target machines. Generated OCR fixtures validate the processing path rather than the accuracy of arbitrary Sinhala/Tamil scans.

## Validation recorded on 31 October 2026

- Production build: passed for the frontend, all bundled servers, and Electron.
- Initial import/layout unit suite: 195 passed, 10 skipped. The subsequent live-assistance delivery passes 215 tests, with 10 skipped. The existing archive-cleanup timing assertion failed once during concurrent checks; the complete sequential rerun passed.
- Desktop test: passed, covering presentation editing, native songbook/Bible document imports, undo, English/Sinhala/Tamil lookup, rapid query changes, and independent background settings with reset to the shared fallback.
- Conversion process: passed selectable-PDF extraction, DOCX Unicode, multiline CSV, duplicate source names, malformed-file isolation, scanned-PDF OCR, cached offline OCR, and actionable missing-data errors. English/Sinhala/Tamil OCR data was loaded; the generated recognition fixture contains English text.
- Svelte diagnostics: 194 errors and 60 warnings remain, compared with 196 errors and 60 warnings in a pristine source snapshot using the same dependencies. No new diagnostic was introduced.
- Changed source formatting and whitespace were checked separately. The repository-wide formatting command still flags existing files outside this change.

Real Sinhala/Tamil scan accuracy, legacy binary Word files, service-audio recognition, and packaged Windows/Linux/Intel-Mac behavior have not been validated against supplied user samples or target devices. Speech features are experimental; see the live-assistance verification record.
