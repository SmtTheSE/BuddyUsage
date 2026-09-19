cask "buddyusage" do
  arch arm: "arm64", intel: "x64"

  version "0.2.4"
  sha256 arm:   "759ef12fd6d417fe38a104b58986e82247df07129f94f7b1881aa895b844d29c",
         intel: "296844e1528d582def7203bc32c7c1229796e5d90c64a6ed8b826ddd19b48aff"

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
