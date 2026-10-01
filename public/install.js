'use strict';
(() => {
  const form = document.querySelector('#install-form');
  const steps = [...document.querySelectorAll('.installer-step')];
  const progress = [...document.querySelectorAll('.progress-step')];
  const errorBox = document.querySelector('#install-error');
  const nextButton = document.querySelector('#next-step');
  const backButton = document.querySelector('#back-step');
  const finishButton = document.querySelector('#finish-install');
  const mysqlFields = document.querySelector('#mysql-fields');
  const dbResult = document.querySelector('#db-test-result');
  const card = document.querySelector('#installer-card');
  const success = document.querySelector('#installer-success');
  let currentStep = 1;
  let busy = false;

  window.hydrateIcons();

  async function checkInstalled() {
    try {
      const response = await fetch('/api/install/status', { cache: 'no-store' });
      const result = await response.json();
      if (result.installed) {
        card.innerHTML = `<div class="already-installed"><span class="success-mark">${window.uiIcon('shield-check', 30)}</span><span class="installer-kicker"><i></i> سامانه نصب شده است</span><h2>راه‌اندازی قبلاً انجام شده</h2><p>برای حفاظت از اطلاعات، ویزارد نصب پس از راه‌اندازی غیرفعال می‌شود.</p><a class="button button-primary" href="/">رفتن به پنل مدرسه ${window.uiIcon('arrow-left')}</a></div>`;
      }
    } catch { /* Offline state is handled when the user submits. */ }
  }

  function showStep(step) {
    currentStep = step;
    steps.forEach((item) => item.classList.toggle('is-visible', Number(item.dataset.step) === step));
    progress.forEach((item) => {
      const number = Number(item.dataset.progressStep);
      item.classList.toggle('is-active', number === step);
      item.classList.toggle('is-done', number < step);
    });
    backButton.hidden = step === 1;
    nextButton.hidden = step === 3;
    finishButton.hidden = step !== 3;
    errorBox.textContent = '';
    errorBox.classList.remove('is-visible');
    if (step === 3) document.querySelector('[name="adminName"]').focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function field(name) { return form.elements.namedItem(name); }
  function validateCurrentStep() {
    const section = steps.find((item) => Number(item.dataset.step) === currentStep);
    const inputs = [...section.querySelectorAll('input:not([type=radio]):not([type=checkbox])')].filter((input) => !input.closest('[hidden]'));
    for (const input of inputs) {
      if (input.required && !input.value.trim()) {
        input.focus();
        input.classList.add('is-invalid');
        return 'لطفاً فیلدهای ضروری را تکمیل کنید.';
      }
      input.classList.remove('is-invalid');
      if (input.type === 'email' && input.value && !input.validity.valid) {
        input.focus();
        return 'قالب ایمیل واردشده معتبر نیست.';
      }
    }
    if (currentStep === 2 && field('databaseDriver').value === 'mysql') {
      for (const name of ['dbHost', 'dbName', 'dbUser']) {
        const input = field(name);
        if (!input.value.trim()) { input.focus(); input.classList.add('is-invalid'); return 'اطلاعات اتصال MySQL را کامل کنید.'; }
      }
    }
    if (currentStep === 3) {
      if (field('username').value.trim().length < 3) return 'نام کاربری باید دست‌کم ۳ نویسه باشد.';
      if (!/^[a-zA-Z0-9._-]{3,40}$/.test(field('username').value.trim())) return 'نام کاربری فقط می‌تواند شامل حروف انگلیسی، عدد، نقطه، خط تیره یا زیرخط باشد.';
      if (field('password').value.length < 10) return 'گذرواژه مدیر باید دست‌کم ۱۰ نویسه باشد.';
    }
    return '';
  }

  function setError(message) {
    errorBox.textContent = message;
    errorBox.classList.toggle('is-visible', Boolean(message));
  }

  nextButton.addEventListener('click', () => {
    const error = validateCurrentStep();
    if (error) return setError(error);
    showStep(Math.min(3, currentStep + 1));
  });
  backButton.addEventListener('click', () => showStep(Math.max(1, currentStep - 1)));

  document.querySelectorAll('[name="databaseDriver"]').forEach((input) => input.addEventListener('change', () => {
    const mysqlSelected = input.value === 'mysql' && input.checked;
    mysqlFields.hidden = !mysqlSelected;
    document.querySelectorAll('.database-option').forEach((option) => option.classList.toggle('is-selected', option.dataset.databaseOption === input.value));
    dbResult.textContent = '';
  }));

  document.querySelector('[data-install-toggle]').addEventListener('click', (event) => {
    const input = field('password');
    input.type = input.type === 'password' ? 'text' : 'password';
    event.currentTarget.classList.toggle('is-shown', input.type === 'text');
  });

  document.querySelector('#test-db-button').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const body = {
      host: field('dbHost').value.trim(), port: field('dbPort').value,
      database: field('dbName').value.trim(), user: field('dbUser').value.trim(), password: field('dbPassword').value
    };
    dbResult.textContent = 'در حال بررسی اتصال…';
    dbResult.className = 'db-test-pending';
    button.disabled = true;
    try {
      const response = await fetch('/api/install/test-db', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json();
      dbResult.textContent = response.ok ? result.message : result.error;
      dbResult.className = response.ok ? 'db-test-success' : 'db-test-error';
    } catch {
      dbResult.textContent = 'امکان اتصال به سامانه نیست. وضعیت سرور را بررسی کنید.';
      dbResult.className = 'db-test-error';
    } finally { button.disabled = false; }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const error = validateCurrentStep();
    if (error) return setError(error);
    const driver = field('databaseDriver').value;
    const payload = {
      schoolName: field('schoolName').value.trim(), schoolNameEn: field('schoolName').value.trim(),
      academicYear: field('academicYear').value.trim(), phone: field('phone').value.trim(),
      email: field('email').value.trim(), address: field('address').value.trim(),
      adminName: field('adminName').value.trim(), username: field('username').value.trim(), password: field('password').value,
      preserveDemo: field('preserveDemo').checked,
      database: driver === 'mysql' ? {
        driver, host: field('dbHost').value.trim(), port: field('dbPort').value || 3306,
        database: field('dbName').value.trim(), user: field('dbUser').value.trim(), password: field('dbPassword').value
      } : { driver: 'json' }
    };
    busy = true;
    finishButton.disabled = true;
    finishButton.innerHTML = '<span class="install-spinner"></span> در حال راه‌اندازی…';
    setError('');
    try {
      const response = await fetch('/api/install', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'نصب انجام نشد.');
      card.hidden = true;
      success.hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (installError) {
      setError(installError.message || 'ارتباط با سرور برقرار نشد.');
      finishButton.disabled = false;
      finishButton.innerHTML = `${window.uiIcon('sparkles')} نصب و راه‌اندازی`;
      busy = false;
    }
  });

  checkInstalled();
})();
