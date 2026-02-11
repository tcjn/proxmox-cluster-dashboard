// Statistics Calculations

function calculateStatistics() {
  if (!STATE.clustersData || !STATE.statusData) {
    return null;
  }
  
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
      total: 0,
      active: 0,
      warning: 0,
      unknown: 0
    },

    topRiskNodes: []
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
        if (!nodeData) {
          stats.topRiskNodes.push({
            nodeName: node,
            clusterName: cluster.name,
            riskScore: nodeStatus === 'offline' ? 100 : nodeStatus === 'degraded' ? 40 : 5,
            cpuPercent: 0,
            memPercent: 0,
            diskPercent: 0,
            nodeStatus,
            subscriptionStatus: 'unknown'
          });
          stats.subscription.total++;
          stats.subscription.unknown++;
          return;
        }

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
              if (vm.status === 'running') {
                stats.runningVMs++;
              } else {
                stats.stoppedVMs++;
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

  stats.topRiskNodes.sort((a, b) => b.riskScore - a.riskScore);
  stats.topRiskNodes = stats.topRiskNodes.slice(0, 5);
  
  return stats;
}

function calculateNodeRisk(nodeName, clusterName, nodeData, nodeStatus) {
  const cpuPercent = Math.round((nodeData.cpu || 0) * 100);
  const memPercent = nodeData.maxmem ? Math.round((nodeData.mem / nodeData.maxmem) * 100) : 0;
  const diskPercent = nodeData.maxdisk ? Math.round((nodeData.disk / nodeData.maxdisk) * 100) : 0;
  const subscriptionStatus = String(nodeData.subscription || 'unknown').toLowerCase();

  let riskScore = 0;
  if (nodeStatus === 'offline') riskScore += 100;
  else if (nodeStatus === 'degraded') riskScore += 40;

  if (cpuPercent >= CONFIG.thresholds.cpuCritical) riskScore += 30;
  else if (cpuPercent >= CONFIG.thresholds.cpuWarning) riskScore += 15;

  if (memPercent >= CONFIG.thresholds.memoryCritical) riskScore += 30;
  else if (memPercent >= CONFIG.thresholds.memoryWarning) riskScore += 15;

  if (diskPercent >= CONFIG.thresholds.diskCritical) riskScore += 35;
  else if (diskPercent >= CONFIG.thresholds.diskWarning) riskScore += 18;

  if (nodeData.pveversion && compareVersions(nodeData.pveversion, CONFIG.pveVersionProd) < 0) riskScore += 10;
  if (subscriptionStatus !== 'active') riskScore += subscriptionStatus === 'unknown' ? 6 : 12;

  return {
    nodeName,
    clusterName,
    riskScore,
    cpuPercent,
    memPercent,
    diskPercent,
    nodeStatus,
    subscriptionStatus
  };
}

function getOccupancyBucket(usage) {
  if (usage < 40) return 'low';
  if (usage < 70) return 'medium';
  if (usage < 85) return 'high';
  return 'critical';
}

function updateStatisticsUI() {
  const stats = calculateStatistics();
  if (!stats) return;
  
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
  
  renderCephStatus(stats.ceph);
  renderTopRiskNodes(stats.topRiskNodes);
  renderSubscriptionHealth(stats.subscription, stats.subscriptionActivePercent);
  
  // Footer stats
  document.getElementById('footerStats').textContent = 
    `${stats.totalClusters} Clusters • ${stats.totalNodes} Nodes • ${stats.totalVMs} VMs`;
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


function renderTopRiskNodes(topRiskNodes) {
  const list = document.getElementById('topRiskNodesList');
  if (!list) return;

  if (!Array.isArray(topRiskNodes) || topRiskNodes.length === 0) {
    list.innerHTML = '<p class="ops-empty">No node telemetry available.</p>';
    return;
  }

  list.innerHTML = topRiskNodes.map(item => `
    <div class="ops-risk-item">
      <div class="ops-risk-item-header">
        <span class="ops-risk-node">${sanitizeHTML(getShortNodeName(item.nodeName))}</span>
        <span class="ops-risk-score ${item.riskScore >= 70 ? 'critical' : item.riskScore >= 40 ? 'warning' : 'healthy'}">Risk ${item.riskScore}</span>
      </div>
      <div class="ops-risk-meta">
        <span>${sanitizeHTML(item.clusterName)}</span>
        <span>CPU ${item.cpuPercent}%</span>
        <span>RAM ${item.memPercent}%</span>
        <span>Disk ${item.diskPercent}%</span>
      </div>
    </div>
  `).join('');
}

function renderSubscriptionHealth(subscriptionStats, activePercent) {
  const activeEl = document.getElementById('subscriptionActive');
  const warningEl = document.getElementById('subscriptionWarning');
  const unknownEl = document.getElementById('subscriptionUnknown');
  const totalEl = document.getElementById('subscriptionTotal');
  const scoreEl = document.getElementById('subscriptionHealthScore');

  if (!activeEl || !warningEl || !unknownEl || !totalEl || !scoreEl) return;

  activeEl.textContent = subscriptionStats.active;
  warningEl.textContent = subscriptionStats.warning;
  unknownEl.textContent = subscriptionStats.unknown;
  totalEl.textContent = subscriptionStats.total;
  scoreEl.textContent = `${activePercent}% active`;
}
