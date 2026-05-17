// ============================================================
// منطق لوحة الإدارة
// ============================================================

(function () {
  'use strict';

  const config = window.SUPABASE_CONFIG;
  if (!config || !config.url || config.url.includes('YOUR_PROJECT_ID')) {
    document.body.innerHTML = '<div style="padding:40px;text-align:center;font-family:HRSD,sans-serif;color:#f59c00;">لم يتم إعداد ملف js/config.js بعد.</div>';
    return;
  }

  const supabase = window.supabase.createClient(config.url, config.anonKey);

  // عناصر DOM
  const loginSection      = document.getElementById('login-section');
  const dashboardSection  = document.getElementById('dashboard-section');
  const loginForm         = document.getElementById('login-form');
  const loginBtn          = document.getElementById('login-btn');
  const logoutBtn         = document.getElementById('logout-btn');
  const exportBtn         = document.getElementById('export-btn');
  const loginAlert        = document.getElementById('login-alert');
  const statsGrid         = document.getElementById('stats-grid');
  const toolbar           = document.getElementById('admin-toolbar');
  const grid              = document.getElementById('nominations-grid');
  const pagination        = document.getElementById('pagination');
  const searchInput       = document.getElementById('search-input');
  const filterOrgSelect   = document.getElementById('filter-org');
  const sortBySelect      = document.getElementById('sort-by');
  const resultCount       = document.getElementById('result-count');
  const drawer            = document.getElementById('drawer');
  const drawerBackdrop    = document.getElementById('drawer-backdrop');
  const drawerCloseBtn    = document.getElementById('drawer-close');
  const drawerOrg         = document.getElementById('drawer-org');
  const drawerTitle       = document.getElementById('drawer-title');
  const drawerDate        = document.getElementById('drawer-date');
  const drawerBody        = document.getElementById('drawer-body');

  // الحالة العامة
  const state = {
    all: [],
    filtered: [],
    search: '',
    orgFilter: '',
    sort: 'newest',
    page: 1,
    perPage: 12
  };

  let lastFocusedCard = null;

  // ===== التحقق من جلسة موجودة =====
  (async function init() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      showDashboard();
      await loadNominations();
    }
  })();

  // ===== تسجيل الدخول =====
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginAlert.innerHTML = '';
    loginBtn.disabled = true;
    loginBtn.textContent = 'جاري الدخول…';

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      loginAlert.innerHTML = `
        <div class="alert alert-error">
          <span>⚠️</span>
          <span>البريد الإلكتروني أو كلمة السر غير صحيحة</span>
        </div>
      `;
      loginBtn.disabled = false;
      loginBtn.textContent = 'دخول';
      return;
    }

    showDashboard();
    await loadNominations();
  });

  // ===== تسجيل الخروج =====
  logoutBtn.addEventListener('click', async () => {
    await supabase.auth.signOut();
    dashboardSection.style.display = 'none';
    loginSection.style.display = '';
    document.body.classList.add('is-locked');
    loginForm.reset();
    loginBtn.disabled = false;
    loginBtn.textContent = 'دخول';
    state.all = [];
    state.filtered = [];
  });

  function showDashboard() {
    loginSection.style.display = 'none';
    dashboardSection.style.display = '';
    document.body.classList.remove('is-locked');
    // إعادة ضبط أي حالة عالقة قد تسبّب overlay
    document.body.style.overflow = '';
    document.querySelector('.sticky-bar')?.classList.remove('is-visible');
    document.getElementById('drawer')?.classList.remove('is-open');
  }

  // ===== جلب الترشيحات =====
  async function loadNominations() {
    grid.innerHTML = '<div class="loading">جاري تحميل البيانات…</div>';

    const PAGE_SIZE = 1000;
    const all = [];
    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from('nominations')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        grid.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">⚠️</div>
            <div>حدث خطأ في تحميل البيانات: ${escapeHtml(error.message)}</div>
          </div>
        `;
        return;
      }

      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    state.all = all;
    populateOrgFilter(state.all);
    renderStats(state.all);
    toolbar.style.display = state.all.length > 0 ? '' : 'none';
    applyFiltersAndRender();
  }

  // ===== الإحصائيات =====
  async function renderStats(data) {
    const totalNominations = data.length;
    const uniqueOrgs = new Set(data.map(d => d.organization)).size;
    const totalLeaders = data.filter(d => d.leader_name).length;

    let totalEmployees = 0;
    data.forEach(d => {
      if (d.employee_1) totalEmployees++;
      if (d.employee_2) totalEmployees++;
      if (d.employee_3) totalEmployees++;
    });

    const visitors = await fetchVisitorCount();

    statsGrid.innerHTML = `
      <div class="stat-card">
        <span class="stat-value">${totalNominations}</span>
        <span class="stat-label">إجمالي الترشيحات الواردة</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">48</span>
        <span class="stat-label">عدد الجهات والإدارات المشاركة</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">${totalLeaders}</span>
        <span class="stat-label">عدد مرات ترشيح القيادات ورؤساء الاقسام</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">${totalEmployees}</span>
        <span class="stat-label">عدد مرات ترشيح الموظفين</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">${visitors === null ? '—' : visitors}</span>
        <span class="stat-label">عدد زيارات الموقع</span>
      </div>
    `;
  }

  async function fetchVisitorCount() {
    const { data, error } = await supabase
      .from('site_stats')
      .select('value')
      .eq('key', 'visitors')
      .single();
    if (error) return null;
    return data.value;
  }

  // ===== ملء dropdown الجهات =====
  function populateOrgFilter(data) {
    const orgs = Array.from(new Set(data.map(d => d.organization).filter(Boolean))).sort();
    const current = filterOrgSelect.value;
    filterOrgSelect.innerHTML = '<option value="">كل الجهات</option>' +
      orgs.map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('');
    if (current && orgs.includes(current)) filterOrgSelect.value = current;
  }

  // ===== تطبيق البحث/الفلترة/الترتيب =====
  function applyFiltersAndRender() {
    let result = [...state.all];

    // بحث نصي
    if (state.search) {
      const q = state.search.toLowerCase();
      result = result.filter(r => {
        const fields = [
          r.organization, r.leader_name, r.leader_title,
          r.employee_1, r.employee_2, r.employee_3,
          r.leader_other_reason
        ];
        return fields.some(f => f && String(f).toLowerCase().includes(q));
      });
    }

    // فلترة بالجهة
    if (state.orgFilter) {
      result = result.filter(r => r.organization === state.orgFilter);
    }

    // ترتيب
    switch (state.sort) {
      case 'oldest':
        result.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        break;
      case 'org':
        result.sort((a, b) => (a.organization || '').localeCompare(b.organization || '', 'ar'));
        break;
      case 'leader':
        result.sort((a, b) => (a.leader_name || '').localeCompare(b.leader_name || '', 'ar'));
        break;
      default: // newest
        result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    state.filtered = result;

    // ضبط الصفحة الحالية لو خرجت عن النطاق
    const totalPages = Math.max(1, Math.ceil(result.length / state.perPage));
    if (state.page > totalPages) state.page = totalPages;
    if (state.page < 1) state.page = 1;

    resultCount.textContent = result.length.toString();
    renderCards();
    renderPagination();
  }

  // ===== رسم البطاقات =====
  function renderCards() {
    if (state.filtered.length === 0) {
      const isFiltered = state.search || state.orgFilter;
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-icon">${isFiltered ? '🔎' : '📋'}</div>
          <div>${isFiltered ? 'لا توجد ترشيحات تطابق بحثك' : 'لا توجد ترشيحات حتى الآن'}</div>
        </div>
      `;
      return;
    }

    const start = (state.page - 1) * state.perPage;
    const pageItems = state.filtered.slice(start, start + state.perPage);

    grid.innerHTML = pageItems.map((row, i) => buildCard(row, start + i)).join('');

    grid.querySelectorAll('.nomination-card').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.index, 10);
        openDrawer(state.filtered[idx], el);
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const idx = parseInt(el.dataset.index, 10);
          openDrawer(state.filtered[idx], el);
        }
      });
    });
  }

  function buildCard(row, idx) {
    const dateStr = formatRelativeDate(row.created_at);
    const reasons = row.leader_reasons || [];
    const visibleReasons = reasons.slice(0, 2);
    const remainingReasons = reasons.length - visibleReasons.length;
    const employees = [row.employee_1, row.employee_2, row.employee_3].filter(Boolean);

    return `
      <article class="nomination-card" role="button" tabindex="0" data-index="${idx}" aria-label="عرض تفاصيل ترشيح ${escapeHtml(row.leader_name || '')}">
        <header class="nom-card__header">
          <div class="nom-card__org">${escapeHtml(row.organization || 'بدون جهة')}</div>
          <span class="nom-card__date">${escapeHtml(dateStr)}</span>
        </header>

        <div class="nom-card__section">
          <div class="nom-card__section-label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            القائد المرشح
          </div>
          <div class="nom-card__leader-name">${escapeHtml(row.leader_name || '—')}</div>
          ${row.leader_title ? `<div class="nom-card__leader-title">${escapeHtml(row.leader_title)}</div>` : ''}
          ${reasons.length > 0 ? `
            <div class="nom-card__chips">
              ${visibleReasons.map(r => `<span class="nom-card__chip">${escapeHtml(r)}</span>`).join('')}
              ${remainingReasons > 0 ? `<span class="nom-card__chip nom-card__chip--more">+${remainingReasons}</span>` : ''}
            </div>
          ` : ''}
        </div>

        <div class="nom-card__section">
          <div class="nom-card__section-label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            الموظفون المرشحون
          </div>
          <div class="nom-card__employees">
            <span class="nom-card__emp-count">${employees.length}</span>
            <span class="nom-card__emp-names">${employees.length > 0 ? escapeHtml(employees.join('، ')) : 'لا يوجد'}</span>
          </div>
        </div>

        <div class="nom-card__footer">
          <span>عرض التفاصيل الكاملة</span>
          <svg class="nom-card__footer-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12 19 5 12 12 5"/>
          </svg>
        </div>
      </article>
    `;
  }

  // ===== ترقيم الصفحات =====
  function renderPagination() {
    const total = state.filtered.length;
    const totalPages = Math.ceil(total / state.perPage);

    if (totalPages <= 1) {
      pagination.innerHTML = '';
      return;
    }

    const cur = state.page;
    const start = (cur - 1) * state.perPage + 1;
    const end = Math.min(cur * state.perPage, total);

    let pages = [];
    const range = 1; // ±1 من الصفحة الحالية
    pages.push(1);
    for (let i = cur - range; i <= cur + range; i++) {
      if (i > 1 && i < totalPages) pages.push(i);
    }
    if (totalPages > 1) pages.push(totalPages);
    pages = [...new Set(pages)].sort((a, b) => a - b);

    let html = '';
    html += `<button class="pagination__btn" data-action="prev" ${cur === 1 ? 'disabled' : ''} aria-label="الصفحة السابقة">→</button>`;

    let lastShown = 0;
    pages.forEach(p => {
      if (p - lastShown > 1) {
        html += `<span class="pagination__ellipsis">…</span>`;
      }
      html += `<button class="pagination__btn ${p === cur ? 'is-active' : ''}" data-page="${p}" aria-label="الصفحة ${p}" ${p === cur ? 'aria-current="page"' : ''}>${p}</button>`;
      lastShown = p;
    });

    html += `<button class="pagination__btn" data-action="next" ${cur === totalPages ? 'disabled' : ''} aria-label="الصفحة التالية">←</button>`;
    html += `<span class="pagination__info">عرض ${start}–${end} من ${total}</span>`;

    pagination.innerHTML = html;

    pagination.querySelectorAll('.pagination__btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        const action = btn.dataset.action;
        const page = btn.dataset.page;
        if (action === 'prev') state.page = Math.max(1, cur - 1);
        else if (action === 'next') state.page = Math.min(totalPages, cur + 1);
        else if (page) state.page = parseInt(page, 10);
        applyFiltersAndRender();
        // التمرير لأعلى الشبكة برفق
        grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  // ===== Drawer التفاصيل =====
  function openDrawer(row, sourceCard) {
    if (!row) return;
    lastFocusedCard = sourceCard || null;

    drawerOrg.textContent = row.organization || 'بدون جهة';
    drawerTitle.textContent = row.leader_name || 'ترشيح';
    drawerDate.textContent = formatFullDate(row.created_at);

    const employees = [row.employee_1, row.employee_2, row.employee_3].filter(Boolean);
    const leaderReasons = row.leader_reasons || [];
    const employeeReasons = row.employee_reasons || [];

    drawerBody.innerHTML = `
      <section class="drawer-section">
        <h3 class="drawer-section__title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          القائد القدوة
        </h3>
        <div class="person-card">
          <div class="person-card__name">${escapeHtml(row.leader_name || '—')}</div>
          ${row.leader_title ? `<div class="person-card__title">${escapeHtml(row.leader_title)}</div>` : ''}
        </div>
        ${leaderReasons.length > 0 ? `
          <div class="drawer-chips">
            ${leaderReasons.map(r => `
              <span class="drawer-chip">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                ${escapeHtml(r)}
              </span>
            `).join('')}
          </div>
        ` : ''}
        ${row.leader_other_reason ? `<div class="drawer-quote">${escapeHtml(row.leader_other_reason)}</div>` : ''}
      </section>

      <section class="drawer-section">
        <h3 class="drawer-section__title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          الموظفون القدوة (${employees.length})
        </h3>
        ${employees.length > 0 ? employees.map((name, i) => `
          <div class="person-card">
            <span class="person-card__num">${i + 1}</span>
            <div class="person-card__name">${escapeHtml(name)}</div>
          </div>
        `).join('') : '<div style="color:var(--color-muted); font-size:0.9rem;">لا يوجد موظفون مرشحون.</div>'}
        ${employeeReasons.length > 0 ? `
          <div class="drawer-chips" style="margin-top: var(--space-2);">
            ${employeeReasons.map(r => `
              <span class="drawer-chip">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                ${escapeHtml(r)}
              </span>
            `).join('')}
          </div>
        ` : ''}
      </section>
    `;

    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setTimeout(() => drawerCloseBtn.focus(), 50);
  }

  function closeDrawer() {
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocusedCard) {
      lastFocusedCard.focus();
      lastFocusedCard = null;
    }
  }

  drawerCloseBtn.addEventListener('click', closeDrawer);
  drawerBackdrop.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('is-open')) {
      closeDrawer();
    }
  });

  // ===== أحداث شريط الأدوات =====
  let searchTimer;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = e.target.value.trim();
      state.page = 1;
      applyFiltersAndRender();
    }, 200);
  });

  filterOrgSelect.addEventListener('change', (e) => {
    state.orgFilter = e.target.value;
    state.page = 1;
    applyFiltersAndRender();
  });

  sortBySelect.addEventListener('change', (e) => {
    state.sort = e.target.value;
    state.page = 1;
    applyFiltersAndRender();
  });

  // ===== تنسيقات التاريخ =====
  function formatRelativeDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr  = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);

    if (diffMin < 1)  return 'الآن';
    if (diffMin < 60) return `قبل ${diffMin} د`;
    if (diffHr < 24)  return `قبل ${diffHr} س`;
    if (diffDay === 1) return 'أمس';
    if (diffDay < 7)  return `قبل ${diffDay} أيام`;
    return d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function formatFullDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString('ar-SA', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  // ===== تصدير CSV =====
  exportBtn.addEventListener('click', () => {
    const dataToExport = state.filtered.length > 0 ? state.filtered : state.all;
    if (dataToExport.length === 0) {
      alert('لا توجد بيانات للتصدير');
      return;
    }

    const headers = [
      'التاريخ',
      'الجهة',
      'اسم القائد',
      'المسمى الوظيفي',
      'أسباب ترشيح القائد',
      'سبب آخر للقائد',
      'الموظف الأول',
      'الموظف الثاني',
      'الموظف الثالث',
      'أسباب ترشيح الموظفين'
    ];

    const rows = dataToExport.map(r => [
      new Date(r.created_at).toLocaleString('ar-SA'),
      r.organization || '',
      r.leader_name || '',
      r.leader_title || '',
      (r.leader_reasons || []).join(' | '),
      r.leader_other_reason || '',
      r.employee_1 || '',
      r.employee_2 || '',
      r.employee_3 || '',
      (r.employee_reasons || []).join(' | ')
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nominations-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  });

  // ===== أداة هروب HTML =====
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

})();
