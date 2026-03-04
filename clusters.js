// Domain-agnostic hostname formatter
function getDisplayNodeName(fullName) {
  if (typeof fullName !== 'string' || fullName.length === 0) return '';
  if (!fullName.includes('.')) return fullName;
  return fullName.split('.')[0];
}

function getClusterQuorumState(cluster, clusterInfra) {
  const quorumRaw = String(clusterInfra?.quorum ?? 'unknown').toLowerCase();
  const quorumTrueStates = ['1', 'yes', 'true', 'ok', 'quorate', 'online'];
  const quorumFalseStates = ['0', 'no', 'false', 'offline', 'not_quorate'];

  if (quorumTrueStates.includes(quorumRaw)) {
    return {
      hasQuorum: true,
      title: `Quorum: ${clusterInfra?.quorum} | Nodes: ${clusterInfra?.nodes ?? 'n/a'} | Votes: ${clusterInfra?.totalVotes ?? 'n/a'}/${clusterInfra?.expectedVotes ?? 'n/a'}`
    };
  }

  if (quorumFalseStates.includes(quorumRaw)) {
    return {
      hasQuorum: false,
      title: `Quorum: ${clusterInfra?.quorum} | Nodes: ${clusterInfra?.nodes ?? 'n/a'} | Votes: ${clusterInfra?.totalVotes ?? 'n/a'}/${clusterInfra?.expectedVotes ?? 'n/a'}`
    };
  }

  const expectedVotes = Number(clusterInfra?.expectedVotes);
  const totalVotes = Number(clusterInfra?.totalVotes);
  if (Number.isFinite(expectedVotes) && expectedVotes > 0 && Number.isFinite(totalVotes)) {
    const hasQuorum = totalVotes > (expectedVotes / 2);
    return {
      hasQuorum,
      title: `Quorum derived from votes: ${totalVotes}/${expectedVotes}`
    };
  }

  const clusterNodes = [cluster?.node1, cluster?.node2, cluster?.node3].filter(Boolean);
  const configuredNodes = clusterNodes.length;
  const onlineNodes = clusterNodes.filter(node => {
    const status = getNodeStatus(node);
    return status === 'online' || status === 'degraded';
  }).length;

  if (configuredNodes > 0) {
    const hasQuorum = onlineNodes > (configuredNodes / 2);
    return {
      hasQuorum,
      title: `Quorum derived from node status: ${onlineNodes}/${configuredNodes} nodes reachable`
    };
  }

  return {
    hasQuorum: false,
    title: 'No cluster quorum data available'
  };
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
  refreshNautobotPresenceIndicators(container);
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
  const clusterInfra = getClusterInfra(cluster.name);
  const quorum = getClusterQuorumState(cluster, clusterInfra);
  const quorumBadgeClass = quorum.hasQuorum ? 'healthy' : 'warning';
  const quorumLabel = quorum.hasQuorum ? 'Quorum OK' : 'No Quorum';
  const quorumTitle = quorum.title;
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
      <span class="ceph-health-badge ${quorumBadgeClass}" title="${quorumTitle}"><i class="fas fa-balance-scale"></i> ${quorumLabel}</span>
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
  const nodes = [cluster.node1, cluster.node2, cluster.node3]
    .filter(Boolean)
    .map(nodeName => ({
      name: nodeName,
      fullName: nodeName
    }));
  
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
  const installedRam = formatBytes(nodeData.maxmem || 0);
  const diskPercent = nodeData.maxdisk ? Math.round((nodeData.disk / nodeData.maxdisk) * 100) : 0;
  const ramLabel = 'RAM';
  const swapPercent = nodeData.maxswap ? Math.round((nodeData.swap / nodeData.maxswap) * 100) : 0;
  const loadAvgOneMinute = Array.isArray(nodeData.loadavg) ? Number(nodeData.loadavg[0] || 0).toFixed(2) : '0.00';
  const runningContainers = (nodeData.containers || []).filter(ct => ct.status === 'running').length;
  const totalContainers = (nodeData.containers || []).length;
  
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
      <div class="node-infra-meta" title="Kernel, load average, swap and guest density">
        <span><i class="fas fa-microchip"></i> ${nodeData.cpus || 0} cores</span>
        <span><i class="fas fa-memory"></i> RAM ${installedRam}</span>
        <span><i class="fas fa-tachometer-alt"></i> Load ${loadAvgOneMinute}</span>
        <span><i class="fas fa-memory"></i> Swap ${swapPercent}%</span>
      </div>
      <div class="node-infra-meta">
        <span><i class="fas fa-box"></i> CTs ${runningContainers}/${totalContainers}</span>
        <span><i class="fas fa-hdd"></i> Pools ${(nodeData.storage && nodeData.storage.activePools) || 0}/${(nodeData.storage && nodeData.storage.pools) || 0}</span>
        <span><i class="fas fa-id-card"></i> ${nodeData.subscription || 'unknown'}</span>
      </div>
      <div class="pve-version ${isVersionOutdated ? 'version-outdated' : ''}" title="Kernel: ${nodeData.kernel || 'unknown'}">
        Version: ${nodeData.pveversion || 'N/A'}
        ${isVersionOutdated ? '<i class="fas fa-exclamation-triangle"></i>' : ''}
      </div>
      ${vmsHTML}
    </div>
  `;
}

function createVMHTML(vm, cluster) {
  const vmName = vm.name || `VM ${vm.vmid}`;
  const vmNautobotKey = encodeURIComponent(getNautobotVmKey(vmName));
  const safeVmName = sanitizeHTML(vmName);
  const vmStatus = vm.status || 'stopped';
  const cpuPercent = Math.round((vm.cpu || 0) * 100);
  const memUsage = formatBytes(vm.mem || 0);
  const ramLabel = 'RAM';
  const nautobotInfo = getVmNautobotInfo(vm);
  const vmUptimeMarkup = vm.uptime
    ? `<div class="vm-uptime">Uptime: ${formatUptime(vm.uptime)}</div>`
    : '';
  const vmNautobotMetaMarkup = nautobotInfo.url
    ? `
      <div class="vm-nautobot-meta" data-nautobot-meta>
        <a href="${nautobotInfo.url}" class="nautobot-link hidden" data-nautobot-link target="_blank" rel="noopener noreferrer"><i class="fas fa-link"></i> Nautobot</a>
        <span class="nautobot-presence-icon ${nautobotInfo.state}" data-nautobot-vm-key="${vmNautobotKey}" data-nautobot-vm-name="${safeVmName}" data-nautobot-state="${nautobotInfo.state}" data-nautobot-title="${sanitizeHTML(nautobotInfo.title)}" data-nautobot-link-visible="${nautobotInfo.isVisible === true}" title="${sanitizeHTML(nautobotInfo.title)}" aria-label="${sanitizeHTML(nautobotInfo.title)}">
          <span class="nautobot-presence-letter">N</span>
        </span>
      </div>
    `
    : '';
  
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
      ${vmUptimeMarkup}
      ${vmNautobotMetaMarkup}
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
