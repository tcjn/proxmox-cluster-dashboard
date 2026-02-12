#!/bin/bash

USERNAME="monit@pve"
PASSWORD="$(cat ~/.token)"
CLUSTERS_FILE="/var/www/html/pve-console.expereo.com/clusters.json"
OUTPUT_FILE="/var/www/html/pve-console.expereo.com/status.json"
MAX_PARALLEL=10
CURL_TIMEOUT=10

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

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
        code=$(sed 's/.*HTTPSTATUS://' "${output}.raw")
        sed 's/HTTPSTATUS\:.*//' "${output}.raw" > "$output"

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

    while read -r NODE; do
        SHORT=$(cut -d'.' -f1 <<< "$NODE")

        jq ".data[] | select(.node==\"$SHORT\")" "$TMP_PREFIX.nodes.api" > "$TMP_PREFIX.node.info"

        STATUS=$(jq -r '.status // "offline"' "$TMP_PREFIX.node.info")

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

            CPU=$(jq '.data.cpu // 0' "$TMP_PREFIX.met")
            MEM=$(( $(jq '.data.memory.used // 0' "$TMP_PREFIX.met") / 1024 / 1024 ))
            MAXMEM=$(( $(jq '.data.memory.total // 0' "$TMP_PREFIX.met") / 1024 / 1024 ))
            DISK=$(( $(jq '.data.rootfs.used // 0' "$TMP_PREFIX.met") / 1024 / 1024 ))
            MAXDISK=$(( $(jq '.data.rootfs.total // 0' "$TMP_PREFIX.met") / 1024 / 1024 ))
            SWAP=$(( $(jq '.data.swap.used // 0' "$TMP_PREFIX.met") / 1024 / 1024 ))
            MAXSWAP=$(( $(jq '.data.swap.total // 0' "$TMP_PREFIX.met") / 1024 / 1024 ))
            UPTIME=$(jq '.data.uptime // 0' "$TMP_PREFIX.met")
            PVERSION=$(jq -r '.data.version // "unknown"' "$TMP_PREFIX.ver")
            KERNEL=$(jq -r '.data.kversion // "unknown"' "$TMP_PREFIX.met")
            CPUS=$(jq '.data.cpuinfo.cpus // 0' "$TMP_PREFIX.met")
            LOADAVG=$(jq '.data.loadavg // [0,0,0]' "$TMP_PREFIX.met")
            SUBSCRIPTION=$(jq -r '.data.status // "unknown"' "$TMP_PREFIX.sub")

            STORAGE_SUMMARY=$(jq '
                (.data // []) as $all |
                {
                  pools: ($all | length),
                  activePools: ($all | map(select(.active == 1)) | length),
                  used: ($all | map(.used // 0) | add // 0),
                  total: ($all | map(.total // 0) | add // 0)
                }
            ' "$TMP_PREFIX.storage")

            NETWORK_SUMMARY=$(jq '
                (.data // []) as $all |
                {
                  interfaces: ($all | length),
                  activeInterfaces: ($all | map(select(.active == 1)) | length),
                  bridges: ($all | map(select(.type == "bridge")) | map(.iface) | unique)
                }
            ' "$TMP_PREFIX.network")

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
                <<< "$NODE_DATA")
        fi

    done < "$TMP_PREFIX.nodes.list"

    echo "$NODE_STATUS" > "${TMP_PREFIX}.nodes.json"
    echo "$NODE_DATA" > "${TMP_PREFIX}.data.json"
    jq -n --arg name "$NAME" '{($name):"online"}' > "${TMP_PREFIX}.cluster.json"
}

export -f process_cluster
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
