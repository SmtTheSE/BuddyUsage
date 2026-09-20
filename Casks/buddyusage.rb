cask "buddyusage" do
  arch arm: "arm64", intel: "x64"

  version "0.3.1"
  sha256 arm:   "816f8c783e4dc0c479ae68f5d2e803e39bd55d563806eb99f734ef841d25b889",
         intel: "ac2f18ffcce899ace0eb32d5f8c1d0556bc9cf0976840b2382c3d1ab03a319a3"

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
