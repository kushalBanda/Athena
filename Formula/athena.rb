class Athena < Formula
  desc "Athena AI coding agent CLI"
  homepage "https://github.com/kushalBanda/Athena"
  version "1.0.0"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/kushalBanda/Athena/releases/download/v1.0.0/athena-darwin-arm64.tar.gz"
      sha256 "33deea9e58ada9dd055e218308bc6216488c3563d954690e2f2bcb4268a5cb8c"
    else
      url "https://github.com/kushalBanda/Athena/releases/download/v1.0.0/athena-darwin-x64.tar.gz"
      sha256 "2f640d3ab703417de67c418fdf218115be677c3e9db551a4f8795067772d7a73"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/kushalBanda/Athena/releases/download/v1.0.0/athena-linux-arm64.tar.gz"
      sha256 "7755d75d9772c91eb71679a4d713b98ba458f4fb154e753d6ddb74d71fc5ccb6"
    else
      url "https://github.com/kushalBanda/Athena/releases/download/v1.0.0/athena-linux-x64.tar.gz"
      sha256 "1093b4d58154135043a0954871d7f4284103852e7f2cd14add5ce58149ad9e78"
    end
  end

  def install
    bin.install Dir["athena-*"].first => "athena"
  end

  test do
    system "#{bin}/athena", "--help"
  end
end
