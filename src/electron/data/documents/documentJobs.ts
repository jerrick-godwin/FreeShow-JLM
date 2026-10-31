import { app, utilityProcess, type UtilityProcess } from "electron"
import path from "path"
import fs from "fs"
import { bundledPath } from "../../bundled/resources"
import { uid } from "uid"
import type { DocumentImportJob, ImportLanguage } from "../../../types/DocumentImport"
import { selectFilesDialog } from "../../utils/files"

const jobs = new Map<string, { job: DocumentImportJob; worker?: UtilityProcess }>()
export async function startDocumentImport(languages: ImportLanguage[]): Promise<DocumentImportJob | null> {
    // Bound job lifetimes and prevent competing OCR jobs during a live service.
    for (const entry of jobs.values()) if (entry.job.state === "running") return entry.job
    const files = await selectFilesDialog("", { name: "Songbook or Bible document", extensions: ["pdf", "doc", "docx", "csv", "txt"] })
    if (!files?.length) return null
    for (const [id, entry] of jobs) if (entry.job.state !== "running") jobs.delete(id)
    const job: DocumentImportJob = { id: uid(), state: "running", progress: 0, message: "Starting document import…", documents: [], errors: [] }
    const entry: { job: DocumentImportJob; worker?: UtilityProcess } = { job }
    jobs.set(job.id, entry)
    let worker: UtilityProcess
    try {
        worker = utilityProcess.fork(path.join(__dirname, "documentWorker.js"), [], { serviceName: "Jesus Lives Ministry document conversion" })
    } catch (error) {
        job.state = "failed"
        job.errors.push(`Unable to start document conversion: ${String(error)}`)
        return job
    }
    entry.worker = worker
    worker.on("message", (message) => {
        if (job.state !== "running") return
        if (message.type === "progress") {
            job.message = message.message
            // Page-level progress can restart for each file; the label identifies the active page.
            if (typeof message.progress === "number") job.progress = Math.max(job.progress, message.progress)
        } else if (message.type === "document") job.documents.push(message.document)
        else if (message.type === "error") job.errors.push(message.error)
        else if (message.type === "fatal") {
            job.errors.push(message.error)
            job.state = "failed"
        } else if (message.type === "complete") {
            job.state = "complete"
            job.progress = 1
            job.message = "Conversion complete"
        }
    })
    worker.on("error", (error) => {
        if (job.state === "running") {
            job.state = "failed"
            job.errors.push(String(error))
        }
    })
    worker.on("exit", () => {
        if (job.state === "running") {
            job.state = "failed"
            job.errors.push("Document processing stopped unexpectedly.")
        }
        entry.worker = undefined
    })
    const offlineOCR = bundledPath("ocr")
    const langPath = ["eng", "sin", "tam"].every((language) => fs.existsSync(path.join(offlineOCR, `${language}.traineddata.gz`))) ? offlineOCR : undefined
    worker.postMessage({ langPath, files, languages: languages.filter((language) => ["eng", "sin", "tam"].includes(language)), cachePath: path.join(app.getPath("userData"), "ocr") })
    return job
}
export function documentImportStatus(id: string): DocumentImportJob | null {
    const job = jobs.get(id)?.job
    return job ? { ...job, documents: job.state === "running" ? [] : job.documents } : null
}
export async function cancelDocumentImport(id: string): Promise<boolean> {
    const entry = jobs.get(id)
    if (!entry || entry.job.state !== "running") return false
    entry.job.state = "cancelled"
    entry.job.message = "Import cancelled"
    entry.worker?.kill()
    return true
}
