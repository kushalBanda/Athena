#!/usr/bin/env bash
# Installs the athena CLI from GitHub Releases.
# Usage: curl -fsSL https://raw.githubusercontent.com/kushalBanda/Athena/main/scripts/install.sh | bash
set -euo pipefail

REPO="kushalBanda/Athena"

os=$(uname -s)
arch=$(uname -m)

case "$os" in
  Darwin) platform="darwin" ;;
  Linux) platform="linux" ;;
  *)
    echo "Unsupported OS: $os. Install manually: https://github.com/$REPO/releases" >&2
    exit 1
    ;;
esac

case "$arch" in
  arm64|aarch64) platform_arch="arm64" ;;
  x86_64|amd64) platform_arch="x64" ;;
  *)
    echo "Unsupported architecture: $arch. Install manually: https://github.com/$REPO/releases" >&2
    exit 1
    ;;
esac

asset="athena-${platform}-${platform_arch}.tar.gz"

install_dir="${ATHENA_INSTALL_DIR:-}"
if [ -z "$install_dir" ]; then
  if [ -n "${XDG_BIN_DIR:-}" ]; then
    install_dir="$XDG_BIN_DIR"
  elif [ -d "$HOME/bin" ]; then
    install_dir="$HOME/bin"
  else
    install_dir="$HOME/.athena/bin"
  fi
fi

mkdir -p "$install_dir"

url="https://github.com/$REPO/releases/latest/download/$asset"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

echo "Downloading $asset..."
curl -fsSL "$url" -o "$tmp/$asset"

tar -xzf "$tmp/$asset" -C "$tmp"
chmod +x "$tmp/athena-${platform}-${platform_arch}"
mv "$tmp/athena-${platform}-${platform_arch}" "$install_dir/athena"

echo "Installed athena to $install_dir/athena"

case ":$PATH:" in
  *":$install_dir:"*) ;;
  *) echo "Add $install_dir to your PATH to run 'athena' directly." ;;
esac
