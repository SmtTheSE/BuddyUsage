cask "buddyusage" do
  arch arm: "arm64", intel: "x64"

  version "0.4.0"
  sha256 arm:   "9f4cfca8044e8a86585e3560c6d3f78e73fa3950113dc2fefa4e81870a326f66",
         intel: "870993f513d32fe4f624f7877eb4ec37a5144ad0c993245a8e6493cbc041403a"

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
