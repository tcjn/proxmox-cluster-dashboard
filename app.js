// Main Application

async function loadData() {
  const loadingSpinner = document.getElementById('loadingSpinner');
  loadingSpinner.style.display = 'flex';
  
  try {
    // Load clusters data
    STATE.clustersData = await fetchWithCache(
      CONFIG.dataUrl,
      'clusters',
      CONFIG.cacheTTL.clusters
    );
    
    // Load status data
    STATE.statusData = await fetchWithCache(
      CONFIG.statusUrl,
      'status',
      CONFIG.cacheTTL.status
    );
    
    // Load maintenance data
    try {
      STATE.maintenanceData = await fetchWithCache(
        CONFIG.maintenanceUrl,
        'maintenance',
        CONFIG.cacheTTL.maintenance
      );
      loadMaintenanceData();
    } catch (err) {
      console.warn('Maintenance data not available:', err);
    }
    
    // Update last update time
    updateLastUpdateTime();
    
    // Render clusters
    renderClusters();
    
    // Check for alerts
    notificationManager.checkAlerts();
    
    // Update statistics if visible
    if (STATE.statisticsVisible) {
      updateStatisticsUI();
      updateCharts();
    }
    
    showToast('Data loaded successfully', 'success', 3000);
  } catch (error) {
    console.error('Error loading data:', error);
    showToast('Failed to load data: ' + error.message, 'error');
    
    document.getElementById('regions-container').innerHTML = `
      <div style="text-align: center; padding: 3rem; color: var(--offline);">
        <i class="fas fa-exclamation-triangle fa-3x" style="margin-bottom: 1rem;"></i>
        <h3>Error loading data</h3>
        <p>${error.message}</p>
        <button onclick="location.reload()" class="btn-primary" style="margin-top: 1rem;">
          <i class="fas fa-redo"></i> Retry
        </button>
      </div>
    `;
  } finally {
    loadingSpinner.style.display = 'none';
  }
}

function updateLastUpdateTime() {
  const lastUpdateEl = document.getElementById('lastUpdateTime');
  if (STATE.statusData && STATE.statusData.lastUpdate) {
    const updateDate = new Date(STATE.statusData.lastUpdate);
    lastUpdateEl.textContent = formatDate(updateDate);
    lastUpdateEl.title = 'UTC: ' + STATE.statusData.lastUpdate;
  } else {
    lastUpdateEl.textContent = formatDate(new Date());
  }
}

function loadMaintenanceData() {
  if (!STATE.maintenanceData) return;
  
  const maintenanceInfo = document.getElementById('maintenanceInfo');
  const maintenanceContent = document.getElementById('maintenanceContent');
  
  if (STATE.maintenanceData.enabled) {
    maintenanceInfo.style.display = 'block';
    
    maintenanceContent.innerHTML = `
      <div class="maintenance-region">
        <div class="maintenance-region-line">
          <i class="fas fa-globe-americas" style="color: var(--amer-color);"></i>
          <span style="color: var(--amer-color); font-weight: 700;">${STATE.maintenanceData.amer}</span>
        </div>
        ${STATE.maintenanceData.amerNotes ? `<div style="padding-left: 1.85rem; margin-top: 0.5rem; font-size: 0.9rem;">${STATE.maintenanceData.amerNotes}</div>` : ''}
      </div>
      <div class="maintenance-region">
        <div class="maintenance-region-line">
          <i class="fas fa-globe-asia" style="color: var(--apac-color);"></i>
          <span style="color: var(--apac-color); font-weight: 700;">${STATE.maintenanceData.apac}</span>
        </div>
        ${STATE.maintenanceData.apacNotes ? `<div style="padding-left: 1.85rem; margin-top: 0.5rem; font-size: 0.9rem;">${STATE.maintenanceData.apacNotes}</div>` : ''}
      </div>
      <div class="maintenance-region">
        <div class="maintenance-region-line">
          <i class="fas fa-globe-europe" style="color: var(--emea-color);"></i>
          <span style="color: var(--emea-color); font-weight: 700;">${STATE.maintenanceData.emea}</span>
        </div>
        ${STATE.maintenanceData.emeaNotes ? `<div style="padding-left: 1.85rem; margin-top: 0.5rem; font-size: 0.9rem;">${STATE.maintenanceData.emeaNotes}</div>` : ''}
      </div>
    `;
  } else {
    maintenanceInfo.style.display = 'none';
  }
}

function initializeEventListeners() {
  // Theme toggle
  document.getElementById('themeToggle').addEventListener('click', () => {
    document.body.classList.toggle('dark');
    const icon = document.getElementById('themeToggle').querySelector('i');
    const isDark = document.body.classList.contains('dark');
    icon.classList.toggle('fa-moon', !isDark);
    icon.classList.toggle('fa-sun', isDark);
    localStorage.setItem('darkMode', isDark);
  });
  
  // Refresh button
  document.getElementById('refreshBtn').addEventListener('click', () => {
    const icon = document.getElementById('refreshBtn').querySelector('i');
    icon.classList.add('fa-spin');
    dataCache.clear();
    loadData().finally(() => {
      setTimeout(() => icon.classList.remove('fa-spin'), 500);
    });
  });
  
  // Auto-refresh toggle
  document.getElementById('autoRefreshToggle').addEventListener('change', (e) => {
    CONFIG.autoRefreshEnabled = e.target.checked;
    if (CONFIG.autoRefreshEnabled) {
      startAutoRefresh();
      showToast('Auto-refresh enabled', 'info');
    } else {
      stopAutoRefresh();
      showToast('Auto-refresh disabled', 'info');
    }
    localStorage.setItem('autoRefreshEnabled', CONFIG.autoRefreshEnabled);
  });
  
  // Search
  const searchInput = document.getElementById('searchInput');
  searchInput.addEventListener('input', debounce(searchClusters, CONFIG.searchDebounce));
  searchInput.addEventListener('keyup', (e) => {
    if (e.key === 'Escape') {
      searchInput.value = '';
      clearSearchResults();
      renderClusters();
    }
  });
  
  // Search focus shortcut (/)
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
      e.preventDefault();
      searchInput.focus();
    }
  });
  
  // Clear search
  document.getElementById('clearSearch').addEventListener('click', () => {
    searchInput.value = '';
    clearSearchResults();
    renderClusters();
  });
  
  // Online toggle
  document.getElementById('onlineToggle').addEventListener('click', () => {
    STATE.showOnlyOnline = !STATE.showOnlyOnline;
    const btn = document.getElementById('onlineToggle');
    btn.classList.toggle('active', STATE.showOnlyOnline);
    
    if (STATE.showOnlyOnline) {
      STATE.filters.status = ['online'];
    } else {
      STATE.filters.status = ['online', 'offline', 'degraded'];
    }
    
    applyFilters();
  });
  
  // Search type buttons
  document.querySelectorAll('.search-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.search-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      STATE.searchType = btn.getAttribute('data-type');
      localStorage.setItem('searchType', STATE.searchType);
      if (searchInput.value.trim()) {
        searchClusters();
      }
    });
  });
  
  // Filter toggle
  document.getElementById('filterToggle').addEventListener('click', () => {
    const panel = document.getElementById('filterPanel');
    const btn = document.getElementById('filterToggle');
    panel.classList.toggle('open');
    btn.classList.toggle('active');
  });
  
  // Filter apply/reset
  document.getElementById('applyFilters').addEventListener('click', () => {
    STATE.filters = {
      status: [],
      type: [],
      region: [],
      version: []
    };
    
    document.querySelectorAll('.filter-panel input[type="checkbox"]:checked').forEach(cb => {
      const name = cb.getAttribute('name');
      const value = cb.getAttribute('value');
      STATE.filters[name].push(value);
    });
    
    applyFilters();
    document.getElementById('filterPanel').classList.remove('open');
    document.getElementById('filterToggle').classList.remove('active');
  });
  
  document.getElementById('resetFilters').addEventListener('click', resetFilters);
  
  // Sort select
  document.getElementById('sortSelect').addEventListener('change', (e) => {
    STATE.sortBy = e.target.value;
    localStorage.setItem('sortBy', STATE.sortBy);
    renderClusters();
  });
  
  // Statistics toggle
  document.getElementById('summaryToggle').addEventListener('click', () => {
    STATE.statisticsVisible = !STATE.statisticsVisible;
    const section = document.getElementById('statisticsSection');
    const btn = document.getElementById('summaryToggle');
    
    if (STATE.statisticsVisible) {
      section.style.display = 'block';
      btn.innerHTML = '<i class="fas fa-chart-bar"></i> Hide Statistics Dashboard';
      btn.classList.add('active');
      updateStatisticsUI();
      initializeCharts();
    } else {
      section.style.display = 'none';
      btn.innerHTML = '<i class="fas fa-chart-bar"></i> Show Statistics Dashboard';
      btn.classList.remove('active');
    }
    
    localStorage.setItem('statisticsVisible', STATE.statisticsVisible);
  });
  
  // Notifications
  document.getElementById('notificationsBtn').addEventListener('click', () => {
    document.getElementById('notificationsPanel').classList.add('open');
  });
  
  document.getElementById('closeNotifications').addEventListener('click', () => {
    document.getElementById('notificationsPanel').classList.remove('open');
  });
  
  // Export
  document.getElementById('exportBtn').addEventListener('click', () => {
    document.getElementById('exportModal').classList.add('open');
  });
  
  document.getElementById('closeExport').addEventListener('click', () => {
    document.getElementById('exportModal').classList.remove('open');
  });
  
  document.querySelectorAll('.export-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const format = btn.getAttribute('data-format');
      if (format === 'csv') exportToCSV();
      else if (format === 'json') exportToJSON();
      else if (format === 'html') exportToHTML();
      document.getElementById('exportModal').classList.remove('open');
    });
  });
  
  // Close modals on background click
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('open');
      }
    });
  });
  
  // Maintenance toggle
  document.getElementById('toggleMaintenance').addEventListener('click', () => {
    const maintenanceInfo = document.getElementById('maintenanceInfo');
    const icon = document.getElementById('toggleMaintenance').querySelector('i');
    maintenanceInfo.classList.toggle('collapsed');
    icon.classList.toggle('fa-chevron-down');
    icon.classList.toggle('fa-chevron-right');
    localStorage.setItem('maintenanceCollapsed', maintenanceInfo.classList.contains('collapsed'));
  });
  
  // Go to top button
  const goToTop = document.getElementById('goToTop');
  window.addEventListener('scroll', throttle(() => {
    if (window.pageYOffset > 300) {
      goToTop.style.display = 'flex';
    } else {
      goToTop.style.display = 'none';
    }
  }, 100));
  
  goToTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  
  // Header logo reload
  document.getElementById('headerLogo').addEventListener('click', (e) => {
    e.preventDefault();
    location.reload();
  });
  
  // Favorites button
  document.getElementById('favoritesBtn').addEventListener('click', () => {
    showToast('Favorites feature coming soon!', 'info');
  });
}

function loadPreferences() {
  // Dark mode
  const isDarkMode = localStorage.getItem('darkMode') === 'true';
  if (isDarkMode) {
    document.body.classList.add('dark');
    const icon = document.getElementById('themeToggle').querySelector('i');
    icon.classList.replace('fa-moon', 'fa-sun');
  }
  
  // Search type
  const searchType = localStorage.getItem('searchType') || 'all';
  STATE.searchType = searchType;
  document.querySelectorAll('.search-type-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-type') === searchType);
  });
  
  // Sort by
  const sortBy = localStorage.getItem('sortBy') || 'name';
  STATE.sortBy = sortBy;
  document.getElementById('sortSelect').value = sortBy;
  
  // Statistics visibility
  const statisticsVisible = localStorage.getItem('statisticsVisible') === 'true';
  if (statisticsVisible) {
    STATE.statisticsVisible = true;
    document.getElementById('statisticsSection').style.display = 'block';
    document.getElementById('summaryToggle').classList.add('active');
    document.getElementById('summaryToggle').innerHTML = '<i class="fas fa-chart-bar"></i> Hide Statistics Dashboard';
  }
  
  // Maintenance collapsed
  const maintenanceCollapsed = localStorage.getItem('maintenanceCollapsed') === 'true';
  if (maintenanceCollapsed) {
    document.getElementById('maintenanceInfo').classList.add('collapsed');
    document.getElementById('toggleMaintenance').querySelector('i').classList.replace('fa-chevron-down', 'fa-chevron-right');
  }
  
  // Auto-refresh
  const autoRefreshEnabled = localStorage.getItem('autoRefreshEnabled') === 'true';
  CONFIG.autoRefreshEnabled = autoRefreshEnabled;
  document.getElementById('autoRefreshToggle').checked = autoRefreshEnabled;
  if (autoRefreshEnabled) {
    startAutoRefresh();
  }
  
  // Load favorites
  STATE.favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
}

function startAutoRefresh() {
  if (STATE.autoRefreshTimer) {
    clearInterval(STATE.autoRefreshTimer);
  }
  
  STATE.autoRefreshTimer = setInterval(() => {
    console.log('Auto-refreshing data...');
    dataCache.clear('status'); // Only clear status cache
    loadData();
  }, CONFIG.autoRefreshInterval);
}

function stopAutoRefresh() {
  if (STATE.autoRefreshTimer) {
    clearInterval(STATE.autoRefreshTimer);
    STATE.autoRefreshTimer = null;
  }
}

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
  console.log('Proxmox Dashboard initializing...');
  
  // Load preferences
  loadPreferences();
  
  // Initialize event listeners
  initializeEventListeners();
  
  // Load data
  loadData();
  
  // Add SVG gradient for health gauge
  const svg = document.querySelector('.health-gauge');
  if (svg) {
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
      <linearGradient id="healthGradient" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" style="stop-color:#10b981;stop-opacity:1" />
        <stop offset="50%" style="stop-color:#0ea5e9;stop-opacity:1" />
        <stop offset="100%" style="stop-color:#8b5cf6;stop-opacity:1" />
      </linearGradient>
    `;
    svg.insertBefore(defs, svg.firstChild);
  }
  
  console.log('Proxmox Dashboard initialized successfully');
});

// Handle page visibility for auto-refresh
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopAutoRefresh();
  } else if (CONFIG.autoRefreshEnabled) {
    startAutoRefresh();
  }
});
