class Athena < Formula
  desc "Athena AI coding agent CLI"
  homepage "https://github.com/kushalBanda/Athena"
  version "0.1.5"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/kushalBanda/Athena/releases/download/v0.1.5/athena-darwin-arm64.tar.gz"
      sha256 "0feb82b46807d968398cd08d0d3befbb61c1032e8bf125cf729a9059024b9f91"
    else
      url "https://github.com/kushalBanda/Athena/releases/download/v0.1.5/athena-darwin-x64.tar.gz"
      sha256 "d73a44664ed5774114969732b3c2b1d981a476772e21860f3a0051743dc622a9"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/kushalBanda/Athena/releases/download/v0.1.5/athena-linux-arm64.tar.gz"
      sha256 "bde0a548d692fd2ff651e1016b6596178e9e877f7afe9894c8ba578f8a0a2ae2"
    else
      url "https://github.com/kushalBanda/Athena/releases/download/v0.1.5/athena-linux-x64.tar.gz"
      sha256 "15113fd647908e7e56c44beb2eb6a4e3ff3097491447df9df60e0169d7a5202f"
    end
  end

  def install
    bin.install Dir["athena-*"].first => "athena"
  end

  test do
    system "#{bin}/athena", "--help"
  end
end
