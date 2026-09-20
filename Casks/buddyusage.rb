cask "buddyusage" do
  arch arm: "arm64", intel: "x64"

  version "0.4.2"
  sha256 arm:   "94ab73af434239b9ed647e084556296a1392a58cec4bde119ebdaa78b5559079",
         intel: "227dc90103dea9d34e556a8a04797463cd601a7c813e7b4acf23dc0d9eeae07e"

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
