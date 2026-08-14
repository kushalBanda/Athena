class Athena < Formula
  desc "Athena AI coding agent CLI"
  homepage "https://github.com/kushalBanda/Athena"
  version "0.1.6"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/kushalBanda/Athena/releases/download/v0.1.6/athena-darwin-arm64.tar.gz"
      sha256 "8a2444d1975ce6cf479c08057df814acfda359db7b140e03150f3af210e6fd65"
    else
      url "https://github.com/kushalBanda/Athena/releases/download/v0.1.6/athena-darwin-x64.tar.gz"
      sha256 "3110ae5d3192db6901846ba83d4c950129194048c88c77f813df83b2d8c706a6"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/kushalBanda/Athena/releases/download/v0.1.6/athena-linux-arm64.tar.gz"
      sha256 "d16e1e4471e72ea6cdf999d2de937b01aab10d25ff8f1ea261a58f6163961768"
    else
      url "https://github.com/kushalBanda/Athena/releases/download/v0.1.6/athena-linux-x64.tar.gz"
      sha256 "60b6e8ffd771f3b2a1668215b057cee1bc1a08c7f3aecd1984b39ec3bc659e3a"
    end
  end

  def install
    bin.install Dir["athena-*"].first => "athena"
  end

  test do
    system "#{bin}/athena", "--help"
  end
end
