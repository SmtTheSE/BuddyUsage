cask "buddyusage" do
  arch arm: "arm64", intel: "x64"

  version "0.3.0"
  sha256 arm:   "4d440fa5ddd577ea0a4da6ff96f5897fd14b43963b2bf8f41c1069027435679b",
         intel: "dfb364f69a3b197db5c33645049e0e9bebfd0de7bad476777b2191aab01e542b"

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
