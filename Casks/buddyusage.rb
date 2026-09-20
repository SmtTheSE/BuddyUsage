cask "buddyusage" do
  arch arm: "arm64", intel: "x64"

  version "0.3.2"
  sha256 arm:   "068f390ed6cae9f3576d6eb58205b421432f0847f055bdf1716bdaf105c0890d",
         intel: "99c0dffda2fbb822ae132f785160a06a66e82f21cfb6e6b733b2ba85a284c11f"

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
