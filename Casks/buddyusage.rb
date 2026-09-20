cask "buddyusage" do
  arch arm: "arm64", intel: "x64"

  version "0.4.3"
  sha256 arm:   "b0863f9a0e582ff0209727a88bddfdff573d5e53f91a938a56269999082d0bc4",
         intel: "a33c928e5dc9c6a87ad0aa0deef489af8f6ffaa0aea8a7856520f266154c2b67"

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
