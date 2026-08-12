class Athena < Formula
  desc "Athena AI coding agent CLI"
  homepage "https://github.com/kushalBanda/Athena"
  version "0.1.4"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/kushalBanda/Athena/releases/download/v0.1.4/athena-darwin-arm64.tar.gz"
      sha256 "46acb0a3036f829d8824fc9b68dbbb065057069e285b1259b65236bb86aab730"
    else
      url "https://github.com/kushalBanda/Athena/releases/download/v0.1.4/athena-darwin-x64.tar.gz"
      sha256 "ae6036cc2296dc07d1065af813a28d5207633a6fda105a5fec59ff637526c4b7"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/kushalBanda/Athena/releases/download/v0.1.4/athena-linux-arm64.tar.gz"
      sha256 "faa586e6de1326fac27f4ba9cf48efd33ed5e9b7a6e14ba5e2ed0770098cffd6"
    else
      url "https://github.com/kushalBanda/Athena/releases/download/v0.1.4/athena-linux-x64.tar.gz"
      sha256 "23c5dde6b103ac10b6b80f52c5a1afccba059bd71ef2e388810321039876d062"
    end
  end

  def install
    bin.install Dir["athena-*"].first => "athena"
  end

  test do
    system "#{bin}/athena", "--help"
  end
end
