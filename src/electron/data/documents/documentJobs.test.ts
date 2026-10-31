import { beforeEach, expect, it, vi } from "vitest"
import { EventEmitter } from "node:events"

const mocks = vi.hoisted(() => ({ workers: [] as any[], select: vi.fn() }))
vi.mock("electron", () => ({
    app: { getPath: () => "/tmp/freeshow-job-test", getAppPath: () => process.cwd(), isPackaged: false },
    utilityProcess: {
        fork: () => {
            const worker = new EventEmitter()
            Object.assign(worker, { kill: vi.fn(), postMessage: vi.fn() })
            mocks.workers.push(worker)
            return worker
        }
    }
}))
vi.mock("../../utils/files", () => ({ selectFilesDialog: mocks.select }))
import { cancelDocumentImport, documentImportStatus, startDocumentImport } from "./documentJobs"
beforeEach(() => mocks.select.mockResolvedValue(["/tmp/book.pdf"]))
it("reports progress, hides partial contents, and ignores late events after cancellation", async () => {
    const job = await startDocumentImport(["eng", "sin", "tam"])
    const worker = mocks.workers[mocks.workers.length - 1]
    worker.emit("message", { type: "progress", progress: 0.5, message: "Reading page 2" })
    worker.emit("message", { type: "document", document: { name: "Partial", text: "Words" } })
    expect(documentImportStatus(job!.id)).toMatchObject({ progress: 0.5, documents: [] })
    expect(await cancelDocumentImport(job!.id)).toBe(true)
    worker.emit("message", { type: "complete" })
    expect(documentImportStatus(job!.id)?.state).toBe("cancelled")
    expect(worker.kill).toHaveBeenCalledOnce()
    expect(await cancelDocumentImport(job!.id)).toBe(false)
})
it("isolates failed files and returns completed documents", async () => {
    const job = await startDocumentImport(["eng"])
    const worker = mocks.workers[mocks.workers.length - 1]
    worker.emit("message", { type: "error", error: "Bad file" })
    worker.emit("message", { type: "document", document: { name: "Book", text: "Words" } })
    worker.emit("message", { type: "complete" })
    expect(documentImportStatus(job!.id)).toMatchObject({ state: "complete", progress: 1, errors: ["Bad file"], documents: [{ name: "Book" }] })
})
it("handles a dismissed file dialog without starting work", async () => {
    mocks.select.mockResolvedValueOnce([])
    expect(await startDocumentImport(["eng"])).toBeNull()
})
