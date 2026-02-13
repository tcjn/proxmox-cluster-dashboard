#!/bin/bash
set -euo pipefail

INPUT_FILE="${1:-status.json}"
OUTPUT_FILE="${2:-$INPUT_FILE}"
NAUTOBOT_BASE_URL="${NAUTOBOT_BASE_URL:-}"
NAUTOBOT_TOKEN="${NAUTOBOT_TOKEN:-}"
NAUTOBOT_API_PATH="${NAUTOBOT_API_PATH:-/api/virtualization/virtual-machines/}"
CURL_TIMEOUT="${CURL_TIMEOUT:-10}"

if [[ ! -f "$INPUT_FILE" ]]; then
  echo "ERROR: Input file not found: $INPUT_FILE" >&2
  exit 1
fi

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

STATUS_MAP='{}'

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
