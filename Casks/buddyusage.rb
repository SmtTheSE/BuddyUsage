cask "buddyusage" do
  arch arm: "arm64", intel: "x64"

  version "0.4.1"
  sha256 arm:   "43987e456306debf1cd102477e791f3b71ee7f666cecc2be12cba146749b900b",
         intel: "aa12a5571ae6996ab4440bbb79c57c24e22aaa8f89543358f35b19877a1d6b9f"

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
