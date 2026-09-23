cask "buddyusage" do
  arch arm: "arm64", intel: "x64"

  version "0.5.0"
  sha256 arm:   "a42111a333be3cd6b0b97ceaf296a1b48298f8f981814650baae2282260b56a3",
         intel: "5648c6b4cdc32354d7e7748db22f9828f9b8e1ba625ad8bf86e19566cd3404bf"

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
