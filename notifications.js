// Notifications System

class NotificationManager {
  constructor() {
    this.notifications = [];
    this.checkedAlerts = new Set();
  }
  
  checkAlerts() {
    if (!STATE.clustersData || !STATE.statusData) return;
    
    const newAlerts = [];
    
    // Check all clusters and nodes
    Object.entries(STATE.clustersData).forEach(([region, clusters]) => {
      clusters.forEach(cluster => {
        // Check cluster status
        const clusterStatus = getClusterStatus(cluster.name);
        if (clusterStatus === 'offline') {
          const alertKey = `cluster-offline-${cluster.name}`;
          if (!this.checkedAlerts.has(alertKey)) {
            newAlerts.push({
              type: 'critical',
              title: 'Cluster Offline',
              message: `${cluster.name} is offline`,
              cluster: cluster.name,
              timestamp: new Date().toISOString()
            });
            this.checkedAlerts.add(alertKey);
          }
        }
        
        // Check nodes
        const nodes = [cluster.node1, cluster.node2, cluster.node3].filter(Boolean);
        nodes.forEach(node => {
          const nodeData = getNodeData(node);
          if (!nodeData) return;
          
          // CPU alert
          const cpuPercent = (nodeData.cpu || 0) * 100;
          if (cpuPercent >= CONFIG.thresholds.cpuCritical) {
            const alertKey = `cpu-critical-${node}`;
            if (!this.checkedAlerts.has(alertKey)) {
              newAlerts.push({
                type: 'critical',
                title: 'High CPU Usage',
                message: `${getShortNodeName(node)}: ${Math.round(cpuPercent)}% CPU`,
                cluster: cluster.name,
                node: node,
                timestamp: new Date().toISOString()
              });
              this.checkedAlerts.add(alertKey);
            }
          } else if (cpuPercent >= CONFIG.thresholds.cpuWarning) {
            const alertKey = `cpu-warning-${node}`;
            if (!this.checkedAlerts.has(alertKey)) {
              newAlerts.push({
                type: 'warning',
                title: 'Elevated CPU Usage',
                message: `${getShortNodeName(node)}: ${Math.round(cpuPercent)}% CPU`,
                cluster: cluster.name,
                node: node,
                timestamp: new Date().toISOString()
              });
              this.checkedAlerts.add(alertKey);
            }
          }
          
          // Memory alert
          if (nodeData.maxmem) {
            const memPercent = (nodeData.mem / nodeData.maxmem) * 100;
            if (memPercent >= CONFIG.thresholds.memoryCritical) {
              const alertKey = `memory-critical-${node}`;
              if (!this.checkedAlerts.has(alertKey)) {
                newAlerts.push({
                  type: 'critical',
                  title: 'High Memory Usage',
                  message: `${getShortNodeName(node)}: ${Math.round(memPercent)}% Memory`,
                  cluster: cluster.name,
                  node: node,
                  timestamp: new Date().toISOString()
                });
                this.checkedAlerts.add(alertKey);
              }
            }
          }
          
          // Version check
          if (nodeData.pveversion) {
            if (compareVersions(nodeData.pveversion, CONFIG.pveVersionProd) < 0) {
              const alertKey = `version-outdated-${node}`;
              if (!this.checkedAlerts.has(alertKey)) {
                newAlerts.push({
                  type: 'info',
                  title: 'Update Available',
                  message: `${getShortNodeName(node)}: v${nodeData.pveversion} (current: ${CONFIG.pveVersionProd})`,
                  cluster: cluster.name,
                  node: node,
                  timestamp: new Date().toISOString()
                });
                this.checkedAlerts.add(alertKey);
              }
            }
          }
        });
      });
    });
    
    // Add new alerts to notifications
    if (newAlerts.length > 0) {
      this.notifications.unshift(...newAlerts);
      this.updateUI();
    }
  }
  
  updateUI() {
    const badge = document.getElementById('notificationBadge');
    const content = document.getElementById('notificationsContent');
    
    if (this.notifications.length === 0) {
      badge.style.display = 'none';
      content.innerHTML = '<p class="no-notifications">No notifications</p>';
      return;
    }
    
    badge.style.display = 'block';
    badge.textContent = this.notifications.length;
    
    content.innerHTML = this.notifications.map(notif => `
      <div class="notification-item ${notif.type}">
        <div class="notification-title">
          <i class="fas fa-${notif.type === 'critical' ? 'exclamation-circle' : notif.type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
          ${notif.title}
        </div>
        <div class="notification-message">${notif.message}</div>
        <div class="notification-time">${getTimeAgo(notif.timestamp)}</div>
      </div>
    `).join('');
  }
  
  acknowledgeAll() {
    const count = this.notifications.length;
    this.notifications = [];
    this.updateUI();
    return count;
  }

  clearAll() {
    const count = this.notifications.length;
    this.notifications = [];
    this.checkedAlerts.clear();
    this.updateUI();
    return count;
  }
}

const notificationManager = new NotificationManager();
