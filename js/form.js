// ============================================================
// منطق استبيان «الارتباط الوظيفي وفاعلية بيئة العمل»
// ============================================================

(function () {
  'use strict';

  // التحقق من إعدادات Supabase
  const config = window.SUPABASE_CONFIG;
  if (!config || !config.url || config.url.includes('YOUR_PROJECT_ID')) {
    showAlert('error', 'لم يتم إعداد الاتصال بقاعدة البيانات. يرجى إعداد ملف js/config.js');
    const b = document.getElementById('submit-btn');
    if (b) b.disabled = true;
    return;
  }

  // إنشاء عميل Supabase
  const supabase = window.supabase.createClient(config.url, config.anonKey);

  // عناصر DOM
  const form           = document.getElementById('survey-form');
  const submitBtn      = document.getElementById('submit-btn');
  const successCard    = document.getElementById('success-card');
  const newResponseBtn = document.getElementById('new-response-btn');

  // مجموعات التقييم (الإلزامية) بالترتيب
  const ENG = ['eng_1', 'eng_2', 'eng_3', 'eng_4', 'eng_5'];
  const ENV = ['env_1', 'env_2', 'env_3', 'env_4', 'env_5', 'env_6'];
  const IMP = ['imp_1', 'imp_2', 'imp_3', 'imp_4'];
  const RATING_GROUPS = [...ENG, ...ENV, ...IMP];

  // ===== الحصول على قيمة تقييم مختار =====
  function getRating(name) {
    const el = form.querySelector(`input[name="${name}"]:checked`);
    return el ? parseInt(el.value, 10) : null;
  }

  // ===== إدارة حالة الخطأ البصرية =====
  function clearInvalid() {
    form.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
  }

  function markRatingInvalid(name) {
    const input = form.querySelector(`input[name="${name}"]`);
    const item = input ? input.closest('.rating-item') : null;
    if (item) item.classList.add('is-invalid');
    return item;
  }

  // إزالة علامة الخطأ فور اختيار المستخدم تقييماً
  form.addEventListener('change', (e) => {
    if (e.target && e.target.matches('input[type="radio"]')) {
      const item = e.target.closest('.rating-item');
      if (item) item.classList.remove('is-invalid');
    }
    if (e.target === form.organization) {
      const g = form.organization.closest('.form-group');
      if (g) g.classList.remove('is-invalid');
    }
  });

  // ===== التحقق من النموذج =====
  function validateForm() {
    clearInvalid();

    // الجهة (إلزامي)
    if (!form.organization.value) {
      const g = form.organization.closest('.form-group');
      if (g) g.classList.add('is-invalid');
      return { ok: false, message: 'يرجى اختيار الإدارة / جهة العمل', focus: form.organization };
    }

    // جميع عبارات التقييم (إلزامية)
    for (const name of RATING_GROUPS) {
      if (getRating(name) === null) {
        const item = markRatingInvalid(name);
        return {
          ok: false,
          message: 'يرجى الإجابة على جميع عبارات التقييم قبل الإرسال',
          focus: item
        };
      }
    }

    return { ok: true };
  }

  // ===== عرض رسالة تنبيه =====
  function showAlert(type, message) {
    const alertContainer = document.getElementById('alert-container');
    if (!alertContainer) return;
    alertContainer.innerHTML = `
      <div class="alert alert-${type}">
        <span>${type === 'error' ? '⚠️' : '✓'}</span>
        <span>${message}</span>
      </div>
    `;
    alertContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function clearAlert() {
    const alertContainer = document.getElementById('alert-container');
    if (alertContainer) alertContainer.innerHTML = '';
  }

  // ===== إرسال النموذج =====
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert();

    const result = validateForm();
    if (!result.ok) {
      showAlert('error', result.message);
      if (result.focus) {
        if (result.focus.scrollIntoView) {
          result.focus.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        try { result.focus.focus({ preventScroll: true }); } catch (_) {}
      }
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'جاري الإرسال…';

    const payload = {
      p_organization: form.organization.value,
      p_job_title: form.job_title.value.trim() || null,
      p_years_experience: form.years_experience.value.trim() || null,
      p_eng: ENG.map(getRating),
      p_env: ENV.map(getRating),
      p_imp: IMP.map(getRating),
      p_positive_point: form.positive_point.value.trim() || null,
      p_improvement_opportunity: form.improvement_opportunity.value.trim() || null
    };

    try {
      const { error } = await supabase.rpc('submit_survey_response', payload);
      if (error) throw error;

      // نجاح: إخفاء النموذج وإظهار بطاقة الشكر
      form.closest('.card').style.display = 'none';
      successCard.style.display = 'block';
      successCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      form.reset();

    } catch (err) {
      console.error('خطأ في إرسال الاستبيان:', err);
      showAlert(
        'error',
        'تعذر إرسال الاستبيان. يرجى التحقق من اتصال الإنترنت والمحاولة مرة أخرى.'
      );
      submitBtn.disabled = false;
      submitBtn.textContent = 'إرسال الاستبيان';
    }
  });

  // زر "تعبئة استبيان آخر"
  newResponseBtn.addEventListener('click', () => {
    successCard.style.display = 'none';
    form.closest('.card').style.display = 'block';
    submitBtn.disabled = false;
    submitBtn.textContent = 'إرسال الاستبيان';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

})();
