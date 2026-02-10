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
  
  // Alert thresholds
  thresholds: {
    cpuWarning: 80,
    cpuCritical: 90,
    memoryWarning: 85,
    memoryCritical: 95,
    diskWarning: 80,
    diskCritical: 90
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
