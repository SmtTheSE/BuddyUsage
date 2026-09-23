cask "buddyusage" do
  arch arm: "arm64", intel: "x64"

  version "0.6.3"
  sha256 arm:   "46ccddd1bd7fd9cd20f03e5ee7bc4c5fffb6e2e1a7c81fbfcf605032d004a437",
         intel: "4dc9cc622889565f3c2ee4b00527710fde5c71df5bb895b760b844bdbbc27873"

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
