cask "buddyusage" do
  arch arm: "arm64", intel: "x64"

  version "0.6.2"
  sha256 arm:   "f7d77313639210040772382512bcc875dda5e99d239945edcf82e6e39692c789",
         intel: "9ce7430d96187eadb49a6a9498543aa07b4f418416781410a29ae53d4f06b1b6"

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
