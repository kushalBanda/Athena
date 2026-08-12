class Athena < Formula
  desc "Athena AI coding agent CLI"
  homepage "https://github.com/kushalBanda/Athena"
  version "0.1.1"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/kushalBanda/Athena/releases/download/v0.1.1/athena-darwin-arm64.tar.gz"
      sha256 "3fb78b411d442948b92d58c46ad92cf8c66b674c4da7a9d93742ff85971db92c"
    else
      url "https://github.com/kushalBanda/Athena/releases/download/v0.1.1/athena-darwin-x64.tar.gz"
      sha256 "ffe839c39e672df2a19fa16ea9ec41b0c41c7ddaddd9378b7eda8df964d3214b"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/kushalBanda/Athena/releases/download/v0.1.1/athena-linux-arm64.tar.gz"
      sha256 "d5606e53ef58fb2c73e4cb226e7d8daecfeaafa09effa2753c5aaae0d12d53d7"
    else
      url "https://github.com/kushalBanda/Athena/releases/download/v0.1.1/athena-linux-x64.tar.gz"
      sha256 "18347df5fab6eafb8528a8c08bd831eb8265d9e6a056319f5aa9110f44133fa2"
    end
  end

  def install
    bin.install Dir["athena-*"].first => "athena"
  end

  test do
    system "#{bin}/athena", "--help"
  end
end
