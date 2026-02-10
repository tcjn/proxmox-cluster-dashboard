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
        stats.ceph.total++;
        stats.ceph.clusters.push({
          name: cluster.name,
          health: cephHealth.label,
          healthText: cephHealth.text,
          details: cephHealth.details
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
        if (nodeData) {
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
        }
      });
    });
  });
  
  // Calculate percentages
  stats.onlineClustersPercent = stats.totalClusters > 0 ? Math.round((stats.onlineClusters / stats.totalClusters) * 100) : 0;
  stats.offlineClustersPercent = stats.totalClusters > 0 ? Math.round((stats.offlineClusters / stats.totalClusters) * 100) : 0;
  stats.runningVMsPercent = stats.totalVMs > 0 ? Math.round((stats.runningVMs / stats.totalVMs) * 100) : 0;
  stats.stoppedVMsPercent = stats.totalVMs > 0 ? Math.round((stats.stoppedVMs / stats.totalVMs) * 100) : 0;
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
  
  return stats;
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
  summary.innerHTML = `
    <span class="ceph-summary-pill healthy">Healthy: ${cephStats.healthy}</span>
    <span class="ceph-summary-pill warning">Warn: ${cephStats.warning}</span>
    <span class="ceph-summary-pill critical">Critical: ${cephStats.critical}</span>
    <span class="ceph-summary-pill not-installed">Not Installed: ${cephStats.notInstalled}</span>
    <span class="ceph-summary-pill unknown">Unknown: ${cephStats.unknown}</span>
  `;

  list.innerHTML = cephStats.clusters.map(item => `
    <div class="ceph-status-item ${item.health}">
      <span class="ceph-cluster-name">${item.name}</span>
      <span class="ceph-cluster-health" title="${sanitizeHTML(item.details || '')}">${sanitizeHTML(item.healthText || item.health)}</span>
    </div>
  `).join('');
}
