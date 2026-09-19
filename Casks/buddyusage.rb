cask "buddyusage" do
  arch arm: "arm64", intel: "x64"

  version "0.2.3"
  sha256 arm:   "c806ec7c7a339201b1947e2c5ad81b7caa1affdab1c3cb96a546d3dc8bc8f89f",
         intel: "c6e0109180705c406427a708e4fe0d4eacbb10bf7cfd498ce850bf6dbd287da4"

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
