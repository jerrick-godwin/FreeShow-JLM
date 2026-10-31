import { extractPageText } from "../../../shared/pdfText"
import fs from "fs/promises"
import path from "path"
import type { ExtractedDocument, ImportLanguage } from "../../../types/DocumentImport"

interface WorkerInput {
    files: string[]
    langPath?: string
    cachePath: string
    languages: ImportLanguage[]
}
let input: WorkerInput
const send = (message: object) => {
    if (process.parentPort) process.parentPort.postMessage(message)
    else process.send?.(message)
}
// Keep native ESM imports intact when the Electron TypeScript build emits CommonJS.
const importESM = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<any>

async function extractPDF(file: string): Promise<{ text: string; warnings: string[] }> {
    const canvas = require("@napi-rs/canvas")
    Object.assign(globalThis, { DOMMatrix: canvas.DOMMatrix, ImageData: canvas.ImageData, Path2D: canvas.Path2D })
    const pdfjs = await importESM("pdfjs-dist/legacy/build/pdf.mjs")
    const document = await pdfjs.getDocument({ data: new Uint8Array(await fs.readFile(file)), useSystemFonts: true }).promise
    const texts: string[] = [],
        warnings: string[] = []
    let ocr: Awaited<ReturnType<typeof import("tesseract.js").createWorker>> | undefined
    try {
        for (let number = 1; number <= document.numPages; number++) {
            send({ type: "progress", message: `${path.basename(file)} — page ${number}/${document.numPages}`, progress: (number - 1) / document.numPages })
            const page = await document.getPage(number)
            const content = await page.getTextContent()
            const items = content.items.filter((item: any) => typeof item.str === "string")
            const extracted = extractPageText(items, page.getViewport({ scale: 1 }).width)
            let text = extracted.text
            if (extracted.columns) warnings.push(`Page ${number} has columns. Review the detected reading order.`)
            // Image-bearing pages may contain both scanned content and a small selectable header.
            const operators = await page.getOperatorList()
            const hasImage = operators.fnArray.some((fn: number) => [pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject, pdfjs.OPS.paintImageXObjectRepeat].includes(fn))
            if (text.trim().length < 40 || hasImage) {
                if (!ocr) {
                    send({ type: "progress", message: input.langPath ? "Preparing bundled offline OCR…" : "Preparing local OCR. Recognition data downloads on first use; later imports work offline." })
                    const { createWorker } = require("tesseract.js") as typeof import("tesseract.js")
                    let rejectInitialization: (error: Error) => void = () => {}
                    const initializationError = new Promise<never>((_resolve, reject) => {
                        rejectInitialization = reject
                    })
                    ocr = await Promise.race([
                        createWorker(input.languages.length ? input.languages : ["eng", "sin", "tam"], 1, {
                            cachePath: input.cachePath,
                            langPath: input.langPath,
                            errorHandler: (error) => rejectInitialization(new Error(input.langPath ? `Bundled OCR language data could not load. Repair the installation and retry. ${String(error)}` : `Local OCR could not load its language data. Connect to download it once, then retry. ${String(error)}`)),
                            logger: (event) => {
                                if (event.status === "downloading language traineddata") send({ type: "progress", message: input.langPath ? "Loading bundled OCR language data…" : "Downloading OCR language data…" })
                            }
                        }),
                        initializationError
                    ])
                }
                const viewport = page.getViewport({ scale: 2.5 })
                const bitmap = canvas.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
                await page.render({ canvasContext: bitmap.getContext("2d"), viewport }).promise
                const recognized = await ocr!.recognize(bitmap.toBuffer("image/png"))
                text = recognized.data.text
                warnings.push(`Page ${number} used OCR (${Math.round(recognized.data.confidence)}% confidence). Review the recognized text.`)
            }
            texts.push(text)
            page.cleanup()
        }
        return { text: texts.join("\n\n"), warnings }
    } finally {
        await ocr?.terminate()
        await document.destroy()
    }
}

async function run() {
    await fs.mkdir(input.cachePath, { recursive: true })
    const names = new Set<string>()
    for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i]
        const extension = path.extname(file).slice(1).toLowerCase()
        const baseName = path.basename(file, path.extname(file))
        let name = baseName,
            suffix = 2
        while (names.has(name)) name = `${baseName} ${suffix++}`
        names.add(name)
        send({ type: "progress", message: `Reading ${path.basename(file)}`, progress: i / input.files.length })
        try {
            let text = "",
                warnings: string[] = []
            if (extension === "pdf") ({ text, warnings } = await extractPDF(file))
            else if (extension === "docx") {
                const mammoth = require("mammoth") as typeof import("mammoth")
                const result = await mammoth.extractRawText({ path: file })
                text = result.value
                warnings = result.messages.map((message) => message.message)
            } else if (extension === "doc") {
                const WordExtractor = require("word-extractor")
                const result = await new WordExtractor().extract(file)
                text = result.getBody()
            } else if (["csv", "txt"].includes(extension)) text = await fs.readFile(file, "utf8")
            else throw new Error(`Unsupported document format: ${extension}`)
            if (!text.trim()) throw new Error("No readable text found.")
            const document: ExtractedDocument = { name, extension, text, warnings }
            send({ type: "document", document })
        } catch (error) {
            send({ type: "error", error: `${path.basename(file)}: ${error instanceof Error ? error.message : String(error)}` })
        }
    }
    send({ type: "complete" })
}
let started = false
function start(data: WorkerInput) {
    if (started) return
    started = true
    input = data
    run()
        .catch((error) => {
            send({ type: "fatal", error: String(error) })
        })
        .finally(() => {
            // Also stop any nested OCR worker left behind by a failed language-data download.
            setTimeout(() => process.exit(0), 50)
        })
}
if (process.parentPort) process.parentPort.on("message", (event) => start(event.data))
else process.on("message", (data) => start(data as WorkerInput))
