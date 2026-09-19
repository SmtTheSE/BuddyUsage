cask "buddyusage" do
  arch arm: "arm64", intel: "x64"

  version "0.2.7"
  sha256 arm:   "316f9a61f9f27db79b9aa35d0b96f3821107d2fe46309bc487698a6307748be3",
         intel: "8d2d411bcf331b3ce1aaa79841618f0b8db7471a86f45f11b575d3a8317d1de0"

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
