# winget

`winget` manifests live in Microsoft's own repository
(`microsoft/winget-pkgs`), not here, so this folder holds the template and
the one command that submits it.

Submitting a version (needs [wingetcreate](https://github.com/microsoft/winget-create),
and a GitHub account able to open a PR against winget-pkgs):

```powershell
wingetcreate update SmtTheSE.BuddyUsage `
  --version 0.5.1 `
  --urls "https://github.com/SmtTheSE/BuddyUsage/releases/download/v0.5.1/BuddyUsage-x64.exe|x64" `
         "https://github.com/SmtTheSE/BuddyUsage/releases/download/v0.5.1/BuddyUsage-arm64.exe|arm64" `
  --submit
```

The first submission uses `wingetcreate new` with the same URLs and fills
in the identity below; after that, `update` is enough for each release.

| Field | Value |
| --- | --- |
| PackageIdentifier | `SmtTheSE.BuddyUsage` |
| PackageName | BuddyUsage |
| Publisher | SmtTheSE |
| License | MIT |
| ShortDescription | An edge-docked island showing live plan usage for Claude, ChatGPT/Codex, Gemini, Cursor and GitHub Copilot. |
| PackageUrl | https://smtthese.github.io/BuddyUsage/ |
| InstallerType | nullsoft |
| InstallerSwitches.Silent | `/S` |
| Scope | user |

Once accepted, Windows users install with:

```powershell
winget install SmtTheSE.BuddyUsage
```

Note: winget validation prefers signed installers. Unsigned packages are
accepted but flagged; see `docs/DISTRIBUTION.md` for the signing plan.
