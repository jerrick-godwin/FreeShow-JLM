// This edition is distributed through ministry administrators. The upstream
// release feed contains a different product without the bundled ministry library.
export async function getUpdateData(currentVersion: string, _includeBeta: boolean) {
    return { latestVersion: currentVersion, changelog: "", hasUpdate: false }
}
export function checkForUpdates(_currentVersion: string) {}
