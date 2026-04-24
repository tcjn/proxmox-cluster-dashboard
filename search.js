// Search Functionality

function searchClusters() {
  const searchTerm = document.getElementById('searchInput').value.trim().toLowerCase();
  
  if (!searchTerm) {
    clearSearchResults();
    return;
  }
  
  const results = {
    clusters: new Map(),
    vms: [],
    nodes: new Set()
  };

  const ensureClusterResult = (cluster, region) => {
    if (!results.clusters.has(cluster.name)) {
      const nodes = [cluster.node1, cluster.node2, cluster.node3].filter(Boolean);
      const vmCount = nodes.reduce((count, nodeName) => {
        const nodeData = getNodeData(nodeName);
        return count + ((nodeData && Array.isArray(nodeData.vms)) ? nodeData.vms.length : 0);
      }, 0);

      results.clusters.set(cluster.name, {
        name: cluster.name,
        url: cluster.url,
        region,
        status: getClusterStatus(cluster.name),
        nodeCount: nodes.length,
        vmCount
      });
    }
  };
  
  Object.entries(STATE.clustersData || {}).forEach(([region, clusters]) => {
    clusters.forEach(cluster => {
      let clusterMatches = false;
      
      // Check cluster name
      if ((STATE.searchType === 'all' || STATE.searchType === 'clusters') &&
          cluster.name.toLowerCase().includes(searchTerm)) {
        clusterMatches = true;
        ensureClusterResult(cluster, region);
      }
      
      // Check nodes
      const nodes = [
        { name: getShortNodeName(cluster.node1), fullName: cluster.node1 },
        { name: getShortNodeName(cluster.node2), fullName: cluster.node2 }
      ];
      if (cluster.node3) {
        nodes.push({ name: getShortNodeName(cluster.node3), fullName: cluster.node3 });
      }
      
      nodes.forEach(node => {
        // Check node name
        if (node.name.toLowerCase().includes(searchTerm)) {
          results.nodes.add(node.name);
          ensureClusterResult(cluster, region);
        }
        
        // Check VMs
        if (STATE.searchType === 'all' || STATE.searchType === 'vms') {
          const nodeData = getNodeData(node.fullName);
          if (nodeData && nodeData.vms && Array.isArray(nodeData.vms)) {
            nodeData.vms.forEach(vm => {
              const vmName = vm.name || `VM ${vm.vmid}`;
              const vmId = vm.vmid.toString();
              
              if (vmName.toLowerCase().includes(searchTerm) || 
                  vmId.includes(searchTerm) ||
                  clusterMatches) {
                results.vms.push({
                  cluster: cluster.name,
                  clusterUrl: cluster.url,
                  node: node.name,
                  nodeFullName: node.fullName,
                  vm: vm,
                  region: region
                });
                ensureClusterResult(cluster, region);
                results.nodes.add(node.name);
              }
            });
          }
        }
      });
    });
  });
  
  updateSearchResults(results);
}

function updateSearchResults(results) {
  const summaryEl = document.getElementById('searchResultsSummary');
  const noResultsEl = document.getElementById('noResults');
  const vmSearchEl = document.getElementById('vmSearchResults');
  const vmGridEl = document.getElementById('vmSearchGrid');
  const clusterSearchEl = document.getElementById('clusterSearchResults');
  const clusterGridEl = document.getElementById('clusterSearchGrid');

  const totalResults = results.clusters.size + results.vms.length;
  
  if (totalResults === 0) {
    summaryEl.classList.remove('visible');
    vmSearchEl.classList.remove('visible');
    clusterSearchEl.classList.remove('visible');
    noResultsEl.classList.add('visible');
    document.body.classList.remove('vm-search-mode');
  } else {
    summaryEl.classList.add('visible');
    noResultsEl.classList.remove('visible');
    
    // Update counts
    document.querySelector('#clusterResultsCount span').textContent = results.clusters.size;
    document.querySelector('#vmResultsCount span').textContent = results.vms.length;
    document.querySelector('#nodeResultsCount span').textContent = results.nodes.size;
    
    // Show cluster results if searching for clusters
    if (STATE.searchType === 'clusters' || (STATE.searchType === 'all' && results.clusters.size > 0)) {
      clusterSearchEl.classList.add('visible');

      const clusterResults = Array.from(results.clusters.values())
        .sort((a, b) => a.name.localeCompare(b.name));

      clusterGridEl.innerHTML = clusterResults
        .map(clusterResult => createClusterSearchCard(clusterResult))
        .join('');
    } else {
      clusterSearchEl.classList.remove('visible');
    }

    // Show VM results if searching for VMs
    if (STATE.searchType === 'vms' || (STATE.searchType === 'all' && results.vms.length > 0)) {
      vmSearchEl.classList.add('visible');
      document.body.classList.add('vm-search-mode');
      
      vmGridEl.innerHTML = results.vms.map(vmResult => createVMSearchCard(vmResult)).join('');
      refreshNautobotPresenceIndicators(vmGridEl);
    } else {
      vmSearchEl.classList.remove('visible');
      document.body.classList.remove('vm-search-mode');
    }
  }
}

function createVMSearchCard(vmResult) {
  const vm = vmResult.vm;
  const vmName = vm.name || `VM ${vm.vmid}`;
  const vmNautobotKey = encodeURIComponent(getNautobotVmKey(vmName));
  const safeVmName = sanitizeHTML(vmName);
  const vmStatus = vm.status || 'stopped';
  const cpuPercent = Math.round((vm.cpu || 0) * 100);
  const memUsage = formatBytes(vm.mem || 0);
  const uptime = vm.uptime ? formatUptime(vm.uptime) : 'N/A';
  const nautobotInfo = getVmNautobotInfo(vm);
  
  const flagCode = CONFIG.countryFlags[vmResult.cluster] || '';
  const clusterStatus = getClusterStatus(vmResult.cluster);
  
  return `
    <div class="vm-search-item" data-vm-id="${vm.vmid}" data-cluster="${vmResult.cluster}">
      <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
        <div>
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
            <span class="vm-status ${vmStatus}" style="width: 10px; height: 10px; border-radius: 50%; box-shadow: 0 0 8px currentColor;"></span>
            <span style="font-weight: 700; font-size: 1.1rem;">${vmName}</span>
            <span style="background: var(--link); color: white; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 700;">
              VM ${vm.vmid}
            </span>
          </div>
          <div style="font-size: 0.85rem; color: var(--copy); display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
            ${flagCode ? `<img src="https://flagcdn.com/24x18/${flagCode}.png" alt="${flagCode}" style="width: 20px; border-radius: 2px;"/>` : ''}
            <a href="${vmResult.clusterUrl}" target="_blank" style="color: var(--link); text-decoration: none; font-weight: 600;">${vmResult.cluster}</a>
            <span>•</span>
            <a href="https://${vmResult.nodeFullName}:8006" target="_blank" style="color: var(--link); text-decoration: none;">${vmResult.node}</a>
          </div>
        </div>
        <span style="color: ${vmStatus === 'running' ? 'var(--online)' : 'var(--offline)'}; font-size: 0.85rem; font-weight: 600; text-transform: uppercase;">
          ${vmStatus}
        </span>
      </div>
      
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-bottom: 1rem;">
        <div style="text-align: center; padding: 0.75rem; background: var(--node-bg); border-radius: var(--radius-md);">
          <div style="font-weight: 700; font-size: 1.1rem; font-family: 'IBM Plex Mono', monospace;">${cpuPercent}%</div>
          <div style="font-size: 0.7rem; color: var(--copy); text-transform: uppercase; letter-spacing: 0.05em;">CPU</div>
        </div>
        <div style="text-align: center; padding: 0.75rem; background: var(--node-bg); border-radius: var(--radius-md);">
          <div style="font-weight: 700; font-size: 1.1rem; font-family: 'IBM Plex Mono', monospace;">${memUsage}</div>
          <div style="font-size: 0.7rem; color: var(--copy); text-transform: uppercase; letter-spacing: 0.05em;">RAM</div>
        </div>
        <div style="text-align: center; padding: 0.75rem; background: var(--node-bg); border-radius: var(--radius-md);">
          <div style="font-weight: 700; font-size: 1.1rem; font-family: 'IBM Plex Mono', monospace;">${uptime}</div>
          <div style="font-size: 0.7rem; color: var(--copy); text-transform: uppercase; letter-spacing: 0.05em;">Uptime</div>
        </div>
      </div>
      
      <div style="display: flex; gap: 0.75rem; justify-content: center;" data-nautobot-meta>
        <a href="${vmResult.clusterUrl}/#v1:0:=qemu%2F${vm.vmid}:4::::::" class="btn-primary" target="_blank" style="flex: 1; text-align: center; text-decoration: none; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
          <i class="fas fa-external-link-alt"></i> Open VM
        </a>
        ${nautobotInfo.url ? `<a href="${nautobotInfo.url}" class="btn-primary hidden" data-nautobot-link target="_blank" rel="noopener noreferrer" style="flex: 1; text-align: center; text-decoration: none; display: flex; align-items: center; justify-content: center; gap: 0.5rem; background: transparent; border-color: var(--link); color: var(--link);">
          <i class="fas fa-link"></i> Nautobot
        </a>
        <a href="${nautobotInfo.url}" class="nautobot-presence-link hidden" data-nautobot-link-icon target="_blank" rel="noopener noreferrer" aria-label="${sanitizeHTML(nautobotInfo.title)}" style="align-self: center;">
        <span class="nautobot-presence-icon ${nautobotInfo.state}" data-nautobot-vm-key="${vmNautobotKey}" data-nautobot-vm-name="${safeVmName}" data-nautobot-state="${nautobotInfo.state}" data-nautobot-title="${sanitizeHTML(nautobotInfo.title)}" data-nautobot-link-visible="${nautobotInfo.isVisible === true}" title="${sanitizeHTML(nautobotInfo.title)}" aria-label="${sanitizeHTML(nautobotInfo.title)}" style="font-size: 0.95rem;">
          <span class="nautobot-presence-letter">N</span>
        </span>
        </a>` : ''}
      </div>
    </div>
  `;
}

function createClusterSearchCard(clusterResult) {
  const flagCode = CONFIG.countryFlags[clusterResult.name] || '';

  return `
    <div class="cluster-search-item">
      <div class="cluster-search-item-header">
        <a href="${clusterResult.url}" target="_blank" class="cluster-search-item-title">
          ${flagCode ? `<img class="flag" src="https://flagcdn.com/24x18/${flagCode}.png" alt="${flagCode}"/>` : ''}
          ${clusterResult.name}
        </a>
        <span class="node-status ${clusterResult.status}">${clusterResult.status}</span>
      </div>
      <div class="cluster-search-item-meta">
        <span><i class="fas fa-globe"></i> ${clusterResult.region.toUpperCase()}</span>
        <span><i class="fas fa-hdd"></i> ${clusterResult.nodeCount} node${clusterResult.nodeCount === 1 ? '' : 's'}</span>
        <span><i class="fas fa-desktop"></i> ${clusterResult.vmCount} VM${clusterResult.vmCount === 1 ? '' : 's'}</span>
      </div>
    </div>
  `;
}

function clearSearchResults() {
  document.getElementById('searchResultsSummary').classList.remove('visible');
  document.getElementById('vmSearchResults').classList.remove('visible');
  document.getElementById('clusterSearchResults').classList.remove('visible');
  document.getElementById('noResults').classList.remove('visible');
  document.body.classList.remove('vm-search-mode');
}
