#!/bin/bash
set -euo pipefail

INPUT_FILE="${1:-status.json}"
OUTPUT_FILE="${2:-$INPUT_FILE}"
NAUTOBOT_BASE_URL="${NAUTOBOT_BASE_URL:-}"
NAUTOBOT_TOKEN="${NAUTOBOT_TOKEN:-}"
NAUTOBOT_API_PATH="${NAUTOBOT_API_PATH:-/api/virtualization/virtual-machines/}"
CURL_TIMEOUT="${CURL_TIMEOUT:-30}"

if [[ ! -f "$INPUT_FILE" ]]; then
  echo "ERROR: Input file not found: $INPUT_FILE" >&2
  exit 1
fi

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

# If Nautobot config is missing, just copy input to output (no enrichment)
if [[ -z "$NAUTOBOT_BASE_URL" || -z "$NAUTOBOT_TOKEN" ]]; then
  echo "WARNING: NAUTOBOT_BASE_URL or NAUTOBOT_TOKEN not set. Skipping enrichment." >&2
  cp "$INPUT_FILE" "$OUTPUT_FILE"
  exit 0
fi

NORMALIZED_BASE_URL="${NAUTOBOT_BASE_URL%/}"
NORMALIZED_API_PATH="${NAUTOBOT_API_PATH#/}"
API_URL="${NORMALIZED_BASE_URL}/${NORMALIZED_API_PATH}"

echo "Fetching all VMs from Nautobot..." >&2

# Fetch ALL VMs in one go. 
# limit=0 fetches everything. We only need the 'name' field to build our lookup.
# Using a temp file for the response to handle large payloads gracefully.
if ! curl -fsS --connect-timeout 10 --max-time "$CURL_TIMEOUT" \
  -H "Authorization: Token ${NAUTOBOT_TOKEN}" \
  -H "Accept: application/json" \
  "${API_URL}?limit=0" > "$TMPDIR/nautobot_vms.json"; then
  echo "ERROR: Failed to fetch VMs from Nautobot." >&2
  # Start with empty map on failure to avoid breaking pipeline? 
  # Or fail hard? Original script used "unknown" on curl failure.
  # Let's fallback to empty map so we preserve original data with "unknown" status.
  echo "{}" > "$TMPDIR/nautobot_vm_map.json"
else
  # Create a lookup map: { "vm_name": "exist" }
  # We assume if it's in the list, it exists.
  jq -r '
    (.results // []) 
    | map( { (.name): "exist" } ) 
    | add 
    | if . == null then {} else . end
  ' "$TMPDIR/nautobot_vms.json" > "$TMPDIR/nautobot_vm_map.json"
fi

echo "Enriching status data..." >&2

# Enrich the status.json
jq --slurpfile vmMap "$TMPDIR/nautobot_vm_map.json" '
  ($vmMap[0]) as $lookup |
  .nodeData |= with_entries(
    .value.vms |= (
      (. // []) | map(
        if .status == "running" then
          . as $vm |
          # Check if VM name exists in our lookup map
          ($lookup[$vm.name] // "missing") as $nbStatus |
          . + {
            nautobotStatus: $nbStatus,
            nautobotVisible: ($nbStatus == "exist")
          }
        else
          # If not running, usage original logic: default to missing/invisible or keep existing?
          # Original script only processed "running" VMs in the loop, 
          # but the *enrichment* jq block (lines 58-75) also only touched "running".
          # However, it previously defaulted to "unknown" if curl failed, or "missing" if count=0.
          # Here, if we failed to fetch Nautobot data, $lookup is empty, so everything becomes "missing".
          # If we successfully fetched, and it is not in list, it is "missing".
          .
        end
      )
    )
  )
' "$INPUT_FILE" > "$TMPDIR/status_enriched.json"

mv "$TMPDIR/status_enriched.json" "$OUTPUT_FILE"
echo "Done." >&2
