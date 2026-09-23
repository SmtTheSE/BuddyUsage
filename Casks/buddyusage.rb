cask "buddyusage" do
  arch arm: "arm64", intel: "x64"

  version "0.6.1"
  sha256 arm:   "5b2941cbdd6b67fbade3bfac93f54abfec40dee056f5619c1ca455edf8aa8850",
         intel: "3ad13152112daa0c26e1de7b6219e331ea3622a08fa1c50cdf6f7a2ce3151725"

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
