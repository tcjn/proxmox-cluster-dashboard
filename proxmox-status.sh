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

    if [[ ! -s "$TMP_PREFIX.nodes.list" ]]; then
        jq -n --arg name "$NAME" '{($name):"offline"}' > "${TMP_PREFIX}.cluster.json"
        jq -n --arg name "$NAME" '{($name):{health:"offline"}}' > "${TMP_PREFIX}.ceph.json"
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
        return
    fi

    # --- Ceph ---
    curl -sk --connect-timeout 5 --max-time $CURL_TIMEOUT \
        -w "HTTPSTATUS:%{http_code}" \
        -H "Cookie: PVEAuthCookie=$TICKET" \
        "$URL/api2/json/cluster/ceph/status" > "$TMP_PREFIX.ceph.raw"

    local HTTP=$(sed 's/.*HTTPSTATUS://' "$TMP_PREFIX.ceph.raw")
    sed 's/HTTPSTATUS\:.*//' "$TMP_PREFIX.ceph.raw" > "$TMP_PREFIX.ceph.body"

    if [[ "$HTTP" != "200" ]]; then
        jq -n --arg name "$NAME" \
            '{($name):{health:"not-installed"}}' > "${TMP_PREFIX}.ceph.json"
    else
        jq '.data // {health:"unknown"}' "$TMP_PREFIX.ceph.body" > "$TMP_PREFIX.ceph.clean"
        jq -n --arg name "$NAME" --slurpfile c "$TMP_PREFIX.ceph.clean" \
            '{($name):$c[0]}' > "${TMP_PREFIX}.ceph.json"
    fi

    # --- Nodes ---
    curl -sk -H "Cookie: PVEAuthCookie=$TICKET" \
        "$URL/api2/json/nodes" > "$TMP_PREFIX.nodes.api"

    local NODE_STATUS="{}"
    local NODE_DATA="{}"

    while read -r NODE; do
        SHORT=$(cut -d'.' -f1 <<< "$NODE")

        jq ".data[] | select(.node==\"$SHORT\")" "$TMP_PREFIX.nodes.api" > "$TMP_PREFIX.node.info"

        STATUS=$(jq -r '.status // "offline"' "$TMP_PREFIX.node.info")

        NODE_STATUS=$(jq --arg n "$NODE" --arg s "$STATUS" \
            '. + {($n):$s}' <<< "$NODE_STATUS")

        if [[ "$STATUS" == "online" ]]; then
            curl -sk -H "Cookie: PVEAuthCookie=$TICKET" \
                "$URL/api2/json/nodes/$SHORT/status" > "$TMP_PREFIX.met"
            curl -sk -H "Cookie: PVEAuthCookie=$TICKET" \
                "$URL/api2/json/nodes/$SHORT/qemu" > "$TMP_PREFIX.vms"
            curl -sk -H "Cookie: PVEAuthCookie=$TICKET" \
                "$URL/api2/json/nodes/$SHORT/version" > "$TMP_PREFIX.ver"

            CPU=$(jq '.data.cpu // 0' "$TMP_PREFIX.met")
            MEM=$(( $(jq '.data.memory.used // 0' "$TMP_PREFIX.met") / 1024 / 1024 ))
            MAXMEM=$(( $(jq '.data.memory.total // 0' "$TMP_PREFIX.met") / 1024 / 1024 ))
            DISK=$(( $(jq '.data.rootfs.used // 0' "$TMP_PREFIX.met") / 1024 / 1024 ))
            MAXDISK=$(( $(jq '.data.rootfs.total // 0' "$TMP_PREFIX.met") / 1024 / 1024 ))
            UPTIME=$(jq '.data.uptime // 0' "$TMP_PREFIX.met")
            PVERSION=$(jq -r '.data.version // "unknown"' "$TMP_PREFIX.ver")

            jq '[.data[]? | {vmid,name,status,cpu,mem,uptime}]' \
                "$TMP_PREFIX.vms" > "$TMP_PREFIX.vm.clean"

            NODE_DATA=$(jq \
                --arg node "$NODE" \
                --argjson cpu "$CPU" \
                --argjson mem "$MEM" \
                --argjson maxmem "$MAXMEM" \
                --argjson disk "$DISK" \
                --argjson maxdisk "$MAXDISK" \
                --argjson uptime "$UPTIME" \
                --arg pve "$PVERSION" \
                --slurpfile v "$TMP_PREFIX.vm.clean" \
                '. + {($node):{cpu:$cpu,mem:$mem,maxmem:$maxmem,disk:$disk,maxdisk:$maxdisk,uptime:$uptime,pveversion:$pve,vms:$v[0]}}' \
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

jq -n --arg t "$LAST_UPDATE" \
--slurpfile c "$TMPDIR/f1" \
--slurpfile n "$TMPDIR/f2" \
--slurpfile d "$TMPDIR/f3" \
--slurpfile ce "$TMPDIR/f4" \
'{lastUpdate:$t,clusterStatus:$c[0],nodeStatus:$n[0],nodeData:$d[0],cephStatus:$ce[0]}' \
> "$OUTPUT_FILE"

echo "OK: $OUTPUT_FILE"
