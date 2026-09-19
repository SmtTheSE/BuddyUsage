/**
 * electron-builder afterPack hook.
 *
 * When a real Developer ID certificate is available (CSC_LINK / CSC_NAME),
 * electron-builder signs and notarizes the app itself and this does nothing.
 * Without one, electron-builder skips signing entirely — which leaves the
 * bundle's seal broken after repackaging, and macOS then reports the app as
 * "damaged and can't be opened". Ad-hoc signing here restores a valid seal so
 * users get Apple's ordinary "unverified developer → Open Anyway" flow
 * instead of a dead end.
 */
const { execFileSync } = require('child_process')
const path = require('path')

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  if (process.env.CSC_LINK || process.env.CSC_NAME) return

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  console.log(`  • ad-hoc signing ${path.basename(appPath)} (no Developer ID certificate configured)`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', appPath], {
    stdio: 'inherit'
  })
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' })
}
