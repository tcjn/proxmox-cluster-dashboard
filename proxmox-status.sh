#!/bin/bash

USERNAME="monit@pve"
PASSWORD="$(cat ~/.token)"
CLUSTERS_FILE="/var/www/html/pve-console.expereo.com/clusters.json"
OUTPUT_FILE="/var/www/html/pve-console.expereo.com/status.json"
MAX_PARALLEL=10
CURL_TIMEOUT=10

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

json_or_default() {
    local file="$1"
    local filter="$2"
    local default="$3"
    local value

    value=$(jq -c "$filter" "$file" 2>/dev/null) || value="$default"
    [[ -z "$value" ]] && value="$default"
    printf '%s' "$value"
}

json_text_or_default() {
    local value="$1"
    local default="$2"

    jq -ce . >/dev/null 2>&1 <<< "$value" && {
        printf '%s' "$value"
        return
    }

    printf '%s' "$default"
}

process_cluster() {
    local CLUSTER_JSON="$1"
    local TMP_PREFIX="$2"

    echo "$CLUSTER_JSON" > "$TMP_PREFIX.input.json"

    local NAME=$(jq -r '.name' "$TMP_PREFIX.input.json")
    local URL=$(jq -r '.url' "$TMP_PREFIX.input.json")
    jq -r '.nodes[]?' "$TMP_PREFIX.input.json" > "$TMP_PREFIX.nodes.list"

    echo "{}" > "${TMP_PREFIX}.cluster.json"
    echo "{}" > "${TMP_PREFIX}.nodes.json"
    echo "{}" > "${TMP_PREFIX}.data.json"
    echo "{}" > "${TMP_PREFIX}.ceph.json"
    echo "{}" > "${TMP_PREFIX}.infra.json"

    if [[ ! -s "$TMP_PREFIX.nodes.list" ]]; then
        jq -n --arg name "$NAME" '{($name):"offline"}' > "${TMP_PREFIX}.cluster.json"
        jq -n --arg name "$NAME" '{($name):{health:"offline"}}' > "${TMP_PREFIX}.ceph.json"
        jq -n --arg name "$NAME" '{($name):{quorum:"offline"}}' > "${TMP_PREFIX}.infra.json"
        return
    fi

    # --- Login ---
    curl -sk -X POST --connect-timeout 5 --max-time $CURL_TIMEOUT \
        "$URL/api2/json/access/ticket" \
        -d "username=$USERNAME" \
        -d "password=$PASSWORD" > "$TMP_PREFIX.login.json"

    local TICKET=$(jq -r '.data.ticket // empty' "$TMP_PREFIX.login.json")

    if [[ -z "$TICKET" ]]; then
        jq -n --arg name "$NAME" '{($name):"offline"}' > "${TMP_PREFIX}.cluster.json"
        jq -n --arg name "$NAME" '{($name):{health:"unreachable"}}' > "${TMP_PREFIX}.ceph.json"
        jq -n --arg name "$NAME" '{($name):{quorum:"unreachable"}}' > "${TMP_PREFIX}.infra.json"
        return
    fi

    pve_get() {
        local endpoint="$1"
        local output="$2"
        curl -sk --connect-timeout 5 --max-time "$CURL_TIMEOUT" \
            -w "HTTPSTATUS:%{http_code}" \
            -H "Cookie: PVEAuthCookie=$TICKET" \
            "$URL/api2/json/$endpoint" > "${output}.raw"

        local code
        code=$(awk -F'HTTPSTATUS:' 'END {print $NF}' "${output}.raw")
        sed 's/HTTPSTATUS\:.*//' "${output}.raw" > "$output"

        # Some endpoints can intermittently return non-JSON content (e.g. proxy
        # errors or HTML). Treat those responses as failed requests so callers
        # can safely fall back to default JSON payloads.
        if ! jq -e . "$output" >/dev/null 2>&1; then
            return 1
        fi

        [[ "$code" == "200" ]]
    }

    # --- Ceph ---
    if ! pve_get "cluster/ceph/status" "$TMP_PREFIX.ceph.body"; then
        jq -n --arg name "$NAME" \
            '{($name):{health:"not-installed"}}' > "${TMP_PREFIX}.ceph.json"
    else
        jq '.data // {health:"unknown"}' "$TMP_PREFIX.ceph.body" > "$TMP_PREFIX.ceph.clean"
        jq -n --arg name "$NAME" --slurpfile c "$TMP_PREFIX.ceph.clean" \
            '{($name):$c[0]}' > "${TMP_PREFIX}.ceph.json"
    fi

    # --- Cluster infra details ---
    if pve_get "cluster/status" "$TMP_PREFIX.cluster.status"; then
        jq '.data // []' "$TMP_PREFIX.cluster.status" > "$TMP_PREFIX.cluster.status.clean"
        jq -n --arg name "$NAME" --slurpfile s "$TMP_PREFIX.cluster.status.clean" '
            ($s[0] // []) as $items |
            ($items | map(select(.type == "cluster"))[0] // {}) as $cluster |
            ($items | map(select(.type == "quorum"))[0] // {}) as $quorum |
            {
              ($name): {
                quorum: ($quorum.quorate // "unknown"),
                nodes: ($quorum.nodes // 0),
                expectedVotes: ($quorum.expected_votes // 0),
                totalVotes: ($quorum.total_votes // 0),
                clusterId: ($cluster.id // "unknown"),
                clusterName: ($cluster.name // $name)
              }
            }
        ' > "${TMP_PREFIX}.infra.json"
    else
        jq -n --arg name "$NAME" '{($name):{quorum:"unknown"}}' > "${TMP_PREFIX}.infra.json"
    fi

    # --- Nodes ---
    pve_get "nodes" "$TMP_PREFIX.nodes.api" || echo '{"data":[]}' > "$TMP_PREFIX.nodes.api"

    local NODE_STATUS="{}"
    local NODE_DATA="{}"
    local CLUSTER_NETWORK='{"rxBytesPerSec":0,"txBytesPerSec":0,"totalBytesPerSec":0}'

    while read -r NODE; do
        NODE=${NODE//$'\r'/}
        SHORT=${NODE%%.*}

        STATUS=$(jq -r --arg short "$SHORT" 'first(.data[]? | select(.node == $short) | .status) // "offline"' "$TMP_PREFIX.nodes.api" 2>/dev/null || echo "offline")

        NODE_STATUS=$(jq --arg n "$NODE" --arg s "$STATUS" \
            '. + {($n):$s}' <<< "$NODE_STATUS")

        if [[ "$STATUS" == "online" ]]; then
            pve_get "nodes/$SHORT/status" "$TMP_PREFIX.met" || echo '{"data":{}}' > "$TMP_PREFIX.met"
            pve_get "nodes/$SHORT/qemu" "$TMP_PREFIX.vms" || echo '{"data":[]}' > "$TMP_PREFIX.vms"
            pve_get "nodes/$SHORT/lxc" "$TMP_PREFIX.cts" || echo '{"data":[]}' > "$TMP_PREFIX.cts"
            pve_get "nodes/$SHORT/version" "$TMP_PREFIX.ver" || echo '{"data":{}}' > "$TMP_PREFIX.ver"
            pve_get "nodes/$SHORT/storage" "$TMP_PREFIX.storage" || echo '{"data":[]}' > "$TMP_PREFIX.storage"
            pve_get "nodes/$SHORT/network" "$TMP_PREFIX.network" || echo '{"data":[]}' > "$TMP_PREFIX.network"
            pve_get "nodes/$SHORT/subscription" "$TMP_PREFIX.sub" || echo '{"data":{}}' > "$TMP_PREFIX.sub"

            CPU=$(json_or_default "$TMP_PREFIX.met" '.data.cpu // 0' '0')

            MEM_BYTES=$(json_or_default "$TMP_PREFIX.met" '.data.memory.used // 0' '0')
            MAXMEM_BYTES=$(json_or_default "$TMP_PREFIX.met" '.data.memory.total // 0' '0')
            DISK_BYTES=$(json_or_default "$TMP_PREFIX.met" '.data.rootfs.used // 0' '0')
            MAXDISK_BYTES=$(json_or_default "$TMP_PREFIX.met" '.data.rootfs.total // 0' '0')
            SWAP_BYTES=$(json_or_default "$TMP_PREFIX.met" '.data.swap.used // 0' '0')
            MAXSWAP_BYTES=$(json_or_default "$TMP_PREFIX.met" '.data.swap.total // 0' '0')

            MEM=$(( MEM_BYTES / 1024 / 1024 ))
            MAXMEM=$(( MAXMEM_BYTES / 1024 / 1024 ))
            DISK=$(( DISK_BYTES / 1024 / 1024 ))
            MAXDISK=$(( MAXDISK_BYTES / 1024 / 1024 ))
            SWAP=$(( SWAP_BYTES / 1024 / 1024 ))
            MAXSWAP=$(( MAXSWAP_BYTES / 1024 / 1024 ))

            UPTIME=$(json_or_default "$TMP_PREFIX.met" '.data.uptime // 0' '0')
            PVERSION=$(jq -r '.data.version // "unknown"' "$TMP_PREFIX.ver" 2>/dev/null || echo "unknown")
            KERNEL=$(jq -r '.data.kversion // "unknown"' "$TMP_PREFIX.met" 2>/dev/null || echo "unknown")
            CPUS=$(json_or_default "$TMP_PREFIX.met" '.data.cpuinfo.cpus // 0' '0')
            LOADAVG=$(json_or_default "$TMP_PREFIX.met" '.data.loadavg // [0,0,0]' '[0,0,0]')
            SUBSCRIPTION=$(jq -r '.data.status // "unknown"' "$TMP_PREFIX.sub" 2>/dev/null || echo "unknown")

            STORAGE_SUMMARY=$(jq -c '
                (.data // []) as $all |
                {
                  pools: ($all | length),
                  activePools: ($all | map(select(.active == 1)) | length),
                  used: ($all | map(.used // 0) | add // 0),
                  total: ($all | map(.total // 0) | add // 0)
                }
            ' "$TMP_PREFIX.storage" 2>/dev/null || echo '{"pools":0,"activePools":0,"used":0,"total":0}')

            NETWORK_SUMMARY=$(jq -c '
                def firstnum($v):
                  ($v | map(select(type == "number" and (isfinite))) | .[0]) // 0;

                (.data // []) as $all |
                ($all | map(firstnum([
                  .rxBytesPerSec,
                  .rx_bytes_per_sec,
                  .rx_bps,
                  .statistics.rx_bytes_per_sec,
                  .statistics.rx,
                  .statistics.rx_bytes,
                  .statistics."rx-bytes",
                  ."rx-bytes",
                  .rx,
                  .receive,
                  .netin
                ])) | add // 0) as $rx |
                ($all | map(firstnum([
                  .txBytesPerSec,
                  .tx_bytes_per_sec,
                  .tx_bps,
                  .statistics.tx_bytes_per_sec,
                  .statistics.tx,
                  .statistics.tx_bytes,
                  .statistics."tx-bytes",
                  ."tx-bytes",
                  .tx,
                  .transmit,
                  .netout
                ])) | add // 0) as $tx |
                {
                  interfaces: ($all | length),
                  activeInterfaces: ($all | map(select(.active == 1)) | length),
                  bridges: ($all | map(select(.type == "bridge")) | map(.iface) | unique),
                  rxBytesPerSec: $rx,
                  txBytesPerSec: $tx,
                  totalBytesPerSec: ($rx + $tx)
                }
            ' "$TMP_PREFIX.network" 2>/dev/null || echo '{"interfaces":0,"activeInterfaces":0,"bridges":[],"rxBytesPerSec":0,"txBytesPerSec":0,"totalBytesPerSec":0}')

            STORAGE_SUMMARY=$(json_text_or_default "$STORAGE_SUMMARY" '{"pools":0,"activePools":0,"used":0,"total":0}')
            NETWORK_SUMMARY=$(json_text_or_default "$NETWORK_SUMMARY" '{"interfaces":0,"activeInterfaces":0,"bridges":[],"rxBytesPerSec":0,"txBytesPerSec":0,"totalBytesPerSec":0}')
            CLUSTER_NETWORK=$(json_text_or_default "$CLUSTER_NETWORK" '{"rxBytesPerSec":0,"txBytesPerSec":0,"totalBytesPerSec":0}')

            CLUSTER_NETWORK=$(jq -c                 --argjson cluster "$CLUSTER_NETWORK"                 --argjson node "$NETWORK_SUMMARY"                 '{
                  rxBytesPerSec: (($cluster.rxBytesPerSec // 0) + ($node.rxBytesPerSec // 0)),
                  txBytesPerSec: (($cluster.txBytesPerSec // 0) + ($node.txBytesPerSec // 0))
                }
                | .totalBytesPerSec = ((.rxBytesPerSec // 0) + (.txBytesPerSec // 0))' 2>/dev/null || echo '{"rxBytesPerSec":0,"txBytesPerSec":0,"totalBytesPerSec":0}')

            jq '[.data[]? | {vmid,name,status,cpu,mem,uptime}]' \
                "$TMP_PREFIX.vms" > "$TMP_PREFIX.vm.clean"
            jq '[.data[]? | {vmid,hostname,status,cpu,mem,maxmem,uptime}]' \
                "$TMP_PREFIX.cts" > "$TMP_PREFIX.ct.clean"

            NODE_DATA=$(jq \
                --arg node "$NODE" \
                --argjson cpu "$CPU" \
                --argjson mem "$MEM" \
                --argjson maxmem "$MAXMEM" \
                --argjson disk "$DISK" \
                --argjson maxdisk "$MAXDISK" \
                --argjson swap "$SWAP" \
                --argjson maxswap "$MAXSWAP" \
                --argjson uptime "$UPTIME" \
                --arg kernel "$KERNEL" \
                --arg pve "$PVERSION" \
                --argjson cpus "$CPUS" \
                --arg sub "$SUBSCRIPTION" \
                --argjson loadavg "$LOADAVG" \
                --argjson storage "$STORAGE_SUMMARY" \
                --argjson network "$NETWORK_SUMMARY" \
                --slurpfile v "$TMP_PREFIX.vm.clean" \
                --slurpfile c "$TMP_PREFIX.ct.clean" \
                '. + {($node):{cpu:$cpu,mem:$mem,maxmem:$maxmem,disk:$disk,maxdisk:$maxdisk,swap:$swap,maxswap:$maxswap,uptime:$uptime,pveversion:$pve,kernel:$kernel,cpus:$cpus,subscription:$sub,loadavg:$loadavg,storage:$storage,network:$network,vms:$v[0],containers:$c[0]}}' \
                <<< "$NODE_DATA" 2>/dev/null || echo "$NODE_DATA")
        fi

    done < "$TMP_PREFIX.nodes.list"

    echo "$NODE_STATUS" > "${TMP_PREFIX}.nodes.json"
    echo "$NODE_DATA" > "${TMP_PREFIX}.data.json"

    CLUSTER_NETWORK=$(json_text_or_default "$CLUSTER_NETWORK" '{"rxBytesPerSec":0,"txBytesPerSec":0,"totalBytesPerSec":0}')
    jq --arg name "$NAME" --argjson network "$CLUSTER_NETWORK" '
      .[$name] = ((.[$name] // {}) + {
        network: {
          rxBytesPerSec: ($network.rxBytesPerSec // 0),
          txBytesPerSec: ($network.txBytesPerSec // 0),
          totalBytesPerSec: ($network.totalBytesPerSec // (($network.rxBytesPerSec // 0) + ($network.txBytesPerSec // 0)))
        }
      })
    ' "${TMP_PREFIX}.infra.json" > "${TMP_PREFIX}.infra.tmp" 2>/dev/null || cp "${TMP_PREFIX}.infra.json" "${TMP_PREFIX}.infra.tmp"
    mv "${TMP_PREFIX}.infra.tmp" "${TMP_PREFIX}.infra.json"

    jq -n --arg name "$NAME" '{($name):"online"}' > "${TMP_PREFIX}.cluster.json"
}

export -f process_cluster json_or_default json_text_or_default
export USERNAME PASSWORD TMPDIR CURL_TIMEOUT

jq -c 'to_entries[] | .value[] |
{name:.name,url:.url,nodes:[to_entries[]|select(.key|test("^node"))|.value]}' \
"$CLUSTERS_FILE" > "$TMPDIR/tasks"

i=0
while read -r CLUSTER; do
    ((i++))
    process_cluster "$CLUSTER" "$TMPDIR/c$i" &
    (( i % MAX_PARALLEL == 0 )) && wait
done < "$TMPDIR/tasks"
wait

LAST_UPDATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

jq -n 'reduce inputs as $i ({};. * $i)' "$TMPDIR"/c*.cluster.json > "$TMPDIR/f1"
jq -n 'reduce inputs as $i ({};. * $i)' "$TMPDIR"/c*.nodes.json > "$TMPDIR/f2"
jq -n 'reduce inputs as $i ({};. * $i)' "$TMPDIR"/c*.data.json > "$TMPDIR/f3"
jq -n 'reduce inputs as $i ({};. * $i)' "$TMPDIR"/c*.ceph.json > "$TMPDIR/f4"
jq -n 'reduce inputs as $i ({};. * $i)' "$TMPDIR"/c*.infra.json > "$TMPDIR/f5"

jq -n --arg t "$LAST_UPDATE" \
--slurpfile c "$TMPDIR/f1" \
--slurpfile n "$TMPDIR/f2" \
--slurpfile d "$TMPDIR/f3" \
--slurpfile ce "$TMPDIR/f4" \
--slurpfile infra "$TMPDIR/f5" \
'{lastUpdate:$t,clusterStatus:$c[0],nodeStatus:$n[0],nodeData:$d[0],cephStatus:$ce[0],clusterInfra:$infra[0]}' \
> "$OUTPUT_FILE"

echo "OK: $OUTPUT_FILE"
