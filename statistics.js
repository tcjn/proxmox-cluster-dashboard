// Statistics Calculations

function calculateStatistics() {
  if (!STATE.clustersData || !STATE.statusData) {
    return null;
  }
  
  const nautobotEnabled = CONFIG?.nautobot?.enabled !== false;

  const stats = {
    totalClusters: 0,
    onlineClusters: 0,
    offlineClusters: 0,
    degradedClusters: 0,
    prodClusters: 0,
    
    totalVMs: 0,
    runningVMs: 0,
    stoppedVMs: 0,
    totalContainers: 0,
    runningContainers: 0,
    stoppedContainers: 0,
    
    totalNodes: 0,
    onlineNodes: 0,
    offlineNodes: 0,
    degradedNodes: 0,
    
    totalCpuUsage: 0,
    totalMemoryUsage: 0,
    totalDiskUsage: 0,
    nodesWithData: 0,

    networkUsageClusters: [],

    occupancyBuckets: {
      low: { cpu: 0, memory: 0, disk: 0 },
      medium: { cpu: 0, memory: 0, disk: 0 },
      high: { cpu: 0, memory: 0, disk: 0 },
      critical: { cpu: 0, memory: 0, disk: 0 }
    },
    
    updatedNodes: 0,
    outdatedNodes: 0,
    
    healthyCount: 0,
    warningCount: 0,
    criticalCount: 0,
    
    regionStats: {
      AMER: { clusters: 0, vms: 0, nodes: 0 },
      APAC: { clusters: 0, vms: 0, nodes: 0 },
      EMEA: { clusters: 0, vms: 0, nodes: 0 },
      CME: { clusters: 0, vms: 0, nodes: 0 }
    },

    ceph: {
      total: 0,
      healthy: 0,
      warning: 0,
      critical: 0,
      notInstalled: 0,
      unknown: 0,
      clusters: []
    },

    subscription: {
      active: 0,
      warning: 0,
      unknown: 0,
      total: 0
    },

    nautobot: {
      total: 0,
      present: 0,
      missing: 0,
      unknown: 0
    }
  };
  
  Object.entries(STATE.clustersData).forEach(([region, clusters]) => {
    clusters.forEach(cluster => {
      stats.totalClusters++;
      
      const clusterStatus = getClusterStatus(cluster.name);
      if (clusterStatus === 'online') stats.onlineClusters++;
      else if (clusterStatus === 'offline') stats.offlineClusters++;
      else if (clusterStatus === 'degraded') stats.degradedClusters++;
      
      if (cluster.name.includes('-prod')) stats.prodClusters++;
      
      const clusterRegion = region.toUpperCase();
      if (stats.regionStats[clusterRegion]) {
        stats.regionStats[clusterRegion].clusters++;
      }

      if (clusterRegion === 'CME') {
        const cephHealth = getCephHealthDetails(cluster.name);
        const cephStatus = getCephStatus(cluster.name);
        stats.ceph.total++;
        stats.ceph.clusters.push({
          name: cluster.name,
          health: cephHealth.label,
          healthText: cephHealth.text,
          details: cephHealth.details,
          metrics: extractCephMetrics(cephStatus)
        });

        if (cephHealth.label === 'healthy') stats.ceph.healthy++;
        else if (cephHealth.label === 'warning') stats.ceph.warning++;
        else if (cephHealth.label === 'critical') stats.ceph.critical++;
        else if (cephHealth.label === 'not-installed') stats.ceph.notInstalled++;
        else stats.ceph.unknown++;
      }
      
      const nodes = [cluster.node1, cluster.node2, cluster.node3].filter(Boolean);
      const clusterNetworkUsage = calculateClusterNetworkUsage(cluster.name, nodes);
      stats.networkUsageClusters.push({
        name: cluster.name,
        clusterName: cluster.name,
        rxBytesPerSec: clusterNetworkUsage.rx,
        txBytesPerSec: clusterNetworkUsage.tx,
        totalBytesPerSec: clusterNetworkUsage.total
      });

      nodes.forEach(node => {
        stats.totalNodes++;
        if (stats.regionStats[clusterRegion]) {
          stats.regionStats[clusterRegion].nodes++;
        }
        
        const nodeStatus = getNodeStatus(node);
        if (nodeStatus === 'online') stats.onlineNodes++;
        else if (nodeStatus === 'offline') stats.offlineNodes++;
        else if (nodeStatus === 'degraded') stats.degradedNodes++;
        
        const nodeData = getNodeData(node);
        if (nodeData) {
          const subscriptionStatus = classifySubscription(nodeData.subscription);
          stats.subscription.total++;
          stats.subscription[subscriptionStatus]++;

          stats.nodesWithData++;
          
          if (nodeData.cpu !== undefined && !isNaN(nodeData.cpu)) {
            const cpuUsage = nodeData.cpu * 100;
            stats.totalCpuUsage += cpuUsage;
            stats.occupancyBuckets[getOccupancyBucket(cpuUsage)].cpu++;
          }
          
          if (nodeData.mem && nodeData.maxmem) {
            const memoryUsage = (nodeData.mem / nodeData.maxmem) * 100;
            stats.totalMemoryUsage += memoryUsage;
            stats.occupancyBuckets[getOccupancyBucket(memoryUsage)].memory++;
          }
          
          if (nodeData.disk && nodeData.maxdisk) {
            const diskUsage = (nodeData.disk / nodeData.maxdisk) * 100;
            stats.totalDiskUsage += diskUsage;
            stats.occupancyBuckets[getOccupancyBucket(diskUsage)].disk++;
          }
          
          if (nodeData.pveversion) {
            if (compareVersions(nodeData.pveversion, CONFIG.pveVersionProd) >= 0) {
              stats.updatedNodes++;
            } else {
              stats.outdatedNodes++;
            }
          }
          
          if (nodeData.vms && Array.isArray(nodeData.vms)) {
            nodeData.vms.forEach(vm => {
              stats.totalVMs++;
              if (stats.regionStats[clusterRegion]) {
                stats.regionStats[clusterRegion].vms++;
              }
              if (isVmRunningStatus(vm?.status)) {
                stats.runningVMs++;
              } else {
                stats.stoppedVMs++;
              }

              if (!isNautobotExcludedVmId(vm?.vmid)) {
                stats.nautobot.total++;

                const vmNautobotInfo = getVmNautobotInfo(vm);
                if (vmNautobotInfo.state === 'present') {
                  stats.nautobot.present++;
                } else if (vmNautobotInfo.state === 'missing') {
                  stats.nautobot.missing++;
                } else {
                  stats.nautobot.unknown++;
                }
              }
            });
          }

          if (nodeData.containers && Array.isArray(nodeData.containers)) {
            nodeData.containers.forEach(container => {
              stats.totalContainers++;
              if (container.status === 'running') {
                stats.runningContainers++;
              } else {
                stats.stoppedContainers++;
              }
            });
          }
        }
      });
    });
  });
  
  // Calculate percentages
  stats.onlineClustersPercent = stats.totalClusters > 0 ? Math.round((stats.onlineClusters / stats.totalClusters) * 100) : 0;
  stats.offlineClustersPercent = stats.totalClusters > 0 ? Math.round((stats.offlineClusters / stats.totalClusters) * 100) : 0;
  stats.runningVMsPercent = stats.totalVMs > 0 ? Math.round((stats.runningVMs / stats.totalVMs) * 100) : 0;
  stats.stoppedVMsPercent = stats.totalVMs > 0 ? Math.round((stats.stoppedVMs / stats.totalVMs) * 100) : 0;
  stats.runningContainersPercent = stats.totalContainers > 0 ? Math.round((stats.runningContainers / stats.totalContainers) * 100) : 0;
  stats.onlineNodesPercent = stats.totalNodes > 0 ? Math.round((stats.onlineNodes / stats.totalNodes) * 100) : 0;
  stats.offlineNodesPercent = stats.totalNodes > 0 ? Math.round((stats.offlineNodes / stats.totalNodes) * 100) : 0;
  stats.degradedNodesPercent = stats.totalNodes > 0 ? Math.round((stats.degradedNodes / stats.totalNodes) * 100) : 0;
  stats.updatedNodesPercent = stats.totalNodes > 0 ? Math.round((stats.updatedNodes / stats.totalNodes) * 100) : 0;
  stats.outdatedNodesPercent = stats.totalNodes > 0 ? Math.round((stats.outdatedNodes / stats.totalNodes) * 100) : 0;
  
  stats.avgCpu = stats.nodesWithData > 0 ? Math.round(stats.totalCpuUsage / stats.nodesWithData) : 0;
  stats.avgMemory = stats.nodesWithData > 0 ? Math.round(stats.totalMemoryUsage / stats.nodesWithData) : 0;
  stats.avgDisk = stats.nodesWithData > 0 ? Math.round(stats.totalDiskUsage / stats.nodesWithData) : 0;
  
  // Health score
  const clusterHealth = stats.onlineClustersPercent * 0.4;
  const nodeHealth = stats.onlineNodesPercent * 0.3;
  const vmHealth = stats.runningVMsPercent * 0.3;
  stats.healthScore = Math.round(clusterHealth + nodeHealth + vmHealth);
  
  // Health counts
  stats.healthyCount = stats.onlineNodes;
  stats.warningCount = stats.degradedNodes;
  stats.criticalCount = stats.offlineNodes;

  stats.subscription.healthPercent = stats.subscription.total > 0
    ? Math.round((stats.subscription.active / stats.subscription.total) * 100)
    : 0;

  stats.nautobot.presentPercent = stats.nautobot.total > 0
    ? Math.round((stats.nautobot.present / stats.nautobot.total) * 100)
    : 0;

  stats.networkUsageClusters.sort((a, b) => b.totalBytesPerSec - a.totalBytesPerSec);
  
  return stats;
}

function calculateClusterNetworkUsage(clusterName, clusterNodes) {
  const clusterInfra = getClusterInfra(clusterName);
  const infraNetwork = normalizeNetworkThroughput(clusterInfra?.network || clusterInfra?.networkUsage || clusterInfra);

  if (infraNetwork.total > 0) {
    return infraNetwork;
  }

  return (clusterNodes || []).reduce((acc, nodeName) => {
    const nodeData = getNodeData(nodeName);
    if (!nodeData) return acc;

    const nodeNetwork = normalizeNetworkThroughput(
      nodeData.netUsage || nodeData.networkUsage || nodeData.network || nodeData
    );
    acc.rx += nodeNetwork.rx;
    acc.tx += nodeNetwork.tx;

    if (Array.isArray(nodeData.vms)) {
      nodeData.vms.forEach(vm => {
        const vmNetwork = normalizeNetworkThroughput(vm.netUsage || vm.networkUsage || vm.network || vm);
        acc.rx += vmNetwork.rx;
        acc.tx += vmNetwork.tx;
      });
    }

    acc.total = acc.rx + acc.tx;
    return acc;
  }, { rx: 0, tx: 0, total: 0 });
}

function normalizeNetworkThroughput(source) {
  if (!source || typeof source !== 'object') {
    return { rx: 0, tx: 0, total: 0 };
  }

  const mbpsToBytesPerSec = value => (value * 1000 * 1000) / 8;

  const pickNumber = keys => {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }

      if (typeof value === 'string') {
        const normalized = value.trim().replace(',', '.');
        const parsed = Number.parseFloat(normalized);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }
    return 0;
  };

  const rxMbps = pickNumber(['rxMbps', 'rx_mbps', 'receiveMbps', 'receive_mbps', 'inboundMbps']);
  const txMbps = pickNumber(['txMbps', 'tx_mbps', 'transmitMbps', 'transmit_mbps', 'outboundMbps']);

  const rx = rxMbps > 0
    ? mbpsToBytesPerSec(rxMbps)
    : pickNumber(['rxBytesPerSec', 'rx_bytes_per_sec', 'rx_bps', 'rx', 'rxBytes', 'rx_bytes', 'receive', 'in', 'netin', 'download', 'inbound']);
  const tx = txMbps > 0
    ? mbpsToBytesPerSec(txMbps)
    : pickNumber(['txBytesPerSec', 'tx_bytes_per_sec', 'tx_bps', 'tx', 'txBytes', 'tx_bytes', 'transmit', 'out', 'netout', 'upload', 'outbound']);

  return {
    rx,
    tx,
    total: rx + tx
  };
}

function classifySubscription(subscription) {
  if (!subscription || typeof subscription !== 'string') {
    return 'unknown';
  }

  const normalized = subscription.toLowerCase();

  if (
    normalized.includes('active') ||
    normalized.includes('valid') ||
    normalized.includes('premium') ||
    normalized.includes('standard') ||
    normalized.includes('basic') ||
    normalized.includes('enterprise') ||
    normalized.includes('community')
  ) {
    return 'active';
  }

  if (
    normalized.includes('warn') ||
    normalized.includes('expire') ||
    normalized.includes('invalid') ||
    normalized.includes('none') ||
    normalized.includes('inactive') ||
    normalized.includes('suspended')
  ) {
    return 'warning';
  }

  if (normalized.includes('unknown') || normalized.includes('n/a')) {
    return 'unknown';
  }

  return 'unknown';
}

function getOccupancyBucket(usage) {
  if (usage < 40) return 'low';
  if (usage < 70) return 'medium';
  if (usage < 85) return 'high';
  return 'critical';
}

function isVmRunningStatus(status) {
  if (typeof status === 'boolean') return status;
  if (typeof status === 'number') return status > 0;
  if (typeof status !== 'string') return false;

  const normalized = status.trim().toLowerCase();
  return ['running', 'started', 'up', 'on', 'active'].includes(normalized);
}

function isNautobotExcludedVmId(vmid) {
  const normalizedVmid = Number(vmid);
  return Number.isFinite(normalizedVmid) && normalizedVmid >= 500 && normalizedVmid <= 510;
}

function updateStatisticsUI() {
  const stats = calculateStatistics();
  if (!stats) return;
  const nautobotEnabled = CONFIG?.nautobot?.enabled !== false;
  
  document.getElementById('totalClusters').textContent = stats.totalClusters;
  document.getElementById('onlineClusters').textContent = stats.onlineClusters;
  document.getElementById('onlineClustersPercent').textContent = `${stats.onlineClustersPercent}%`;
  document.getElementById('offlineClusters').textContent = stats.offlineClusters;
  document.getElementById('offlineClustersPercent').textContent = `${stats.offlineClustersPercent}%`;
  
  document.getElementById('totalVMs').textContent = stats.totalVMs;
  document.getElementById('runningVMs').textContent = stats.runningVMs;
  document.getElementById('runningVMsPercent').textContent = `${stats.runningVMsPercent}%`;
  document.getElementById('stoppedVMs').textContent = stats.stoppedVMs;
  document.getElementById('stoppedVMsPercent').textContent = `${stats.stoppedVMsPercent}%`;
  document.getElementById('totalContainers').textContent = stats.totalContainers;
  document.getElementById('runningContainersPercent').textContent = `${stats.runningContainersPercent}% running`;
  
  document.getElementById('totalNodes').textContent = stats.totalNodes;
  document.getElementById('avgCpu').textContent = `${stats.avgCpu}%`;
  document.getElementById('avgMemory').textContent = `${stats.avgMemory}%`;
  document.getElementById('avgDisk').textContent = `${stats.avgDisk}%`;
  
  // Health score
  document.getElementById('healthScore').textContent = `${stats.healthScore}%`;
  const healthFill = document.getElementById('healthProgressFill');
  healthFill.style.width = `${stats.healthScore}%`;
  document.getElementById('healthClustersValue').textContent = `${stats.onlineClustersPercent}%`;
  document.getElementById('healthNodesValue').textContent = `${stats.onlineNodesPercent}%`;
  document.getElementById('healthVMsValue').textContent = `${stats.runningVMsPercent}%`;
  
  document.getElementById('healthyCount').textContent = `${stats.healthyCount} Healthy`;
  document.getElementById('warningCount').textContent = `${stats.warningCount} Warnings`;
  document.getElementById('criticalCount').textContent = `${stats.criticalCount} Critical`;
  
  // Regional stats
  document.getElementById('amerClusters').textContent = stats.regionStats.AMER.clusters;
  document.getElementById('apacClusters').textContent = stats.regionStats.APAC.clusters;
  document.getElementById('emeaClusters').textContent = stats.regionStats.EMEA.clusters;
  document.getElementById('cmeClusters').textContent = stats.regionStats.CME.clusters;
  
  document.getElementById('amerTrend').innerHTML = `<i class="fas fa-server"></i> <span>${stats.regionStats.AMER.vms} VMs</span>`;
  document.getElementById('apacTrend').innerHTML = `<i class="fas fa-server"></i> <span>${stats.regionStats.APAC.vms} VMs</span>`;
  document.getElementById('emeaTrend').innerHTML = `<i class="fas fa-server"></i> <span>${stats.regionStats.EMEA.vms} VMs</span>`;
  document.getElementById('cmeTrend').innerHTML = `<i class="fas fa-server"></i> <span>${stats.regionStats.CME.vms} VMs</span>`;

  document.getElementById('subscriptionActive').textContent = stats.subscription.active;
  document.getElementById('subscriptionWarning').textContent = stats.subscription.warning;
  document.getElementById('subscriptionUnknown').textContent = stats.subscription.unknown;
  document.getElementById('subscriptionTotal').textContent = stats.subscription.total;
  document.getElementById('subscriptionHealthScore').textContent = `${stats.subscription.healthPercent}% active`;
  
  renderCephStatus(stats.ceph);
  renderVictoriaMetricsPanel(stats);
  renderNautobotCoveragePanel(stats, nautobotEnabled);


  
  // Footer stats
  document.getElementById('footerStats').textContent = 
    `${stats.totalClusters} Clusters • ${stats.totalNodes} Nodes • ${stats.totalVMs} VMs`;
}

function renderNautobotCoveragePanel(stats, nautobotEnabled) {
  const nautobotPanel = document.querySelector('.nautobot-card');
  if (!nautobotPanel) return;

  if (!nautobotEnabled) {
    nautobotPanel.style.display = 'none';
    return;
  }

  nautobotPanel.style.display = 'block';

  const presentEl = document.getElementById('nautobotPresent');
  const missingEl = document.getElementById('nautobotMissing');
  const unknownEl = document.getElementById('nautobotUnknown');
  const totalEl = document.getElementById('nautobotRunningTotal');
  const scoreEl = document.getElementById('nautobotCoverageScore');

  if (presentEl) presentEl.textContent = stats.nautobot.present;
  if (missingEl) missingEl.textContent = stats.nautobot.missing;
  if (unknownEl) unknownEl.textContent = stats.nautobot.unknown;
  if (totalEl) totalEl.textContent = stats.nautobot.total;
  if (scoreEl) scoreEl.textContent = `${stats.nautobot.presentPercent}% present in Nautobot`;
}

function renderCephStatus(cephStats) {
  const panel = document.getElementById('cephStatusPanel');
  const summary = document.getElementById('cephStatusSummary');
  const list = document.getElementById('cephStatusList');

  if (!panel || !summary || !list) return;

  if (!cephStats || cephStats.total === 0) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';
  const clustersWithAlerts = cephStats.warning + cephStats.critical + cephStats.unknown;
  summary.innerHTML = `
    <span class="ceph-summary-pill healthy">Healthy: ${cephStats.healthy}</span>
    <span class="ceph-summary-pill warning">Warn: ${cephStats.warning}</span>
    <span class="ceph-summary-pill critical">Critical: ${cephStats.critical}</span>
    <span class="ceph-summary-pill meta">Monitored: ${cephStats.total}</span>
    <span class="ceph-summary-pill meta">Needs attention: ${clustersWithAlerts}</span>
  `;

  list.innerHTML = cephStats.clusters.map(item => `
    <div class="ceph-status-item ${item.health}">
      <div class="ceph-status-item-main">
        <span class="ceph-cluster-name">${sanitizeHTML(item.name)}</span>
        <span class="ceph-cluster-health ${sanitizeHTML(item.health)}" title="${sanitizeHTML(item.details || '')}">${sanitizeHTML(item.healthText || item.health)}</span>
      </div>
      <div class="ceph-status-item-meta">
        ${item.details ? `<span class="ceph-meta-item details">${sanitizeHTML(item.details)}</span>` : ''}
        ${Array.isArray(item.metrics) ? item.metrics.map(metric => `<span class="ceph-meta-item">${sanitizeHTML(metric)}</span>`).join('') : ''}
      </div>
    </div>
  `).join('');
}

function extractCephMetrics(cephStatus) {
  if (!cephStatus || typeof cephStatus !== 'object') return [];

  const metrics = [];
  const healthChecks = cephStatus.health && typeof cephStatus.health === 'object' && cephStatus.health.checks
    ? cephStatus.health.checks
    : null;

  if (healthChecks && Object.keys(healthChecks).length > 0) {
    metrics.push(`Checks: ${Object.keys(healthChecks).length}`);
  }

  const monMap = cephStatus.monmap || cephStatus.mon_status || cephStatus.monStatus;
  if (monMap && typeof monMap === 'object') {
    const mons = monMap.mons || monMap.monitors;
    const quorum = monMap.quorum;
    if (Array.isArray(quorum)) {
      metrics.push(`MON quorum: ${quorum.length}`);
    } else if (Array.isArray(mons)) {
      metrics.push(`MONs: ${mons.length}`);
    }
  }

  const osdMap = cephStatus.osdmap || cephStatus.osd_map || cephStatus.osdMap;
  if (osdMap && typeof osdMap === 'object') {
    const upOsds = osdMap.num_up_osds ?? osdMap.up_osds;
    const inOsds = osdMap.num_in_osds ?? osdMap.in_osds;
    const totalOsds = osdMap.num_osds ?? osdMap.total_osds;

    if (typeof upOsds === 'number' && typeof totalOsds === 'number') {
      metrics.push(`OSDs up: ${upOsds}/${totalOsds}`);
    }
    if (typeof inOsds === 'number' && typeof totalOsds === 'number') {
      metrics.push(`OSDs in: ${inOsds}/${totalOsds}`);
    }
  }

  const pgMap = cephStatus.pgmap || cephStatus.pg_map || cephStatus.pgMap;
  if (pgMap && typeof pgMap === 'object') {
    const pgs = pgMap.num_pgs ?? pgMap.pgs;
    if (typeof pgs === 'number') {
      metrics.push(`PGs: ${pgs}`);
    }
  }

  const fsMap = cephStatus.fsmap || cephStatus.fs_map || cephStatus.fsMap;
  if (fsMap && typeof fsMap === 'object') {
    if (typeof fsMap.up === 'number' && typeof fsMap.in === 'number') {
      metrics.push(`MDS up/in: ${fsMap.up}/${fsMap.in}`);
    }
  }

  return metrics.slice(0, 5);
}


function renderVictoriaMetricsPanel(stats) {
  const panel = document.getElementById('victoriaPanel');
  const linksContainer = document.getElementById('victoriaLinks');
  const openLink = document.getElementById('victoriaOpenLink');

  if (!panel || !linksContainer || !openLink) return;

  const vmConfig = CONFIG.victoriaMetrics || {};
  const statusVictoria = STATE.statusData?.victoriaMetrics || {};
  const useStatusData = vmConfig.useStatusData === true;
  const dataSource = useStatusData ? statusVictoria : vmConfig;

  const isEnabled = typeof dataSource.enabled === 'boolean'
    ? dataSource.enabled
    : !useStatusData && vmConfig.enabled;
  const baseUrl = dataSource.baseUrl || '';

  if (!isEnabled || !baseUrl) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';

  const coverage = dataSource.coverage || {};
  const clustersCount = Number.isFinite(coverage.clusters) ? coverage.clusters : stats.totalClusters;
  const nodesCount = Number.isFinite(coverage.nodes) ? coverage.nodes : stats.totalNodes;
  const vmsCount = Number.isFinite(coverage.vms) ? coverage.vms : stats.totalVMs;

  document.getElementById('victoriaClustersCount').textContent = clustersCount;
  document.getElementById('victoriaNodesCount').textContent = nodesCount;
  document.getElementById('victoriaVMsCount').textContent = vmsCount;

  openLink.href = baseUrl;

  const queries = useStatusData
    ? (dataSource.queries || {})
    : (vmConfig.queries || {});

  const links = [
    { label: 'Node CPU', icon: 'fa-microchip', query: queries.nodeCpu },
    { label: 'Node RAM', icon: 'fa-memory', query: queries.nodeMemory },
    { label: 'Node Disk', icon: 'fa-hard-drive', query: queries.nodeDisk },
    { label: 'Node Network', icon: 'fa-network-wired', query: queries.nodeNetwork },
    { label: 'VM CPU', icon: 'fa-server', query: queries.vmCpu },
    { label: 'VM RAM', icon: 'fa-desktop', query: queries.vmMemory }
  ].filter(item => Boolean(item.query));

  linksContainer.innerHTML = links.map(link => {
    const url = buildVictoriaQueryUrl(baseUrl, link.query);
    return `
      <a class="victoria-link" href="${sanitizeHTML(url)}" target="_blank" rel="noopener noreferrer">
        <i class="fas ${sanitizeHTML(link.icon)}"></i>
        <span>${sanitizeHTML(link.label)}</span>
      </a>
    `;
  }).join('');
}

function buildVictoriaQueryUrl(baseUrl, query) {
  if (!query) return baseUrl;

  const url = new URL(baseUrl, window.location.origin);
  url.searchParams.set('g0.expr', query);
  url.searchParams.set('g0.tab', '0');
  return url.toString();
}
