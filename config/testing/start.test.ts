import { _electron as electron } from "playwright"
import { expect, test } from "@playwright/test"
import tmp from "tmp"
import fs from "node:fs/promises"
import path from "node:path"

const timeoutMs = 2_000
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

test.beforeEach(async ({ context }) => {
    await context.route("https://api.github.com/repos/ChurchApps/freeshow/releases", (route) => route.abort())
})

test("Launch electron app", async () => {
    const tmpSettingFolder = tmp.dirSync({ unsafeCleanup: true })
    const tmpDataFolder = tmp.dirSync({ unsafeCleanup: true })
    await fs.writeFile(path.join(tmpSettingFolder.name, "config.json"), JSON.stringify({ dataPath: tmpDataFolder.name }))
    const electronApp = await electron.launch({
        // --no-sandbox is required for Electron to launch reliably on Linux CI.
        args: [".", "--no-sandbox", `--user-data-dir=${path.join(tmpSettingFolder.name, "browser")}`],
        env: { ...process.env, NODE_ENV: "production", FS_MOCK_STORE_PATH: tmpSettingFolder.name }
    })

    // Screenshots use bundled/system fonts; external font servers must not stall offline checks.
    await electronApp.context().route(/^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//, (route) => route.abort())

    electronApp.process().stderr?.on("data", (data) => console.log("Electron:", data.toString()))

    // Mocking Electron open dialog
    await electronApp.evaluate(async ({ dialog }, tmpDataFolderName) => {
        dialog.showOpenDialog = async (): Promise<any> => {
            return { canceled: false, filePaths: [tmpDataFolderName] }
        }
    }, tmpDataFolder.name)

    if (!electronApp.windows().length) await electronApp.waitForEvent("window")

    // Seems like we need some delay for FreeShow to start up correctly,
    // before doing anything
    // TODO: would be great if we can identify the loading window and main window
    await delay(5_000)

    const appPath = await electronApp.evaluate(async ({ app }) => {
        // This runs in the main Electron process, parameter here is always
        // the result of the require('electron') in the main app script.
        return app.getAppPath()
    })
    console.log(appPath)

    // The app opens a small loading/splash window first, then the main window.
    // firstWindow() can return the splash, so explicitly pick the main window (it loads index.html).
    let window = electronApp.windows().find((w) => w.url().includes("index.html"))
    for (let i = 0; i < 20 && !window; i++) {
        await delay(500)
        window = electronApp.windows().find((w) => w.url().includes("index.html"))
    }
    if (!window) window = await electronApp.firstWindow()

    const capture = async (name: string) => {
        if (process.env.JLM_CAPTURE_SCREENSHOTS !== "1") return
        await fs.mkdir("docs/screenshots", { recursive: true })
        await window!.screenshot({ path: `docs/screenshots/${name}.png` })
    }
    if (process.env.JLM_CAPTURE_SCREENSHOTS === "1") await window.setViewportSize({ width: 1440, height: 960 })

    // Direct Electron console to Node terminal.
    window.on("console", console.log)
    try {
        // Print the title.
        console.log(await window.title())

        // Capture a screenshot.
        // await window.screenshot({ path: "intro.png" })

        // Wait for the app UI to be interactive: either the first-run setup popup or the main top bar.
        await window
            .locator(".popup button.start, .top")
            .first()
            .waitFor({ timeout: 10 * timeoutMs })

        // First-run setup popup (Initialize.svelte) — only shown when the app isn't initialized yet.
        // It can be absent if a previous run already initialized the user data, so guard it.
        const setupStart = window.locator(".popup button.start")
        let didSetup = false
        if ((await setupStart.count()) > 0) {
            const setupPopup = window.locator(".popup")

            // Set language to English (it is the default, but select it explicitly so the English text selectors below stay stable)
            await setupPopup
                .locator(".dropdown-trigger")
                .first()
                .click({ timeout: 5 * timeoutMs })
            await setupPopup.locator("li[role=option]").filter({ hasText: "English" }).first().click({ timeout: timeoutMs })

            // Set the data location via the folder picker; this triggers the Electron open dialog, mocked above
            await setupPopup.locator(".button-trigger").first().click({ timeout: timeoutMs })

            await expect(setupStart).toBeDisabled()
            await window.locator("#setup-branch-name").fill("Colombo")

            await capture("01-first-launch")

            // Finish setup ("Get started!")
            await setupStart.click({ timeout: timeoutMs })
            didSetup = true
        }

        const walkthrough = window.getByTestId("ministry-walkthrough")
        if (didSetup) {
            await expect(walkthrough).toBeVisible()
            await expect(walkthrough).toContainText("All new feature controls are enabled by default")
            await capture("02-walkthrough")
            for (let step = 0; step < 6; step++) {
                await walkthrough.getByRole("button", { name: "Next", exact: true }).click()
                if (step === 4) await capture("03-follow-live-walkthrough")
            }
            await expect(walkthrough).toContainText("Step 7 of 7")
            await walkthrough.getByRole("button", { name: "Start presenting", exact: true }).click()
            await expect(walkthrough).toHaveCount(0)
        } else if (await walkthrough.count()) await walkthrough.getByRole("button", { name: "Skip walkthrough", exact: true }).click()

        const ministryBrand = window.getByTestId("ministry-brand")
        await expect(ministryBrand).toContainText("Jesus Lives Evangelical International Ministry")
        if (didSetup) await expect(ministryBrand).toContainText("Colombo Branch")
        await expect(ministryBrand.locator("img")).toBeVisible()
        expect(await ministryBrand.locator("img").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
        expect(await window.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--secondary").trim().toUpperCase())).toBe("#FFC805")

        await capture("04-ministry-dashboard")

        // Fresh setup installs the complete local bundle, without importing or downloading.
        await expect.poll(async () => (await fs.readdir(path.join(tmpDataFolder.name, "Shows")).catch(() => [])).filter((file) => file.endsWith(".show")).length, { timeout: 30000 }).toBeGreaterThanOrEqual(935)
        const bundledShows = (await fs.readdir(path.join(tmpDataFolder.name, "Shows"))).filter((file) => file.endsWith(".show"))
        expect(bundledShows.length).toBeGreaterThanOrEqual(935)
        expect((await fs.readdir(path.join(tmpDataFolder.name, "Bibles"))).filter((file) => file.endsWith(".fsb"))).toHaveLength(3)
        const speechStatus: any = await window.evaluate(
            () =>
                new Promise((resolve) => {
                    const id = "bundled-speech-status"
                    const api = (window as any).api
                    api.receive(
                        "MAIN",
                        (message: any, listener: string) => {
                            if (listener === id) {
                                api.removeListener("MAIN", id)
                                resolve(message.data)
                            }
                        },
                        id
                    )
                    api.send("MAIN", { channel: "AI_GET_STATUS", data: { engineId: "whisper" } }, id)
                })
        )
        expect(speechStatus.whisper.ready).toBe(true)
        expect(speechStatus.whisper.localPath).toContain(path.join("resources", "bundled", "models", "whisper"))
        await window.locator(".drawer button#scripture").click()
        const offlineSearch = window.getByPlaceholder("Book, reference, or verse words…")
        await expect(offlineSearch).toBeVisible()
        await offlineSearch.fill("Psalms 3:4")
        await expect(window.locator(".verseList .verse").first()).toContainText("I cry to the LORD")
        await capture("05-bible-search")
        await offlineSearch.fill("")
        await offlineSearch.blur()
        await window.locator(".drawer button#shows").click()

        // Create a new project, then try creating a new show under the project
        await window.getByText("New project").first().click({ timeout: timeoutMs })
        await window.getByText("New show").first().click({ timeout: timeoutMs })

        // Expect the create-show popup to be visible (the name input is part of it)
        await expect(window.locator("#name")).toBeVisible({ timeout: timeoutMs })

        // Fill name of show
        await window.locator("#name").fill("New Test Show", { timeout: timeoutMs })

        // Select category (this will sometimes not have any categories)
        // await window.getByText("—").click()
        // await window.locator("#id_categorysong").click()

        // Put lyrics
        await window.getByText("Quick Lyrics").click({ timeout: timeoutMs })
        let lyricsBox = window.getByPlaceholder("[Verse]")
        await lyricsBox.focus()
        await lyricsBox.fill(`[Verse]\ntest line 1\ntest line 2\n\n[Chorus]\ntest line 3\ntest line 4`, { timeout: timeoutMs })

        // Click new show
        await window.getByTestId("create.show.popup.new.show").click({ timeout: timeoutMs })

        // Try changing group for Chorus (group names render as text in the #group list)
        await window.locator("#group").getByText("Chorus").first().click({ timeout: timeoutMs })
        //await window.getByText("Change group").hover({ timeout: timeoutMs })
        await window
            .locator("#group")
            .getByText("Verse")
            .first()
            .click({ timeout: 5 * timeoutMs })

        // Verify the group changing was successful
        await expect(window.locator("#group").getByText("Verse").first()).toBeVisible({ timeout: timeoutMs })

        // Exercise document conversion through the real Electron utility process and renderer.
        const songsCSV = path.join(tmpDataFolder.name, "E2E Songs.csv")
        await fs.writeFile(songsCSV, 'title,lyrics\n"E2E Imported Song","First imported lyric\nSecond imported lyric"')
        await electronApp.evaluate(({ dialog }, file) => {
            dialog.showOpenDialog = async (): Promise<any> => ({ canceled: false, filePaths: [file] })
        }, songsCSV)
        await window.keyboard.press("Escape")
        await window.keyboard.press("Control+i")
        await window.getByRole("button", { name: "Import Songbook", exact: true }).click()
        const importer = window.locator(".document-import")
        await importer.getByRole("button", { name: "Choose files", exact: true }).click()
        await expect(importer.getByRole("status")).toContainText("Imported: 1", { timeout: 30_000 })
        await importer.getByRole("button", { name: "Undo this import", exact: true }).click()
        await expect(importer.getByRole("status").first()).toContainText("Imported: 0")
        await expect(importer.getByText("Removed 1 imported item.")).toBeVisible()
        await expect(window.locator(".drawer").getByText("E2E Imported Song", { exact: true })).toHaveCount(0)

        const bibleCSV = path.join(tmpDataFolder.name, "E2E Bible.csv")
        await fs.writeFile(bibleCSV, 'book,chapter,verse,text\nPsalms,3,4,"I cried unto the Lord தமிழ் வசனம் සිංහල වචනය"')
        await electronApp.evaluate(({ dialog }, file) => {
            dialog.showOpenDialog = async (): Promise<any> => ({ canceled: false, filePaths: [file] })
        }, bibleCSV)
        await importer.getByRole("button", { name: "Done", exact: true }).click()
        await window.keyboard.press("Control+i")
        await window.getByRole("button", { name: "Import Bible", exact: true }).click()
        await importer.getByRole("button", { name: "Choose files", exact: true }).click()
        await expect(importer.getByRole("status")).toContainText("Imported: 1", { timeout: 30_000 })
        await importer.getByRole("button", { name: "Done", exact: true }).click()
        await window.locator(".drawer button#scripture").click()
        await window.locator(".drawer").getByText("E2E Bible", { exact: true }).click()
        const bibleSearch = window.getByPlaceholder("Book, reference, or verse words…")
        await expect(bibleSearch).toBeVisible()
        for (const query of ["Psalms 3:4", "தமிழ்", "සිංහල"]) {
            await bibleSearch.fill(query)
            await expect(window.locator(".verseList .verse").first()).toContainText("I cried unto the Lord")
            await expect(bibleSearch).toHaveValue(query)
        }
        await bibleSearch.fill("Psalms 3:4")
        await bibleSearch.fill("missing phrase")
        await expect(window.locator(".verseList .verse")).toHaveCount(0)
        await bibleSearch.fill("")

        // The two background controls retain independent values through normal settings edits.
        await bibleSearch.blur()
        await window.keyboard.press("5")
        await window.getByRole("button", { name: "Styles", exact: true }).click()
        await expect(window.getByText("Song Lyrics layout", { exact: true })).toBeVisible()
        await expect(window.getByText("Bible Verses layout", { exact: true })).toBeVisible()
        const colorControl = window.getByTestId("content-background-color")
        await window.getByRole("button", { name: "Song Lyrics background", exact: true }).click()
        await colorControl.locator(".color-display").click()
        await colorControl.locator('[data-value="#FF4136"]').click()
        await expect(colorControl.locator(".color-display")).toHaveCSS("background-color", "rgb(255, 65, 54)")
        await window.getByRole("button", { name: "Bible Verses background", exact: true }).click()
        await expect(colorControl.locator(".color-display")).not.toHaveCSS("background-color", "rgb(255, 65, 54)")
        await colorControl.locator(".color-display").click()
        await colorControl.locator('[data-value="#0074D9"]').click()
        await window.getByRole("button", { name: "Song Lyrics background", exact: true }).click()
        await expect(colorControl.locator(".color-display")).toHaveCSS("background-color", "rgb(255, 65, 54)")
        await window.getByRole("button", { name: "Use shared background", exact: true }).click()
        await expect(colorControl.locator(".color-display")).not.toHaveCSS("background-color", "rgb(255, 65, 54)")
        await window.getByRole("button", { name: "Bible Verses background", exact: true }).click()
        await expect(colorControl.locator(".color-display")).toHaveCSS("background-color", "rgb(0, 116, 217)")

        await capture("06-independent-layouts")
        await window.getByRole("button", { name: "General", exact: true }).click()
        await window.locator("#settings-branch-name").fill("Kandy")
        await expect(ministryBrand).toContainText("Kandy Branch")
        await window.locator("#settings-branch-name").blur()

        // Exercise real renderer IPC, local suggestions, captions, and confirmation without opening a microphone.
        const mainBrowserWindow = await electronApp.browserWindow(window)
        const message = async (channel: string, data: any) => mainBrowserWindow.evaluate((win, payload) => win.webContents.send("MAIN", payload), { channel, data })
        await electronApp.evaluate(({ ipcMain }) => {
            ;(globalThis as any).__liveOutputs = {}
            ipcMain.on("OUTPUT", (_event, message) => {
                if (message.channel === "OUTPUTS") (globalThis as any).__liveOutputs = message.data
            })
        })
        await message("SYNCED_SETTINGS", {
            outputs: { liveTest: { enabled: true, active: true, name: "Live test", screen: null, invisible: true, color: "#ffffff", bounds: { x: 0, y: 0, width: 1280, height: 720 } } },
            ai: { enabled: true, stt: {}, live: { enabled: true, captions: true, outputIds: ["liveTest"], captionOutputIds: ["liveTest"] } }
        })
        const live = window.getByTestId("live-assistance")
        await expect(live).toBeVisible()
        await delay(300)
        await message("AI_STATUS", { state: "listening", sessionId: "e2e-live" })
        let segmentId = 0
        const transcript = (text: string, interim = false, sessionId = "e2e-live") => message("AI_TRANSCRIPT", { sessionId, id: String(++segmentId), revision: 1, text, interim, startMs: 0, endMs: 1000 })
        const slideIndex = () => electronApp.evaluate(() => (globalThis as any).__liveOutputs.liveTest?.out?.slide?.index ?? null)
        await transcript("Let us sing New Test Show")
        const follow = live.getByRole("button", { name: "Follow New Test Show", exact: true })
        await expect(follow).toBeVisible()
        expect(await slideIndex()).toBe(null)
        await expect(live.getByTestId("caption-preview")).toContainText("Let us sing")
        await follow.click()
        await expect(live.getByTestId("follow-session")).toContainText("Following live")
        await expect.poll(slideIndex).toBe(0)
        await expect.poll(() => electronApp.evaluate(() => (globalThis as any).__liveOutputs.liveTest?.out?.caption?.text || "")).toContain("Let us sing")
        await transcript("test line 3 test line 4", true)
        expect(await slideIndex()).toBe(0)
        await transcript("test line 3 test line 4")
        await expect.poll(slideIndex).toBe(1)
        await live.getByRole("button", { name: "Pause following", exact: true }).click()
        await transcript("test line 1 test line 2")
        expect(await slideIndex()).toBe(1)
        await expect(live.getByTestId("follow-session")).toContainText("Paused")
        await live.getByRole("button", { name: "Stop following", exact: true }).click()
        await expect(live.getByTestId("follow-session")).toHaveCount(0)
        await transcript("Amazing grace how sweet the Sound")
        const bundledSong = live.getByRole("button", { name: "Follow 315 Song — Amazing grace how sweet the Sound", exact: true })
        await expect(bundledSong).toBeVisible({ timeout: 30000 })
        await bundledSong.click()
        await expect(live.getByTestId("follow-session")).toContainText("315 Song")
        await expect.poll(() => electronApp.evaluate(() => (globalThis as any).__liveOutputs.liveTest?.out?.slide?.id)).toBe("jl-bundled-9799e2b98465d2d6a9ad")
        await live.getByRole("button", { name: "Stop following", exact: true }).click()
        await transcript("Psalms chapter three verse four")
        const followBible = live.getByRole("button", { name: /^Follow Psalms 3/ })
        await expect(followBible).toBeVisible()
        await followBible.click()
        await expect.poll(() => electronApp.evaluate(() => JSON.stringify((globalThis as any).__liveOutputs.liveTest?.out?.slide?.tempItems || []))).toContain("I cried unto the Lord")
        await live.getByRole("button", { name: "Stop following", exact: true }).click()
        await message("SETTINGS", { outLocked: true })
        await expect(live.getByRole("button", { name: "Captions off", exact: true })).toBeVisible()
        await transcript("These captions must stay off", true)
        await expect(live.getByTestId("caption-preview")).toHaveCount(0)
        await message("SETTINGS", { outLocked: false })
        await message("AI_STATUS", { state: "stopped" })
        await transcript("This is a stale transcript", true)
        await expect(live.getByTestId("caption-preview")).toHaveCount(0)

        // Manual save via keyboard shortcut (Ctrl+S) — robust across menu changes; the app also auto-saves
        await window.keyboard.press("Escape")
        await window.keyboard.press("Control+s")
        await delay(5_000)
        const savedSettings = JSON.parse(await fs.readFile(path.join(tmpSettingFolder.name, "settings.json"), "utf8"))
        expect(savedSettings.special.branchName).toBe("Kandy")
        await window.screenshot({ path: "test-output/screenshots/ministry-branding.png" })
    } catch (ex) {
        console.log(ex)
        console.log("Taking screenshot")
        await window.screenshot({ path: "test-output/screenshots/failed.png" })
        await Promise.race([electronApp.close(), delay(5000)]).catch(() => {})
        if (electronApp.process().pid) electronApp.process().kill("SIGKILL")
        tmpDataFolder.removeCallback()
        tmpSettingFolder.removeCallback()
        throw ex
    }

    // Close after finishing
    console.log("Closing app...")
    // Race shutdown with a timeout to avoid hanging CI on Linux.
    const electronProcess = electronApp.process()
    await Promise.race([electronApp.close(), delay(5_000)]).catch(() => {})
    try {
        if (electronProcess?.pid && !electronProcess.killed) electronProcess.kill("SIGKILL")
    } catch {
        // already exited
    }
    await delay(1_000)
    console.log("App closed!")

    tmpDataFolder.removeCallback()
    tmpSettingFolder.removeCallback()
    console.log("DONE!")
})
