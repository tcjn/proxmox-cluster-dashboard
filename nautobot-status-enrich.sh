#!/bin/bash
set -euo pipefail

INPUT_FILE="${1:-status.json}"
OUTPUT_FILE="${2:-$INPUT_FILE}"
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
CONFIG_FILE="${CONFIG_FILE:-$SCRIPT_DIR/config.js}"

NAUTOBOT_BASE_URL="${NAUTOBOT_BASE_URL:-}"
NAUTOBOT_TOKEN="${NAUTOBOT_TOKEN:-${NAUTOBOT_API_KEY:-}}"
NAUTOBOT_API_PATH="${NAUTOBOT_API_PATH:-}"
CURL_TIMEOUT="${CURL_TIMEOUT:-10}"

if [[ ! -f "$INPUT_FILE" ]]; then
  echo "ERROR: Input file not found: $INPUT_FILE" >&2
  exit 1
fi

load_nautobot_defaults_from_config() {
  [[ -f "$CONFIG_FILE" ]] || return 0
  command -v node >/dev/null 2>&1 || return 0

  local CONFIG_JSON
  if ! CONFIG_JSON=$(node - "$CONFIG_FILE" <<'NODE'
const fs = require('fs');
const vm = require('vm');

const configPath = process.argv[2];
const source = fs.readFileSync(configPath, 'utf8');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(`${source}\nthis.__config = CONFIG;`, sandbox);

const nautobot = (sandbox.__config && sandbox.__config.nautobot) || {};
process.stdout.write(JSON.stringify({
  baseUrl: nautobot.baseUrl || '',
  apiPath: nautobot.apiPath || '',
  apiToken: nautobot.apiToken || ''
}));
NODE
  ); then
    return 0
  fi

  local CFG_BASE_URL CFG_API_PATH CFG_API_TOKEN
  CFG_BASE_URL=$(jq -r '.baseUrl // empty' <<< "$CONFIG_JSON")
  CFG_API_PATH=$(jq -r '.apiPath // empty' <<< "$CONFIG_JSON")
  CFG_API_TOKEN=$(jq -r '.apiToken // empty' <<< "$CONFIG_JSON")

  NAUTOBOT_BASE_URL="${NAUTOBOT_BASE_URL:-$CFG_BASE_URL}"
  NAUTOBOT_API_PATH="${NAUTOBOT_API_PATH:-$CFG_API_PATH}"
  NAUTOBOT_TOKEN="${NAUTOBOT_TOKEN:-$CFG_API_TOKEN}"
}

load_nautobot_defaults_from_config
NAUTOBOT_API_PATH="${NAUTOBOT_API_PATH:-/api/virtualization/virtual-machines/}"

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

STATUS_MAP='{}'

if [[ -z "$NAUTOBOT_BASE_URL" || -z "$NAUTOBOT_TOKEN" ]]; then
  echo "WARN: Nautobot API credentials are missing. Set NAUTOBOT_BASE_URL + NAUTOBOT_TOKEN (or NAUTOBOT_API_KEY), or fill CONFIG.nautobot.baseUrl/apiToken in $CONFIG_FILE. Writing nautobotStatus=\"unknown\" for all VMs." >&2
fi

if [[ -n "$NAUTOBOT_BASE_URL" && -n "$NAUTOBOT_TOKEN" ]]; then
  NORMALIZED_BASE_URL="${NAUTOBOT_BASE_URL%/}"
  NORMALIZED_API_PATH="${NAUTOBOT_API_PATH#/}"
  API_URL="${NORMALIZED_BASE_URL}/${NORMALIZED_API_PATH}"

  while IFS= read -r VM_NAME; do
    [[ -z "$VM_NAME" ]] && continue

    ENCODED_VM_NAME=$(jq -rn --arg value "$VM_NAME" '$value|@uri')
    REQUEST_URL="${API_URL}?name=${ENCODED_VM_NAME}"

    if RESPONSE=$(curl -fsS --connect-timeout 5 --max-time "$CURL_TIMEOUT" \
      -H "Authorization: Token ${NAUTOBOT_TOKEN}" \
      -H "Accept: application/json" \
      "$REQUEST_URL" 2>/dev/null); then
      MATCH_COUNT=$(jq -r '.count // 0' <<< "$RESPONSE" 2>/dev/null || echo 0)
      if [[ "$MATCH_COUNT" =~ ^[0-9]+$ ]] && (( MATCH_COUNT > 0 )); then
        NAUTOBOT_STATUS="exist"
      else
        NAUTOBOT_STATUS="missing"
      fi
    else
      NAUTOBOT_STATUS="unknown"
    fi

    STATUS_MAP=$(jq --arg name "$VM_NAME" --arg status "$NAUTOBOT_STATUS" '. + {($name):$status}' <<< "$STATUS_MAP")
  done < <(jq -r '.nodeData[]?.vms[]?.name // empty' "$INPUT_FILE" | sort -u)
fi

jq --argjson statusMap "$STATUS_MAP" '
  .nodeData |= with_entries(
    .value.vms |= (
      (. // []) | map(
        . as $vm |
        ($statusMap[$vm.name] // "unknown") as $nbStatus |
        . + {
          nautobotStatus: $nbStatus,
          nautobotVisible: ($nbStatus == "exist")
        }
      )
    )
  )
' "$INPUT_FILE" > "$TMPDIR/status.json"

mv "$TMPDIR/status.json" "$OUTPUT_FILE"
echo "OK: Nautobot VM statuses written to $OUTPUT_FILE"
