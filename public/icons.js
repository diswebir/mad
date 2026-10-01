'use strict';
(function () {
  const icons = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.6"/><rect x="14" y="3" width="7" height="5" rx="1.6"/><rect x="14" y="12" width="7" height="9" rx="1.6"/><rect x="3" y="16" width="7" height="5" rx="1.6"/>',
    student: '<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    teacher: '<circle cx="12" cy="8" r="4"/><path d="M5 21v-1a7 7 0 0 1 14 0v1M18 8h3m-1.5-1.5v3"/>',
    classes: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h4v4H7zm7 0h3M14 12h3M7 16h10"/>',
    parents: '<path d="M20.8 8.6c0 4.4-8.8 10-8.8 10s-8.8-5.6-8.8-10A4.6 4.6 0 0 1 12 6.1a4.6 4.6 0 0 1 8.8 2.5Z"/><path d="M8.5 11.5h7"/>',
    attendance: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18m-13 5 2 2 4-4"/>',
    subjects: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/><path d="M8 7h8m-8 4h7"/>',
    timetable: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    assignments: '<path d="M8 4h10a2 2 0 0 1 2 2v14H8a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z"/><path d="M5 8h10m-8 4h8m-8 4h6M8 4V2"/>',
    exams: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5h6V2H9zM9 11h6m-6 4h6m-6 4h3"/>',
    grades: '<path d="M3 3v18h18M7 14l4-4 4 3 6-7"/><circle cx="7" cy="14" r="1"/><circle cx="11" cy="10" r="1"/><circle cx="15" cy="13" r="1"/>',
    tickets: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/>',
    notices: '<path d="m3 11 18-5v12L3 13v-2Zm0 2v5a2 2 0 0 0 2 2h2l-1-6m14-7a5 5 0 0 1 0 12"/>',
    events: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18m3 4h.01"/>',
    messages: '<path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13"/>',
    finance: '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18m-5 5h2m-15-9V4a2 2 0 0 1 2-2h12"/>',
    library: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/><path d="M9 6h8M9 10h8"/>',
    transport: '<path d="M5 17h14l1-7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2l1 7Z"/><path d="M3 17h18v3H3zm4 3v2m10-2v2M7 12h.01M17 12h.01M6 8l1-4h10l1 4"/>',
    documents: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6m-12 4h8m-8 4h8m-8 4h4"/>',
    reports: '<path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6" rx=".5"/><rect x="13" y="7" width="3" height="10" rx=".5"/><rect x="19" y="4" width="3" height="13" rx=".5"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 8v6m3-3h-6"/>',
    roles: '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
    audit: '<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5m4-1v5l3 2"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1a2 2 0 1 1-2.8 2.8l-.1-.1a2 2 0 0 0-3.4 1.4v.3a2 2 0 1 1-4 0v-.2A2 2 0 0 0 5.8 17l-.1.1a2 2 0 1 1-2.8-2.8L3 14a2 2 0 0 0-1.4-3.4h-.3a2 2 0 1 1 0-4h.2A2 2 0 0 0 3 3.2l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a2 2 0 0 0 3.4-1.4v-.3a2 2 0 1 1 4 0v.2A2 2 0 0 0 17 1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a2 2 0 0 0 1.4 3.4h.3a2 2 0 1 1 0 4h-.2a2 2 0 0 0-1.9 3.8Z" transform="translate(1 1) scale(.92)"/>',
    modules: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4m-5 5v2"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    'arrow-left': '<path d="M19 12H5m7 7-7-7 7-7"/>',
    'arrow-right': '<path d="M5 12h14m-7-7 7 7-7 7"/>',
    'chevron-left': '<path d="m15 18-6-6 6-6"/>',
    'chevron-right': '<path d="m9 18 6-6-6-6"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    close: '<path d="m18 6-12 12M6 6l12 12"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12a2 2 0 0 0 4 0"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.5 9a2.6 2.6 0 1 1 4.5 1.8c-1.1 1.1-2 1.5-2 3.2m0 3h.01"/>',
    external: '<path d="M14 3h7v7m0-7L10 14"/><path d="M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    school: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10Z"/><path d="M9 21v-7h6v7m-9-11h2m8 0h2"/>',
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/>',
    'file-database': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6m-12 5c0-1 2-1.7 4-1.7s4 .7 4 1.7-2 1.7-4 1.7-4-.7-4-1.7Zm0 0v4c0 1 2 1.7 4 1.7s4-.7 4-1.7v-4"/>',
    plug: '<path d="M12 22v-5m0 0a7 7 0 0 0 7-7V7H5v3a7 7 0 0 0 7 7Zm-3-15v5m6-5v5"/>',
    shield: '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/>',
    'user-shield': '<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="m19 14 3 1.2V18c0 2-1.4 3-3 4-1.6-1-3-2-3-4v-2.8l3-1.2Z"/>',
    'shield-check': '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
    sparkles: '<path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Zm7 12 1 2.5 2.5 1-2.5 1L19 22l-1-2.5-2.5-1 2.5-1 1-2.5ZM5 2l.8 2.2L8 5l-2.2.8L5 8l-.8-2.2L2 5l2.2-.8L5 2Z"/>',
    plus: '<path d="M12 5v14m-7-7h14"/>',
    filter: '<path d="M4 6h16M7 12h10m-7 6h4"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4m4-5 5 5 5-5m-5 5V3"/>',
    printer: '<path d="M6 9V2h12v7m0 8h2a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2m0-4h12v9H6z"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
    trash: '<path d="M3 6h18m-2 0-1 14H6L5 6m3 0V4h8v2m-6 4v6m4-6v6"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7l.5 3a2 2 0 0 1-.6 1.7L7.2 10a16 16 0 0 0 6 6l1.6-1.8a2 2 0 0 1 1.7-.6l3 .5a2 2 0 0 1 1.5 1.8Z"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    'arrow-up': '<path d="M12 19V5m-7 7 7-7 7 7"/>',
    'arrow-down': '<path d="M12 5v14m7-7-7 7-7-7"/>',
    'message-check': '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6A8.4 8.4 0 0 1 12.5 3M9 12l2 2 5-5"/>',
    'empty-box': '<path d="m4 7 8-4 8 4v10l-8 4-8-4V7Z"/><path d="m4 7 8 4 8-4m-8 4v10"/>'
  };
  window.uiIcon = function (name, size = 20, extraClass = '') {
    const content = icons[name] || icons.documents;
    return `<svg class="ui-icon ${extraClass}" width="${Number(size)}" height="${Number(size)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${content}</svg>`;
  };
  window.hydrateIcons = function (root = document) {
    root.querySelectorAll('[data-icon]').forEach((node) => {
      if (node.dataset.iconReady) return;
      const name = node.dataset.icon;
      const oldLabel = node.getAttribute('aria-label');
      const size = Number(node.dataset.iconSize || 20);
      node.insertAdjacentHTML('afterbegin', window.uiIcon(name, size));
      if (oldLabel) node.setAttribute('aria-label', oldLabel);
      node.dataset.iconReady = '1';
    });
  };
})();
