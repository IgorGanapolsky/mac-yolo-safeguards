cask "mac-yolo-safeguards" do
  version "1.1.1"
  sha256 "984800aeb47b36530a6b4534d865bb9d1194004152b64e032758fa1e048c87b8"

  url "https://github.com/IgorGanapolsky/mac-yolo-safeguards/releases/download/v#{version}/MacYoloSafeguards.zip"
  name "Mac YOLO Safeguards"
  desc "Menubar HUD and resource guardrails for AI coding agents"
  homepage "https://github.com/IgorGanapolsky/mac-yolo-safeguards"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on arch: :arm64
  depends_on macos: :sonoma

  app "MacYoloSafeguards.app"

  zap trash: [
    "/tmp/yolo-status.txt",
    "~/.hermes/mac-yolo-*",
    "~/Library/Logs/mac-yolo",
  ]
end
