cask "buddyusage" do
  arch arm: "arm64", intel: "x64"

  version "0.3.3"
  sha256 arm:   "d41c8d24563833881b66e2009db6a52ed92cd84689aa1e144305d78e63172c75",
         intel: "005dbe022820d6d4cfb8bb31febb2c38abd2757c50f311e57a7976d8f5f3ba79"

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
