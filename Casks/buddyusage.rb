cask "buddyusage" do
  arch arm: "arm64", intel: "x64"

  version "0.2.8"
  sha256 arm:   "afe39573097c9912099276fe3579414b3672f6e2881e3794082e46baa8d5fdb8",
         intel: "0fb467ff594a5a34685d8ae702b8b8ab117da8ec11542d9c43ad802cd08cae84"

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
