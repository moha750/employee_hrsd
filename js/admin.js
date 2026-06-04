// ============================================================
// منطق لوحة الإدارة — استبيان الارتباط الوظيفي وفاعلية بيئة العمل
// ============================================================

(function () {
  'use strict';

  const config = window.SUPABASE_CONFIG;
  if (!config || !config.url || config.url.includes('YOUR_PROJECT_ID')) {
    document.body.innerHTML = '<div style="padding:40px;text-align:center;font-family:HRSD,sans-serif;color:#f59c00;">لم يتم إعداد ملف js/config.js بعد.</div>';
    return;
  }

  const supabase = window.supabase.createClient(config.url, config.anonKey);

  // ===== تعريف أقسام التقييم وعباراتها =====
  const SECTIONS = [
    {
      key: 'eng', title: 'الارتباط الوظيفي',
      cols: ['eng_1', 'eng_2', 'eng_3', 'eng_4', 'eng_5'],
      items: [
        'أفهم كيف يسهم عملي في تحقيق أهداف الوزارة',
        'أشعر بالحماس لتقديم أفضل أداء في عملي',
        'توجد بيئة تشجع على المشاركة وإبداء الآراء',
        'أشعر بالتقدير عند تقديم إنجازات أو مبادرات مميزة',
        'يوجد تواصل فعّال بين الإدارة والموظفين'
      ]
    },
    {
      key: 'env', title: 'بيئة العمل',
      cols: ['env_1', 'env_2', 'env_3', 'env_4', 'env_5', 'env_6'],
      items: [
        'بيئة العمل تساعدني على أداء مهامي بكفاءة',
        'تتوفر الأدوات والأنظمة التي تساعد على إنجاز العمل',
        'توجد روح تعاون إيجابية بين الزملاء',
        'يتم التعامل مع التحديات والملاحظات بصورة فعالة',
        'أشعر أن الفرع يهتم بتحسين تجربة الموظف',
        'المبادرات والبرامج المنفذة تسهم في تحسين بيئة العمل'
      ]
    },
    {
      key: 'imp', title: 'الأثر والتحسين',
      cols: ['imp_1', 'imp_2', 'imp_3', 'imp_4'],
      items: [
        'التحسينات والمبادرات انعكست إيجابًا على بيئة العمل',
        'ألاحظ تطويرًا مستمرًا في أساليب العمل والخدمات',
        'يتم الاستفادة من آراء الموظفين في تطوير بيئة العمل',
        'رأيك في برامج الرفاه الوظيفي في بيئة العمل'
      ]
    }
  ];
  const ALL_COLS = SECTIONS.reduce((a, s) => a.concat(s.cols), []);
  const SCALE = ['لا أوافق بشدة', 'لا أوافق', 'محايد', 'أوافق', 'أوافق بشدة'];

  // ===== أدوات حسابية =====
  function mean(nums) {
    const vals = nums.filter(n => typeof n === 'number' && !isNaN(n));
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  function rowAvg(row) { return mean(ALL_COLS.map(c => row[c])); }
  function sectionAvg(row, sec) { return mean(sec.cols.map(c => row[c])); }
  function fmtScore(n) { return n === null || n === undefined ? '—' : n.toFixed(2); }
  function scoreLevel(n) {
    if (n === null || n === undefined) return 'na';
    if (n >= 4) return 'high';
    if (n >= 3) return 'mid';
    return 'low';
  }

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
      await loadResponses();
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
    await loadResponses();
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
    document.body.style.overflow = '';
    document.querySelector('.sticky-bar')?.classList.remove('is-visible');
    document.getElementById('drawer')?.classList.remove('is-open');
  }

  // ===== جلب الردود =====
  async function loadResponses() {
    grid.innerHTML = '<div class="loading">جاري تحميل البيانات…</div>';

    const PAGE_SIZE = 1000;
    const all = [];
    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from('survey_responses')
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
    await renderStats(state.all);
    toolbar.style.display = state.all.length > 0 ? '' : 'none';
    applyFiltersAndRender();
  }

  // ===== الإحصائيات =====
  async function renderStats(data) {
    const total = data.length;
    const uniqueOrgs = new Set(data.map(d => d.organization).filter(Boolean)).size;

    const overall = mean(data.map(rowAvg).filter(v => v !== null));
    const engAvg  = mean(data.map(d => sectionAvg(d, SECTIONS[0])).filter(v => v !== null));
    const envAvg  = mean(data.map(d => sectionAvg(d, SECTIONS[1])).filter(v => v !== null));
    const impAvg  = mean(data.map(d => sectionAvg(d, SECTIONS[2])).filter(v => v !== null));

    const visitors = await fetchVisitorCount();

    statsGrid.innerHTML = `
      <div class="stat-card">
        <span class="stat-value">${total}</span>
        <span class="stat-label">إجمالي الردود الواردة</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">${uniqueOrgs}</span>
        <span class="stat-label">عدد الجهات المشاركة</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">${fmtScore(overall)}</span>
        <span class="stat-label">متوسط التقييم العام (من 5)</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">${fmtScore(engAvg)}</span>
        <span class="stat-label">متوسط الارتباط الوظيفي</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">${fmtScore(envAvg)}</span>
        <span class="stat-label">متوسط بيئة العمل</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">${fmtScore(impAvg)}</span>
        <span class="stat-label">متوسط الأثر والتحسين</span>
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
    const orgs = Array.from(new Set(data.map(d => d.organization).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ar'));
    const current = filterOrgSelect.value;
    filterOrgSelect.innerHTML = '<option value="">كل الجهات</option>' +
      orgs.map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('');
    if (current && orgs.includes(current)) filterOrgSelect.value = current;
  }

  // ===== تطبيق البحث/الفلترة/الترتيب =====
  function applyFiltersAndRender() {
    let result = [...state.all];

    if (state.search) {
      const q = state.search.toLowerCase();
      result = result.filter(r => {
        const fields = [
          r.organization, r.job_title, r.years_experience,
          r.positive_point, r.improvement_opportunity
        ];
        return fields.some(f => f && String(f).toLowerCase().includes(q));
      });
    }

    if (state.orgFilter) {
      result = result.filter(r => r.organization === state.orgFilter);
    }

    switch (state.sort) {
      case 'oldest':
        result.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        break;
      case 'org':
        result.sort((a, b) => (a.organization || '').localeCompare(b.organization || '', 'ar'));
        break;
      case 'avg_desc':
        result.sort((a, b) => (rowAvg(b) || 0) - (rowAvg(a) || 0));
        break;
      case 'avg_asc':
        result.sort((a, b) => (rowAvg(a) || 0) - (rowAvg(b) || 0));
        break;
      default: // newest
        result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    state.filtered = result;

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
          <div class="empty-icon">${isFiltered}</div>
          <div>${isFiltered ? 'لا توجد ردود تطابق بحثك' : 'لا توجد ردود حتى الآن'}</div>
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
    const avg = rowAvg(row);
    const meta = [row.job_title, row.years_experience].filter(Boolean).join(' • ');
    const hasText = row.positive_point || row.improvement_opportunity;

    const chips = SECTIONS.map(sec => {
      const v = sectionAvg(row, sec);
      return `<span class="resp-chip">${escapeHtml(sec.title)} <b>${fmtScore(v)}</b></span>`;
    }).join('');

    return `
      <article class="nomination-card" role="button" tabindex="0" data-index="${idx}" aria-label="عرض تفاصيل ردّ ${escapeHtml(row.organization || '')}">
        <header class="nom-card__header">
          <div class="nom-card__org">${escapeHtml(row.organization || 'بدون جهة')}</div>
          <span class="nom-card__date">${escapeHtml(dateStr)}</span>
        </header>

        <div class="resp-card__score">
          <span class="score-badge score-badge--${scoreLevel(avg)}">${fmtScore(avg)}</span>
          <span class="resp-card__score-label">متوسط التقييم العام<br>من 5</span>
        </div>

        <div class="nom-card__section">
          <div class="resp-card__chips">${chips}</div>
          ${meta ? `<div class="resp-card__meta">${escapeHtml(meta)}</div>` : ''}
          ${hasText ? `<div class="resp-card__hastext">✍️ يحتوي إجابات مكتوبة</div>` : ''}
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
    const range = 1;
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
        grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  // ===== Drawer التفاصيل =====
  function openDrawer(row, sourceCard) {
    if (!row) return;
    lastFocusedCard = sourceCard || null;

    drawerOrg.textContent = row.organization || 'بدون جهة';
    drawerTitle.textContent = `متوسط التقييم: ${fmtScore(rowAvg(row))} من 5`;
    drawerDate.textContent = formatFullDate(row.created_at);

    const general = `
      <section class="drawer-section">
        <h3 class="drawer-section__title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/>
          </svg>
          بيانات عامة
        </h3>
        <div class="person-card">
          <div class="person-card__name">${escapeHtml(row.organization || '—')}</div>
          ${row.job_title ? `<div class="person-card__title">المسمى الوظيفي: ${escapeHtml(row.job_title)}</div>` : ''}
          ${row.years_experience ? `<div class="person-card__title">سنوات الخبرة: ${escapeHtml(row.years_experience)}</div>` : ''}
        </div>
      </section>
    `;

    const sectionsHtml = SECTIONS.map(sec => {
      const avg = sectionAvg(row, sec);
      const rows = sec.items.map((label, i) => {
        const v = row[sec.cols[i]];
        const lvl = scoreLevel(v);
        return `
          <div class="rating-readout">
            <span class="rating-readout__text">${escapeHtml(label)}</span>
            <span class="rating-readout__meta">
              <span class="rating-readout__scale">${v ? escapeHtml(SCALE[v - 1]) : '—'}</span>
              <span class="score-badge score-badge--${lvl} score-badge--sm">${v ?? '—'}</span>
            </span>
          </div>
        `;
      }).join('');
      return `
        <section class="drawer-section">
          <h3 class="drawer-section__title">
            <span class="drawer-section__avg">${fmtScore(avg)}</span>
            ${escapeHtml(sec.title)}
          </h3>
          ${rows}
        </section>
      `;
    }).join('');

    const hasText = row.positive_point || row.improvement_opportunity;
    const textHtml = hasText ? `
      <section class="drawer-section">
        <h3 class="drawer-section__title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
          </svg>
          إجابات مكتوبة
        </h3>
        ${row.positive_point ? `<div class="drawer-qa"><div class="drawer-qa__q">أبرز نقطة إيجابية في بيئة العمل:</div><div class="drawer-quote">${escapeHtml(row.positive_point)}</div></div>` : ''}
        ${row.improvement_opportunity ? `<div class="drawer-qa"><div class="drawer-qa__q">أهم فرصة تحسين مقترحة:</div><div class="drawer-quote">${escapeHtml(row.improvement_opportunity)}</div></div>` : ''}
      </section>
    ` : '';

    drawerBody.innerHTML = general + sectionsHtml + textHtml;

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

  // ===== تصدير CSV (يفتح في إكسل) =====
  exportBtn.addEventListener('click', () => {
    const dataToExport = state.filtered.length > 0 ? state.filtered : state.all;
    if (dataToExport.length === 0) {
      alert('لا توجد بيانات للتصدير');
      return;
    }

    const headers = ['التاريخ', 'الجهة', 'المسمى الوظيفي', 'سنوات الخبرة'];
    SECTIONS.forEach(sec => sec.items.forEach(label => headers.push(`[${sec.title}] ${label}`)));
    headers.push('أبرز نقطة إيجابية', 'أهم فرصة تحسين', 'المتوسط العام');

    const rows = dataToExport.map(r => {
      const base = [
        new Date(r.created_at).toLocaleString('ar-SA'),
        r.organization || '',
        r.job_title || '',
        r.years_experience || ''
      ];
      ALL_COLS.forEach(c => base.push(r[c] ?? ''));
      base.push(r.positive_point || '', r.improvement_opportunity || '', fmtScore(rowAvg(r)));
      return base;
    });

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `survey-responses-${new Date().toISOString().split('T')[0]}.csv`;
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
