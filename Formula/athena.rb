class Athena < Formula
  desc "Athena AI coding agent CLI"
  homepage "https://github.com/kushalBanda/Athena"
  version "0.1.3"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/kushalBanda/Athena/releases/download/v0.1.3/athena-darwin-arm64.tar.gz"
      sha256 "84cfc14430636e57ea489ceeca23ead59be945821cec7ad37e686e4a183673aa"
    else
      url "https://github.com/kushalBanda/Athena/releases/download/v0.1.3/athena-darwin-x64.tar.gz"
      sha256 "dbab547a3fb48a3526482d137680cf637c7b70621a5d2698bc8ea1394479eaa2"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/kushalBanda/Athena/releases/download/v0.1.3/athena-linux-arm64.tar.gz"
      sha256 "e4ebd28c5e37d25c344d7ae13a0e42983c919023833aa946b3f070551a9faa21"
    else
      url "https://github.com/kushalBanda/Athena/releases/download/v0.1.3/athena-linux-x64.tar.gz"
      sha256 "9517b81581640aebb7de4ae5d519047ce12e6aaee76faf6817241f912997b89b"
    end
  end

  def install
    bin.install Dir["athena-*"].first => "athena"
  end

  test do
    system "#{bin}/athena", "--help"
  end
end
