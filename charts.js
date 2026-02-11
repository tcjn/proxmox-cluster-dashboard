// Charts using Chart.js

let resourceChart = null;
let statusChart = null;

function initializeCharts() {
  if (typeof window.calculateStatistics !== 'function') return;
  const stats = calculateStatistics();
  if (!stats) return;
  
  // Resource Usage vs Free Capacity Chart
  const resourceCtx = document.getElementById('resourceChart');
  if (resourceCtx && !resourceChart) {
    resourceChart = new Chart(resourceCtx, {
      type: 'bar',
      data: {
        labels: ['CPU', 'RAM', 'Disk'],
        datasets: [{
          label: 'Used (%)',
          data: [stats.avgCpu, stats.avgMemory, stats.avgDisk],
          backgroundColor: 'rgba(59, 130, 246, 0.8)',
          borderColor: 'rgb(59, 130, 246)',
          borderWidth: 2
        }, {
          label: 'Free (%)',
          data: [100 - stats.avgCpu, 100 - stats.avgMemory, 100 - stats.avgDisk],
          backgroundColor: 'rgba(16, 185, 129, 0.75)',
          borderColor: 'rgb(16, 185, 129)',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              padding: 15,
              font: {
                family: "'Outfit', sans-serif",
                size: 12
              }
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                return context.dataset.label + ': ' + context.parsed.y + '%';
              }
            }
          }
        },
        scales: {
          x: {
            stacked: true
          },
          y: {
            stacked: true,
            beginAtZero: true,
            max: 100,
            ticks: {
              callback: function(value) {
                return value + '%';
              }
            }
          }
        }
      }
    });
  }
  
  // Node Resource Occupancy Chart
  const statusCtx = document.getElementById('statusChart');
  if (statusCtx && !statusChart) {
    statusChart = new Chart(statusCtx, {
      type: 'bar',
      data: {
        labels: ['Low (<40%)', 'Medium (40-69%)', 'High (70-84%)', 'Critical (85%+)'],
        datasets: [{
          label: 'CPU Nodes',
          data: [
            stats.occupancyBuckets.low.cpu,
            stats.occupancyBuckets.medium.cpu,
            stats.occupancyBuckets.high.cpu,
            stats.occupancyBuckets.critical.cpu
          ],
          backgroundColor: 'rgba(59, 130, 246, 0.8)',
          borderColor: 'rgb(59, 130, 246)',
          borderWidth: 2
        }, {
          label: 'RAM Nodes',
          data: [
            stats.occupancyBuckets.low.memory,
            stats.occupancyBuckets.medium.memory,
            stats.occupancyBuckets.high.memory,
            stats.occupancyBuckets.critical.memory
          ],
          backgroundColor: 'rgba(16, 185, 129, 0.8)',
          borderColor: 'rgb(16, 185, 129)',
          borderWidth: 2
        }, {
          label: 'Disk Nodes',
          data: [
            stats.occupancyBuckets.low.disk,
            stats.occupancyBuckets.medium.disk,
            stats.occupancyBuckets.high.disk,
            stats.occupancyBuckets.critical.disk
          ],
          backgroundColor: 'rgba(245, 158, 11, 0.8)',
          borderColor: 'rgb(245, 158, 11)',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'bottom'
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                return `${context.dataset.label}: ${context.parsed.y} nodes`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1
            }
          }
        }
      }
    });
  }
}

function updateCharts() {
  if (typeof window.calculateStatistics !== 'function') return;
  const stats = calculateStatistics();
  if (!stats) return;
  
  if (resourceChart) {
    resourceChart.data.datasets[0].data = [stats.avgCpu, stats.avgMemory, stats.avgDisk];
    resourceChart.data.datasets[1].data = [100 - stats.avgCpu, 100 - stats.avgMemory, 100 - stats.avgDisk];
    resourceChart.update();
  }
  
  if (statusChart) {
    statusChart.data.datasets[0].data = [
      stats.occupancyBuckets.low.cpu,
      stats.occupancyBuckets.medium.cpu,
      stats.occupancyBuckets.high.cpu,
      stats.occupancyBuckets.critical.cpu
    ];
    statusChart.data.datasets[1].data = [
      stats.occupancyBuckets.low.memory,
      stats.occupancyBuckets.medium.memory,
      stats.occupancyBuckets.high.memory,
      stats.occupancyBuckets.critical.memory
    ];
    statusChart.data.datasets[2].data = [
      stats.occupancyBuckets.low.disk,
      stats.occupancyBuckets.medium.disk,
      stats.occupancyBuckets.high.disk,
      stats.occupancyBuckets.critical.disk
    ];
    statusChart.update();
  }
}
