cask "buddyusage" do
  arch arm: "arm64", intel: "x64"

  version "0.3.4"
  sha256 arm:   "1ec579710c06ed09733e5f148212b90805240256720cc011db14fc9e4a9882e7",
         intel: "5a36c33b264087e1ae4ad0906ca3ba2c5dc26e3607b381b5c38a0e6f23b4e7da"

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
