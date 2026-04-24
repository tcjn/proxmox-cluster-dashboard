// Configuration and Constants
const CONFIG = {
  // Data URLs
  dataUrl: 'clusters.json',
  statusUrl: 'status.json',
  maintenanceUrl: 'maintenance.json',
  
  // Production PVE version for comparison
  pveVersionProd: '8.4.8',
  
  // Auto-refresh settings
  autoRefreshInterval: 60000, // 60 seconds
  autoRefreshEnabled: false,
  
  // Cache settings
  cacheTTL: {
    clusters: 300000, // 5 minutes
    status: 30000,    // 30 seconds
    maintenance: 600000 // 10 minutes
  },
  
  // Search settings
  searchDebounce: 300, // milliseconds

  // Nautobot integration
  nautobot: {
    enabled: true,
    baseUrl: 'https://nautobot.expereocloud.com',
    searchPath: '/search/',
    virtualizationPath: '/virtualization/virtual-machines/',
    devicesPath: '/dcim/devices/',
    apiPath: '/api/virtualization/virtual-machines/',
    apiToken: '' // Optional; used by external status enrichment scripts
  },

  // VictoriaMetrics integration
  victoriaMetrics: {
    enabled: true,
    // If true, VictoriaMetrics panel settings are sourced from status.json
    // using the `victoriaMetrics` object.
    useStatusData: true,
    baseUrl: 'https://pve-console.expereo.com/metrics',
    // Common PromQL templates for quick navigation in VMUI.
    // Adjust metric names if your scrape jobs expose different labels.
    queries: {
      nodeCpu: '100 - avg by(instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100',
      nodeMemory: '(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100',
      nodeDisk: '(1 - (node_filesystem_avail_bytes{fstype!~"tmpfs|overlay"} / node_filesystem_size_bytes{fstype!~"tmpfs|overlay"})) * 100',
      nodeNetwork: 'sum by(instance) (rate(node_network_receive_bytes_total{device!~"lo"}[5m]) + rate(node_network_transmit_bytes_total{device!~"lo"}[5m]))',
      vmCpu: 'avg by(vm_name) (rate(qemu_cpu_usage_seconds_total[5m])) * 100',
      vmMemory: 'avg by(vm_name) (qemu_memory_usage_bytes / qemu_memory_max_bytes) * 100'
    }
  },
  
  // Alert thresholds
  thresholds: {
    cpuWarning: 80,
    cpuCritical: 90,
    memoryWarning: 85,
    memoryCritical: 95,
    diskWarning: 80,
    diskCritical: 90,
    loadAverageWarning: 8,
    loadAverageCritical: 10
  },
  
  // Regional prefixes
  regionPrefixes: {
    AMER: ['us', 'ca', 'mx', 'dr', 'br'],
    APAC: ['au', 'sg', 'hk', 'ch', 'id', 'jp', 'th', 'za'],
    EMEA: ['nl', 'de', 'es', 'fr', 'ie', 'it', 'lt', 'pl', 'uk'],
    CME: [] // CME clusters are identified by name pattern
  },
  
  // Country flags mapping
  countryFlags: {
    // AMER
    'dr-sao1': 'br', 'ca-tor1': 'ca', 'mx-mx1': 'mx', 'mx-mxc1': 'mx',
    'us-asn1': 'us', 'us-ash1': 'us', 'us-chi1': 'us', 'us-dai1': 'us',
    'us-dal1': 'us', 'us-jax1': 'us', 'us-lax1': 'us', 'us-mia1': 'us',
    'us-nyc1': 'us', 'us-nyc1-prod': 'us', 'us-sea1': 'us', 'us-sjc1': 'us',
    
    // APAC
    'au-mefi': 'au', 'au-mel1': 'au', 'au-syd1': 'au', 'br-sao1': 'br',
    'ch-hkg1': 'hk', 'hk-hkg1': 'hk', 'id-jkt1': 'id',
    'jp-kyo1': 'jp', 'jp-tyo1': 'jp', 'sg-sin1': 'sg', 'sg-sin1-prod': 'sg',
    'sg-sin2-prod': 'sg', 'sg-sin2': 'sg', 'th-bkk1': 'th', 'th-bkx1': 'th',
    'za-jb01': 'za', 'za-jnb1': 'za',
    
    // EMEA
    'ch-zm1': 'ch', 'ch-zrh1': 'ch', 'de-fra1': 'de', 'es-mac1': 'es',
    'es-mad1': 'es', 'fr-par1': 'fr', 'fr-lil1': 'fr', 'ie-dub1': 'ie',
    'it-mil1': 'it', 'lt-mil1': 'lt', 'nl-ams1': 'nl', 'nl-ams2': 'nl',
    'pl-war1': 'pl', 'uk-lon1': 'gb', 'uk-lon2': 'gb',
    'nl-ams1-prod': 'nl', 'nl-ams2-prod': 'nl', 
    'nl-ams1-dev': 'nl', 'nl-ams2-preprod': 'nl'
  }
};

// Global state
const STATE = {
  clustersData: null,
  statusData: null,
  maintenanceData: null,
  searchType: 'all', // 'all', 'clusters', 'vms'
  showOnlyOnline: false,
  statisticsVisible: false,
  autoRefreshTimer: null,
  filters: {
    status: ['online', 'offline', 'degraded'],
    type: ['prod', 'nonprod'],
    region: ['AMER', 'APAC', 'EMEA', 'CME', 'LAB'],
    version: ['updated', 'outdated']
  },
  sortBy: 'name'
};
