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
            stats.totalCpuUsage += nodeData.cpu * 100;
          }
          
          if (nodeData.mem && nodeData.maxmem) {
            stats.totalMemoryUsage += (nodeData.mem / nodeData.maxmem) * 100;
          }
          
          if (nodeData.disk && nodeData.maxdisk) {
            stats.totalDiskUsage += (nodeData.disk / nodeData.maxdisk) * 100;
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
  
  // Health gauge
  document.getElementById('healthScore').textContent = `${stats.healthScore}%`;
  const gaugeFill = document.getElementById('healthGaugeFill');
  const dashOffset = 502.4 * (1 - stats.healthScore / 100);
  gaugeFill.style.strokeDashoffset = dashOffset;
  
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
  
  // Footer stats
  document.getElementById('footerStats').textContent = 
    `${stats.totalClusters} Clusters • ${stats.totalNodes} Nodes • ${stats.totalVMs} VMs`;
}
