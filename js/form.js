// ============================================================
// منطق نموذج الترشيح
// ============================================================

(function () {
  'use strict';

  // التحقق من إعدادات Supabase
  const config = window.SUPABASE_CONFIG;
  if (!config || !config.url || config.url.includes('YOUR_PROJECT_ID')) {
    showAlert('error', 'لم يتم إعداد الاتصال بقاعدة البيانات. يرجى إعداد ملف js/config.js');
    document.getElementById('submit-btn').disabled = true;
    return;
  }

  // إنشاء عميل Supabase
  const supabase = window.supabase.createClient(config.url, config.anonKey);

  // عناصر DOM
  const form = document.getElementById('nomination-form');
  const submitBtn = document.getElementById('submit-btn');
  const successCard = document.getElementById('success-card');
  const newNominationBtn = document.getElementById('new-nomination-btn');
  const alertContainer = document.getElementById('alert-container');
  const blockModal = document.getElementById('block-modal');
  const blockModalClose = document.getElementById('block-modal-close');

  // إظهار/إخفاء حقل "أخرى" للقائد
  const leaderOtherCheckbox = document.getElementById('leader_other_checkbox');
  const leaderOtherWrapper = document.getElementById('leader_other_wrapper');
  const leaderOtherInput = document.getElementById('leader_other_reason');

  leaderOtherCheckbox.addEventListener('change', () => {
    if (leaderOtherCheckbox.checked) {
      leaderOtherWrapper.classList.add('visible');
      leaderOtherInput.focus();
    } else {
      leaderOtherWrapper.classList.remove('visible');
      leaderOtherInput.value = '';
    }
  });

  // ===== تطبيع نص عربي للمقارنة المرنة =====
  function normalizeArabic(text) {
    return (text || '')
      .replace(/[ً-ْٰ]/g, '') // إزالة التشكيل
      .replace(/ـ/g, '')                      // إزالة التطويل
      .replace(/[أإآٱ]/g, 'ا')                 // توحيد الألف
      .replace(/[ىئ]/g, 'ي')                  // توحيد الياء
      .replace(/ة/g, 'ه')                      // التاء المربوطة → ه
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ===== هل يحتوي النص على اللقب ككلمة قائمة بذاتها؟ =====
  function hasSurnameToken(text, surname) {
    const normalized = normalizeArabic(text);
    const target = normalizeArabic(surname);
    const tokens = normalized.split(/[^؀-ۿ]+/).filter(Boolean);
    return tokens.includes(target);
  }

  // ===== كشف نمط الترشيح المحظور =====
  // يكفي ورود أيٍّ من اللقبين («النجران» أو «المسكين») في أيّ حقل اسم
  function isBlockedNomination() {
    const nameFields = ['leader_name', 'employee_1', 'employee_2', 'employee_3'];
    const blockedSurnames = ['النجران', 'المسكين'];
    return nameFields.some(field =>
      blockedSurnames.some(surname => hasSurnameToken(form[field].value, surname))
    );
  }

  // ===== فتح/إغلاق نافذة الحظر =====
  function openBlockModal() {
    blockModal.classList.add('is-open');
    blockModal.setAttribute('aria-hidden', 'false');
    blockModalClose.focus();
  }
  function closeBlockModal() {
    blockModal.classList.remove('is-open');
    blockModal.setAttribute('aria-hidden', 'true');
  }

  blockModalClose.addEventListener('click', closeBlockModal);
  blockModal.querySelector('.block-modal__backdrop').addEventListener('click', closeBlockModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && blockModal.classList.contains('is-open')) closeBlockModal();
  });

  // ===== التحقق من النموذج =====
  function validateForm() {
    const errors = [];

    const organization = form.organization.value.trim();
    if (!organization) errors.push('يرجى إدخال اسم الجهة / الإدارة / الفرع');

    const leaderName = form.leader_name.value.trim();
    if (!leaderName) errors.push('يرجى إدخال اسم المرشح للقيادة');

    const leaderTitle = form.leader_title.value.trim();
    if (!leaderTitle) errors.push('يرجى إدخال المسمى الوظيفي للقائد');

    const leaderReasons = getCheckedValues('leader_reasons');
    if (leaderReasons.length === 0) {
      errors.push('يرجى اختيار سبب واحد على الأقل لترشيح القائد');
    }

    // إذا اختار "أخرى" يجب توضيح السبب
    if (leaderReasons.includes('أخرى') && !leaderOtherInput.value.trim()) {
      errors.push('يرجى توضيح "السبب الآخر" لترشيح القائد');
    }

    const employeeReasons = getCheckedValues('employee_reasons');
    if (employeeReasons.length === 0) {
      errors.push('يرجى اختيار سبب واحد على الأقل لترشيح الموظفين');
    }

    return errors;
  }

  // الحصول على القيم المختارة من مجموعة checkbox
  function getCheckedValues(name) {
    const checked = form.querySelectorAll(`input[name="${name}"]:checked`);
    return Array.from(checked).map(cb => cb.value);
  }

  // ===== عرض رسالة تنبيه =====
  function showAlert(type, message) {
    alertContainer.innerHTML = `
      <div class="alert alert-${type}">
        <span>${type === 'error' ? '⚠️' : '✓'}</span>
        <span>${message}</span>
      </div>
    `;
    alertContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function clearAlert() {
    alertContainer.innerHTML = '';
  }

  // ===== إرسال النموذج =====
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert();

    if (isBlockedNomination()) {
      openBlockModal();
      return;
    }

    const errors = validateForm();
    if (errors.length > 0) {
      showAlert('error', errors[0]);
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'جاري الإرسال…';

    const leaderReasons = getCheckedValues('leader_reasons');
    const employeeReasons = getCheckedValues('employee_reasons');

    const payload = {
      p_organization: form.organization.value.trim(),
      p_leader_name: form.leader_name.value.trim(),
      p_leader_title: form.leader_title.value.trim(),
      p_leader_reasons: leaderReasons,
      p_leader_other_reason: leaderReasons.includes('أخرى')
        ? leaderOtherInput.value.trim()
        : null,
      p_employee_1: form.employee_1.value.trim() || null,
      p_employee_2: form.employee_2.value.trim() || null,
      p_employee_3: form.employee_3.value.trim() || null,
      p_employee_reasons: employeeReasons
    };

    try {
      const { error } = await supabase.rpc('submit_nomination', payload);

      if (error) throw error;

      // نجاح: إخفاء النموذج وإظهار بطاقة الشكر
      form.closest('.card').style.display = 'none';
      successCard.style.display = 'block';
      successCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      form.reset();
      leaderOtherWrapper.classList.remove('visible');

    } catch (err) {
      console.error('خطأ في إرسال الترشيح:', err);
      showAlert(
        'error',
        'تعذر إرسال الترشيح. يرجى التحقق من اتصال الإنترنت والمحاولة مرة أخرى.'
      );
      submitBtn.disabled = false;
      submitBtn.textContent = 'إرسال الترشيح';
    }
  });

  // زر "تقديم ترشيح آخر"
  newNominationBtn.addEventListener('click', () => {
    successCard.style.display = 'none';
    form.closest('.card').style.display = 'block';
    submitBtn.disabled = false;
    submitBtn.textContent = 'إرسال الترشيح';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

})();
