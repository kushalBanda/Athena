class Athena < Formula
  desc "Athena AI coding agent CLI"
  homepage "https://github.com/kushalBanda/Athena"
  version "1.0.1"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/kushalBanda/Athena/releases/download/v1.0.1/athena-darwin-arm64.tar.gz"
      sha256 "a7fe308a5896b154baeb76ff4518bc714bf94450d53ab92af0a1005e948e03c1"
    else
      url "https://github.com/kushalBanda/Athena/releases/download/v1.0.1/athena-darwin-x64.tar.gz"
      sha256 "82ef26ebc94d7fde9e8f160142aa9d8493d038085de3996d4dd92fb63235c346"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/kushalBanda/Athena/releases/download/v1.0.1/athena-linux-arm64.tar.gz"
      sha256 "9bd7f2dc58e5aa405dca7b329a20aea3d2175a79abe0e119db195897da651fc6"
    else
      url "https://github.com/kushalBanda/Athena/releases/download/v1.0.1/athena-linux-x64.tar.gz"
      sha256 "c783a603ab953581298983075dea1bf458676be3f54db0a13c3ffc6660ac6bb0"
    end
  end

  def install
    bin.install Dir["athena-*"].first => "athena"
  end

  test do
    system "#{bin}/athena", "--help"
  end
end
