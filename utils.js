// Utility Functions

// Format bytes to human-readable format
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Format RAM capacity as rounded GB, handling both bytes and MiB input formats
function formatRamCapacity(memoryValue) {
  if (!memoryValue) return '0 GB';

  const bytes = memoryValue > (4 * 1024 * 1024 * 1024)
    ? memoryValue
    : memoryValue * 1024 * 1024;

  const gb = Math.round(bytes / Math.pow(1024, 3));
  return `${gb} GB`;
}

// Format uptime in seconds to human-readable format
function formatUptime(seconds) {
  if (!seconds) return 'N/A';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// Compare version strings
function compareVersions(v1, v2) {
  if (!v1 || !v2) return 0;
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 !== p2) return p1 - p2;
  }
  return 0;
}

// Get short node name (remove domain)
function getShortNodeName(fullNodeName) {
  if (!fullNodeName) return '';

  let normalized = String(fullNodeName).trim();

  // Handle values passed as URL, e.g. https://srv01.expereo.local:8006
  normalized = normalized.replace(/^https?:\/\//i, '');

  // Remove path/query fragments if present
  normalized = normalized.split('/')[0].split('?')[0].split('#')[0];

  // Remove port suffix
  normalized = normalized.split(':')[0];

  return normalized.split('.')[0];
}

// Get compact node display name for cards
function getDisplayNodeName(fullNodeName) {
  const shortName = getShortNodeName(fullNodeName);
  if (!shortName) return '';

  const parts = shortName.split('-').filter(Boolean);
  const trailingPart = parts[parts.length - 1] || shortName;

  if (/^(srv|node)\d+[a-z0-9-]*$/i.test(trailingPart)) {
    return trailingPart;
  }

  return shortName;
}

// Get region from cluster name
function getRegionFromClusterName(clusterName) {
  // Check if it's CME cluster
  if (clusterName.toLowerCase().includes('cme')) {
    return 'CME';
  }
  
  const prefix = clusterName.split('-')[0].toLowerCase();
  
  for (const [region, prefixes] of Object.entries(CONFIG.regionPrefixes)) {
    if (prefixes.includes(prefix)) {
      return region;
    }
  }
  
  return 'OTHER';
}

// Get cluster status from status data
function getClusterStatus(clusterName) {
  if (!STATE.statusData || !STATE.statusData.clusterStatus) {
    return 'offline';
  }
  return STATE.statusData.clusterStatus[clusterName] || 'offline';
}

// Get ceph status for a cluster from status data
function getCephStatus(clusterName) {
  if (!STATE.statusData || !STATE.statusData.cephStatus || !clusterName) {
    return null;
  }

  return STATE.statusData.cephStatus[clusterName] || null;
}

function getClusterInfra(clusterName) {
  if (!STATE.statusData || !STATE.statusData.clusterInfra || !clusterName) {
    return null;
  }

  return STATE.statusData.clusterInfra[clusterName] || null;
}

function getCephHealthLabel(clusterName) {
  const cephStatus = getCephStatus(clusterName);
  if (!cephStatus) return 'unknown';

  const rawHealth = extractCephHealthValue(cephStatus);
  return normalizeCephHealthLabel(rawHealth);
}

function getCephHealthDetails(clusterName) {
  const cephStatus = getCephStatus(clusterName);
  if (!cephStatus) {
    return {
      label: 'unknown',
      text: 'Unknown',
      details: 'No Ceph status data available.'
    };
  }

  const rawHealth = extractCephHealthValue(cephStatus);
  const label = normalizeCephHealthLabel(rawHealth);

  const checks = cephStatus.health && typeof cephStatus.health === 'object' && cephStatus.health.checks
    ? cephStatus.health.checks
    : null;

  let details = '';
  if (checks && Object.keys(checks).length > 0) {
    details = `${Object.keys(checks).length} active checks`;
  } else if (cephStatus.health && typeof cephStatus.health === 'object' && cephStatus.health.summary) {
    details = String(cephStatus.health.summary);
  } else if (cephStatus.detail) {
    details = String(cephStatus.detail);
  }

  const textMap = {
    healthy: 'Healthy',
    warning: 'Warning',
    critical: 'Critical',
    'not-installed': 'Not installed',
    unknown: 'Unknown'
  };

  return {
    label,
    text: textMap[label] || label,
    details
  };
}

function extractCephHealthValue(cephStatus) {
  if (typeof cephStatus === 'string') return cephStatus;
  if (!cephStatus || typeof cephStatus !== 'object') return 'unknown';

  const health = cephStatus.health;
  if (typeof health === 'string') return health;
  if (health && typeof health === 'object') {
    if (typeof health.status === 'string') return health.status;
    if (typeof health.overall_status === 'string') return health.overall_status;
    if (typeof health.overallStatus === 'string') return health.overallStatus;
  }

  if (typeof cephStatus.status === 'string') return cephStatus.status;
  if (typeof cephStatus.overall_status === 'string') return cephStatus.overall_status;

  return 'unknown';
}

function normalizeCephHealthLabel(rawHealth) {
  const normalized = String(rawHealth || 'unknown').trim().toLowerCase();

  if (normalized === 'health_ok' || normalized === 'ok' || normalized === 'healthy') return 'healthy';
  if (normalized === 'health_warn' || normalized === 'warn' || normalized === 'warning') return 'warning';
  if (normalized === 'health_err' || normalized === 'health_error' || normalized === 'error' || normalized === 'critical') return 'critical';
  if (normalized === 'not-installed' || normalized === 'not_installed' || normalized === 'not installed') return 'not-installed';

  return 'unknown';
}


// Get node status from status data
function getNodeStatus(nodeName) {
  if (!STATE.statusData || !STATE.statusData.nodeStatus) {
    return 'offline';
  }
  
  const shortName = getShortNodeName(nodeName);
  
  // Try exact match
  if (STATE.statusData.nodeStatus[nodeName]) {
    return STATE.statusData.nodeStatus[nodeName];
  }
  
  // Try short name
  if (STATE.statusData.nodeStatus[shortName]) {
    return STATE.statusData.nodeStatus[shortName];
  }
  
  // Try partial match
  const nodeKey = Object.keys(STATE.statusData.nodeStatus).find(key => 
    key.includes(shortName) || shortName.includes(key)
  );
  
  return nodeKey ? STATE.statusData.nodeStatus[nodeKey] : 'offline';
}

// Get node data from status data
function getNodeData(nodeName) {
  if (!STATE.statusData || !STATE.statusData.nodeData) {
    return null;
  }
  
  const shortName = getShortNodeName(nodeName);
  
  // Try exact match
  if (STATE.statusData.nodeData[nodeName]) {
    return STATE.statusData.nodeData[nodeName];
  }
  
  // Try short name
  if (STATE.statusData.nodeData[shortName]) {
    return STATE.statusData.nodeData[shortName];
  }
  
  // Try partial match
  const nodeKey = Object.keys(STATE.statusData.nodeData).find(key => 
    key.includes(shortName) || shortName.includes(key) ||
    nodeName.includes(key) || key.includes(nodeName)
  );
  
  return nodeKey ? STATE.statusData.nodeData[nodeKey] : null;
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'visible', 'found', 'present', 'exist', 'exists'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'hidden', 'missing', 'absent'].includes(normalized)) return false;
  }

  return null;
}

function normalizeNautobotStatus(statusValue) {
  if (typeof statusValue !== 'string') return null;

  const normalized = statusValue.trim().toLowerCase();
  if (['exist', 'exists', 'present', 'found'].includes(normalized)) return 'present';
  if (['missing', 'absent', 'not-found', 'not_found'].includes(normalized)) return 'missing';
  if (['unknown', 'n/a', 'na'].includes(normalized)) return 'unknown';

  return null;
}

function getNautobotBaseUrl() {
  return (CONFIG?.nautobot?.baseUrl || '').trim().replace(/\/$/, '');
}

function getShortVmName(vmName) {
  if (!vmName) return '';
  return String(vmName).trim().split('.')[0];
}

function getVmNautobotInfo(vm) {
  const nautobotEnabled = CONFIG?.nautobot?.enabled !== false;
  const vmName = vm?.name || `VM ${vm?.vmid || ''}`;
  const vmLookupName = getShortVmName(vmName) || vmName;

  const visibilitySignals = [
    vm?.nautobotVisible,
    vm?.nautobot_visibility,
    vm?.inNautobot,
    vm?.in_nautobot,
    vm?.nautobot?.visible,
    vm?.nautobot?.exists,
    vm?.nautobot?.found
  ];

  const firstVisibilitySignal = visibilitySignals
    .map(normalizeBoolean)
    .find(value => value !== null);

  const statusSignals = [
    vm?.nautobotStatus,
    vm?.nautobot_status,
    vm?.nautobot?.status,
    vm?.nautobot,
    vm?.nautobotExists,
    vm?.nautobot_exists,
    vm?.existsInNautobot,
    vm?.exists_in_nautobot
  ];

  const firstStatusSignal = statusSignals
    .map(normalizeNautobotStatus)
    .find(value => value !== null);

  const firstBooleanStatusSignal = statusSignals
    .map(normalizeBoolean)
    .find(value => value !== null);

  const explicitUrl = vm?.nautobotUrl || vm?.nautobot_url || vm?.nautobot?.url;

  const state = firstStatusSignal || (
    firstVisibilitySignal === true || firstBooleanStatusSignal === true || Boolean(explicitUrl)
      ? 'present'
      : firstVisibilitySignal === false || firstBooleanStatusSignal === false
        ? 'missing'
        : 'unknown'
  );
  const title = {
    present: 'VM record found in Nautobot.',
    missing: 'No matching VM record in Nautobot.',
    unknown: 'Nautobot status unknown.'
  }[state] || 'Nautobot status unknown.';

  const isVisible = firstVisibilitySignal !== undefined && firstVisibilitySignal !== null
    ? firstVisibilitySignal
    : state === 'present';

  if (!nautobotEnabled) {
    return {
      url: null,
      isVisible,
      hasExplicitUrl: false,
      state,
      title
    };
  }

  if (explicitUrl) {
    return {
      url: explicitUrl,
      isVisible,
      hasExplicitUrl: true,
      state,
      title
    };
  }

  const baseUrl = getNautobotBaseUrl();
  const virtualizationPath = CONFIG?.nautobot?.virtualizationPath || '/virtualization/virtual-machines/';
  const cleanPath = virtualizationPath.startsWith('/') ? virtualizationPath : `/${virtualizationPath}`;
  if (!baseUrl) {
    return {
      url: null,
      isVisible,
      hasExplicitUrl: false,
      state,
      title
    };
  }

  const encodedName = encodeURIComponent(vmLookupName);
  const queryParam = `q=${encodedName}`;

  return {
    url: `${baseUrl}${cleanPath}?${queryParam}`,
    isVisible,
    hasExplicitUrl: false,
    state,
    title
  };
}

function getNodeNautobotInfo(nodeName, nodeData = null) {
  const nautobotEnabled = CONFIG?.nautobot?.enabled !== false;
  const lookupName = getShortNodeName(nodeName || '');

  const visibilitySignals = [
    nodeData?.nautobotVisible,
    nodeData?.nautobot_visibility,
    nodeData?.inNautobot,
    nodeData?.in_nautobot,
    nodeData?.nautobot?.visible,
    nodeData?.nautobot?.exists,
    nodeData?.nautobot?.found
  ];

  const firstVisibilitySignal = visibilitySignals
    .map(normalizeBoolean)
    .find(value => value !== null);

  const statusSignals = [
    nodeData?.nautobotStatus,
    nodeData?.nautobot_status,
    nodeData?.nautobot?.status,
    nodeData?.nautobot,
    nodeData?.nautobotExists,
    nodeData?.nautobot_exists,
    nodeData?.existsInNautobot,
    nodeData?.exists_in_nautobot
  ];

  const firstStatusSignal = statusSignals
    .map(normalizeNautobotStatus)
    .find(value => value !== null);

  const firstBooleanStatusSignal = statusSignals
    .map(normalizeBoolean)
    .find(value => value !== null);

  const explicitUrl = nodeData?.nautobotUrl || nodeData?.nautobot_url || nodeData?.nautobot?.url;

  const state = firstStatusSignal || (
    firstVisibilitySignal === true || firstBooleanStatusSignal === true || Boolean(explicitUrl)
      ? 'present'
      : firstVisibilitySignal === false || firstBooleanStatusSignal === false
        ? 'missing'
        : 'unknown'
  );
  const title = {
    present: 'Node device found in Nautobot.',
    missing: 'No matching node device in Nautobot.',
    unknown: 'Node Nautobot status unknown.'
  }[state] || 'Node Nautobot status unknown.';

  const isVisible = firstVisibilitySignal !== undefined && firstVisibilitySignal !== null
    ? firstVisibilitySignal
    : state === 'present';

  if (!nautobotEnabled) {
    return {
      url: null,
      isVisible,
      hasExplicitUrl: false,
      state,
      title
    };
  }

  if (explicitUrl) {
    return {
      url: explicitUrl,
      isVisible,
      hasExplicitUrl: true,
      state,
      title
    };
  }

  const baseUrl = getNautobotBaseUrl();
  const devicesPath = CONFIG?.nautobot?.devicesPath || '/dcim/devices/';
  const cleanPath = devicesPath.startsWith('/') ? devicesPath : `/${devicesPath}`;
  if (!baseUrl || !lookupName) {
    return {
      url: null,
      isVisible,
      hasExplicitUrl: false,
      state,
      title
    };
  }

  return {
    url: `${baseUrl}${cleanPath}?q=${encodeURIComponent(lookupName)}`,
    isVisible,
    hasExplicitUrl: false,
    state,
    title
  };
}

function getNautobotVmKey(vmName) {
  return (vmName || '').trim().toLowerCase();
}

function setNautobotPresenceIconState(iconEl, state, title) {
  if (!iconEl) return;

  iconEl.classList.remove('present', 'missing', 'unknown');
  iconEl.classList.add(state);

  const statusText = {
    present: 'Present in Nautobot',
    missing: 'Missing in Nautobot',
    unknown: 'Nautobot status unknown'
  };

  iconEl.innerHTML = '<span class="nautobot-presence-letter">N</span>';
  iconEl.title = title || statusText[state] || statusText.unknown;
  iconEl.setAttribute('aria-label', iconEl.title);
}

function setNautobotLinkVisibility(iconEl, isVisible) {
  if (!iconEl) return;

  const metaEl = iconEl.closest('[data-nautobot-meta]');
  if (!metaEl) return;

  const linkEl = metaEl.querySelector('[data-nautobot-link]');
  if (linkEl) {
    linkEl.classList.toggle('hidden', !isVisible);
  }

  const iconLinkEl = metaEl.querySelector('[data-nautobot-link-icon]');
  if (iconLinkEl) {
    iconLinkEl.classList.toggle('is-disabled', !isVisible);
    iconLinkEl.setAttribute('aria-disabled', String(!isVisible));
    if (isVisible) {
      iconLinkEl.removeAttribute('tabindex');
    } else {
      iconLinkEl.setAttribute('tabindex', '-1');
    }
  }
}

function refreshNautobotPresenceIndicators(root = document) {
  if (CONFIG?.nautobot?.enabled === false) return;

  const iconElements = Array.from(root.querySelectorAll('[data-nautobot-state]'));
  if (iconElements.length === 0) return;

  iconElements.forEach(iconEl => {
    const state = normalizeNautobotStatus(iconEl.getAttribute('data-nautobot-state')) || 'unknown';
    const title = iconEl.getAttribute('data-nautobot-title') || null;
    const shouldShowLink = iconEl.getAttribute('data-nautobot-link-visible') === 'true';

    setNautobotPresenceIconState(iconEl, state, title);
    setNautobotLinkVisibility(iconEl, shouldShowLink);
  });
}

// Throttle function
function throttle(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Debounce function
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Show toast notification
function showToast(message, type = 'info', duration = 5000) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const iconMap = {
    success: 'check-circle',
    error: 'exclamation-circle',
    warning: 'exclamation-triangle',
    info: 'info-circle'
  };
  
  toast.innerHTML = `
    <i class="fas fa-${iconMap[type] || 'info-circle'}"></i>
    <span class="toast-message">${message}</span>
  `;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Copy to clipboard
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('Copied to clipboard!', 'success', 2000);
  }).catch(err => {
    showToast('Failed to copy', 'error');
    console.error('Copy failed:', err);
  });
}

// Download file
function downloadFile(filename, content, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Format date
function formatDate(date) {
  return new Date(date).toLocaleString('pl-PL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

// Get time ago
function getTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - new Date(timestamp)) / 1000);
  
  const intervals = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60,
    second: 1
  };
  
  for (const [unit, secondsInUnit] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / secondsInUnit);
    if (interval >= 1) {
      return `${interval} ${unit}${interval > 1 ? 's' : ''} ago`;
    }
  }
  
  return 'just now';
}

// Sanitize HTML input
function sanitizeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Check if element is in viewport
function isInViewport(element) {
  const rect = element.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

// Smooth scroll to element
function scrollToElement(element, offset = 0) {
  const top = element.getBoundingClientRect().top + window.pageYOffset - offset;
  window.scrollTo({
    top,
    behavior: 'smooth'
  });
}
