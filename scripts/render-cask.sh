#!/usr/bin/env bash
# Renders the Homebrew cask for a release.
#   scripts/render-cask.sh 0.2.3 <sha256-arm64-dmg> <sha256-x64-dmg> > Casks/buddyusage.rb
set -euo pipefail

VERSION="$1"
SHA_ARM="$2"
SHA_INTEL="$3"

cat <<EOF
cask "buddyusage" do
  arch arm: "arm64", intel: "x64"

  version "${VERSION}"
  sha256 arm:   "${SHA_ARM}",
         intel: "${SHA_INTEL}"

  url "https://github.com/SmtTheSE/BuddyUsage/releases/download/v#{version}/BuddyUsage-#{arch}.dmg"
  name "BuddyUsage"
  desc "Screen-edge island showing live plan usage for Claude, Codex and Gemini"
  homepage "https://github.com/SmtTheSE/BuddyUsage"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on macos: :ventura

  app "BuddyUsage.app"

  zap trash: "~/Library/Application Support/BuddyUsage"
end
EOF
