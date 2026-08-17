#!/usr/bin/env bash
#
# Athena installer.
#
# Downloads the latest (or a pinned) Athena release binary from
# https://github.com/kushalBanda/Athena/releases and installs it to
# ~/.athena/bin/athena.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/kushalBanda/Athena/main/install.sh | sh
#
# Environment overrides:
#   ATHENA_INSTALL_VERSION   Install a specific release tag (e.g. v0.1.6) instead of latest.
#   ATHENA_INSTALL_DIR       Directory to install the binary into (default: ~/.athena/bin).

set -euo pipefail

REPO="kushalBanda/Athena"
INSTALL_DIR="${ATHENA_INSTALL_DIR:-$HOME/.athena/bin}"
VERSION="${ATHENA_INSTALL_VERSION:-}"

log() {
	printf '%s\n' "$*"
}

err() {
	printf 'error: %s\n' "$*" >&2
	exit 1
}

detect_os() {
	case "$(uname -s)" in
	Darwin) echo "darwin" ;;
	Linux) echo "linux" ;;
	*) err "unsupported OS: $(uname -s). Install manually: https://github.com/${REPO}/releases" ;;
	esac
}

detect_arch() {
	case "$(uname -m)" in
	arm64 | aarch64) echo "arm64" ;;
	x86_64 | amd64) echo "x64" ;;
	*) err "unsupported architecture: $(uname -m). Install manually: https://github.com/${REPO}/releases" ;;
	esac
}

resolve_version() {
	if [ -n "$VERSION" ]; then
		echo "$VERSION"
		return
	fi
	local latest
	latest=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name":' | head -1 | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')
	[ -n "$latest" ] || err "could not resolve the latest release. Set ATHENA_INSTALL_VERSION to install a specific version."
	echo "$latest"
}

tmp_dir=""
cleanup() {
	[ -n "$tmp_dir" ] && rm -rf "$tmp_dir"
}
trap cleanup EXIT

main() {
	command -v curl >/dev/null 2>&1 || err "curl is required"
	command -v tar >/dev/null 2>&1 || err "tar is required"

	local os arch version archive url
	os=$(detect_os)
	arch=$(detect_arch)
	version=$(resolve_version)
	archive="athena-${os}-${arch}.tar.gz"
	url="https://github.com/${REPO}/releases/download/${version}/${archive}"

	log "Installing Athena ${version} (${os}/${arch})..."

	tmp_dir=$(mktemp -d)

	curl -fsSL "$url" -o "$tmp_dir/$archive" || err "failed to download $url"
	tar -xzf "$tmp_dir/$archive" -C "$tmp_dir"

	local binary
	binary=$(find "$tmp_dir" -maxdepth 1 -type f -name 'athena-*' | head -1)
	[ -n "$binary" ] || err "downloaded archive did not contain an athena-* binary"

	mkdir -p "$INSTALL_DIR"
	install -m 755 "$binary" "$INSTALL_DIR/athena"

	log "Installed athena to $INSTALL_DIR/athena"

	case ":$PATH:" in
	*":$INSTALL_DIR:"*) ;;
	*)
		log ""
		log "Add $INSTALL_DIR to your PATH:"
		log "  export PATH=\"$INSTALL_DIR:\$PATH\""
		log ""
		log "Add that line to your shell profile (~/.bashrc, ~/.zshrc, etc.) to persist it."
		;;
	esac

	log "Run 'athena --help' to get started."
}

main "$@"
