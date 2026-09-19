cask "buddyusage" do
  arch arm: "arm64", intel: "x64"

  version "0.2.6"
  sha256 arm:   "7009f04ceffad55a5d314d3343741dcb0bd000b4f589a5b7ed12cb8b3db63059",
         intel: "87ae4ace84f68ed2e8995cb6988364e48d54978530e6f899fffed780984c46fe"

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
