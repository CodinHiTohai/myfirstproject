// ═══════════════════════════════════════════════════════════════
// Eye In – Admin Side JavaScript
// ═══════════════════════════════════════════════════════════════

let adminToken = null;

// ─── Init ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    adminToken = localStorage.getItem('adminToken');
    if (!adminToken) {
        window.location.href = '/admin-login.html';
        return;
    }

    loadDashboard();

    // Auto-refresh every 30s
    setInterval(loadDashboard, 30000);
});

// ─── Load Dashboard ──────────────────────────────────────────
async function loadDashboard() {
    await Promise.all([
        loadStats(),
        loadRoutes(),
        loadDrivers()
    ]);
}

// ─── Load Stats ──────────────────────────────────────────────
async function loadStats() {
    try {
        const res = await fetch('/api/admin/stats', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });

        if (res.status === 401 || res.status === 403) {
            adminLogout();
            return;
        }

        const data = await res.json();

        document.getElementById('statActiveRoutes').textContent = data.activeRoutes;
        document.getElementById('statTotalDrivers').textContent = data.totalDrivers;
        document.getElementById('statActiveVehicles').textContent = data.activeVehicles;
        document.getElementById('statTotalVehicles').textContent = data.totalVehicles;

    } catch (err) {
        console.error('Failed to load stats:', err);
    }
}

// ─── Load Routes ─────────────────────────────────────────────
async function loadRoutes() {
    try {
        const res = await fetch('/api/admin/routes', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });

        const routes = await res.json();
        const tbody = document.getElementById('routesTableBody');

        if (routes.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 40px; color: var(--text-muted);">No routes found</td></tr>`;
            return;
        }

        tbody.innerHTML = routes.map(r => {
            const empty = r.total_seats - r.filled_seats;
            return `
        <tr>
          <td>#${r.id}</td>
          <td>${r.driver_name}</td>
          <td><span style="font-size: 0.8rem;">${r.vehicle_number}</span></td>
          <td>${r.start_location} → ${r.end_location}</td>
          <td style="color: var(--success); font-weight: 600;">₹${r.fare}</td>
          <td>${empty} / ${r.total_seats}</td>
          <td><span class="status ${r.status}">${r.status}</span></td>
          <td>
            ${r.status === 'active'
                    ? `<button class="btn btn-danger btn-sm" onclick="disableRoute(${r.id})">Disable</button>`
                    : '<span style="color: var(--text-muted);">—</span>'}
          </td>
        </tr>
      `;
        }).join('');

    } catch (err) {
        console.error('Failed to load routes:', err);
    }
}

// ─── Load Drivers ────────────────────────────────────────────
async function loadDrivers() {
    try {
        const res = await fetch('/api/admin/drivers', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });

        const drivers = await res.json();
        const tbody = document.getElementById('driversTableBody');

        if (drivers.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 40px; color: var(--text-muted);">No drivers found</td></tr>`;
            return;
        }

        tbody.innerHTML = drivers.map(d => `
      <tr>
        <td>#${d.id}</td>
        <td>${d.name}</td>
        <td>${d.phone}</td>
        <td>${d.vehicle_number}</td>
        <td style="text-transform: capitalize;">${d.vehicle_type}</td>
      </tr>
    `).join('');

    } catch (err) {
        console.error('Failed to load drivers:', err);
    }
}

// ─── Disable Route ───────────────────────────────────────────
async function disableRoute(routeId) {
    if (!confirm('Are you sure you want to disable this route?')) return;

    try {
        const res = await fetch(`/api/admin/routes/${routeId}/disable`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to disable');

        showToast('Route disabled successfully', 'success');
        loadDashboard();

    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ─── Logout ──────────────────────────────────────────────────
function adminLogout() {
    localStorage.removeItem('adminToken');
    window.location.href = '/admin-login.html';
}

// ─── Toast ───────────────────────────────────────────────────
function showToast(msg, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}
