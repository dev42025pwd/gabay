#!/bin/sh
# Sourced by the hooks: gabay_node runs Node 22 (L123, L124), whatever Node the shell has first.
# The default Node on this machine is 24 outside Gabay, so: use `node` when it is 22, else fnm, else
# stop with a message that says what to do. A hook that cannot find Node 22 must not guess.
#
#   gabay_node tools/hooks/pre-commit.js ...

gabay_node() {
  if command -v node >/dev/null 2>&1; then
    major=$(node -p "process.versions.node.split('.')[0]" 2>/dev/null)
    if [ "$major" = "22" ]; then
      node "$@"
      return $?
    fi
  fi
  fnm_bin=$(command -v fnm 2>/dev/null)
  if [ -z "$fnm_bin" ] && [ -n "$LOCALAPPDATA" ] && [ -x "$LOCALAPPDATA/Microsoft/WinGet/Links/fnm.exe" ]; then
    fnm_bin="$LOCALAPPDATA/Microsoft/WinGet/Links/fnm.exe"
  fi
  if [ -n "$fnm_bin" ]; then
    "$fnm_bin" exec --using=22 -- node "$@"
    return $?
  fi
  echo "Gabay hooks need Node 22 and found neither it nor fnm." >&2
  echo "Install fnm (winget install Schniz.fnm), run: fnm install 22 (INSTALL.md A.2), then try again." >&2
  return 127
}
