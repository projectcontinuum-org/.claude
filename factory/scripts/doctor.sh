#!/usr/bin/env bash
# Checks what this machine can do for the Continuum software factory and writes the environment profile
# .factory/environment.md (workspace root). Every factory agent reads that profile before working.
# Read-only: installs nothing, starts nothing. Safe to re-run at any time (bash 3.2 compatible).
#
#   .claude/factory/scripts/doctor.sh            # print + write .factory/environment.md
#   .claude/factory/scripts/doctor.sh --quiet    # write only
set -uo pipefail

FACTORY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE_ROOT="$(cd "$FACTORY_DIR/../.." && pwd)"
OUT_DIR="$WORKSPACE_ROOT/.factory"
OUT="$OUT_DIR/environment.md"
POLICY="$FACTORY_DIR/local-policy.md"
mkdir -p "$OUT_DIR"

rows=""
missing=""
row() { rows="$rows| $1 | $2 | $3 |"$'\n'; }
need() { missing="$missing- $1"$'\n'; }
have() { command -v "$1" >/dev/null 2>&1; }
http_code() {
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time "${2:-6}" "$1" 2>/dev/null)"
  echo "${code:0:3}" | grep -E '^[0-9]{3}$' || echo 000
}

os="$(uname -s)"; arch="$(uname -m)"

# --- core tools ---------------------------------------------------------------------------------------------
if have git; then row git "$(git --version | awk '{print $3}')" ok; else row git - MISSING; need "git"; fi
if git lfs version >/dev/null 2>&1; then row git-lfs "$(git lfs version | awk '{print $1}' | cut -d/ -f2)" ok
else row git-lfs - MISSING; need "git-lfs (api-server DuckDB extensions are LFS objects)"; fi

java_version=""
if have java; then
  java_version="$(java -version 2>&1 | head -1 | sed -E 's/.*version "([0-9]+).*/\1/')"
  if [[ "$java_version" -ge 21 ]] 2>/dev/null; then row "java (JDK 21+)" "$java_version" ok
  else row "java (JDK 21+)" "$java_version" "TOO OLD"; need "JDK 21 (Temurin)"; fi
else row "java (JDK 21+)" - MISSING; need "JDK 21 (Temurin)"; fi

node_major=""
if have node; then
  node_major="$(node -p 'process.versions.node.split(".")[0]')"
  if [[ "$node_major" -ge 20 ]]; then row "node (20+)" "$(node -v)" ok; else row "node (20+)" "$(node -v)" "TOO OLD"; need "Node.js 20+"; fi
else row "node (20+)" - MISSING; need "Node.js 20+"; fi
if have yarn; then row "yarn (1.22.x)" "$(yarn -v 2>/dev/null)" ok
elif have corepack; then row "yarn (1.22.x)" "via corepack" "ok (corepack enable)"
else row "yarn (1.22.x)" - MISSING; need "yarn 1.22 (corepack enable)"; fi

docker_state="MISSING"
if have docker; then
  if docker info >/dev/null 2>&1; then docker_state="ok (daemon running)"; else docker_state="INSTALLED, DAEMON NOT RUNNING"; fi
  row docker "$(docker --version 2>/dev/null | awk '{print $3}' | tr -d ,)" "$docker_state"
else row docker - MISSING; need "Docker + Compose v2"; fi
if have k6; then row k6 "$(k6 version 2>/dev/null | awk '{print $2}')" ok; else row k6 - MISSING; need "k6 (backend system tests)"; fi
if have openapi-generator; then row openapi-generator "$(openapi-generator version 2>/dev/null)" ok
else row openapi-generator - "missing (only for regenerating workbench API clients)"; fi

# --- browser automation -------------------------------------------------------------------------------------
find_pkg() { # $1 = package name; prints first directory found
  local p
  for p in "$OUT_DIR/tools/node_modules/$1" \
           "$(npm root -g 2>/dev/null)/$1"; do
    [[ -d "$p" ]] && { echo "$p"; return; }
  done
  find "$HOME/.npm/_npx" -maxdepth 3 -type d -name "$1" -path '*node_modules*' 2>/dev/null | head -1
}
puppeteer_dir="$(find_pkg puppeteer)"
playwright_dir="$(find_pkg playwright)"
[[ -n "$puppeteer_dir" ]] && row puppeteer "$(node -p "require('$puppeteer_dir/package.json').version" 2>/dev/null)" "ok — $puppeteer_dir" \
                          || row puppeteer - missing
[[ -n "$playwright_dir" ]] && row playwright "$(node -p "require('$playwright_dir/package.json').version" 2>/dev/null)" "ok — $playwright_dir" \
                           || row playwright - missing
[[ -z "$puppeteer_dir$playwright_dir" ]] && need "a browser driver: puppeteer or playwright (see SETUP.md 'Browser tools')"

browsers=""
for b in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
         "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \
         "/Applications/Chromium.app/Contents/MacOS/Chromium" \
         "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
         "$(command -v google-chrome 2>/dev/null)" "$(command -v chromium 2>/dev/null)" "$(command -v chromium-browser 2>/dev/null)"; do
  [[ -n "$b" && -x "$b" ]] && browsers="$browsers- \`$b\`"$'\n'
done

# --- repos --------------------------------------------------------------------------------------------------
repo_rows=""
while read -r name url role required; do
  [[ -z "${name:-}" || "$name" == \#* ]] && continue
  d="$WORKSPACE_ROOT/$name"
  if [[ -d "$d/.git" ]]; then
    branch="$(git -C "$d" rev-parse --abbrev-ref HEAD 2>/dev/null)"
    dirty="$(git -C "$d" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
    extra=""
    if grep -qs "filter=lfs" "$d/.gitattributes" && git lfs version >/dev/null 2>&1; then
      pointers="$(cd "$d" && git lfs ls-files 2>/dev/null | grep -c ' - ' || true)"
      [[ "$pointers" != "0" ]] && extra=" · LFS NOT PULLED ($pointers pointer files)"
    fi
    repo_rows="$repo_rows| $name | $role | present | $branch | $dirty$extra |"$'\n'
  else
    repo_rows="$repo_rows| $name | $role | ABSENT | - | - |"$'\n'
    [[ "$required" == "yes" ]] && need "repo $name (run .claude/factory/scripts/bootstrap.sh)"
  fi
done < "$FACTORY_DIR/repos.txt"

wb="$WORKSPACE_ROOT/continuum-workbench"
wb_modules="absent"; [[ -d "$wb/node_modules" ]] && wb_modules="present"
gradle_cache="absent"; [[ -d "$HOME/.gradle/caches/modules-2" ]] && gradle_cache="present"
platform_version="$(grep -s '^platformVersion' "$WORKSPACE_ROOT/continuum-platform-core/gradle.properties" | cut -d= -f2)"
maven_local="absent"
[[ -n "$platform_version" && -d "$HOME/.m2/repository/org/projectcontinuum/core/continuum-commons/$platform_version" ]] && maven_local="present ($platform_version)"

# --- network + running services -----------------------------------------------------------------------------
net_npm="$(http_code https://registry.npmjs.org/left-pad)"
net_yarn="$(http_code https://registry.yarnpkg.com/turbo)"
net_maven="$(http_code https://repo.maven.apache.org/maven2/)"
net_gh="$(http_code https://github.com)"
svc() { local c; c="$(http_code "$1" 3)"; [[ "$c" == "000" ]] && echo "not reachable" || echo "up (HTTP $c)"; }
svc_api="$(svc http://localhost:8080/actuator/health)"
svc_cred="$(svc http://localhost:8083/actuator/health)"
svc_wb="$(svc http://127.0.0.1:3002/)"

# --- write the profile --------------------------------------------------------------------------------------
{
  echo "# Factory environment profile"
  echo "Generated by \`.claude/factory/scripts/doctor.sh\` on $(date '+%Y-%m-%d %H:%M') · $os/$arch · workspace \`$WORKSPACE_ROOT\`"
  echo "Re-run the doctor after installing anything. Do not edit by hand — put manual rules in \`.claude/factory/local-policy.md\`."
  echo
  echo "## Tools"
  echo "| Tool | Version | State |"; echo "|---|---|---|"; printf "%s" "$rows"
  echo
  echo "Chromium-family browsers found (for headed runs / CDP):"
  [[ -n "$browsers" ]] && printf "%s" "$browsers" || echo "- none (puppeteer/playwright bundled Chromium only)"
  echo
  echo "## Repositories"
  echo "| Repo | Role | State | Branch | Uncommitted files |"; echo "|---|---|---|---|---|"; printf "%s" "$repo_rows"
  echo
  echo "## Build state"
  echo "- Gradle dependency cache (\`--offline\` possible): $gradle_cache"
  echo "- continuum-platform-core \`platformVersion\`: ${platform_version:-unknown}; published to mavenLocal: $maven_local"
  echo "- continuum-workbench \`node_modules\`: $wb_modules"
  echo
  echo "## Network (HTTP status; 000 = unreachable, 403 = blocked by proxy/VPN)"
  echo "- registry.npmjs.org: $net_npm · registry.yarnpkg.com: $net_yarn · Maven Central: $net_maven · github.com: $net_gh"
  echo
  echo "## Running services (from this shell; a sandboxed shell may not reach localhost even when a browser can)"
  echo "- api-server :8080 — $svc_api"
  echo "- credentials-server :8083 — $svc_cred"
  echo "- workbench :3002 — $svc_wb"
  echo
  echo "## Missing for a full pipeline"
  [[ -n "$missing" ]] && printf "%s" "$missing" || echo "- nothing"
  echo
  echo "## Local policy"
  if [[ -f "$POLICY" ]]; then sed '1{/^# /d;}' "$POLICY"; else echo "- none (no \`.claude/factory/local-policy.md\`; see \`local-policy.example.md\`)"; fi
} > "$OUT"

[[ "${1:-}" == "--quiet" ]] || cat "$OUT"
echo
echo "Wrote $OUT"
