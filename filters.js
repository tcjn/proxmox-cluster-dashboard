// Filtering and Sorting

function applyFilters() {
  renderClusters();
  updateFilterCount();
}

function updateFilterCount() {
  const activeFilters = Object.values(STATE.filters).flat().length;
  const totalPossible = Object.keys(STATE.filters).reduce((sum, key) => {
    if (key === 'status') return sum + 3;
    if (key === 'type') return sum + 2;
    if (key === 'region') return sum + 4;
    if (key === 'version') return sum + 2;
    return sum;
  }, 0);
  
  const filterCount = document.getElementById('filterCount');
  if (activeFilters < totalPossible) {
    filterCount.textContent = totalPossible - activeFilters;
    filterCount.style.display = 'block';
  } else {
    filterCount.style.display = 'none';
  }
}

function resetFilters() {
  STATE.filters = {
    status: ['online', 'offline', 'degraded'],
    type: ['prod', 'nonprod'],
    region: ['AMER', 'APAC', 'EMEA', 'CME'],
    version: ['updated', 'outdated']
  };
  
  // Update checkboxes
  document.querySelectorAll('.filter-panel input[type="checkbox"]').forEach(cb => {
    cb.checked = true;
  });
  
  applyFilters();
}

function matchesFilters(cluster, region) {
  // Status filter
  const clusterStatus = getClusterStatus(cluster.name);
  if (!STATE.filters.status.includes(clusterStatus)) {
    return false;
  }
  
  // Type filter
  const isProd = cluster.name.includes('-prod');
  const typeMatch = isProd ? STATE.filters.type.includes('prod') : STATE.filters.type.includes('nonprod');
  if (!typeMatch) {
    return false;
  }
  
  // Region filter
  if (!STATE.filters.region.includes(region.toUpperCase())) {
    return false;
  }
  
  // Version filter
  const nodes = [cluster.node1, cluster.node2, cluster.node3].filter(Boolean);
  const hasOutdated = nodes.some(node => {
    const nodeData = getNodeData(node);
    if (!nodeData || !nodeData.pveversion) return false;
    return compareVersions(nodeData.pveversion, CONFIG.pveVersionProd) < 0;
  });
  
  if (hasOutdated && !STATE.filters.version.includes('outdated')) {
    return false;
  }
  if (!hasOutdated && !STATE.filters.version.includes('updated')) {
    return false;
  }
  
  return true;
}

function sortClusters(clusters) {
  return [...clusters].sort((a, b) => {
    switch (STATE.sortBy) {
      case 'name':
        return a.name.localeCompare(b.name);
      
      case 'status': {
        const statusPriority = { online: 0, degraded: 1, offline: 2 };
        const aStatus = getClusterStatus(a.name);
        const bStatus = getClusterStatus(b.name);
        return (statusPriority[aStatus] || 3) - (statusPriority[bStatus] || 3);
      }
      
      case 'cpu': {
        const aAvg = getClusterAvgCPU(a);
        const bAvg = getClusterAvgCPU(b);
        return bAvg - aAvg;
      }
      
      case 'memory': {
        const aAvg = getClusterAvgMemory(a);
        const bAvg = getClusterAvgMemory(b);
        return bAvg - aAvg;
      }
      
      case 'vms': {
        const aCount = getClusterVMCount(a);
        const bCount = getClusterVMCount(b);
        return bCount - aCount;
      }
      
      case 'region':
        return getRegionFromClusterName(a.name).localeCompare(getRegionFromClusterName(b.name));
      
      default:
        return 0;
    }
  });
}

function getClusterAvgCPU(cluster) {
  const nodes = [cluster.node1, cluster.node2, cluster.node3].filter(Boolean);
  const cpuValues = nodes.map(node => {
    const data = getNodeData(node);
    return data ? (data.cpu || 0) * 100 : 0;
  }).filter(v => v > 0);
  return cpuValues.length > 0 ? cpuValues.reduce((a, b) => a + b) / cpuValues.length : 0;
}

function getClusterAvgMemory(cluster) {
  const nodes = [cluster.node1, cluster.node2, cluster.node3].filter(Boolean);
  const memValues = nodes.map(node => {
    const data = getNodeData(node);
    return data && data.maxmem ? (data.mem / data.maxmem) * 100 : 0;
  }).filter(v => v > 0);
  return memValues.length > 0 ? memValues.reduce((a, b) => a + b) / memValues.length : 0;
}

function getClusterVMCount(cluster) {
  const nodes = [cluster.node1, cluster.node2, cluster.node3].filter(Boolean);
  return nodes.reduce((count, node) => {
    const data = getNodeData(node);
    return count + (data && data.vms ? data.vms.length : 0);
  }, 0);
}
