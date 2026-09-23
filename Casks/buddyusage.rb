cask "buddyusage" do
  arch arm: "arm64", intel: "x64"

  version "0.5.1"
  sha256 arm:   "5a401c634075c4a6e3f0cd9b076d2bf59fd39d1b1f931dcb479aeedc7106e51e",
         intel: "5363727b81041a18325c46159b97613f2b1e08c5f68598bc31d5a38ee3c5dc4d"

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
