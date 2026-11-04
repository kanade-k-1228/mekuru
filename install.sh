#!/usr/bin/env bash
set -euo pipefail

# Keep the installation version aligned with package.json's packageManager.
BUN_VERSION=1.4.4
MIN_BUN_VERSION=1.4
temp_dir=

log() { printf '%s\n' "$*"; }
fail() { printf 'error: %s\n' "$*" >&2; exit 1; }
cleanup() { if [[ -n "$temp_dir" ]]; then rm -rf -- "$temp_dir"; fi; }

check_bun() {
  local version major minor min_major=${MIN_BUN_VERSION%.*} min_minor=${MIN_BUN_VERSION#*.}
  version=$("$bun_cmd" --version) || fail "Cannot run $bun_cmd. Repair the existing Bun installation."
  [[ "$version" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]] || fail "Cannot verify Bun version '$version'; install stable Bun >= $MIN_BUN_VERSION."
  major=$((10#${BASH_REMATCH[1]}))
  minor=$((10#${BASH_REMATCH[2]}))
  (( major > min_major || (major == min_major && minor >= min_minor) )) || fail "Bun $version is too old; need >= $MIN_BUN_VERSION. Update Bun with its original installer or package manager, then rerun."
  log "Bun $version ($bun_cmd)"
}

check_ffmpeg() {
  local version encoders
  version=$("$ffmpeg_cmd" -version) || fail "Cannot run $ffmpeg_cmd. Repair it or set MEKURU_FFMPEG."
  encoders=$("$ffmpeg_cmd" -hide_banner -encoders 2>&1) || fail "Cannot inspect encoders in $ffmpeg_cmd."
  [[ "$encoders" =~ (^|[[:space:]])libx264([[:space:]]|$) ]] || fail "$ffmpeg_cmd has no libx264 encoder. Install an ffmpeg build with libx264, or set MEKURU_FFMPEG / MEKURU_FFPROBE."
  log "${version%%$'\n'*} ($ffmpeg_cmd)"
  log 'libx264: available'
}

check_ffprobe() {
  local probe
  probe=$("$ffprobe_cmd" -version) || fail "Cannot run $ffprobe_cmd. Repair it or set MEKURU_FFPROBE."
  log "${probe%%$'\n'*} ($ffprobe_cmd)"
}

install_packages() {
  (( $# > 0 )) || return 0
  case "$os" in
    Linux)
      command -v apt-get >/dev/null 2>&1 || fail "Automatic installation supports Debian/Ubuntu (including WSL). Install these packages manually and rerun: $*"
      local elevate=()
      if [[ "$(id -u)" != 0 ]]; then
        command -v sudo >/dev/null 2>&1 || fail "Install these packages as an administrator and rerun: $*"
        elevate=(sudo)
      fi
      log "Installing system packages: $*"
      "${elevate[@]}" apt-get update
      "${elevate[@]}" apt-get install -y "$@"
      ;;
    Darwin)
      command -v brew >/dev/null 2>&1 || fail "Install Homebrew from https://brew.sh, then rerun to install: $*"
      log "Installing Homebrew packages: $*"
      brew install "$@"
      ;;
  esac
}

main() {
  case "${1:-}" in
    '') ;;
    --help|-h)
      log 'Usage: bash install.sh'
      log "Prepare Bun >= $MIN_BUN_VERSION and ffmpeg/ffprobe with libx264 for Mekuru."
      log 'Missing tools: install on Debian/Ubuntu/WSL or macOS with Homebrew.'
      log 'Existing incompatible tools: report the problem without replacing them.'
      return ;;
    *) fail "Unknown option: $1 (use --help)" ;;
  esac
  (( $# == 0 )) || fail 'Unexpected arguments (use --help).'
  os=$(uname -s)
  case "$os" in
    Linux|Darwin) ;;
    MINGW*|MSYS*|CYGWIN*) fail 'Run this installer inside WSL on Windows.' ;;
    *) fail "Unsupported operating system: $os" ;;
  esac

  bun_cmd=$(command -v bun || true)
  local bun_dir="${BUN_INSTALL:-$HOME/.bun}"
  if [[ -z "$bun_cmd" && -x "$bun_dir/bin/bun" ]]; then bun_cmd="$bun_dir/bin/bun"; fi
  ffmpeg_cmd=${MEKURU_FFMPEG:-ffmpeg}
  ffprobe_cmd=${MEKURU_FFPROBE:-ffprobe}
  local need_ffmpeg=false packages=()

  # Inspect existing installations before making any changes.
  if [[ -n "$bun_cmd" ]]; then check_bun; fi
  if ! command -v "$ffmpeg_cmd" >/dev/null 2>&1; then
    [[ -z "${MEKURU_FFMPEG:-}" ]] || fail "MEKURU_FFMPEG points to a missing command: $ffmpeg_cmd"
    need_ffmpeg=true
  else
    check_ffmpeg
  fi
  if ! command -v "$ffprobe_cmd" >/dev/null 2>&1; then
    [[ -z "${MEKURU_FFPROBE:-}" ]] || fail "MEKURU_FFPROBE points to a missing command: $ffprobe_cmd"
    need_ffmpeg=true
  else
    check_ffprobe
  fi
  if [[ -z "$bun_cmd" ]]; then
    command -v curl >/dev/null 2>&1 || packages+=(curl)
    command -v unzip >/dev/null 2>&1 || packages+=(unzip)
  fi
  if [[ "$need_ffmpeg" == true ]]; then packages+=(ffmpeg); fi
  # Bash 3.2 (macOS) treats an empty array as unset under nounset.
  if (( ${#packages[@]} > 0 )); then install_packages "${packages[@]}"; fi
  if [[ -z "$bun_cmd" ]]; then
    log "Installing Bun $BUN_VERSION using the official installer."
    temp_dir=$(mktemp -d)
    trap cleanup EXIT
    curl --fail --silent --show-error --location https://bun.com/install --output "$temp_dir/bun-install.sh"
    BUN_INSTALL="$bun_dir" bash "$temp_dir/bun-install.sh" "bun-v$BUN_VERSION"
    bun_cmd="$bun_dir/bin/bun"
    check_bun
  fi
  if [[ "$need_ffmpeg" == true ]]; then check_ffmpeg; check_ffprobe; fi
  log 'Mekuru dependencies are ready.'
  if ! command -v bun >/dev/null 2>&1; then
    printf 'Open a new terminal, or add Bun to PATH: export PATH=%q:"$PATH"\n' "$bun_dir/bin"
  fi
  log 'Next: bun create @mekuru my-video'
  log 'Then: cd my-video && bun install && bun preview'
  log 'Also prepare a speech engine and fonts (default: Noto Sans; Noto Sans CJK for Chinese, Japanese or Korean).'
}

main "$@"
