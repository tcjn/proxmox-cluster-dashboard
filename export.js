// Export Functionality

function exportToCSV() {
  if (!STATE.clustersData || !STATE.statusData) {
    showToast('No data available to export', 'error');
    return;
  }
  
  const rows = [['Region', 'Cluster', 'Status', 'Node', 'Node Status', 'CPU %', 'Memory %', 'Disk %', 'VMs', 'PVE Version']];
  
  Object.entries(STATE.clustersData).forEach(([region, clusters]) => {
    clusters.forEach(cluster => {
      const clusterStatus = getClusterStatus(cluster.name);
      const nodes = [cluster.node1, cluster.node2, cluster.node3].filter(Boolean);
      
      nodes.forEach(node => {
        const nodeData = getNodeData(node);
        const nodeStatus = getNodeStatus(node);
        const shortName = getShortNodeName(node);
        
        if (nodeData) {
          const cpu = Math.round((nodeData.cpu || 0) * 100);
          const mem = nodeData.maxmem ? Math.round((nodeData.mem / nodeData.maxmem) * 100) : 0;
          const disk = nodeData.maxdisk ? Math.round((nodeData.disk / nodeData.maxdisk) * 100) : 0;
          const vmCount = nodeData.vms ? nodeData.vms.length : 0;
          const version = nodeData.pveversion || 'N/A';
          
          rows.push([region, cluster.name, clusterStatus, shortName, nodeStatus, cpu, mem, disk, vmCount, version]);
        } else {
          rows.push([region, cluster.name, clusterStatus, shortName, nodeStatus, '-', '-', '-', '-', '-']);
        }
      });
    });
  });
  
  const csv = rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
  downloadFile(`proxmox-export-${formatDate(new Date())}.csv`, csv, 'text/csv');
  showToast('Exported to CSV successfully', 'success');
}

function exportToJSON() {
  if (!STATE.clustersData || !STATE.statusData) {
    showToast('No data available to export', 'error');
    return;
  }
  
  const exportData = {
    timestamp: new Date().toISOString(),
    clusters: STATE.clustersData,
    status: STATE.statusData,
    statistics: calculateStatistics()
  };
  
  const json = JSON.stringify(exportData, null, 2);
  downloadFile(`proxmox-export-${Date.now()}.json`, json, 'application/json');
  showToast('Exported to JSON successfully', 'success');
}

function exportToHTML() {
  if (!STATE.clustersData || !STATE.statusData) {
    showToast('No data available to export', 'error');
    return;
  }
  
  const stats = calculateStatistics();
  
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Proxmox Infrastructure Report - ${formatDate(new Date())}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 2rem; line-height: 1.6; }
    h1 { color: #0a1628; border-bottom: 3px solid #0ea5e9; padding-bottom: 0.5rem; }
    h2 { color: #1a2942; margin-top: 2rem; }
    table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
    th, td { padding: 0.75rem; border: 1px solid #ddd; text-align: left; }
    th { background: #0a1628; color: white; }
    tr:nth-child(even) { background: #f8fafc; }
    .stat-card { display: inline-block; margin: 1rem; padding: 1rem; background: #f1f5f9; border-radius: 8px; min-width: 200px; }
    .stat-value { font-size: 2rem; font-weight: bold; color: #0ea5e9; }
    .stat-label { color: #64748b; font-size: 0.9rem; }
    .status-online { color: #10b981; font-weight: bold; }
    .status-offline { color: #ef4444; font-weight: bold; }
    .status-degraded { color: #f59e0b; font-weight: bold; }
  </style>
</head>
<body>
  <h1>Proxmox Infrastructure Report</h1>
  <p><strong>Generated:</strong> ${formatDate(new Date())}</p>
  
  <h2>Overview Statistics</h2>
  <div>
    <div class="stat-card">
      <div class="stat-value">${stats.totalClusters}</div>
      <div class="stat-label">Total Clusters</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${stats.totalNodes}</div>
      <div class="stat-label">Total Nodes</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${stats.totalVMs}</div>
      <div class="stat-label">Total VMs</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${stats.healthScore}%</div>
      <div class="stat-label">Health Score</div>
    </div>
  </div>
  
  <h2>Cluster Details</h2>
  <table>
    <thead>
      <tr>
        <th>Region</th>
        <th>Cluster</th>
        <th>Status</th>
        <th>Nodes</th>
        <th>VMs</th>
        <th>Avg CPU</th>
        <th>Avg Memory</th>
      </tr>
    </thead>
    <tbody>
      ${Object.entries(STATE.clustersData).map(([region, clusters]) => 
        clusters.map(cluster => {
          const clusterStatus = getClusterStatus(cluster.name);
          const nodes = [cluster.node1, cluster.node2, cluster.node3].filter(Boolean);
          const vmCount = getClusterVMCount(cluster);
          const avgCpu = Math.round(getClusterAvgCPU(cluster));
          const avgMem = Math.round(getClusterAvgMemory(cluster));
          
          return `
            <tr>
              <td>${region}</td>
              <td>${cluster.name}</td>
              <td class="status-${clusterStatus}">${clusterStatus}</td>
              <td>${nodes.length}</td>
              <td>${vmCount}</td>
              <td>${avgCpu}%</td>
              <td>${avgMem}%</td>
            </tr>
          `;
        }).join('')
      ).join('')}
    </tbody>
  </table>
  
  <p style="margin-top: 2rem; color: #64748b; font-size: 0.9rem;">
    Report generated by Proxmox Cluster Dashboard
  </p>
</body>
</html>
  `;
  
  downloadFile(`proxmox-report-${Date.now()}.html`, html, 'text/html');
  showToast('Exported HTML report successfully', 'success');
}
