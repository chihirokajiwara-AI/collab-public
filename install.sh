#!/bin/bash
set -euo pipefail

REPO="collaborator-ai/collab-public"
INSTALL_DIR="/Applications"
TMP_DIR=$(mktemp -d)

cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

echo "Fetching latest release..."
ZIP_URL=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
  | grep -o '"browser_download_url": *"[^"]*arm64-mac\.zip"' \
  | head -1 \
  | cut -d'"' -f4)

if [ -z "$ZIP_URL" ]; then
  echo "Error: could not find a macOS ARM64 zip in the latest release." >&2
  exit 1
fi

echo "Downloading $(basename "$ZIP_URL")..."
curl -fSL --progress-bar "$ZIP_URL" -o "$TMP_DIR/Collaborator.zip"

echo "Installing to ${INSTALL_DIR}..."
ditto -xk "$TMP_DIR/Collaborator.zip" "$INSTALL_DIR"

echo "Done. Opening Collaborator..."
open "$INSTALL_DIR/Collaborator.app"
