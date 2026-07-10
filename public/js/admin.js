// ═══════════════════════════════════════════════════════════════
// Eye In – Admin Side JavaScript (Complete Rewrite)
// ═══════════════════════════════════════════════════════════════

let adminToken = null;
let allDrivers = [];
let activeTab = 'dashboard';

// ─── Init ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  adminToken = localStorage.getItem('adminToken');
  if (!adminToken) {
    window.location.href = '/admin-login.html';
    return;
  }

  loadDashboard();

  // Auto-refresh every 30 seconds
  setInterval(() => {
    loadCurrentTab();
  }, 30000);
});

// ─── Tab Switching ────────────────────────────────────────────
function switchTab(tab) {
  activeTab = tab;

  // Update sidebar buttons
  document.querySelectorAll('.sidebar-nav-btn').forEach(btn => btn.classList.remove('active'));
  const navBtn = document.getElementById(`nav-${tab}`);
  if (navBtn) navBtn.classList.add('active');

  // Update panes
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  const pane = document.getElementById(`pane-${tab}`);
  if (pane) pane.classList.add('active');

  // Update topbar title
  const titles = {
    dashboard: '📊 Dashboard',
    drivers: '👨‍✈️ Drivers',
    routes: '📍 Routes',
    feedback: '💬 Feedback'
  };
  const titleEl = document.getElementById('topbarTitle');
  if (titleEl) titleEl.textContent = titles[tab] || tab;

  // Close sidebar on mobile
  closeSidebar();

  // Load tab data
  loadCurrentTab();
}

function loadCurrentTab() {
  switch (activeTab) {
    case 'dashboard': return loadDashboard();
    case 'drivers':   return loadDrivers();
    case 'routes':    return loadRoutes();
    case 'feedback':  return loadFeedback();
  }
}

// ─── Sidebar Mobile ───────────────────────────────────────────
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebarOverlay').classList.add('open');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}

// ─── Load Full Dashboard ──────────────────────────────────────
async function loadDashboard() {
  await Promise.all([
    loadStats(),
    loadRoutes(),
    loadDrivers(),
    loadRecentRides()
  ]);
  updateRefreshTime();
}

function updateRefreshTime() {
  const el = document.getElementById('lastRefreshText');
  if (el) {
    const now = new Date();
    el.textContent = `Updated ${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
  }
}

// ─── Load Stats ───────────────────────────────────────────────
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

    const setEl = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setEl('statActiveRoutes', data.todayRides ?? data.activeRoutes ?? '–');
    setEl('statActiveVehicles', data.activeVehicles ?? '–');
    setEl('statTotalDrivers', data.totalDrivers ?? '–');
    setEl('statRevenue', data.totalRevenue ? `₹${data.totalRevenue.toLocaleString('en-IN')}` : '₹–');

    // Update charts if data available
    if (data.topRoutes) renderTopRoutesChart(data.topRoutes);
    if (data.vehicleTypes) renderVehicleTypeChart(data.vehicleTypes);

  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

// ─── Top Routes Chart ─────────────────────────────────────────
function renderTopRoutesChart(routes) {
  const container = document.getElementById('topRoutesChart');
  if (!container) return;

  if (!routes || routes.length === 0) {
    container.innerHTML = '<div style="color:#334155;text-align:center;padding:20px;font-size:0.82rem;">No route data available</div>';
    return;
  }

  const maxVal = Math.max(...routes.map(r => r.count || 0), 1);

  container.innerHTML = routes.slice(0, 6).map(r => {
    const pct = Math.round(((r.count || 0) / maxVal) * 100);
    const label = `${(r.start || '').substring(0, 8)}→${(r.end || '').substring(0, 8)}`;
    return `
      <div class="bar-row">
        <div class="bar-label" title="${r.start} → ${r.end}">${label}</div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${pct}%"></div>
        </div>
        <div class="bar-value">${r.count}</div>
      </div>
    `;
  }).join('');
}

// ─── Vehicle Type Chart ───────────────────────────────────────
function renderVehicleTypeChart(types) {
  const container = document.getElementById('vtypeChart');
  if (!container) return;

  const icons = { auto: '🛺', bus: '🚌', car: '🚗' };
  const total = Object.values(types).reduce((a, b) => a + (b || 0), 0) || 1;

  container.innerHTML = Object.entries(types).map(([type, count]) => {
    const pct = Math.round((count / total) * 100);
    return `
      <div class="vtype-row">
        <div class="vtype-icon">${icons[type] || '🚗'}</div>
        <div class="vtype-info">
          <div class="vtype-name">${type.charAt(0).toUpperCase() + type.slice(1)} <span style="color:#64748b;font-size:0.72rem;">(${pct}%)</span></div>
          <div class="vtype-bar-track">
            <div class="vtype-bar-fill ${type}" style="width:${pct}%"></div>
          </div>
        </div>
        <div class="vtype-count">${count}</div>
      </div>
    `;
  }).join('');
}

// ─── Load Recent Rides ────────────────────────────────────────
async function loadRecentRides() {
  try {
    const res = await fetch('/api/admin/recent-rides', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    if (!res.ok) {
      // Fallback: try routes
      loadRecentRidesFallback();
      return;
    }

    const rides = await res.json();
    const tbody = document.getElementById('recentRidesBody');
    if (!tbody) return;

    if (!rides || rides.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:#334155;">No recent rides</td></tr>`;
      return;
    }

    tbody.innerHTML = rides.slice(0, 10).map(r => `
      <tr>
        <td style="color:#6366f1;font-weight:700;">#${r.id}</td>
        <td style="color:#e2e8f0;font-weight:600;">${r.passenger_name || 'N/A'}</td>
        <td>${(r.start_location || '').substring(0,12)} → ${(r.end_location || '').substring(0,12)}</td>
        <td>${r.driver_name || 'N/A'}</td>
        <td style="color:#10b981;font-weight:700;">₹${r.fare || 0}</td>
        <td><span class="status-badge ${r.status || 'active'}">${r.status || 'active'}</span></td>
        <td>${r.created_at ? new Date(r.created_at).toLocaleDateString('en-IN') : '–'}</td>
      </tr>
    `).join('');

  } catch (err) {
    console.error('Failed to load recent rides:', err);
    loadRecentRidesFallback();
  }
}

async function loadRecentRidesFallback() {
  const tbody = document.getElementById('recentRidesBody');
  if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:#334155;">Ride history endpoint not available</td></tr>`;
}

// ─── Load Routes ──────────────────────────────────────────────
async function loadRoutes() {
  try {
    const res = await fetch('/api/admin/routes', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    const routes = await res.json();
    const tbody = document.getElementById('routesTableBody');
    const countEl = document.getElementById('routesCountText');
    const badgeEl = document.getElementById('routeCountBadge');

    if (badgeEl) badgeEl.textContent = routes.length;
    if (countEl) countEl.textContent = `${routes.length} routes found`;

    if (!tbody) return;

    if (!routes || routes.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="8">
          <div class="empty-row">
            <div class="empty-row-icon">📍</div>
            <div class="empty-row-text">Koi active routes nahi hain</div>
          </div>
        </td></tr>
      `;
      return;
    }

    tbody.innerHTML = routes.map(r => {
      const empty = r.total_seats - r.filled_seats;
      return `
        <tr>
          <td style="color:#6366f1;font-weight:700;">#${r.id}</td>
          <td style="color:#e2e8f0;font-weight:600;">${r.driver_name}</td>
          <td><span style="font-size:0.78rem;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);padding:2px 7px;border-radius:6px;">${r.vehicle_number}</span></td>
          <td>${r.start_location} → ${r.end_location}</td>
          <td style="color:#10b981;font-weight:700;">₹${r.fare}</td>
          <td>
            <span style="color:${empty > 0 ? '#10b981' : '#ef4444'};font-weight:600;">${empty}</span>
            <span style="color:#475569;">/${r.total_seats}</span>
          </td>
          <td><span class="status-badge ${r.status}">${r.status}</span></td>
          <td>
            ${r.status === 'active'
              ? `<button class="btn-sm btn-sm-danger" onclick="disableRoute(${r.id})">🛑 Disable</button>`
              : '<span style="color:#334155;">—</span>'}
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error('Failed to load routes:', err);
  }
}

// ─── Load Drivers ─────────────────────────────────────────────
async function loadDrivers() {
  try {
    const res = await fetch('/api/admin/drivers', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    const drivers = await res.json();
    allDrivers = drivers;

    const badgeEl = document.getElementById('driverCountBadge');
    if (badgeEl) badgeEl.textContent = drivers.length;

    renderDriversTable(drivers);

  } catch (err) {
    console.error('Failed to load drivers:', err);
  }
}

function renderDriversTable(drivers) {
  const tbody = document.getElementById('driversTableBody');
  if (!tbody) return;

  if (!drivers || drivers.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="9">
        <div class="empty-row">
          <div class="empty-row-icon">👨‍✈️</div>
          <div class="empty-row-text">Koi driver registered nahi hai</div>
        </div>
      </td></tr>
    `;
    return;
  }

  const vehicleIcons = { auto: '🛺', bus: '🚌', car: '🚗' };

  tbody.innerHTML = drivers.map(d => {
    const isBlocked = d.status === 'blocked' || d.is_blocked;
    const statusClass = isBlocked ? 'blocked' : 'active';
    const statusText = isBlocked ? 'Blocked' : 'Active';
    const rating = d.avg_rating ? parseFloat(d.avg_rating).toFixed(1) : '–';
    const ratingColor = parseFloat(d.avg_rating) >= 4 ? '#10b981' : parseFloat(d.avg_rating) >= 3 ? '#f59e0b' : '#ef4444';

    return `
      <tr>
        <td style="color:#6366f1;font-weight:700;">#${d.id}</td>
        <td style="color:#e2e8f0;font-weight:600;">${d.name}</td>
        <td style="color:#94a3b8;">${d.phone}</td>
        <td>${vehicleIcons[d.vehicle_type] || '🚗'} <span style="font-size:0.78rem;">${d.vehicle_number}</span></td>
        <td style="text-transform:capitalize;">${d.vehicle_type}</td>
        <td style="color:${ratingColor};font-weight:600;">⭐ ${rating}</td>
        <td>${d.total_rides || 0}</td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        <td>
          ${isBlocked
            ? `<button class="btn-sm btn-sm-success" onclick="unblockDriver(${d.id})">✅ Unblock</button>`
            : `<button class="btn-sm btn-sm-danger" onclick="blockDriver(${d.id})">🚫 Block</button>`
          }
        </td>
      </tr>
    `;
  }).join('');
}

function filterDrivers() {
  const query = document.getElementById('driverSearch')?.value?.toLowerCase() || '';
  const filtered = allDrivers.filter(d =>
    d.name?.toLowerCase().includes(query) ||
    d.phone?.includes(query) ||
    d.vehicle_number?.toLowerCase().includes(query) ||
    d.vehicle_type?.toLowerCase().includes(query)
  );
  renderDriversTable(filtered);
}

// ─── Block / Unblock Driver ───────────────────────────────────
async function blockDriver(driverId) {
  if (!confirm('Kya aap is driver ko block karna chahte hain?')) return;

  try {
    const res = await fetch(`/api/admin/drivers/${driverId}/status`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: 'blocked' })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to block driver');

    showToast('Driver block ho gaya.', 'success');
    loadDrivers();

  } catch (err) {
    console.error('Block driver error:', err);
    showToast(err.message, 'error');
  }
}

async function unblockDriver(driverId) {
  if (!confirm('Is driver ko unblock karna chahte hain?')) return;

  try {
    const res = await fetch(`/api/admin/drivers/${driverId}/status`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: 'active' })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to unblock driver');

    showToast('Driver unblock ho gaya.', 'success');
    loadDrivers();

  } catch (err) {
    console.error('Unblock driver error:', err);
    showToast(err.message, 'error');
  }
}

// ─── Disable Route ────────────────────────────────────────────
async function disableRoute(routeId) {
  if (!confirm('Is route ko disable karna chahte hain?')) return;

  try {
    const res = await fetch(`/api/admin/routes/${routeId}/disable`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to disable route');

    showToast('Route disabled!', 'success');
    loadRoutes();

  } catch (err) {
    console.error('Disable route error:', err);
    showToast(err.message, 'error');
  }
}

// ─── Load Feedback ────────────────────────────────────────────
async function loadFeedback() {
  try {
    const res = await fetch('/api/admin/feedback', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    const feedbacks = await res.json();
    const grid = document.getElementById('feedbackGrid');
    const badgeEl = document.getElementById('feedbackCountBadge');
    const countEl = document.getElementById('feedbackCountText');

    if (badgeEl) badgeEl.textContent = feedbacks.length;
    if (countEl) countEl.textContent = `${feedbacks.length} feedback items`;

    if (!grid) return;

    if (!feedbacks || feedbacks.length === 0) {
      grid.innerHTML = `
        <div style="text-align:center;padding:48px;color:#334155;grid-column:1/-1;">
          <div style="font-size:2.5rem;margin-bottom:10px;">💬</div>
          <div>Abhi koi feedback nahi aaya</div>
        </div>
      `;
      return;
    }

    grid.innerHTML = feedbacks.map(f => {
      const typeColors = { suggestion: 'suggestion', bug: 'bug', praise: 'praise', complaint: 'complaint' };
      const typeClass = typeColors[f.type] || 'suggestion';
      const date = f.created_at ? new Date(f.created_at).toLocaleDateString('en-IN') : '';

      return `
        <div class="feedback-card">
          <div class="feedback-card-top">
            <span class="feedback-type-tag ${typeClass}">${f.type || 'Suggestion'}</span>
            <span class="feedback-date">${date}</span>
          </div>
          <div class="feedback-message">"${f.message || ''}"</div>
          <div class="feedback-sender">
            <div class="feedback-sender-avatar">👤</div>
            <span>${f.name || 'Anonymous'}${f.phone ? ` · ${f.phone}` : ''}</span>
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error('Failed to load feedback:', err);
    const grid = document.getElementById('feedbackGrid');
    if (grid) grid.innerHTML = `<div style="text-align:center;padding:40px;color:#ef4444;grid-column:1/-1;">Failed to load feedback</div>`;
  }
}

// ─── Logout ───────────────────────────────────────────────────
function adminLogout() {
  localStorage.removeItem('adminToken');
  window.location.href = '/admin-login.html';
}

// ─── Toast ────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const box = document.getElementById('toastBox');
  if (!box) return;
  const toast = document.createElement('div');
  toast.className = `toast-item ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${msg}</span>`;
  box.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}
