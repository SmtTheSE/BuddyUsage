cask "buddyusage" do
  arch arm: "arm64", intel: "x64"

  version "0.6.0"
  sha256 arm:   "a16b2e28476bba208c204c6539c59bde7111bb64a485427c10467af40d0987fe",
         intel: "a13ed36f7f8d131a5fecbb6629f6b19cfdd6decc494912afebc02f8720a25c67"

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
