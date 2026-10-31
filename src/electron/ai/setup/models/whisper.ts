import fs from "fs/promises"
import path from "path"
import { DownloadManager } from "../DownloadManager"
import { WHISPER_FILES, WHISPER_REVISION } from "../../stt/models/whisperFiles"
import { sendToMain } from "../../../IPC/main"
import { ToMain } from "../../../../types/IPC/ToMain"

export class WhisperSetupManager {
    private static downloader = new DownloadManager("whisper", "Multilingual speech recognition")
    private static downloading: Promise<{ ok: boolean }> | null = null
    private static cancelled = false
    private static verified = new Map<string, string>()
    static isPlatformSupported() {
        return ["darwin-arm64", "darwin-x64", "linux-x64", "linux-arm64", "win32-x64", "win32-arm64"].includes(`${process.platform}-${process.arch}`)
    }
    static getBinaryName() {
        return ""
    }
    static async checkIntegrity(directory: string): Promise<"ok" | "missing" | "outdated"> {
        const stats: { file: string; size: number; modified: number }[] = []
        try {
            for (const file of WHISPER_FILES) {
                const stat = await fs.stat(path.join(directory, file.file))
                if (stat.size !== file.size) return "outdated"
                stats.push({ file: file.file, size: stat.size, modified: stat.mtimeMs })
            }
        } catch {
            return "missing"
        }
        const stamp = JSON.stringify({ revision: WHISPER_REVISION, stats })
        if (this.verified.get(directory) === stamp) return "ok"
        for (const file of WHISPER_FILES) if ((await this.downloader.computeSha256(path.join(directory, file.file))) !== file.sha256) return "outdated"
        this.verified.set(directory, stamp)
        return "ok"
    }
    static async downloadEngine(directory: string): Promise<{ ok: boolean }> {
        if (this.downloading) return this.downloading
        this.cancelled = false
        this.downloading = this.download(directory).finally(() => (this.downloading = null))
        return this.downloading
    }
    private static async download(directory: string): Promise<{ ok: boolean }> {
        await fs.mkdir(directory, { recursive: true })
        const total = WHISPER_FILES.reduce((sum, file) => sum + file.size, 0)
        let completed = 0
        try {
            for (const file of WHISPER_FILES) {
                if (this.cancelled) return { ok: false }
                const target = path.join(directory, file.file)
                let valid = false
                try {
                    valid = (await this.downloader.computeSha256(target)) === file.sha256
                } catch {}
                if (!valid) {
                    await this.downloader.downloadFile(`https://huggingface.co/csukuangfj/sherpa-onnx-whisper-small/resolve/${WHISPER_REVISION}/${file.file}`, target, {
                        totalBytes: file.size,
                        onProgress: (bytes) => sendToMain(ToMain.MEDIA_DOWNLOAD_PROGRESS, { url: "whisper", name: "Multilingual speech recognition", progress: completed + bytes, total, status: "downloading" })
                    })
                    if ((await this.downloader.computeSha256(target)) !== file.sha256) {
                        this.downloader.safeUnlink(target)
                        throw new Error(`Checksum mismatch for ${file.file}`)
                    }
                }
                completed += file.size
            }
            if (this.cancelled || (await this.checkIntegrity(directory)) !== "ok") return { ok: false }
            return this.downloader.reportComplete()
        } catch (error) {
            return this.downloader.reportError(this.downloader.isAbortError(error) ? "Model download cancelled." : `Speech model download failed: ${this.downloader.errorMessage(error)}`)
        }
    }
    static cancelEngineDownload() {
        this.cancelled = true
        this.downloader.cancel()
    }
}
