cask "buddyusage" do
  arch arm: "arm64", intel: "x64"

  version "0.2.5"
  sha256 arm:   "82ac8347a9134343c1aacd50c2bdb14b1c6b3a520cdd84d9d1f6469f107168da",
         intel: "c236fdbb3f6b18c9b87b08234704fae87be39fa47b8900063e70ad86d671fe7b"

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
