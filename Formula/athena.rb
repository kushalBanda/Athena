class Athena < Formula
  desc "Athena AI coding agent CLI"
  homepage "https://github.com/kushalBanda/Athena"
  version "0.1.2"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/kushalBanda/Athena/releases/download/v0.1.2/athena-darwin-arm64.tar.gz"
      sha256 "aa7b9b7f389eea7daa5f22d3bb21636656b0c8b99dc573908ae5b0d01768af87"
    else
      url "https://github.com/kushalBanda/Athena/releases/download/v0.1.2/athena-darwin-x64.tar.gz"
      sha256 "fcabf79db09b5270a3d9ce111e548cbc59d5ae5509b9da391e6a7da8833761fb"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/kushalBanda/Athena/releases/download/v0.1.2/athena-linux-arm64.tar.gz"
      sha256 "6db0a908c6e9c587daccd642727aa89ca0c96ca6cc2c652af3bad27981d2510c"
    else
      url "https://github.com/kushalBanda/Athena/releases/download/v0.1.2/athena-linux-x64.tar.gz"
      sha256 "ac48deff21c1a92315175e6d4664a93ce66bcc690dd970f0ee8a1ae45f86e3c6"
    end
  end

  def install
    bin.install Dir["athena-*"].first => "athena"
  end

  test do
    system "#{bin}/athena", "--help"
  end
end
