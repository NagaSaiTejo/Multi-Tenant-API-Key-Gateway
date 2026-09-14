const TENANT_ID = 1;
const API_BASE = '/api';

// DOM Elements
const btnCreateKey = document.getElementById('btn-create-key');
const keysTableBody = document.querySelector('#keys-table tbody');
const logsTableBody = document.querySelector('#logs-table tbody');
const modal = document.getElementById('key-modal');
const btnModalClose = document.getElementById('btn-modal-close');
const closeBtn = document.querySelector('.close-btn');
const newKeyValue = document.getElementById('new-key-value');

// Chart Instance
let usageChart = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    fetchKeys();
    fetchLogs();
    initChart();
});

// Fetch and render keys
async function fetchKeys() {
    try {
        const res = await fetch(`${API_BASE}/tenants/${TENANT_ID}/keys`);
        const keys = await res.json();
        renderKeys(keys);
    } catch (err) {
        console.error('Failed to fetch keys', err);
    }
}

function renderKeys(keys) {
    keysTableBody.innerHTML = '';
    
    if (keys.length === 0) {
        keysTableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-secondary);">No API keys found.</td></tr>`;
        return;
    }

    keys.forEach(key => {
        const tr = document.createElement('tr');
        const date = new Date(key.createdAt).toLocaleString();
        const statusClass = key.isActive ? 'status-active' : 'status-inactive';
        const statusText = key.isActive ? 'Active' : 'Inactive';
        
        tr.innerHTML = `
            <td><code>${key.maskedKey}</code></td>
            <td>${date}</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td class="actions">
                ${key.isActive ? `
                    <button class="btn-secondary" onclick="rotateKey(${key.id})">Rotate</button>
                    <button class="btn-danger" onclick="revokeKey(${key.id})">Revoke</button>
                ` : '-'}
            </td>
        `;
        keysTableBody.appendChild(tr);
    });
}

// Fetch and render logs
async function fetchLogs() {
    try {
        const res = await fetch(`${API_BASE}/tenants/${TENANT_ID}/logs?limit=10`);
        const logs = await res.json();
        renderLogs(logs);
        updateChart(logs);
    } catch (err) {
        console.error('Failed to fetch logs', err);
    }
}

function renderLogs(logs) {
    logsTableBody.innerHTML = '';
    
    if (logs.length === 0) {
        logsTableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-secondary);">No recent activity.</td></tr>`;
        return;
    }

    logs.forEach(log => {
        const tr = document.createElement('tr');
        const date = new Date(log.timestamp).toLocaleString();
        
        // Status color coding
        let statusColor = 'var(--text-primary)';
        if (log.statusCode >= 400 && log.statusCode < 500) statusColor = '#f59e0b'; // warning
        if (log.statusCode === 429) statusColor = 'var(--danger)'; // rate limited
        if (log.statusCode >= 200 && log.statusCode < 300) statusColor = 'var(--success)';

        tr.innerHTML = `
            <td>${date}</td>
            <td><code>${log.maskedKey}</code></td>
            <td>${log.endpoint}</td>
            <td style="color: ${statusColor}; font-weight: 600;">${log.statusCode}</td>
        `;
        logsTableBody.appendChild(tr);
    });
}

// Actions
btnCreateKey.addEventListener('click', async () => {
    try {
        const res = await fetch(`${API_BASE}/tenants/${TENANT_ID}/keys`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rateLimitPerMinute: 5 }) // Small limit for testing
        });
        
        if (res.ok) {
            const data = await res.json();
            showModal(data.apiKey);
            fetchKeys();
        }
    } catch (err) {
        console.error('Error creating key', err);
    }
});

async function rotateKey(keyId) {
    if (!confirm('Are you sure you want to rotate this key? The old key will expire in 1 minute.')) return;
    
    try {
        const res = await fetch(`${API_BASE}/keys/${keyId}/rotate`, { method: 'POST' });
        if (res.ok) {
            const data = await res.json();
            showModal(data.newApiKey);
            fetchKeys();
        }
    } catch (err) {
        console.error('Error rotating key', err);
    }
}

async function revokeKey(keyId) {
    if (!confirm('Are you sure you want to immediately revoke this key? This action cannot be undone.')) return;
    
    try {
        const res = await fetch(`${API_BASE}/keys/${keyId}`, { method: 'DELETE' });
        if (res.ok) {
            fetchKeys();
        }
    } catch (err) {
        console.error('Error revoking key', err);
    }
}

// Modal Logic
function showModal(apiKey) {
    newKeyValue.textContent = apiKey;
    modal.classList.add('show');
}

function hideModal() {
    modal.classList.remove('show');
}

btnModalClose.addEventListener('click', hideModal);
closeBtn.addEventListener('click', hideModal);
window.addEventListener('click', (e) => {
    if (e.target === modal) hideModal();
});

// Chart Logic
function initChart() {
    const ctx = document.getElementById('usageChart').getContext('2d');
    
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = 'Inter';

    usageChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Requests per minute',
                data: [],
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 3,
                pointBackgroundColor: '#3b82f6'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleColor: '#fff',
                    bodyColor: '#cbd5e1',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { precision: 0 }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
}

function updateChart(logs) {
    // Process logs into requests per minute for the last hour
    const now = new Date();
    const minuteCounts = {};
    
    // Initialize last 60 minutes with 0
    for (let i = 59; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 60000);
        const label = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
        minuteCounts[label] = 0;
    }

    logs.forEach(log => {
        const d = new Date(log.timestamp);
        // Only count if within last hour
        if (now.getTime() - d.getTime() <= 60 * 60 * 1000) {
            const label = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
            if (minuteCounts[label] !== undefined) {
                minuteCounts[label]++;
            }
        }
    });

    const labels = Object.keys(minuteCounts);
    const data = Object.values(minuteCounts);

    usageChart.data.labels = labels;
    usageChart.data.datasets[0].data = data;
    usageChart.update();
}

// Refresh data periodically
setInterval(() => {
    fetchKeys();
    fetchLogs();
}, 10000);
