// Domain-agnostic hostname formatter
function getDisplayNodeName(fullName) {
  if (typeof fullName !== 'string' || fullName.length === 0) return '';
  if (!fullName.includes('.')) return fullName;
  return fullName.split('.')[0];
}

// Cluster Rendering

function renderClusters() {
  const container = document.getElementById('regions-container');
  container.innerHTML = '';
  
  if (!STATE.clustersData) {
    container.innerHTML = '<p style="text-align: center; padding: 2rem;">No cluster data available</p>';
    return;
  }
  
  Object.entries(STATE.clustersData).forEach(([region, clusters]) => {
    const sortedClusters = sortClusters(clusters);
    const filteredClusters = sortedClusters.filter(cluster => matchesFilters(cluster, region));
    
    if (filteredClusters.length === 0) return;
    
    const regionEl = document.createElement('div');
    regionEl.className = 'region';
    
    const onlineCount = filteredClusters.filter(c => getClusterStatus(c.name) === 'online').length;
    regionEl.innerHTML = `
      <h2>
        <i class="fas fa-globe"></i>
        ${region.toUpperCase()}
        <span style="font-size: 0.8em; opacity: 0.7; margin-left: 0.5rem;">(${onlineCount}/${filteredClusters.length} online)</span>
      </h2>
    `;
    
    const clusterList = document.createElement('div');
    clusterList.className = 'cluster-list';
    
    filteredClusters.forEach((cluster, index) => {
      const clusterEl = createClusterElement(cluster, region, index);
      clusterList.appendChild(clusterEl);
    });
    
    regionEl.appendChild(clusterList);
    container.appendChild(regionEl);
  });
  
  attachClusterEventListeners();
}

function createClusterElement(cluster, region, index) {
  const div = document.createElement('div');
  div.className = 'cluster';
  div.style.animationDelay = `${index * 0.05}s`;
  div.setAttribute('data-name', cluster.name.toLowerCase());
  div.setAttribute('data-region', region);
  
  const clusterStatus = getClusterStatus(cluster.name);
  const isCmeCluster = region.toUpperCase() === 'CME';
  const cephHealth = isCmeCluster ? getCephHealthDetails(cluster.name) : null;
  const cephHealthLabel = cephHealth ? cephHealth.label : null;
  const cephHealthTitle = isCmeCluster
    ? `Ceph: ${cephHealth.text}${cephHealth.details ? ` (${cephHealth.details})` : ''}`
    : '';
  div.setAttribute('data-status', clusterStatus);
  
  const isProd = cluster.name.includes('-prod');
  if (isProd) div.classList.add('prod-cluster');
  
  const flagCode = CONFIG.countryFlags[cluster.name] || '';
  
  div.innerHTML = `
    <span class="status ${clusterStatus}"></span>
    <div class="cluster-header">
      <div class="icon"><i class="fas fa-server"></i></div>
      <a href="${cluster.url}" target="_blank">
        ${flagCode ? `<img class="flag" src="https://flagcdn.com/24x18/${flagCode}.png" alt="${flagCode}"/>` : ''}
        ${cluster.name}
        ${isProd ? '<i class="fas fa-star" style="color: var(--prod-color); margin-left: 0.25rem;"></i>' : ''}
      </a>
      ${isCmeCluster ? `<span class="ceph-health-badge ${cephHealthLabel}" title="${cephHealthTitle}"><i class="fas fa-database"></i> Ceph ${cephHealth.text}</span>` : ''}
      <button class="copy-btn" title="Copy link" data-url="${cluster.url}">
        <i class="fas fa-copy"></i>
      </button>
    </div>
    <div class="node-container">
      ${createNodesHTML(cluster)}
    </div>
  `;
  
  return div;
}

function createNodesHTML(cluster) {
  const nodes = [
    { name: cluster.node1, fullName: cluster.node1 },
    { name: cluster.node2, fullName: cluster.node2 }
  ];
  if (cluster.node3) {
    nodes.push({ name: cluster.node3, fullName: cluster.node3 });
  }
  
  return nodes.map(node => createNodeHTML(node, cluster)).join('');
}

function createNodeHTML(node, cluster) {
  const displayName = getDisplayNodeName(node.fullName);
  const nodeStatus = getNodeStatus(node.fullName);
  const nodeData = getNodeData(node.fullName);
  
  if (!nodeData || nodeStatus === 'offline') {
    const statusLabel = nodeStatus === 'offline' ? 'Offline' : 'No Data';
    const offlineMessage = nodeStatus === 'offline'
      ? 'Node is currently offline. Login is unavailable.'
      : 'Telemetry is unavailable. Login status cannot be verified.';
    return `
      <div class="node">
        <div class="node-header">
          <div class="node-name">
            <span class="node-indicator ${nodeStatus}"></span>
            <a href="https://${node.fullName}:8006" target="_blank">${displayName}</a>
          </div>
          <span class="node-status ${nodeStatus}">${statusLabel}</span>
        </div>
        <div class="node-offline">${offlineMessage}</div>
      </div>
    `;
  }
  
  const cpuPercent = Math.round((nodeData.cpu || 0) * 100);
  const memPercent = nodeData.maxmem ? Math.round((nodeData.mem / nodeData.maxmem) * 100) : 0;
  const diskPercent = nodeData.maxdisk ? Math.round((nodeData.disk / nodeData.maxdisk) * 100) : 0;
  const ramLabel = 'RAM';
  
  const isVersionOutdated = nodeData.pveversion && 
    compareVersions(nodeData.pveversion, CONFIG.pveVersionProd) < 0;
  
  let vmsHTML = '';
  if (nodeData.vms && nodeData.vms.length > 0) {
    const runningVMs = nodeData.vms.filter(vm => vm.status === 'running').length;
    vmsHTML = `
      <button class="vm-toggle" onclick="window.toggleVMDetails(this)">
        <i class="fas fa-server"></i>
        VMs: ${runningVMs}/${nodeData.vms.length} running
        <i class="fas fa-chevron-down"></i>
      </button>
      <div class="vm-details">
        <div class="vm-list">
          ${nodeData.vms.map(vm => createVMHTML(vm, cluster)).join('')}
        </div>
      </div>
    `;
  }
  
  return `
    <div class="node">
      <div class="node-header">
        <div class="node-name">
          <span class="node-indicator ${nodeStatus}"></span>
          <a href="https://${node.fullName}:8006" target="_blank">${displayName}</a>
        </div>
        <span class="node-status ${nodeStatus}">${nodeStatus}</span>
      </div>
      <div class="node-details">
        <div class="node-metric">
          <span class="metric-value">${cpuPercent}%</span>
          <span class="metric-label">CPU</span>
          <div class="progress-container">
            <div class="progress-bar cpu-progress" style="width: ${cpuPercent}%"></div>
          </div>
        </div>
        <div class="node-metric">
          <span class="metric-value">${memPercent}%</span>
          <span class="metric-label">${ramLabel}</span>
          <div class="progress-container">
            <div class="progress-bar mem-progress" style="width: ${memPercent}%"></div>
          </div>
        </div>
        <div class="node-metric">
          <span class="metric-value">${diskPercent}%</span>
          <span class="metric-label">Disk</span>
          <div class="progress-container">
            <div class="progress-bar disk-progress" style="width: ${diskPercent}%"></div>
          </div>
        </div>
      </div>
      <div class="uptime">Uptime: ${formatUptime(nodeData.uptime || 0)}</div>
      <div class="pve-version ${isVersionOutdated ? 'version-outdated' : ''}">
        Version: ${nodeData.pveversion || 'N/A'}
        ${isVersionOutdated ? '<i class="fas fa-exclamation-triangle"></i>' : ''}
      </div>
      ${vmsHTML}
    </div>
  `;
}

function createVMHTML(vm, cluster) {
  const vmName = vm.name || `VM ${vm.vmid}`;
  const vmStatus = vm.status || 'stopped';
  const cpuPercent = Math.round((vm.cpu || 0) * 100);
  const memUsage = formatBytes(vm.mem || 0);
  const ramLabel = 'RAM';
  
  return `
    <div class="vm-item" data-vm-id="${vm.vmid}" data-vm-name="${vmName.toLowerCase()}">
      <div class="vm-header">
        <span class="vm-status ${vmStatus}"></span>
        <a href="${cluster.url}/#v1:0:=qemu%2F${vm.vmid}:4::::::" target="_blank">${vmName}</a>
      </div>
      <div class="vm-metric">
        <span class="vm-metric-value">${cpuPercent}%</span>
        <span class="vm-metric-label">CPU</span>
      </div>
      <div class="vm-metric">
        <span class="vm-metric-value">${memUsage}</span>
        <span class="vm-metric-label">${ramLabel}</span>
      </div>
      <div class="vm-metric">
        <span class="vm-metric-value">${vm.vmid}</span>
        <span class="vm-metric-label">VM ID</span>
      </div>
      ${vm.uptime ? `<div class="vm-uptime">Uptime: ${formatUptime(vm.uptime)}</div>` : ''}
    </div>
  `;
}

function attachClusterEventListeners() {
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = btn.getAttribute('data-url');
      copyToClipboard(url);
      const icon = btn.querySelector('i');
      icon.classList.replace('fa-copy', 'fa-check');
      setTimeout(() => icon.classList.replace('fa-check', 'fa-copy'), 2000);
    });
  });
  
  document.querySelectorAll('.region h2').forEach(header => {
    header.addEventListener('click', () => {
      header.parentElement.classList.toggle('collapsed');
    });
  });
}

window.toggleVMDetails = function(button) {
  const details = button.nextElementSibling;
  const icon = button.querySelector('.fa-chevron-down, .fa-chevron-up');
  
  details.classList.toggle('visible');
  if (icon) {
    if (icon.classList.contains('fa-chevron-down')) {
      icon.classList.replace('fa-chevron-down', 'fa-chevron-up');
    } else {
      icon.classList.replace('fa-chevron-up', 'fa-chevron-down');
    }
  }
};
