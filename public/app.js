import { DEMO_WEEKS, SAMPLE_MESSAGE, compareDemoWeeks, computeDemoRisks, extractDemoUpdate, getDemoItems, scanDemoPrivacy } from "./demo-intelligence.js";

const state = {
  token: localStorage.getItem("pib_token") || "",
  role: localStorage.getItem("pib_role") || "",
  selectedPmProfile: localStorage.getItem("pib_pm_profile") || "",
  pmAccountId: localStorage.getItem("pib_pm_account") || "",
  config: null,
  dashboard: null,
  selectedWeek: "",
  period: "weekly",
  pmViewMode: "owner",
  pmViewProfile: "",
  filters: {
    status: "",
    owner: "",
    productArea: "",
    segment: "",
    track: "",
    productWorkstream: "",
    includeFutureDone: false,
  },
  boardView: localStorage.getItem("pib_board_view") || "product",
  archiveItems: [],
  archiveSearch: "",
  view: "login",
  modal: null,
  detail: null,
  guideOpen: false,
  error: "",
  modules: loadModuleData(),
  demo: {
    intelligenceMode: localStorage.getItem("pib_intelligence_mode") || "live",
    weekIndex: 4,
    compareFrom: 2,
    groupBy: "area",
    filter: "",
    selectedId: "",
    captureStep: "input",
    captureText: "",
    privacy: null,
    extraction: null,
    reviewTab: "updates",
    notice: "",
    importBundle: loadDemoImportBundle(),
  },
};

const app = document.querySelector("#app");
const DASHBOARD_CACHE_KEY = "pib_dashboard_cache";
const fallbackLoginConfig = {
  roles: ["viewer", "pm_team", "product_lead", "admin", "pmm"],
  pmAccounts: [
    { accountId: "pm01", pmProfile: "Arbi", active: true },
    { accountId: "pm02", pmProfile: "Kintan", active: true },
    { accountId: "pm03", pmProfile: "Stephen", active: true },
    { accountId: "pm04", pmProfile: "Martin", active: true },
    { accountId: "pm05", pmProfile: "Aaron", active: true },
    { accountId: "pm06", pmProfile: "Min Hou", active: true },
    { accountId: "pm07", pmProfile: "Fadlim", active: true },
    { accountId: "pm08", pmProfile: "Aurora", active: true },
  ],
  pmProfiles: [],
  currentReportingWeek: "",
};

function loadModuleData() {
  try {
    return {
      announcements: [],
      marketing: [],
      meetings: [],
      ...JSON.parse(localStorage.getItem("pib_modules") || "{}"),
    };
  } catch {
    return { announcements: [], marketing: [], meetings: [] };
  }
}

function loadDemoImportBundle() {
  try {
    return JSON.parse(localStorage.getItem("pib_fictional_demo_import") || "null");
  } catch {
    return null;
  }
}

function saveModuleData() {
  localStorage.setItem("pib_modules", JSON.stringify(state.modules));
}

function loadDashboardCache() {
  try {
    return JSON.parse(localStorage.getItem(DASHBOARD_CACHE_KEY) || "null");
  } catch {
    return null;
  }
}

function saveDashboardCache() {
  if (!state.config || !state.dashboard) return;
  localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify({
    config: state.config,
    dashboard: state.dashboard,
    modules: state.modules,
    session: {
      role: state.role,
      selectedPmProfile: state.selectedPmProfile,
      pmAccountId: state.pmAccountId,
    },
    savedAt: new Date().toISOString(),
  }));
}

function api(path, options = {}) {
  return fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {}),
    },
  }).then(async (response) => {
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      localStorage.clear();
      state.config = state.config || fallbackLoginConfig;
      Object.assign(state, { token: "", role: "", selectedPmProfile: "", pmAccountId: "", view: "login", dashboard: null, modal: null, detail: null, error: "Session expired. Please log in again." });
      render();
      throw new Error("Session expired. Please log in again.");
    }
    if (!response.ok) throw new Error(data.error || "Request failed.");
    return data;
  });
}

function canEdit() {
  return ["pm_team", "pm_editor", "product_lead", "admin"].includes(state.role);
}

function canArchive() {
  return ["product_lead", "admin"].includes(state.role);
}

function canAdmin() {
  return state.role === "admin";
}

function canDeleteItem(item) {
  if (!item) return false;
  if (canAdmin()) return true;
  if (["pm_team", "pm_editor"].includes(state.role)) return item.owner === state.selectedPmProfile;
  return false;
}

function canManageSavedModules() {
  return ["product_lead", "admin"].includes(state.role);
}

function canManagePmm() {
  return ["pmm", "product_lead", "admin"].includes(state.role);
}

function canManageModules() {
  return ["pm_team", "pm_editor", "product_lead", "admin", "pmm"].includes(state.role);
}

function html(strings, ...values) {
  return strings.reduce((acc, string, index) => acc + string + (values[index] ?? ""), "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatDateTime(value) {
  if (!value) return "Not updated";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function displayWeek(week) {
  return `W${String(week || "").split("-")[1] || ""}`;
}

function statusClass(status) {
  const key = String(status || "").toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");
  if (key) return `status-${key}`;
  return "";
}

function needsBlockerDelay(status) {
  return status === "Blocked" || status === "Delay";
}

function setFormBusy(form, busy, label = "Saving...") {
  const button = form.querySelector("button[type='submit']");
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = label;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
    delete button.dataset.originalText;
  }
}

function linkLines(links = []) {
  return links.map((link) => `${link.label || link.url} | ${link.url}`).join("\n");
}

function taskLines(tasks = []) {
  return tasks.map((task) => task.title || task).join("\n");
}

function subTaskStatePayload(form) {
  return [...form.querySelectorAll("[data-subtask-check]")].map((input) => ({
    id: input.dataset.subtaskId || "",
    title: input.dataset.subtaskTitle || "",
    done: input.checked,
  }));
}

const DEFAULT_WORKSTREAM_TITLE = "Overall update";

function deriveProductWorkstream(itemOrTitle) {
  if (typeof itemOrTitle === "object" && itemOrTitle?.productWorkstream) return itemOrTitle.productWorkstream;
  const title = typeof itemOrTitle === "object" ? itemOrTitle?.title : itemOrTitle;
  return String(title || "").split(/\s+[—–-]\s+/)[0]?.trim() || "";
}

function productWorkstreamOptions(productArea, segment, item = null) {
  const values = (state.dashboard?.items || [])
    .filter((candidate) => candidate.productArea === productArea && candidate.segment === segment)
    .map((candidate) => deriveProductWorkstream(candidate))
    .filter(Boolean);
  if (item) values.push(deriveProductWorkstream(item));
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function itemDisplayParts(item) {
  const product = deriveProductWorkstream(item);
  const title = String(item?.title || "");
  const escapedProduct = product.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const prefixedDetail = product
    ? title.replace(new RegExp(`^${escapedProduct}\\s+[—–-]\\s+`, "i"), "").trim()
    : "";
  const detail = prefixedDetail && prefixedDetail !== title ? prefixedDetail : title;
  return {
    product: product || title,
    detail: detail && detail !== product ? detail : "",
  };
}

function matchingProductWorkstreamOwner(productArea, segment, productWorkstream) {
  return (state.dashboard?.items || []).find((item) =>
    item.productArea === productArea
    && item.segment === segment
    && deriveProductWorkstream(item) === productWorkstream
    && item.owner
  )?.owner || "";
}

function allWeeklyItems() {
  const items = [...(state.dashboard?.items || [])];
  if (state.detail && !items.some((item) => item.id === state.detail.id)) items.unshift(state.detail);
  return items;
}

function weeklySelectionOptions(selected = {}) {
  const items = allWeeklyItems();
  const productAreas = [...new Set(items.map((item) => item.productArea).filter(Boolean))];
  const allowBlank = selected.allowBlank && !selected.item;
  const productArea = selected.productArea || selected.item?.productArea || (allowBlank ? "" : productAreas[0]) || "";
  const areaItems = items.filter((item) => item.productArea === productArea);
  const segments = [...new Set(areaItems.map((item) => item.segment).filter(Boolean))];
  const segment = selected.segment || selected.item?.segment || (allowBlank ? "" : segments[0]) || "";
  const segmentItems = areaItems.filter((item) => item.segment === segment);
  const tracks = [...new Set(segmentItems.map((item) => item.track).filter(Boolean))];
  const track = selected.track || selected.item?.track || (allowBlank ? "" : tracks[0]) || "";
  const productWorkstreams = [...new Set(segmentItems.map((item) => deriveProductWorkstream(item)).filter(Boolean))];
  const productWorkstream = selected.productWorkstream || deriveProductWorkstream(selected.item) || (allowBlank ? "" : productWorkstreams[0]) || "";
  const updateItems = segmentItems.filter((item) => deriveProductWorkstream(item) === productWorkstream);
  return { productAreas, productArea, segments, segment, tracks, track, productWorkstreams, productWorkstream, updateItems };
}

function workstreamLabel(value) {
  return String(value || "").trim() === "General" ? DEFAULT_WORKSTREAM_TITLE : String(value || "").trim();
}

function workstreamKey(value) {
  return String(value || "").trim().toLowerCase();
}

function isPlaceholderWorkstream(value) {
  return ["no", "none", "n/a", "na", "-", "无", "没有"].includes(String(value || "").trim().toLowerCase());
}

function workstreamsForItem(item, entry = null) {
  const workstreams = [...(item?.workstreams || item?.subTasks || [])]
    .map((workstream) => ({ ...workstream, title: workstreamLabel(workstream.title || workstream) }))
    .filter((workstream) => workstream.title && !isPlaceholderWorkstream(workstream.title));
  const entryWorkstreamTitle = workstreamLabel(entry?.workstreamTitle);
  if (entryWorkstreamTitle && !isPlaceholderWorkstream(entryWorkstreamTitle) && !workstreams.some((workstream) => workstream.id === entry.workstreamId || workstream.title === entryWorkstreamTitle)) {
    workstreams.push({ id: entry.workstreamId || entryWorkstreamTitle, title: entryWorkstreamTitle });
  }
  if (!workstreams.length) workstreams.push({ id: "overall-update", title: DEFAULT_WORKSTREAM_TITLE });
  return workstreams;
}

function ownerProfiles() {
  const accountProfiles = (state.config?.pmAccounts || []).map((account) => account.pmProfile).filter(Boolean);
  const itemOwners = (state.dashboard?.items || []).map((item) => item.owner).filter(Boolean);
  return [...new Set([...(state.config?.pmProfiles || []), ...accountProfiles, ...itemOwners])];
}

function dashboardItems() {
  return state.dashboard?.items || [];
}

function uniqueDashboardValues(selector, filterFn = () => true) {
  return [...new Set(dashboardItems().filter(filterFn).map(selector).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function availableProductAreas() {
  return uniqueDashboardValues((item) => item.productArea);
}

function availableSegments() {
  return uniqueDashboardValues(
    (item) => item.segment,
    (item) => !state.filters.productArea || item.productArea === state.filters.productArea,
  );
}

function availableTracks() {
  return uniqueDashboardValues(
    (item) => item.track,
    (item) => (!state.filters.productArea || item.productArea === state.filters.productArea) && (!state.filters.segment || item.segment === state.filters.segment),
  );
}

function availableProductWorkstreams() {
  if (state.dashboard?.filterOptions?.productWorkstreams) {
    return state.dashboard.filterOptions.productWorkstreams;
  }
  return [...new Set((state.dashboard?.items || [])
    .filter((item) => !state.filters.productArea || item.productArea === state.filters.productArea)
    .filter((item) => !state.filters.segment || item.segment === state.filters.segment)
    .filter((item) => !state.filters.track || item.track === state.filters.track)
    .map((item) => item.productWorkstream || deriveProductWorkstream(item))
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

async function init() {
  renderLoading();
  try {
    if (state.token) {
      const cached = loadDashboardCache();
      if (cached?.config && cached?.dashboard) {
        applyBootstrap(cached);
        state.view = ["pm_team", "pm_editor"].includes(state.role) && !state.selectedPmProfile ? "login" : "dashboard";
        render();
      }
      applyBootstrap(await api(`/api/bootstrap?${dashboardParams().toString()}`));
      saveDashboardCache();
      state.view = ["pm_team", "pm_editor"].includes(state.role) && !state.selectedPmProfile ? "login" : "dashboard";
    } else {
      state.config = await api("/api/login-config");
      state.modules = state.config.modules || state.modules;
      state.selectedWeek = state.config.currentReportingWeek;
    }
    render();
  } catch (error) {
    if (window.location.protocol === "file:") {
      renderOpenViaServerMessage();
      return;
    }
    localStorage.clear();
    state.token = "";
    state.role = "";
    state.selectedPmProfile = "";
    state.view = "login";
    state.error = error.message;
    render();
  }
}

function renderLoading() {
  app.innerHTML = html`
    <main class="auth-shell">
      <section class="auth-panel loading-panel">
        <h1>Product Intelligence Board</h1>
        <p class="muted">Loading workspace...</p>
      </section>
    </main>
  `;
}

async function loadDashboard(options = {}) {
  const includeModules = options.includeModules !== false;
  const params = dashboardParams();
  const [dashboard, modules] = await Promise.all([
    api(`/api/dashboard?${params.toString()}`),
    includeModules ? api("/api/modules") : Promise.resolve(state.modules),
  ]);
  state.dashboard = dashboard;
  state.modules = modules;
  saveDashboardCache();
}

function dashboardParams() {
  const params = new URLSearchParams({ period: state.period });
  if (state.selectedWeek) params.set("week", state.selectedWeek);
  Object.entries(state.filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params;
}

function applyBootstrap(payload) {
  state.config = payload.config;
  state.modules = payload.config?.modules || state.modules;
  state.selectedWeek = payload.dashboard?.reportingWeek || state.selectedWeek || state.config?.currentReportingWeek || "";
  state.dashboard = payload.dashboard || state.dashboard;
  if (payload.session) {
    state.role = payload.session.role;
    state.selectedPmProfile = payload.session.selectedPmProfile || "";
    state.pmAccountId = payload.session.pmAccountId || "";
  }
}

async function loadModules() {
  if (!state.token) return;
  state.modules = await api("/api/modules");
}

async function loadArchiveFolder() {
  if (!state.token) return;
  const data = await api("/api/archived-items");
  state.archiveItems = data.items || [];
}

function render() {
  if (state.view === "login") {
    document.querySelector(".role-guide")?.remove();
    return renderLogin();
  }
  if (state.view === "profile") {
    document.querySelector(".role-guide")?.remove();
    return renderProfileSelection();
  }
  if (state.view === "pmManagement") renderPmManagement();
  else if (state.view === "pmView") renderPmView();
  else if (state.view === "adminSettings") renderPlaceholderPage("Admin / Settings", renderAdminSettingsContent());
  else if (state.view === "archiveFolder") renderArchiveFolder();
  else if (state.view === "productMarketing") renderProductMarketing();
  else if (state.view === "meetings") renderMeetings();
  else if (state.view === "capacity") renderPmCapacity();
  else if (state.view === "reportExport") renderReportExport();
  else if (state.view === "smartCapture") renderSmartCapture();
  else if (state.view === "executionIntelligence") renderExecutionIntelligence();
  else renderDashboard();
  mountRoleGuide();
}

function renderOpenViaServerMessage() {
  app.innerHTML = html`
    <main class="auth-shell">
      <section class="auth-panel">
        <h1>Product Intelligence Board</h1>
        <p class="muted">This app needs the local backend server. Open it from localhost instead of the HTML file.</p>
        <p><a href="http://127.0.0.1:3000">http://127.0.0.1:3000</a></p>
      </section>
    </main>
  `;
}

function roleLabel(role = state.role) {
  const labels = {
    viewer: "Viewer",
    pm_team: "PM Team",
    pm_editor: "PM Team",
    pmm: "PMM",
    product_lead: "Product Lead",
    admin: "Admin",
  };
  return labels[role] || role || "User";
}

function roleGuideConfig() {
  const shared = [
    "Use the reporting week selector to review past or current weekly board status.",
    "Use filters to narrow by status, owner, product area, segment, track, or product/workstream.",
    "Open Timeline on any card to see historical weekly entries without overwriting old updates.",
  ];
  const configs = {
    viewer: {
      title: "Viewer Guide",
      steps: [
        ...shared,
        "Viewer can read the full shared board, announcements, meeting notes, PMM, and capacity sections.",
      ],
      actions: [
        ["dashboard", "Open Dashboard"],
        ["pmView", "Open PM View"],
      ],
    },
    pm_team: {
      title: "PM Team Guide",
      steps: [
        ...shared,
        "Add Weekly Update for an existing item when reporting progress for this week.",
        "Create New Update Item only when the product/workstream item does not exist yet.",
        "Owner and submitted-by are separate: owner can be changed, submitted-by uses your PM profile.",
      ],
      actions: [
        ["weekly", "Add Weekly Update"],
        ["item", "Create New Update Item"],
        ["announcement", "Add Announcement"],
        ["meeting", "Upload Meeting Note"],
        ["pmView", "Open PM View"],
      ],
    },
    pmm: {
      title: "PMM Guide",
      steps: [
        ...shared,
        "Use PMM assets to track launch materials, PM review, revisions, and final links.",
        "Relate PMM assets back to Update Items when the launch content belongs to a product item.",
      ],
      actions: [
        ["marketing", "Add PMM Asset"],
        ["productMarketing", "Open PMM Section"],
        ["dashboard", "Open Dashboard"],
      ],
    },
    product_lead: {
      title: "Product Lead Guide",
      steps: [
        ...shared,
        "Use Management to maintain PM accounts and track/category taxonomy.",
        "Archive outdated items with a reason; archived records remain searchable in Archive Folder.",
        "Update PM Capacity from the capacity panel and export reports for review.",
      ],
      actions: [
        ["weekly", "Add Weekly Update"],
        ["item", "Create New Update Item"],
        ["management", "PM Management"],
        ["archive", "Archive Folder"],
        ["capacity", "PM Capacity"],
        ["report", "Report Export"],
        ["announcement", "Add Announcement"],
        ["meeting", "Upload Meeting Note"],
      ],
    },
    admin: {
      title: "Admin Guide",
      steps: [
        ...shared,
        "Use Admin / Settings to rotate role passcodes. Current passcodes are not exposed in the UI.",
        "Admin can correct or delete records when cleanup is needed.",
        "Use Archive Folder and Report Export for review and backup checks.",
      ],
      actions: [
        ["settings", "Admin / Settings"],
        ["archive", "Archive Folder"],
        ["report", "Report Export"],
        ["weekly", "Add Weekly Update"],
        ["item", "Create New Update Item"],
      ],
    },
  };
  return configs[state.role] || configs.pm_team;
}

function mountRoleGuide() {
  if (!state.token || ["login", "profile"].includes(state.view)) return;
  document.querySelector(".role-guide")?.remove();
  document.body.insertAdjacentHTML("beforeend", renderRoleGuide());
  bindRoleGuideEvents();
}

function renderRoleGuide() {
  const guide = roleGuideConfig();
  return html`
    <aside class="role-guide ${state.guideOpen ? "open" : ""}">
      <button class="role-guide-toggle" id="role-guide-toggle" title="${state.guideOpen ? "Close guide" : "Open guide"}">
        <span>?</span>
        <strong>Guide</strong>
      </button>
      ${state.guideOpen ? html`
        <section class="role-guide-panel">
          <header>
            <div>
              <span class="section-kicker">${escapeHtml(roleLabel())}</span>
              <h2>${escapeHtml(guide.title)}</h2>
            </div>
            <button class="secondary" id="role-guide-close">Close</button>
          </header>
          <ol>
            ${guide.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}
          </ol>
          <div class="role-guide-actions">
            ${guide.actions.map(([action, label]) => `<button type="button" data-guide-action="${escapeHtml(action)}">${escapeHtml(label)}</button>`).join("")}
          </div>
        </section>
      ` : ""}
    </aside>
  `;
}

function bindRoleGuideEvents() {
  document.querySelector("#role-guide-toggle")?.addEventListener("click", () => {
    state.guideOpen = !state.guideOpen;
    render();
  });
  document.querySelector("#role-guide-close")?.addEventListener("click", () => {
    state.guideOpen = false;
    render();
  });
  document.querySelectorAll("[data-guide-action]").forEach((button) => {
    button.addEventListener("click", () => handleGuideAction(button.dataset.guideAction));
  });
}

async function handleGuideAction(action) {
  state.guideOpen = false;
  if (action === "weekly") state.modal = { type: "weekly", itemId: "", direct: false };
  else if (action === "item") state.modal = { type: "item", item: null };
  else if (action === "announcement") state.modal = { type: "announcement", announcement: null };
  else if (action === "meeting") state.modal = { type: "meeting", meeting: null };
  else if (action === "marketing") state.modal = { type: "marketing", asset: null };
  else if (action === "capacity") state.modal = { type: "capacity" };
  else if (action === "dashboard") {
    state.view = "dashboard";
    await loadDashboard();
  } else if (action === "pmView") {
    state.view = "pmView";
    await loadDashboard();
  } else if (action === "management") {
    state.view = "pmManagement";
    await loadDashboard();
  } else if (action === "archive") {
    state.view = "archiveFolder";
    await loadArchiveFolder();
  } else if (action === "settings") {
    state.view = "adminSettings";
  } else if (action === "report") {
    state.view = "reportExport";
    await loadDashboard();
    await loadModules();
  } else if (action === "productMarketing") {
    state.view = "productMarketing";
    await loadDashboard();
    await loadModules();
  }
  render();
  if (action === "weekly") loadPreviousReference();
}

function renderLogin() {
  app.innerHTML = html`
    <main class="auth-shell">
      <section class="auth-panel">
        <h1>Product Intelligence Board</h1>
        <p class="muted">Choose a role, then enter the passcode.</p>
        <form id="login-form" class="grid">
          <label>Role
            <select name="role" id="login-role" required>
              ${state.config.roles.map((role) => `<option value="${role}">${escapeHtml(role)}</option>`).join("")}
            </select>
          </label>
          <label id="pm-account-row" hidden>PM Team Account
            <select name="accountId">
              ${state.config.pmAccounts
                .filter((account) => account.active)
                .map((account) => `<option value="${escapeHtml(account.accountId)}">${escapeHtml(account.accountId)} - ${escapeHtml(account.pmProfile)}</option>`)
                .join("")}
            </select>
          </label>
          <label>Passcode <input name="passcode" type="password" autocomplete="current-password" required /></label>
          <button type="submit">Continue</button>
          ${state.error ? `<div class="error">${escapeHtml(state.error)}</div>` : ""}
        </form>
      </section>
    </main>
  `;
  const roleSelect = document.querySelector("#login-role");
  const accountRow = document.querySelector("#pm-account-row");
  const syncAccountField = () => {
    accountRow.hidden = roleSelect.value !== "pm_team";
    accountRow.querySelector("select").disabled = roleSelect.value !== "pm_team";
  };
  roleSelect.addEventListener("change", syncAccountField);
  syncAccountField();
  document.querySelector("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    state.error = "";
    try {
      const data = await api("/api/login", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(event.target))),
      });
      state.token = data.token;
      state.role = data.role;
      state.selectedPmProfile = data.selectedPmProfile || "";
      state.pmAccountId = data.pmAccountId || "";
      localStorage.setItem("pib_token", state.token);
      localStorage.setItem("pib_role", state.role);
      if (state.selectedPmProfile) localStorage.setItem("pib_pm_profile", state.selectedPmProfile);
      else localStorage.removeItem("pib_pm_profile");
      if (state.pmAccountId) localStorage.setItem("pib_pm_account", state.pmAccountId);
      else localStorage.removeItem("pib_pm_account");
      applyBootstrap(await api(`/api/bootstrap?${dashboardParams().toString()}`));
      saveDashboardCache();
      state.view = "dashboard";
    } catch (error) {
      state.error = error.message;
    }
    render();
  });
}

function renderProfileSelection() {
  app.innerHTML = html`
    <main class="auth-shell">
      <section class="auth-panel">
        <h1>Select PM Profile</h1>
        <p class="muted">This is the active business profile for owner defaults, submitted by, and last updated by. It is not a login account.</p>
        <form id="profile-form" class="grid">
          <label>Active PM Profile
            <select name="pmProfile" required>
              ${state.config.pmProfiles.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}
            </select>
          </label>
          <button type="submit">Enter Dashboard</button>
        </form>
        ${state.error ? `<div class="error">${escapeHtml(state.error)}</div>` : ""}
      </section>
    </main>
  `;
  document.querySelector("#profile-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    state.error = "";
    try {
      const session = await api("/api/session/profile", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(event.target))),
      });
      state.token = session.token || state.token;
      state.selectedPmProfile = session.selectedPmProfile;
      localStorage.setItem("pib_token", state.token);
      localStorage.setItem("pib_pm_profile", state.selectedPmProfile);
      applyBootstrap(await api(`/api/bootstrap?${dashboardParams().toString()}`));
      saveDashboardCache();
      state.view = "dashboard";
    } catch (error) {
      state.error = error.message;
    }
    render();
  });
}

function renderDashboard() {
  const cards = state.dashboard?.cards || {};
  const items = state.dashboard?.items || [];
  app.innerHTML = html`
    <main class="board-page">
      <header class="board-topbar">
        <div class="brand-row">
          <img class="brand-logo cbi-logo" src="/assets/CBI-logo-F-1.svg" alt="CBI" />
          <div class="brand-divider"></div>
          <img class="brand-logo advance-logo" src="/assets/ADVANCE%20CBP%20logo-F.svg" alt="ADVANCE.CBP" />
          <div class="brand-divider"></div>
          <div class="product-title">
            <span>PRODUCT UPDATE</span>
            <strong>Product Intelligence Board</strong>
          </div>
        </div>
        <div class="top-actions">
          <button class="secondary" data-page="dashboard">Dashboard</button>
          <button class="secondary" data-page="pmView">PM View</button>
          <button class="secondary demo-nav-button" data-page="smartCapture">AI Smart Capture</button>
          <button class="secondary demo-nav-button" data-page="executionIntelligence">Execution Intelligence</button>
          ${["product_lead", "admin"].includes(state.role) ? `<button class="secondary" data-page="archiveFolder">Archive Folder</button>` : ""}
          ${state.role === "product_lead" ? `<button class="secondary" data-page="pmManagement">Management</button>` : ""}
          ${state.role === "admin" ? `<button class="secondary" data-page="adminSettings">Admin / Settings</button>` : ""}
          ${["product_lead", "admin"].includes(state.role) ? `<button class="secondary" data-page="reportExport">Report Export</button>` : ""}
          <button class="secondary" id="logout">Logout</button>
        </div>
        <aside class="week-panel">
          <div class="week-label">Reporting Week</div>
          <strong>${periodTitle()}</strong>
          <div class="period-range">${escapeHtml(viewRangeLabel())}: ${escapeHtml(periodRangeLabel())}</div>
          <div class="period-nav">
            <button id="prev-period" title="Previous reporting week">‹</button>
            <button id="today-period" title="Today">Today</button>
            <button id="next-period" title="Next reporting week">›</button>
          </div>
          <input id="week-selector" value="${escapeHtml(state.selectedWeek)}" pattern="\\d{4}-\\d{2}" />
          <div class="period-toggle">
            ${["weekly", "bi-weekly", "monthly", "quarterly"].map((period) => `<button class="${state.period === period ? "active" : ""}" data-period="${period}">${periodLabel(period)}</button>`).join("")}
          </div>
        </aside>
      </header>

      <section class="board-shell">
        <div class="board-context muted">${renderActorLine()}</div>
        ${canEdit() ? renderEditorQuickActions() : ""}
        <section class="board-summary">
          ${renderSummaryCard("Total Updates", cards["Total Updates"] ?? 0, items)}
          ${state.config.statuses.map((status) => renderSummaryCard(status, cards[status] ?? 0, items.filter((item) => item.status === status))).join("")}
          <div class="summary-card board-week-card">
            <span class="summary-label">Current Week</span>
            <div class="week-stat">
              <strong>${periodTitle()}</strong>
              <span>${cards["Current Week"] ?? 0} updates</span>
            </div>
            <div class="week-stat-range">${escapeHtml(viewRangeLabel())} · ${escapeHtml(periodRangeLabel())}</div>
          </div>
        </section>

        ${renderAnnouncementsPanel()}

        <section class="filters board-filters" id="filters-panel">
          <label>Status
            <select id="filter-status">
              <option value="">All</option>
              ${state.config.statuses.map((status) => `<option value="${escapeHtml(status)}" ${state.filters.status === status ? "selected" : ""}>${escapeHtml(status)}</option>`).join("")}
            </select>
          </label>
          <label>Owner
            <select id="filter-owner">
              <option value="">All</option>
              ${ownerProfiles().map((name) => `<option value="${escapeHtml(name)}" ${state.filters.owner === name ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}
            </select>
          </label>
          <label>Product Area
            <select id="filter-product-area">
              <option value="">All</option>
              ${availableProductAreas().map((area) => `<option value="${escapeHtml(area)}" ${state.filters.productArea === area ? "selected" : ""}>${escapeHtml(area)}</option>`).join("")}
            </select>
          </label>
          <label>Segment
            <select id="filter-segment">
              <option value="">All</option>
              ${availableSegments().map((segment) => `<option value="${escapeHtml(segment)}" ${state.filters.segment === segment ? "selected" : ""}>${escapeHtml(segment)}</option>`).join("")}
            </select>
          </label>
          <label>Track / Category
            <select id="filter-track">
              <option value="">All</option>
              ${availableTracks().map((track) => `<option value="${escapeHtml(track)}" ${state.filters.track === track ? "selected" : ""}>${escapeHtml(track)}</option>`).join("")}
            </select>
          </label>
          <label>Products / Workstreams
            <select id="filter-product-workstream">
              <option value="">All</option>
              ${availableProductWorkstreams().map((name) => `<option value="${escapeHtml(name)}" ${state.filters.productWorkstream === name ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}
            </select>
          </label>
          <div class="filter-reset-row"><button type="button" class="secondary" id="reset-filters">Reset Filters</button></div>
        </section>

        ${renderBoardViewControls()}
        ${state.filters.productWorkstream ? renderProductWorkstreamTimeline(items) : ""}
        ${state.boardView === "item" ? renderItemView(items) : renderProductBoardView(items)}
        ${renderDashboardModuleStack(items)}
      </section>
      ${state.modal ? renderModal() : ""}
    </main>
  `;
  bindDashboardEvents();
}

function periodTitle() {
  return displayWeek(state.selectedWeek);
}

function viewRangeLabel() {
  if (state.period === "weekly") return "Week";
  if (state.period === "bi-weekly") return "Bi-Weekly";
  if (state.period === "monthly") return "Month";
  return "Quarter";
}

function periodLabel(period) {
  if (period === "weekly") return "Weekly";
  if (period === "bi-weekly") return "Bi-Weekly";
  if (period === "monthly") return "Monthly";
  return "Quarterly";
}

function periodRangeLabel() {
  if (state.dashboard?.periodStart && state.dashboard?.periodEnd) {
    return `${formatShortDate(state.dashboard.periodStart)} - ${formatShortDate(state.dashboard.periodEnd)}`;
  }
  const start = weekStartDate(state.selectedWeek);
  return `${formatShortDate(start)} - ${formatShortDate(addDays(start, 6))}`;
}

function weekStartDate(week) {
  const [year, number] = String(week).split("-").map(Number);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
  week1Monday.setUTCDate(week1Monday.getUTCDate() + (number - 1) * 7);
  return week1Monday;
}

function weekFromDate(date) {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((target - yearStart) / 86400000 + 1) / 7);
  return `${target.getUTCFullYear()}-${String(week).padStart(2, "0")}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function shiftSelectedWeek(direction) {
  const start = weekStartDate(state.selectedWeek);
  return weekFromDate(addDays(start, direction * 7));
}

function periodAnchorDate() {
  return addDays(weekStartDate(state.selectedWeek), 3);
}

function formatShortDate(value) {
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(date);
}

function formatMonth(date) {
  return new Intl.DateTimeFormat("en-GB", { month: "short" }).format(date);
}

function formatQuarter(date) {
  return `Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
}

function renderActorLine() {
  if (["pm_team", "pm_editor"].includes(state.role)) {
    return `Role: ${escapeHtml(state.role)} · PM Account: ${escapeHtml(state.pmAccountId)} · PM Profile: ${escapeHtml(state.selectedPmProfile)}`;
  }
  if (state.role === "product_lead") return "Role: product_lead · Scope: All PM updates";
  return `Role: ${escapeHtml(state.role)} · Scope: All visible updates`;
}

function renderEditorQuickActions() {
  const actor = state.selectedPmProfile || (state.role === "product_lead" ? "Product Lead" : "Admin");
  return html`
    <section class="editor-quick-actions">
      <div>
        <span class="section-kicker">Update Workflow</span>
        <strong>Add a weekly update to an existing item, or create a new item if it does not exist yet.</strong>
      </div>
      <div class="quick-action-buttons">
        <button id="quick-weekly">Add Weekly Update</button>
        <button class="secondary" id="quick-item">Create New Update Item</button>
      </div>
    </section>
  `;
}

function renderSummaryCard(label, value, scopedItems) {
  const cbi = scopedItems.filter((item) => item.productArea === "CBI").length;
  const cbp = scopedItems.filter((item) => item.productArea === "CBP").length;
  const ai = scopedItems.filter((item) => item.productArea === "AI Agents").length;
  const riskClass = needsBlockerDelay(label) ? "summary-risk" : "";
  return html`
    <div class="summary-card ${statusClass(label)} ${riskClass}">
      <span class="summary-label">${escapeHtml(label)}</span>
      <strong>${value}</strong>
      <div class="summary-chips"><span class="summary-chip-cbi">CBI ${cbi}</span><span class="summary-chip-cbp">CBP ${cbp}</span><span class="summary-chip-ai">AI ${ai}</span></div>
    </div>
  `;
}

function renderAnnouncementsPanel() {
  const announcements = (state.modules.announcements || [])
    .filter((announcement) => !announcement.archived)
    .filter((announcement) => !announcement.week || announcement.week === state.selectedWeek)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return html`
    <section class="announcements-panel">
      <div class="announcements-head">
        <div>
          <span class="section-kicker">This Week</span>
          <strong>Announcements</strong>
        </div>
        ${canManageModules() ? `<button class="secondary" id="quick-announcement">Add Announcement</button>` : ""}
      </div>
      ${announcements.length
        ? `<div class="announcement-list">${announcements.map((announcement) => html`
            <article>
              <strong>${escapeHtml(announcement.title)}</strong>
              <p>${escapeHtml(announcement.body)}</p>
              <small>${escapeHtml(announcement.type || "Info")} · ${escapeHtml(announcement.productArea || "All areas")} · ${escapeHtml(announcement.week || "All weeks")} · ${escapeHtml(announcement.createdBy || "Team")}</small>
              ${renderLinks(announcement.relatedLinks || [])}
              ${canManageSavedModules() ? `<div class="row"><button class="secondary" data-edit-announcement="${announcement.id}">Edit</button><button class="danger" data-delete-announcement="${announcement.id}">Delete</button></div>` : ""}
            </article>
          `).join("")}</div>`
        : `<p class="muted">No announcements for this reporting week.</p>`}
    </section>
  `;
}

function renderDashboardModuleStack(items) {
  return html`
    <section class="updates-below-modules">
      ${renderDashboardCapacityPanel(items)}
      ${renderDashboardMeetingsPanel()}
      ${renderDashboardPmmPanel()}
    </section>
  `;
}

function renderCollapsibleModule(kicker, title, action, body, extraClass = "", openByDefault = false) {
  return html`
    <details class="dashboard-collapsible ${extraClass}" ${openByDefault ? "open" : ""}>
      <summary>
        <span>
          <span class="section-kicker">${escapeHtml(kicker)}</span>
          <strong>${escapeHtml(title)}</strong>
        </span>
        <span class="collapse-hint">Expand</span>
      </summary>
      <section class="announcements-panel">
        <div class="announcements-head">
          <div>
            <span class="section-kicker">${escapeHtml(kicker)}</span>
            <strong>${escapeHtml(title)}</strong>
          </div>
          ${action || ""}
        </div>
        ${body}
      </section>
    </details>
  `;
}

function renderDashboardMeetingsPanel() {
  const meetings = (state.modules.meetings || [])
    .filter((meeting) => !meeting.reportingWeek || meeting.reportingWeek === state.selectedWeek)
    .sort((a, b) => String(b.meetingDate || b.createdAt || "").localeCompare(String(a.meetingDate || a.createdAt || "")));
  return renderCollapsibleModule(
    "This Week",
    "Meeting Notes",
    canManageModules() ? `<button class="secondary" id="quick-meeting">Upload Meeting Note</button>` : "",
    meetings.length
        ? `<div class="announcement-list module-list">${meetings.map(renderMeetingNoteCard).join("")}</div>`
        : `<p class="muted">No meeting notes for this reporting week.</p>`,
  );
}

function renderDashboardPmmPanel() {
  const assets = state.modules.marketing || [];
  return renderCollapsibleModule(
    "PMM",
    "Launch / GTM Board",
    canManagePmm() ? `<button class="secondary" id="quick-marketing">Add PMM Asset</button>` : "",
    assets.length
        ? `<div class="announcement-list module-list">${assets.slice(0, 6).map(renderMarketingAssetCard).join("")}</div>`
        : `<p class="muted">No PMM assets yet.</p>`,
  );
}

function capacityRowsFromDashboard(items) {
  const saved = state.modules.capacity?.records || [];
  if (saved.length) return saved;
  return ownerProfiles()
    .map((owner) => {
      const ownerItems = items.filter((item) => item.owner === owner);
      if (!ownerItems.length) return null;
      return {
        id: owner,
        pmName: owner,
        status: "Active",
        roleScope: [...new Set(ownerItems.map((item) => item.productArea))].join(", "),
        q1: ownerItems.filter((item) => item.status !== "Done").length,
        q2: 0,
        q3: 0,
        q4: 0,
        notes: "Auto workload count from current dashboard.",
      };
    })
    .filter(Boolean);
}

function renderDashboardCapacityPanel(items) {
  const rows = capacityRowsFromDashboard(items);
  const summary = state.modules.capacity?.summary || {};
  const breakdown = capacityBreakdownDefaults(rows, summary);
  const totalPd = summary.totalPd ?? rows.reduce((sum, row) => sum + Number(row.q1 || 0), 0);
  const activePm = summary.activePm ?? rows.filter((row) => String(row.status).toLowerCase() === "active").length;
  const averagePd = summary.averagePd ?? (activePm ? Math.round((totalPd / activePm) * 10) / 10 : 0);
  return renderCollapsibleModule(
    "Capacity",
    "PM Timesheet",
    state.role === "product_lead" ? `<button class="secondary" id="quick-capacity">Update Capacity Data</button>` : "",
    html`
      <div class="capacity-timesheet">
        ${renderCapacityStatCard("Total Team Timesheet Recorded", `${totalPd} PD`, summary.totalQuarters || { q1: 822, q2: 0, q3: 0, q4: 0 }, breakdown.totalBreakdown)}
        ${renderCapacityStatCard("Total Active PM Count", activePm, summary.activeQuarters || { q1: 11, q2: 13, q3: 12, q4: 12 }, breakdown.activeBreakdown)}
        ${renderCapacityStatCard("Average PD per Active PM", `${averagePd} PD`, summary.averageQuarters || { q1: 74.7, q2: 0, q3: 0, q4: 0 }, breakdown.averageBreakdown)}
      </div>
      <div class="capacity-card-grid">
        ${rows.length ? rows.map(renderCapacityRow).join("") : `<div class="empty-track">No capacity data yet.</div>`}
      </div>
    `,
    "capacity-panel",
    true,
  );
}

function capacityBusinessBucket(row) {
  const scope = String(row.roleScope || row.productArea || "").toLowerCase();
  if (/cbp|advance/.test(scope)) return "cbp";
  if (/\baai\b|\bai\b|agent/.test(scope)) return "aai";
  return "cbi";
}

function hasCapacityQuarterValue(row, quarter) {
  const value = row?.[quarter];
  return value !== "" && value !== null && value !== undefined && value !== "-";
}

function emptyCapacityBreakdown() {
  return {
    q1: { cbi: 0, cbp: 0, aai: 0 },
    q2: { cbi: 0, cbp: 0, aai: 0 },
    q3: { cbi: 0, cbp: 0, aai: 0 },
    q4: { cbi: 0, cbp: 0, aai: 0 },
  };
}

function normalizeCapacityBreakdown(breakdown) {
  const normalized = emptyCapacityBreakdown();
  for (const quarter of ["q1", "q2", "q3", "q4"]) {
    for (const bucket of ["cbi", "cbp", "aai"]) {
      normalized[quarter][bucket] = parseCapacityNumber(breakdown?.[quarter]?.[bucket]);
    }
  }
  return normalized;
}

function calculateCapacityBreakdown(rows = []) {
  const totalBreakdown = emptyCapacityBreakdown();
  const activeBreakdown = emptyCapacityBreakdown();
  const averageBreakdown = emptyCapacityBreakdown();
  for (const row of rows) {
    const bucket = capacityBusinessBucket(row);
    const isActive = String(row.status || "Active").toLowerCase() === "active";
    for (const quarter of ["q1", "q2", "q3", "q4"]) {
      if (!hasCapacityQuarterValue(row, quarter)) continue;
      totalBreakdown[quarter][bucket] += parseCapacityNumber(row[quarter]);
      if (isActive) activeBreakdown[quarter][bucket] += 1;
    }
  }
  for (const quarter of ["q1", "q2", "q3", "q4"]) {
    for (const bucket of ["cbi", "cbp", "aai"]) {
      averageBreakdown[quarter][bucket] = activeBreakdown[quarter][bucket]
        ? Math.round((totalBreakdown[quarter][bucket] / activeBreakdown[quarter][bucket]) * 10) / 10
        : 0;
    }
  }
  return { totalBreakdown, activeBreakdown, averageBreakdown };
}

function capacityBreakdownDefaults(rows = capacityRowsFromDashboard(state.dashboard?.items || []), summary = state.modules.capacity?.summary || {}) {
  const calculated = calculateCapacityBreakdown(rows);
  return {
    totalBreakdown: summary.totalBreakdown ? normalizeCapacityBreakdown(summary.totalBreakdown) : calculated.totalBreakdown,
    activeBreakdown: summary.activeBreakdown ? normalizeCapacityBreakdown(summary.activeBreakdown) : calculated.activeBreakdown,
    averageBreakdown: summary.averageBreakdown ? normalizeCapacityBreakdown(summary.averageBreakdown) : calculated.averageBreakdown,
  };
}

function capacitySummaryDefaults(rows = capacityRowsFromDashboard(state.dashboard?.items || [])) {
  const summary = state.modules.capacity?.summary || {};
  const totalPd = summary.totalPd ?? rows.reduce((sum, row) => sum + Number(row.q1 || 0), 0);
  const activePm = summary.activePm ?? rows.filter((row) => String(row.status).toLowerCase() === "active").length;
  const averagePd = summary.averagePd ?? (activePm ? Math.round((totalPd / activePm) * 10) / 10 : 0);
  const breakdown = capacityBreakdownDefaults(rows, summary);
  return {
    totalPd,
    activePm,
    averagePd,
    totalQuarters: summary.totalQuarters || { q1: totalPd, q2: 0, q3: 0, q4: 0 },
    activeQuarters: summary.activeQuarters || { q1: activePm, q2: activePm, q3: activePm, q4: activePm },
    averageQuarters: summary.averageQuarters || { q1: averagePd, q2: 0, q3: 0, q4: 0 },
    ...breakdown,
  };
}

function renderCapacityStatBreakdown(breakdown = {}, unit = "") {
  return html`
    <dl class="capacity-quarter-breakdown">
      ${["cbi", "cbp", "aai"].map((key) => html`
        <div class="capacity-breakdown-${key}">
          <dt>${key.toUpperCase()}</dt>
          <dd>${escapeHtml(breakdown?.[key] ?? 0)}${unit ? ` ${escapeHtml(unit)}` : ""}</dd>
        </div>
      `).join("")}
    </dl>
  `;
}

function renderCapacityStatCard(label, value, quarters = {}, breakdown = {}, unit = "") {
  return html`
    <article class="capacity-stat-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <div class="capacity-stat-quarters">
        ${["q1", "q2", "q3", "q4"].map((key) => html`
          <div class="${key === "q3" ? "active" : ""}">
            <span>${key.toUpperCase()}</span>
            <strong>${escapeHtml(quarters[key] ?? 0)}</strong>
            ${renderCapacityStatBreakdown(breakdown?.[key], unit)}
          </div>
        `).join("")}
      </div>
    </article>
  `;
}

function renderCapacityRow(row) {
  const initials = row.initials || ownerInitials(row.pmName);
  const status = row.status || "Active";
  const statusKey = String(status).toLowerCase();
  const roleScope = row.roleScope || "-";
  const shouldAppendActiveSince = row.activeSince && !/active since|w\.e\.f\./i.test(roleScope);
  return html`
    <article class="capacity-person-card">
      <div class="capacity-person-head">
        <span class="capacity-avatar">${escapeHtml(initials)}</span>
        <div>
          <strong>${escapeHtml(row.pmName)}</strong>
          <small>${escapeHtml(roleScope)} ${shouldAppendActiveSince ? `· active since ${escapeHtml(row.activeSince)}` : ""}</small>
        </div>
        <span class="capacity-status status-${escapeHtml(statusKey)}">${escapeHtml(status)}</span>
      </div>
      <div class="capacity-person-quarters">
        ${renderCapacityQuarter("Q1", row.q1, row.q1Total || 64, row.q1Alert)}
        ${renderCapacityQuarter("Q2", row.q2, row.q2Total || 65, row.q2Alert)}
        ${renderCapacityQuarter("Q3", row.q3, row.q3Total || 66, row.q3Alert)}
        ${renderCapacityQuarter("Q4", row.q4, row.q4Total || 66, row.q4Alert)}
      </div>
      ${row.notes ? `<small class="capacity-note">${escapeHtml(row.notes)}</small>` : ""}
    </article>
  `;
}

function renderCapacityQuarter(label, used, total, alert = false) {
  const hasValue = used !== "" && used !== null && used !== undefined;
  const ratio = hasValue && Number(total) ? Math.min(100, Math.max(0, (Number(used) / Number(total)) * 100)) : 0;
  return html`
    <div class="capacity-person-quarter ${alert ? "over" : ""}">
      <span>${escapeHtml(label)}</span>
      <strong>${hasValue ? `${escapeHtml(used)}/${escapeHtml(total)}` : "-"}</strong>
      <i><b style="width:${ratio}%"></b></i>
    </div>
  `;
}

function renderMeetingNoteCard(note) {
  const relatedItem = (state.dashboard?.items || []).find((item) => item.id === note.relatedUpdateItemId);
  return html`
    <article>
      <strong>${escapeHtml(note.title)}</strong>
      <small>${escapeHtml(note.meetingType || "Meeting")} · ${escapeHtml(note.productArea || relatedItem?.productArea || "All areas")} · ${escapeHtml(note.meetingDate || note.reportingWeek || "-")} · Owner ${escapeHtml(note.owner || "-")}</small>
      ${relatedItem ? `<small>Related update: ${escapeHtml(relatedItem.title)}</small>` : ""}
      <p>${escapeHtml(note.notes || note.agenda || "")}</p>
      ${note.decisions ? `<p><strong>Decisions:</strong> ${escapeHtml(note.decisions)}</p>` : ""}
      ${note.actionItems?.length ? `<div class="task-list">${note.actionItems.map((action) => `<span>${escapeHtml(action.title || action)}</span>`).join("")}</div>` : ""}
      ${renderLinks(note.attachments || [])}
      ${canManageSavedModules() ? `<div class="row"><button class="secondary" data-edit-meeting="${note.id}">Edit</button><button class="danger" data-delete-meeting="${note.id}">Delete</button></div>` : ""}
    </article>
  `;
}

function renderMarketingAssetCard(asset) {
  const relatedItem = (state.dashboard?.items || []).find((item) => item.id === (asset.relatedUpdateItemId || asset.launchItemId));
  const links = [
    asset.draftLink ? { label: "Draft", url: asset.draftLink } : null,
    asset.internalVersionLink ? { label: "Internal", url: asset.internalVersionLink } : null,
    asset.finalVersionLink || asset.link ? { label: "Final", url: asset.finalVersionLink || asset.link } : null,
  ].filter(Boolean);
  return html`
    <article>
      <strong>${escapeHtml(asset.title)}</strong>
      <small>${escapeHtml(asset.productArea || relatedItem?.productArea || "No product area")} · ${escapeHtml(asset.type || asset.channel || "No type")} · Owner ${escapeHtml(asset.owner || "No owner")} · Reviewer ${escapeHtml(asset.pmReviewer || "-")}</small>
      ${relatedItem ? `<small>Related update: ${escapeHtml(relatedItem.title)}</small>` : ""}
      ${asset.description || asset.notes ? `<p>${escapeHtml(asset.description || asset.notes)}</p>` : ""}
      ${asset.pmFeedback ? `<p><strong>PM feedback:</strong> ${escapeHtml(asset.pmFeedback)}</p>` : ""}
      ${links.length ? renderLinks(links) : ""}
      <small>Target ${escapeHtml(asset.targetCompletionDate || "-")} · Completed ${escapeHtml(asset.completedDate || "-")} · Updated by ${escapeHtml(asset.lastUpdatedBy || asset.createdBy || "-")}</small>
      <span class="module-status">${escapeHtml(asset.status || "Backlog")}</span>
      ${canManagePmm() ? `<div class="row"><button class="secondary" data-edit-marketing="${asset.id}">Edit</button><button class="danger" data-delete-marketing="${asset.id}">Delete</button></div>` : ""}
    </article>
  `;
}

function renderBoardViewControls() {
  return html`
    <section class="board-view-controls">
      <div>
        <span class="section-kicker">View By</span>
        <strong>${state.boardView === "item" ? "Products / Workstreams" : "All Updates"}</strong>
      </div>
      <div class="view-toggle">
        <button class="${state.boardView === "product" ? "active" : ""}" data-board-view="product">All</button>
        <button class="${state.boardView === "item" ? "active" : ""}" data-board-view="item">Items</button>
      </div>
    </section>
  `;
}

function visibleProductAreas(items) {
  if (state.filters.productArea) return [state.filters.productArea];
  const preferredOrder = ["CBI", "CBP", "AI Agents"];
  return preferredOrder.filter((area) => state.config.productAreas.includes(area));
}

function hasBoardFilters() {
  return Boolean(state.filters.status || state.filters.owner || state.filters.productArea || state.filters.segment || state.filters.track || state.filters.productWorkstream);
}

function renderProductBoardView(items) {
  const areas = visibleProductAreas(items);
  if (state.filters.productArea) {
    return html`
      <div class="board-layout single-board-layout focused-board-layout">
        <div class="main-board">
          ${renderProductAreaBoard(state.filters.productArea, items, false)}
        </div>
      </div>
    `;
  }
  return html`
    <div class="board-layout single-board-layout">
      <div class="main-board">
        ${areas.map((area) => renderProductAreaBoard(area, items)).join("")}
        ${!areas.length ? `<div class="empty">No matching product boards.</div>` : ""}
      </div>
    </div>
  `;
}

function renderProductAreaBoard(productArea, allItems, compact = false) {
  const segments = state.config.segmentsByArea[productArea] || [];
  const areaItems = allItems.filter((item) => item.productArea === productArea);
  const focused = state.filters.productArea === productArea;
  const renderedSegments = segments
    .map((segment) => renderSegmentColumn(productArea, segment, areaItems, compact))
    .filter(Boolean);
  return html`
    <section class="product-area-board ${compact ? "compact-area" : ""} ${focused ? "focused-area" : ""}">
      <header class="area-header">
        <div>
          ${renderAreaBrandMark(productArea)}
          <strong>${escapeHtml(areaTitle(productArea))}</strong>
        </div>
        <span class="muted">${areaItems.length} items</span>
      </header>
      <div class="segment-grid ${compact ? "compact-segments" : ""} ${focused ? "focused-segments" : ""}">
        ${renderedSegments.length ? renderedSegments.join("") : `<div class="empty-track">No matching updates</div>`}
      </div>
    </section>
  `;
}

function areaTitle(productArea) {
  if (productArea === "CBI") return "CBI - Credit Bureau Indonesia";
  if (productArea === "CBP") return "CBP - Credit Bureau Platform";
  return "AI Agents - ID, PH & SG";
}

function renderAreaBrandMark(productArea) {
  if (productArea === "CBI") {
    return `<span class="area-brand-mark area-brand-cbi"><img src="/assets/CBI-logo-F-1.svg" alt="CBI" /></span>`;
  }
  if (productArea === "CBP") {
    return `<span class="area-brand-mark area-brand-cbp"><img src="/assets/ADVANCE%20CBP%20logo-F.svg" alt="ADVANCE.CBP" /></span>`;
  }
  return `<span class="area-brand-mark area-brand-ai"><span>AI</span></span>`;
}

function renderSegmentColumn(productArea, segment, areaItems, compact) {
  const segmentItems = areaItems.filter((item) => item.segment === segment);
  const seededTracks = state.config.tracksByAreaSegment[`${productArea}::${segment}`] || [];
  const tracks = [...new Set([...seededTracks, ...segmentItems.map((item) => item.track).filter(Boolean)])];
  if (hasBoardFilters() && !segmentItems.length) return "";
  const renderedTracks = tracks
    .map((track) => renderTrackGroup(track, segmentItems.filter((item) => item.track === track), compact))
    .filter(Boolean);
  return html`
    <section class="segment-column ${segmentClass(segment)}">
      <header class="segment-header">
        ${renderSegmentBrandMark(productArea, segment)}
        <div><strong>${escapeHtml(segment)}</strong><small>${escapeHtml(segmentMarketLabel(productArea))}</small></div>
      </header>
      <div class="track-stack">
        ${renderedTracks.length ? renderedTracks.join("") : `<div class="empty-track">No matching updates</div>`}
      </div>
    </section>
  `;
}

function segmentMarketLabel(productArea) {
  if (productArea === "CBP") return "PH";
  if (productArea === "AI Agents") return "ID, PH & SG";
  return "ID";
}

function segmentBadge(segment) {
  if (segment === "B2B") return "B2B";
  if (segment === "SME") return "SME";
  if (segment === "D2C") return "D2C";
  if (segment === "AI Agents") return "AI";
  return segment.slice(0, 3).toUpperCase();
}

function renderSegmentBrandMark(productArea, segment) {
  if (segment === "SME") {
    return `<span class="segment-brand-mark segment-brand-sme"><img src="/assets/SME%20Bureau%20logo_Primary%20(3).svg" alt="SME Bureau" /></span>`;
  }
  if (segment === "D2C") {
    return `<span class="segment-brand-mark segment-brand-d2c"><img src="/assets/SkorKu_Logo_Primary.svg" alt="SkorKu" /></span>`;
  }
  if (productArea === "CBP") {
    return `<span class="segment-brand-mark segment-brand-cbp"><img src="/assets/ADVANCE%20CBP%20logo-F.svg" alt="ADVANCE.CBP" /></span>`;
  }
  if (segment === "AI Agents") {
    return `<span class="segment-brand-mark segment-brand-ai"><span>AI</span></span>`;
  }
  return `<span class="segment-brand-mark segment-brand-cbi"><img src="/assets/CBI-logo-F-1.svg" alt="CBI" /></span>`;
}

function segmentClass(segment) {
  if (segment === "B2B") return "segment-b2b";
  if (segment === "SME") return "segment-sme";
  if (segment === "D2C") return "segment-d2c";
  if (segment === "AI Agents") return "segment-ai";
  return "";
}

function renderTrackGroup(track, items, compact) {
  if (!items.length) return "";
  return html`
    <section class="track-group">
      <header class="track-header">
        <span>${escapeHtml(track)}</span>
      </header>
      <div class="board-card-stack">
        ${items.map((item) => renderBoardCard(item, compact)).join("")}
      </div>
    </section>
  `;
}

function renderItemView(items) {
  const groups = itemViewGroups(items);
  const productCount = groups.length;
  return html`
    <section class="item-view">
      <header class="item-view-head">
        <div>
          <span class="section-kicker">Products / Workstreams</span>
          <strong>${productCount} product/workstream${productCount === 1 ? "" : "s"} · ${items.length} update item${items.length === 1 ? "" : "s"}</strong>
        </div>
      </header>
      <div class="item-group-list">
        ${items.length ? groups.map(renderProductWorkstreamGroup).join("") : `<div class="empty">No matching update items.</div>`}
      </div>
    </section>
  `;
}

function itemViewGroups(items) {
  const groupMap = new Map();
  for (const item of items) {
    const productWorkstream = item.productWorkstream || deriveProductWorkstream(item) || "Unassigned Product / Workstream";
    const key = workstreamKey(productWorkstream);
    const group = groupMap.get(key) || {
      label: productWorkstream,
      badge: productWorkstream.split(/\s+/).map((word) => word[0]).join("").slice(0, 3).toUpperCase(),
      items: [],
    };
    group.items.push(item);
    groupMap.set(key, group);
  }
  return [...groupMap.values()]
    .map((group) => ({
      ...group,
      items: group.items.sort((a, b) => a.segment.localeCompare(b.segment) || a.track.localeCompare(b.track) || itemDisplayParts(a).detail.localeCompare(itemDisplayParts(b).detail)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function renderProductWorkstreamGroup(group) {
  return html`
    <section class="item-group-card">
      <header class="item-group-head">
        <div><span>${escapeHtml(group.badge)}</span><strong>${escapeHtml(group.label)}</strong></div>
        <small>${group.items.length} update item${group.items.length === 1 ? "" : "s"}</small>
      </header>
      <div class="item-list">
        ${group.items.map((item) => renderItemRow(item, { groupedByProductWorkstream: true })).join("")}
      </div>
    </section>
  `;
}

function renderItemRow(item, options = {}) {
  const latest = item.latestWeeklyUpdate;
  const display = itemDisplayParts(item);
  const title = options.groupedByProductWorkstream ? display.detail || item.title : display.product;
  const subtitle = options.groupedByProductWorkstream ? "" : display.detail;
  const path = options.groupedByProductWorkstream
    ? `${item.segment} · ${item.track}`
    : `${item.productArea} · ${item.segment} · ${item.track}`;
  return html`
    <article class="item-row-card ${segmentClass(item.segment)} ${statusClass(item.status)} ${item.isQaIssue ? "qa-issue-card" : ""}" data-open-detail="${item.id}" tabindex="0" role="button" aria-label="Open timeline for ${escapeHtml(title)}">
      <div class="item-row-main">
        <div>
          <h3>${escapeHtml(title)}</h3>
          ${item.isQaIssue ? `<span class="qa-issue-label">QA Issue</span>` : ""}
          ${subtitle ? `<div class="board-card-subtitle">${escapeHtml(subtitle)}</div>` : ""}
          <div class="item-row-path">${escapeHtml(path)}</div>
        </div>
        <span class="badge ${statusClass(item.status)}">${escapeHtml(item.status)}</span>
      </div>
      <div class="item-row-grid">
        <div><span>Owner</span><strong>${escapeHtml(item.owner)}</strong></div>
        <div><span>Target</span><strong>${escapeHtml(item.targetCompletionDate)}</strong></div>
        <div><span>Updates</span><strong>${item.updatesThisWeek}</strong></div>
        <div><span>Lifecycle</span><strong>${escapeHtml(item.lifecycleState || lifecycleState(item))}</strong></div>
        <div><span>Links</span><strong>${escapeHtml(linkSummary(item.relatedLinks))}</strong></div>
        <div><span>Workstreams</span><strong>${escapeHtml(workstreamSummary(item))}</strong></div>
        <div><span>Last Updated By</span><strong>${escapeHtml(item.lastUpdatedBy || "-")}</strong></div>
        <div><span>Last Updated At</span><strong>${escapeHtml(formatDateTime(item.lastUpdatedAt))}</strong></div>
      </div>
      <div class="item-row-update">
        <span>Latest Update</span>
        ${renderLatestUpdateText(latest)}
      </div>
      <div class="board-card-actions">
        <button class="secondary" data-detail="${item.id}">Timeline</button>
        ${canEdit() ? `<button class="secondary" data-edit="${item.id}">Edit Item</button><button data-weekly="${item.id}">Add Update</button>` : ""}
        ${canAdmin() ? `<button class="danger" data-delete-update="${item.id}">Delete</button>` : ""}
      </div>
    </article>
  `;
}

function renderProductWorkstreamTimeline(items) {
  const productItems = items
    .filter((item) => (item.productWorkstream || deriveProductWorkstream(item)) === state.filters.productWorkstream)
    .sort((a, b) => a.productArea.localeCompare(b.productArea) || a.segment.localeCompare(b.segment) || a.track.localeCompare(b.track) || a.title.localeCompare(b.title));
  return html`
    <section class="product-timeline-panel">
      <header class="product-timeline-head">
        <div>
          <span class="section-kicker">Product / Workstream</span>
          <strong>${escapeHtml(state.filters.productWorkstream)}</strong>
          <p class="muted">${productItems.length} update item${productItems.length === 1 ? "" : "s"} across the selected reporting view.</p>
        </div>
      </header>
      <div class="product-timeline-grid">
        ${productItems.length ? productItems.map(renderProductTimelineItem).join("") : `<div class="empty">No matching update items for this Product / Workstream.</div>`}
      </div>
    </section>
  `;
}

function renderProductTimelineItem(item) {
  const display = itemDisplayParts(item);
  const entries = [...(item.timelineEntries || item.weeklyUpdatesThisPeriod || [])]
    .sort((a, b) => String(b.reportingWeek || "").localeCompare(String(a.reportingWeek || "")) || String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")));
  return html`
    <article class="product-timeline-item ${statusClass(item.status)} ${item.isQaIssue ? "qa-issue-card" : ""}" data-open-detail="${item.id}" tabindex="0" role="button" aria-label="Open timeline for ${escapeHtml(display.detail || item.title)}">
      <header>
        <div>
          <span class="item-row-path">${escapeHtml(item.productArea)} · ${escapeHtml(item.segment)} · ${escapeHtml(item.track)}</span>
          ${item.isQaIssue ? `<span class="qa-issue-label">QA Issue</span>` : ""}
          <h3>${escapeHtml(display.detail || item.title)}</h3>
        </div>
        <span class="badge ${statusClass(item.status)}">${escapeHtml(item.status)}</span>
      </header>
      <div class="meta product-timeline-meta">
        <div><span>Owner</span>${escapeHtml(item.owner)}</div>
        <div><span>Target</span>${escapeHtml(item.targetCompletionDate || "-")}</div>
        <div><span>QA</span>${item.isQaIssue ? "Yes" : "No"}</div>
        <div><span>Updates</span>${entries.length}</div>
      </div>
      <div class="mini-timeline">
        ${entries.length ? entries.map(renderMiniTimelineEntry).join("") : `<div class="empty-track">No timeline entries yet.</div>`}
      </div>
      <div class="board-card-actions">
        <button class="secondary" data-detail="${item.id}">Open Full Timeline</button>
        ${canEdit() ? `<button data-weekly="${item.id}">Add Update</button>` : ""}
      </div>
    </article>
  `;
}

function renderMiniTimelineEntry(entry) {
  return html`
    <div class="mini-timeline-entry">
      <div><strong>${escapeHtml(entry.reportingWeek)}</strong><span class="badge ${statusClass(entry.status)}">${escapeHtml(entry.status)}</span></div>
      <p><strong>Progress:</strong> ${escapeHtml(cleanProgress(entry))}</p>
      <p><strong>Next:</strong> ${escapeHtml(entry.nextStep || "-")}</p>
      ${hasMeaningfulBlocker(entry.blockerRisk) ? `<p><strong>Blocker / Delay:</strong> ${escapeHtml(entry.blockerRisk)}</p>` : ""}
    </div>
  `;
}

function renderBoardCard(item, compact = false) {
  const latest = item.latestWeeklyUpdate;
  const display = itemDisplayParts(item);
  const itemTitle = display.detail || item.title || display.product;
  return html`
    <article class="board-card ${segmentClass(item.segment)} ${statusClass(item.status)} ${item.isQaIssue ? "qa-issue-card" : ""}">
      <div class="board-card-head">
        <div>
          <div class="product-workstream-box">${escapeHtml(display.product)}</div>
          ${item.isQaIssue ? `<span class="qa-issue-label">QA Issue</span>` : ""}
          <div class="board-card-title-row has-detail"><h3 class="board-card-subtitle">${escapeHtml(itemTitle)}</h3><span class="badge ${statusClass(item.status)}">${escapeHtml(item.status)}</span></div>
        </div>
      </div>
      ${renderLatestUpdateBlock(item, compact)}
      ${renderBoardSubTaskList(item.subTasks || [])}
      <div class="board-card-meta">
        <span class="subtask-pill">${escapeHtml(subTaskSummary(item.subTasks || []))}</span>
        <span>${escapeHtml(formatCardDate(item, latest))}</span>
        <span class="owner-chip"><span>${escapeHtml(ownerInitials(item.owner))}</span>${escapeHtml(item.owner)}</span>
      </div>
      <div class="board-card-actions">
        <button class="secondary" data-detail="${item.id}">Timeline</button>
        ${canEdit() ? `<button class="secondary" data-edit="${item.id}">Edit Item</button><button data-weekly="${item.id}">Add Update</button>` : ""}
        ${canAdmin() ? `<button class="danger" data-delete-update="${item.id}">Delete</button>` : ""}
      </div>
    </article>
  `;
}

function ownerInitials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function lifecycleState(item) {
  if (item.archived) return "Archived";
  if (item.status === "Done" || item.doneWeek) return "Done";
  return "Active";
}

function linkSummary(links = []) {
  if (!links.length) return "No links";
  return `${links.length} link${links.length === 1 ? "" : "s"}`;
}

function workstreamSummary(item) {
  const workstreams = (item?.workstreams || item?.subTasks || []).filter((workstream) => !isPlaceholderWorkstream(workstream.title || workstream));
  if (!workstreams.length) return "No workstreams";
  return `${workstreams.length} workstream${workstreams.length === 1 ? "" : "s"}`;
}

function subTaskSummary(subTasks = []) {
  const total = subTasks.length;
  if (!total) return "No sub-tasks";
  const done = subTasks.filter((task) => task.done).length;
  return `${done}/${total} done`;
}

function renderSubTaskChecklist(subTasks = [], options = {}) {
  if (!subTasks.length) return `<div class="empty-track compact-empty">No sub-tasks yet.</div>`;
  const disabled = options.disabled ? "disabled" : "";
  return html`
    <div class="subtask-checklist ${options.compact ? "compact" : ""}">
      ${subTasks.map((task) => html`
        <label class="subtask-check ${task.done ? "is-done" : ""}">
          <input type="checkbox" data-subtask-check data-subtask-id="${escapeHtml(task.id || "")}" data-subtask-title="${escapeHtml(task.title || task)}" ${task.done ? "checked" : ""} ${disabled} />
          <span>${escapeHtml(task.title || task)}</span>
        </label>
      `).join("")}
    </div>
  `;
}

function renderBoardSubTaskList(subTasks = []) {
  if (!subTasks.length) return "";
  return html`
    <div class="board-subtask-list" aria-label="Sub-tasks">
      ${subTasks.map((task) => html`
        <div class="board-subtask ${task.done ? "is-done" : ""}">
          <span class="board-subtask-box">${task.done ? "✓" : ""}</span>
          <span>${escapeHtml(task.title || task)}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderLatestUpdateText(latest) {
  if (!latest) return "";
  return html`
    <p><strong>${escapeHtml(workstreamLabel(latest.workstreamTitle || DEFAULT_WORKSTREAM_TITLE))}</strong></p>
    <p><strong>Progress:</strong> ${escapeHtml(cleanProgress(latest))}</p>
    <p><strong>Next:</strong> ${escapeHtml(latest.nextStep || "-")}</p>
    ${hasMeaningfulBlocker(latest.blockerRisk) ? `<p><strong>Blocker / Delay:</strong> ${escapeHtml(latest.blockerRisk)}</p>` : ""}
  `;
}

function cleanProgress(entry) {
  const prefix = `${entry.workstreamTitle}:`;
  const progress = String(entry.progress || "").startsWith(prefix) ? entry.progress.slice(prefix.length).trim() : entry.progress;
  return String(progress || "").trim() || "-";
}

function renderLatestUpdateBlock(item, compact) {
  const updates = item.latestByWorkstream?.length ? item.latestByWorkstream : (item.latestWeeklyUpdate ? [item.latestWeeklyUpdate] : []);
  const visibleUpdates = compact ? updates.slice(0, 2) : updates;
  if (!updates.length) {
    return "";
  }
  return html`
    <div class="board-update-block">
      ${visibleUpdates.map((latest) => html`
        <div class="workstream-update">
          ${shouldShowWorkstreamLabel(item, latest) ? `<strong>${escapeHtml(workstreamLabel(latest.workstreamTitle || DEFAULT_WORKSTREAM_TITLE))}</strong>` : ""}
          <span>Progress</span>
          <p>${escapeHtml(cleanProgress(latest))}</p>
          ${compact
            ? ""
            : html`
                <span>Next</span>
                <p>${escapeHtml(latest.nextStep)}</p>
                ${hasMeaningfulBlocker(latest.blockerRisk)
                  ? `<div class="risk-line has-risk"><span>Blocker / Delay</span><p>${escapeHtml(latest.blockerRisk)}</p></div>`
                  : ""}
              `}
        </div>
      `).join("")}
      ${compact && updates.length > visibleUpdates.length ? `<p class="muted">+${updates.length - visibleUpdates.length} more workstream update${updates.length - visibleUpdates.length === 1 ? "" : "s"}</p>` : ""}
    </div>
  `;
}

function shouldShowWorkstreamLabel(item, latest) {
  const label = workstreamLabel(latest.workstreamTitle || DEFAULT_WORKSTREAM_TITLE);
  if (!label || label === DEFAULT_WORKSTREAM_TITLE) return false;
  return label.trim().toLowerCase() !== String(item.productWorkstream || "").trim().toLowerCase();
}

function renderWeeklyItemInfo(item) {
  if (!item) return `<div class="empty">Select an Update Item to view project details.</div>`;
  return html`
    <section class="weekly-item-panel">
      <div class="weekly-item-panel-head">
        <div>
          <span class="section-kicker">Project Information</span>
          <h3>${escapeHtml(item.title)}</h3>
        </div>
        ${canEdit() ? `<button type="button" class="secondary" data-edit="${item.id}">Edit item details</button>` : ""}
      </div>
      <div class="weekly-info-grid">
        <div><span>Description</span><strong>${escapeHtml(item.description || "-")}</strong></div>
        <div><span>Owner</span><strong>${escapeHtml(item.owner || "-")}</strong></div>
        <div><span>Current status</span><strong>${escapeHtml(item.status || "-")}</strong></div>
        <div><span>Target completion</span><strong>${escapeHtml(item.targetCompletionDate || "-")}</strong></div>
        <div><span>Related links</span><strong>${escapeHtml(linkSummary(item.relatedLinks || []))}</strong></div>
        <div><span>Sub-task summary</span><strong>${escapeHtml(subTaskSummary(item.subTasks || []))}</strong></div>
        <div><span>Last updated by</span><strong>${escapeHtml(item.lastUpdatedBy || "-")}</strong></div>
        <div><span>Last updated at</span><strong>${escapeHtml(item.lastUpdatedAt ? formatDateTime(item.lastUpdatedAt) : "-")}</strong></div>
      </div>
      <div class="weekly-subtask-panel">
        <span class="section-kicker">Sub-tasks</span>
        ${renderSubTaskChecklist(item.subTasks || [], { compact: true })}
      </div>
    </section>
  `;
}

function hasMeaningfulBlocker(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return Boolean(normalized && !["no", "none", "n/a", "na", "-", "no.", "none."].includes(normalized));
}

function formatCardDate(item, latest) {
  const value = latest?.submittedAt || item.lastUpdatedAt;
  if (!value) return item.targetCompletionDate;
  return new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function bindDashboardEvents() {
  document.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.view = button.dataset.page;
      if (["dashboard", "pmView"].includes(state.view)) await loadDashboard();
      if (state.view === "archiveFolder") await loadArchiveFolder();
      if (["productMarketing", "meetings", "reportExport"].includes(state.view)) await loadModules();
      render();
    });
  });
  document.querySelector("#logout").addEventListener("click", async () => {
    await api("/api/logout", { method: "POST" }).catch(() => {});
    localStorage.clear();
    Object.assign(state, { token: "", role: "", selectedPmProfile: "", pmAccountId: "", view: "login", dashboard: null, modal: null });
    render();
  });
  document.querySelector("#quick-item")?.addEventListener("click", () => {
    state.modal = { type: "item", item: null };
    render();
  });
  document.querySelector("#quick-weekly")?.addEventListener("click", () => {
    state.modal = { type: "weekly", itemId: "", direct: false };
    render();
  });
  document.querySelector("#quick-announcement")?.addEventListener("click", () => {
    state.modal = { type: "announcement", announcement: null };
    render();
  });
  document.querySelector("#quick-meeting")?.addEventListener("click", () => {
    state.modal = { type: "meeting", meeting: null };
    render();
  });
  document.querySelector("#quick-marketing")?.addEventListener("click", () => {
    state.modal = { type: "marketing", asset: null };
    render();
  });
  document.querySelector("#quick-capacity")?.addEventListener("click", () => {
    state.modal = { type: "capacity" };
    render();
  });
  document.querySelectorAll("[data-period]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.period = button.dataset.period;
      await loadDashboard();
      render();
    });
  });
  document.querySelectorAll("[data-board-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.boardView = button.dataset.boardView;
      localStorage.setItem("pib_board_view", state.boardView);
      render();
    });
  });
  document.querySelector("#prev-period").addEventListener("click", async () => {
    state.selectedWeek = shiftSelectedWeek(-1);
    await loadDashboard();
    render();
  });
  document.querySelector("#next-period").addEventListener("click", async () => {
    state.selectedWeek = shiftSelectedWeek(1);
    await loadDashboard();
    render();
  });
  document.querySelector("#today-period").addEventListener("click", async () => {
    state.selectedWeek = state.config.currentReportingWeek;
    await loadDashboard();
    render();
  });
  document.querySelector("#week-selector").addEventListener("change", async (event) => {
    state.selectedWeek = event.target.value || state.config.currentReportingWeek;
    await loadDashboard();
    render();
  });
  document.querySelector("#filter-status").addEventListener("change", updateFilters);
  document.querySelector("#filter-owner").addEventListener("change", updateFilters);
  document.querySelector("#filter-product-area").addEventListener("change", updateFilters);
  document.querySelector("#filter-segment").addEventListener("change", updateFilters);
  document.querySelector("#filter-track").addEventListener("change", updateFilters);
  document.querySelector("#filter-product-workstream").addEventListener("change", updateFilters);
  document.querySelector("#reset-filters").addEventListener("click", async () => {
    state.filters = {
      status: "",
      owner: "",
      productArea: "",
      segment: "",
      track: "",
      productWorkstream: "",
      includeFutureDone: false,
    };
    await loadDashboard();
    render();
  });
  document.querySelectorAll("[data-detail]").forEach((button) => {
    button.addEventListener("click", async () => {
      await openItemDetail(button.dataset.detail);
    });
  });
  document.querySelectorAll("[data-open-detail]").forEach((card) => {
    card.addEventListener("click", async (event) => {
      if (event.target.closest("button, a, input, select, textarea")) return;
      await openItemDetail(card.dataset.openDetail);
    });
    card.addEventListener("keydown", async (event) => {
      if (!["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      await openItemDetail(card.dataset.openDetail);
    });
  });
  document.querySelectorAll("[data-weekly]").forEach((button) => {
    button.addEventListener("click", () => {
      state.modal = { type: "weekly", itemId: button.dataset.weekly, direct: true };
      render();
      loadPreviousReference();
    });
  });
}

async function openItemDetail(itemId) {
  if (!itemId) return;
  state.detail = await api(`/api/items/${itemId}`);
  state.modal = { type: "detail" };
  render();
}

async function updateFilters(event) {
  const changedId = event?.target?.id || "";
  const resetSegment = changedId === "filter-product-area";
  const resetTrack = resetSegment || changedId === "filter-segment";
  const resetProductWorkstream = resetTrack || changedId === "filter-track";
  state.filters = {
    status: document.querySelector("#filter-status").value,
    owner: document.querySelector("#filter-owner").value,
    productArea: document.querySelector("#filter-product-area").value,
    segment: resetSegment ? "" : document.querySelector("#filter-segment").value,
    track: resetTrack ? "" : document.querySelector("#filter-track").value,
    productWorkstream: resetProductWorkstream ? "" : document.querySelector("#filter-product-workstream").value,
    includeFutureDone: false,
  };
  await loadDashboard();
  if (state.filters.segment && !availableSegments().includes(state.filters.segment)) state.filters.segment = "";
  if (state.filters.track && !availableTracks().includes(state.filters.track)) state.filters.track = "";
  if (state.filters.productWorkstream && !availableProductWorkstreams().includes(state.filters.productWorkstream)) {
    state.filters.productWorkstream = "";
    await loadDashboard();
  }
  render();
}

function renderModal() {
  if (state.modal.type === "item") return renderItemForm(state.modal.item);
  if (state.modal.type === "weekly") return renderWeeklyForm(state.modal.itemId, state.modal.entry);
  if (state.modal.type === "detail") return renderDetail();
  if (state.modal.type === "announcement") return renderAnnouncementForm(state.modal.announcement);
  if (state.modal.type === "meeting") return renderMeetingForm(state.modal.meeting);
  if (state.modal.type === "marketing") return renderMarketingForm(state.modal.asset);
  if (state.modal.type === "capacity") return renderCapacityForm();
  return "";
}

function renderAnnouncementForm(announcement = null) {
  return html`
    <div class="modal">
      <section class="modal-panel">
          <div class="modal-head">
          <div><h2>${announcement ? "Edit Announcement" : "Add Announcement"}</h2><p class="muted">Announcements are saved to the shared board database.</p></div>
          <button class="secondary" data-close>Close</button>
        </div>
        <form id="announcement-form" class="grid form-grid">
          <label class="full">Title <input name="title" required value="${escapeHtml(announcement?.title || "")}" /></label>
          <label>Reporting week <input name="week" pattern="\\d{4}-\\d{2}" value="${escapeHtml(announcement?.week || state.selectedWeek)}" /></label>
          <label>Type <select name="type">${["Info", "Warning", "Alert", "Success", "Event"].map((type) => `<option ${type === (announcement?.type || "Info") ? "selected" : ""}>${escapeHtml(type)}</option>`).join("")}</select></label>
          <label>Product Area <select name="productArea"><option value="">All areas</option>${(state.config.productAreas || []).map((area) => `<option value="${escapeHtml(area)}" ${area === (announcement?.productArea || "") ? "selected" : ""}>${escapeHtml(area)}</option>`).join("")}</select></label>
          <label>Priority <select name="priority">${["Normal", "High", "Critical"].map((priority) => `<option ${priority === (announcement?.priority || "Normal") ? "selected" : ""}>${priority}</option>`).join("")}</select></label>
          <label>Valid until <input type="date" name="validUntil" value="${escapeHtml(announcement?.validUntil || "")}" /></label>
          <label>Visibility <select name="visibility">${["All", "PM Team", "PMM", "Product Lead"].map((visibility) => `<option ${visibility === (announcement?.visibility || "All") ? "selected" : ""}>${escapeHtml(visibility)}</option>`).join("")}</select></label>
          <label class="full">Details <textarea name="body" required>${escapeHtml(announcement?.body || "")}</textarea></label>
          <label class="full">Upload / related links <span class="optional-label">Optional</span><textarea name="relatedLinks" placeholder="Label | https://example.com">${escapeHtml(linkLines(announcement?.relatedLinks || []))}</textarea></label>
          ${announcement ? `<label class="checkbox full"><input type="checkbox" name="archived" ${announcement.archived ? "checked" : ""} /> Archive this announcement</label>` : ""}
          <div class="full row"><button type="submit">${announcement ? "Save Announcement" : "Add Announcement"}</button></div>
          <div class="error full" id="form-error"></div>
        </form>
      </section>
    </div>
  `;
}

function renderPmManagement() {
  app.innerHTML = html`
    <main class="page">
      <header class="topbar">
        <div class="brand">
          <h1>Management</h1>
          <div class="muted">Product Lead management for PM profiles, PM accounts, taxonomy structure, and archived item visibility.</div>
        </div>
        <div class="row">
          <button class="secondary" id="back-dashboard">Back to Dashboard</button>
          <button class="secondary" id="logout">Logout</button>
        </div>
      </header>
      <section class="panel management-panel">
        ${renderPmProfilesPanel()}
        ${renderPmAccountsForm()}
        ${renderTaxonomyPanel()}
        ${renderManagementNotes()}
      </section>
    </main>
  `;
  document.querySelector("#back-dashboard").addEventListener("click", async () => {
    state.view = "dashboard";
    await loadDashboard();
    render();
  });
  document.querySelector("#logout").addEventListener("click", async () => {
    await api("/api/logout", { method: "POST" }).catch(() => {});
    localStorage.clear();
    Object.assign(state, { token: "", role: "", selectedPmProfile: "", pmAccountId: "", view: "login", dashboard: null, modal: null });
    render();
  });
  document.querySelector("#management-show-archived")?.addEventListener("click", async () => {
    state.view = "archiveFolder";
    await loadArchiveFolder();
    render();
  });
}

function renderPlaceholderPage(title, content) {
  app.innerHTML = html`
    <main class="page">
      <header class="topbar">
        <div class="brand">
          <h1>${escapeHtml(title)}</h1>
          <div class="muted">Product Intelligence Board</div>
        </div>
        <div class="row">
          <button class="secondary" id="back-dashboard">Back to Dashboard</button>
          <button class="secondary" id="logout">Logout</button>
        </div>
      </header>
      <section class="panel management-panel">
        <div class="placeholder-panel">${content}</div>
      </section>
    </main>
  `;
  document.querySelector("#back-dashboard").addEventListener("click", async () => {
    state.view = "dashboard";
    await loadDashboard();
    render();
  });
  document.querySelector("#logout").addEventListener("click", async () => {
    await api("/api/logout", { method: "POST" }).catch(() => {});
    localStorage.clear();
    Object.assign(state, { token: "", role: "", selectedPmProfile: "", pmAccountId: "", view: "login", dashboard: null, modal: null });
    render();
  });
}

function renderArchiveFolder() {
  const query = state.archiveSearch.trim().toLowerCase();
  const items = (state.archiveItems || []).filter((item) => {
    if (!query) return true;
    return [
      item.title,
      item.productWorkstream,
      item.productArea,
      item.segment,
      item.track,
      item.owner,
      item.status,
      item.archivedReason,
      item.lastUpdatedBy,
    ].some((value) => String(value || "").toLowerCase().includes(query));
  });
  app.innerHTML = html`
    <main class="page">
      <header class="topbar">
        <div class="brand">
          <h1>Archive Folder</h1>
          <div class="muted">Archived update items are hidden from the main dashboard and kept here for search and timeline access.</div>
        </div>
        <div class="row">
          <button class="secondary" id="back-dashboard">Back to Dashboard</button>
          <button class="secondary" id="logout">Logout</button>
        </div>
      </header>
      <section class="panel management-panel">
        <div class="archive-folder-head">
          <label>Search archived items
            <input id="archive-search" value="${escapeHtml(state.archiveSearch)}" placeholder="Search title, owner, product, reason..." />
          </label>
          <strong>${items.length} archived item${items.length === 1 ? "" : "s"}</strong>
        </div>
        <div class="item-group-list">
          ${items.length ? items.map(renderArchivedItemCard).join("") : `<div class="empty">No archived items found.</div>`}
        </div>
      </section>
      ${state.modal ? renderModal() : ""}
    </main>
  `;
  bindArchiveFolderEvents();
}

function renderPmView() {
  const profiles = ownerProfiles();
  const selectedProfile = state.pmViewProfile || state.selectedPmProfile || profiles[0] || "";
  state.pmViewProfile = selectedProfile;
  const items = state.dashboard?.items || [];
  const ownerItems = items.filter((item) => item.owner === selectedProfile);
  const entryRows = items
    .flatMap((item) => (item.timelineEntries || []).map((entry) => ({ item, entry })))
    .filter(({ entry }) => entry.submittedBy === selectedProfile || entry.lastUpdatedBy === selectedProfile)
    .sort((a, b) => String(b.entry.reportingWeek || "").localeCompare(String(a.entry.reportingWeek || "")) || String(b.entry.lastUpdatedAt || "").localeCompare(String(a.entry.lastUpdatedAt || "")));
  app.innerHTML = html`
    <main class="page">
      <header class="topbar">
        <div class="brand">
          <h1>PM View</h1>
          <div class="muted">Secondary view for owner workload and submitted / updated weekly entries. The main dashboard remains shared.</div>
        </div>
        <div class="row">
          <button class="secondary" id="back-dashboard">Back to Dashboard</button>
          <button class="secondary" id="logout">Logout</button>
        </div>
      </header>
      <section class="panel management-panel">
        <div class="pm-view-controls">
          <label>PM Profile
            <select id="pm-view-profile">${profiles.map((name) => `<option value="${escapeHtml(name)}" ${name === selectedProfile ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select>
          </label>
          <div class="segmented-control">
            <button class="${state.pmViewMode === "owner" ? "active" : ""}" data-pm-view-mode="owner">By Owner</button>
            <button class="${state.pmViewMode === "activity" ? "active" : ""}" data-pm-view-mode="activity">Submitted / Updated</button>
          </div>
          <div class="pm-view-stats"><strong>${ownerItems.length}</strong> owned items · <strong>${entryRows.length}</strong> submitted/updated entries</div>
        </div>
        ${state.pmViewMode === "owner" ? renderPmOwnerView(ownerItems) : renderPmActivityView(entryRows)}
      </section>
      ${state.modal ? renderModal() : ""}
    </main>
  `;
  bindPmViewEvents();
}

function renderPmOwnerView(items) {
  return html`
    <section class="item-view">
      <div class="item-view-head">
        <span class="section-kicker">View by Owner</span>
        <strong>${escapeHtml(state.pmViewProfile)}</strong>
      </div>
      <div class="item-group-list">
        ${items.length ? items.map(renderItemRow).join("") : `<div class="empty">No owned update items in the selected dashboard view.</div>`}
      </div>
    </section>
  `;
}

function renderPmActivityView(rows) {
  return html`
    <section class="item-view">
      <div class="item-view-head">
        <span class="section-kicker">Submitted / Updated Weekly Entries</span>
        <strong>${escapeHtml(state.pmViewProfile)}</strong>
      </div>
      <div class="mini-timeline">
        ${rows.length ? rows.map(({ item, entry }) => html`
          <article class="mini-timeline-entry pm-activity-entry">
            <div><strong>${escapeHtml(entry.reportingWeek)}</strong><span class="badge ${statusClass(entry.status)}">${escapeHtml(entry.status)}</span></div>
            <h3>${escapeHtml(item.title)}</h3>
            <small>${escapeHtml(item.productArea)} · ${escapeHtml(item.segment)} · ${escapeHtml(item.track)} · Owner ${escapeHtml(item.owner)}</small>
            <p><strong>Progress:</strong> ${escapeHtml(cleanProgress(entry))}</p>
            <p><strong>Next:</strong> ${escapeHtml(entry.nextStep || "-")}</p>
            <p class="muted">Submitted by ${escapeHtml(entry.submittedBy)} at ${formatDateTime(entry.submittedAt)} · Last updated by ${escapeHtml(entry.lastUpdatedBy)} at ${formatDateTime(entry.lastUpdatedAt)}</p>
            <div class="row"><button class="secondary" data-detail="${item.id}">Timeline</button></div>
          </article>
        `).join("") : `<div class="empty">No submitted or updated weekly entries in the selected dashboard view.</div>`}
      </div>
    </section>
  `;
}

function bindPmViewEvents() {
  document.querySelector("#back-dashboard").addEventListener("click", async () => {
    state.view = "dashboard";
    await loadDashboard();
    render();
  });
  document.querySelector("#logout").addEventListener("click", async () => {
    await api("/api/logout", { method: "POST" }).catch(() => {});
    localStorage.clear();
    Object.assign(state, { token: "", role: "", selectedPmProfile: "", pmAccountId: "", view: "login", dashboard: null, modal: null });
    render();
  });
  document.querySelector("#pm-view-profile").addEventListener("change", (event) => {
    state.pmViewProfile = event.target.value;
    renderPmView();
  });
  document.querySelectorAll("[data-pm-view-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.pmViewMode = button.dataset.pmViewMode;
      renderPmView();
    });
  });
  document.querySelectorAll("[data-detail]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.detail = await api(`/api/items/${button.dataset.detail}`);
      state.modal = { type: "detail" };
      renderPmView();
    });
  });
  document.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", async () => {
      const item = await api(`/api/items/${button.dataset.edit}`);
      state.modal = { type: "item", item };
      renderPmView();
    });
  });
  document.querySelectorAll("[data-weekly]").forEach((button) => {
    button.addEventListener("click", () => {
      state.modal = { type: "weekly", itemId: button.dataset.weekly, direct: true };
      renderPmView();
      loadPreviousReference();
    });
  });
}

function renderArchivedItemCard(item) {
  const display = itemDisplayParts(item);
  return html`
    <article class="item-row-card archived-folder-card">
      <div class="item-row-main">
        <div>
          <h3>${escapeHtml(display.product)}</h3>
          ${display.detail ? `<div class="board-card-subtitle">${escapeHtml(display.detail)}</div>` : ""}
          <div class="item-row-path">${escapeHtml(item.productArea)} · ${escapeHtml(item.segment)} · ${escapeHtml(item.track)}</div>
        </div>
        <span class="badge status-done">Archived</span>
      </div>
      <div class="item-row-grid">
        <div><span>Owner</span><strong>${escapeHtml(item.owner || "-")}</strong></div>
        <div><span>Status when archived</span><strong>${escapeHtml(item.status || "-")}</strong></div>
        <div><span>Archived by</span><strong>${escapeHtml(item.lastUpdatedBy || "-")}</strong></div>
        <div><span>Archived at</span><strong>${escapeHtml(formatDateTime(item.lastUpdatedAt))}</strong></div>
        <div><span>Reason</span><strong>${escapeHtml(item.archivedReason || "-")}</strong></div>
        <div><span>Timeline entries</span><strong>${item.timelineEntries?.length || 0}</strong></div>
      </div>
      <div class="board-card-actions">
        <button class="secondary" data-archive-detail="${item.id}">Timeline</button>
        ${canAdmin() ? `<button class="danger" data-archive-delete="${item.id}">Delete</button>` : ""}
      </div>
    </article>
  `;
}

function bindArchiveFolderEvents() {
  document.querySelector("#back-dashboard").addEventListener("click", async () => {
    state.view = "dashboard";
    await loadDashboard();
    render();
  });
  document.querySelector("#logout").addEventListener("click", async () => {
    await api("/api/logout", { method: "POST" }).catch(() => {});
    localStorage.clear();
    Object.assign(state, { token: "", role: "", selectedPmProfile: "", pmAccountId: "", view: "login", dashboard: null, modal: null });
    render();
  });
  document.querySelector("#archive-search").addEventListener("input", (event) => {
    state.archiveSearch = event.target.value;
    renderArchiveFolder();
    document.querySelector("#archive-search")?.focus();
  });
  document.querySelectorAll("[data-archive-detail]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.detail = await api(`/api/items/${button.dataset.archiveDetail}`);
      state.modal = { type: "detail" };
      renderArchiveFolder();
    });
  });
  document.querySelectorAll("[data-archive-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!window.confirm("Delete this Update Item and all of its weekly timeline entries?")) return;
      await api(`/api/items/${button.dataset.archiveDelete}`, { method: "DELETE" });
      await loadArchiveFolder();
      renderArchiveFolder();
    });
  });
}

function renderProductMarketing() {
  const launchItems = (state.dashboard?.items || [])
    .filter((item) => ["Testing", "Live", "Done"].includes(item.status))
    .slice(0, 12);
  const assets = state.modules.marketing || [];
  app.innerHTML = renderStandalonePage("Product Marketing", "Launch readiness, GTM assets, and PMM follow-up.", html`
    <section class="module-grid">
      <div class="module-card wide">
        <h2>Launch Readiness</h2>
        <div class="module-list">
          ${launchItems.length ? launchItems.map((item) => html`
            <article class="module-row">
              <div>
                <strong>${escapeHtml(item.title)}</strong>
                <small>${escapeHtml(item.productArea)} · ${escapeHtml(item.segment)} · Owner ${escapeHtml(item.owner)}</small>
              </div>
              <span class="badge ${statusClass(item.status)}">${escapeHtml(item.status)}</span>
            </article>
          `).join("") : `<div class="empty-track">No launch-stage items in the current view.</div>`}
        </div>
      </div>
      ${canManagePmm() ? `<div class="module-card">
        <h2>PMM Asset Tracker</h2>
        <p class="muted">Track launch assets, PM review, revision status, and final links.</p>
        <button id="quick-marketing">Add PMM Asset</button>
      </div>` : ""}
      <div class="module-card wide">
        <h2>Tracked Assets</h2>
        <div class="module-list">
          ${assets.length ? assets.map(renderMarketingAssetCard).join("") : `<div class="empty-track">No PMM assets added yet.</div>`}
        </div>
      </div>
    </section>
  `);
  bindStandalonePageEvents();
  document.querySelector("#quick-marketing")?.addEventListener("click", () => {
    state.modal = { type: "marketing", asset: null };
    renderProductMarketing();
  });
}

function renderMeetings() {
  const items = state.dashboard?.items || [];
  const riskItems = items.filter((item) => ["Blocked", "Delay"].includes(item.status));
  const recentlyDone = items.filter((item) => item.status === "Done");
  app.innerHTML = renderStandalonePage("Meetings", "Weekly review agenda generated from the current board view.", html`
    <section class="module-grid">
      <div class="module-card">
        <h2>Meeting Notes</h2>
        <p class="muted">Upload weekly review notes, decisions, action items, and meeting attachments.</p>
        ${canManageModules() ? `<button id="add-meeting-note">Upload Meeting Note</button>` : ""}
      </div>
      <div class="module-card">
        <h2>Risk Agenda</h2>
        <div class="module-list">${riskItems.length ? riskItems.map(renderMeetingAgendaRow).join("") : `<div class="empty-track">No Blocked or Delay items in this view.</div>`}</div>
      </div>
      <div class="module-card">
        <h2>Done Review</h2>
        <div class="module-list">${recentlyDone.length ? recentlyDone.map(renderMeetingAgendaRow).join("") : `<div class="empty-track">No Done items in this view.</div>`}</div>
      </div>
      <div class="module-card wide">
        <h2>Saved Notes</h2>
        <div class="module-list">
          ${(state.modules.meetings || []).length ? state.modules.meetings.map(renderMeetingNoteCard).join("") : `<div class="empty-track">No meeting notes yet.</div>`}
        </div>
      </div>
    </section>
  `);
  bindStandalonePageEvents();
  document.querySelector("#add-meeting-note")?.addEventListener("click", () => {
    state.modal = { type: "meeting", meeting: null };
    renderMeetings();
  });
}

function renderMeetingForm(meeting = null) {
  const updateItems = state.dashboard?.items || [];
  const relatedValue = meeting?.relatedUpdateItemId || "";
  const productAreaValue = meeting?.productArea || updateItems.find((item) => item.id === relatedValue)?.productArea || "";
  return html`
    <div class="modal">
      <section class="modal-panel">
        <div class="modal-head">
          <div><h2>${meeting ? "Edit Meeting Note" : "Upload Meeting Note"}</h2><p class="muted">Capture meeting note, action items, decisions, and attachment links.</p></div>
          <button class="secondary" data-close>Close</button>
        </div>
        <form id="meeting-form" class="grid form-grid">
          <label class="full">Meeting title <input name="title" required placeholder="Weekly product review" value="${escapeHtml(meeting?.title || "")}" /></label>
          <label>Meeting type <select name="meetingType">${["Weekly Review", "Product Review", "Launch Review", "Risk Review", "Customer / Partner Sync"].map((type) => `<option ${type === (meeting?.meetingType || "Weekly Review") ? "selected" : ""}>${escapeHtml(type)}</option>`).join("")}</select></label>
          <label>Meeting date <input name="meetingDate" type="date" value="${escapeHtml(meeting?.meetingDate || new Date().toISOString().slice(0, 10))}" /></label>
          <label>Reporting week <input name="reportingWeek" pattern="\\d{4}-\\d{2}" value="${escapeHtml(meeting?.reportingWeek || state.selectedWeek)}" /></label>
          <label>Product Area <select name="productArea"><option value="">All areas</option>${(state.config.productAreas || []).map((area) => `<option value="${escapeHtml(area)}" ${area === productAreaValue ? "selected" : ""}>${escapeHtml(area)}</option>`).join("")}</select></label>
          <label>Related Update Item <select name="relatedUpdateItemId"><option value="">None</option>${updateItems.map((item) => `<option value="${item.id}" ${item.id === relatedValue ? "selected" : ""}>${escapeHtml(item.productArea)} · ${escapeHtml(item.title)}</option>`).join("")}</select></label>
          <label>Owner <input name="owner" value="${escapeHtml(meeting?.owner || state.selectedPmProfile || "Product Lead")}" /></label>
          <label class="full">Participants <input name="participants" placeholder="Names, teams, or roles" value="${escapeHtml(meeting?.participants || "")}" /></label>
          <label class="full">Agenda <textarea name="agenda" placeholder="Topics discussed">${escapeHtml(meeting?.agenda || "")}</textarea></label>
          <label class="full">Meeting notes <textarea name="notes" required placeholder="Discussion notes">${escapeHtml(meeting?.notes || "")}</textarea></label>
          <label class="full">Decisions <textarea name="decisions" placeholder="Decision log">${escapeHtml(meeting?.decisions || "")}</textarea></label>
          <label class="full">Action items <textarea name="actionItems" placeholder="One action item per line">${escapeHtml(taskLines(meeting?.actionItems || []))}</textarea></label>
          <label>Status <select name="status">${["Open", "Follow-up", "Closed"].map((status) => `<option ${status === (meeting?.status || "Open") ? "selected" : ""}>${status}</option>`).join("")}</select></label>
          <label class="full">Upload / attachment links <span class="optional-label">Optional</span><textarea name="attachments" placeholder="Deck | https://example.com">${escapeHtml(linkLines(meeting?.attachments || []))}</textarea></label>
          <div class="full row"><button type="submit">${meeting ? "Save Meeting Note" : "Upload Meeting Note"}</button></div>
          <div class="error full" id="form-error"></div>
        </form>
      </section>
    </div>
  `;
}

function renderMarketingForm(asset = null) {
  const updateItems = state.dashboard?.items || [];
  const productAreaValue = asset?.productArea || updateItems.find((item) => item.id === (asset?.relatedUpdateItemId || asset?.launchItemId))?.productArea || "CBI";
  const relatedValue = asset?.relatedUpdateItemId || asset?.launchItemId || "";
  const typeValue = asset?.type || asset?.channel || "Internal enablement";
  const statusValue = asset?.status || "Backlog";
  const typeOptions = ["Internal enablement", "Sales deck", "Customer comms", "Release note", "FAQ", "Training", "Website / landing page", "Launch plan"];
  const statusOptions = ["Backlog", "In Progress", "PM Review", "Revision Needed", "Internal Version Confirmed", "Final", "Archived"];
  return html`
    <div class="modal">
      <section class="modal-panel">
        <div class="modal-head">
          <div><h2>${asset ? "Edit PMM Asset" : "Add PMM Asset"}</h2><p class="muted">Track launch readiness, GTM assets, PMM notes, and external links.</p></div>
          <button class="secondary" data-close>Close</button>
        </div>
        <form id="marketing-form" class="grid form-grid">
          <label>Product Area <select name="productArea">${(state.config.productAreas || []).map((area) => `<option ${area === productAreaValue ? "selected" : ""}>${escapeHtml(area)}</option>`).join("")}</select></label>
          <label>Related Update Item <select name="relatedUpdateItemId"><option value="">None</option>${updateItems.map((item) => `<option value="${item.id}" ${item.id === relatedValue ? "selected" : ""}>${escapeHtml(item.productArea)} · ${escapeHtml(item.title)}</option>`).join("")}</select></label>
          <label class="full">Asset / Message <input name="title" required placeholder="e.g. SkorKu 3.0 launch one-pager" value="${escapeHtml(asset?.title || "")}" /></label>
          <label>Type <select name="type">${typeOptions.map((type) => `<option ${type === typeValue ? "selected" : ""}>${escapeHtml(type)}</option>`).join("")}</select></label>
          <label>Status <select name="status">${statusOptions.map((status) => `<option ${status === statusValue ? "selected" : ""}>${escapeHtml(status)}</option>`).join("")}</select></label>
          <label>Owner <input name="owner" placeholder="PMM owner" value="${escapeHtml(asset?.owner || "")}" /></label>
          <label>PM Reviewer <input name="pmReviewer" placeholder="PM reviewer" value="${escapeHtml(asset?.pmReviewer || "")}" /></label>
          <label>Target Completion Date <input type="date" name="targetCompletionDate" value="${escapeHtml(asset?.targetCompletionDate || "")}" /></label>
          <label>Completed Date <input type="date" name="completedDate" value="${escapeHtml(asset?.completedDate || "")}" /></label>
          <label class="full">Description <textarea name="description" placeholder="Positioning, target users, launch risk">${escapeHtml(asset?.description || asset?.notes || "")}</textarea></label>
          <label class="full">Draft Link <input name="draftLink" placeholder="https://..." value="${escapeHtml(asset?.draftLink || "")}" /></label>
          <label class="full">Internal Version Link <input name="internalVersionLink" placeholder="https://..." value="${escapeHtml(asset?.internalVersionLink || "")}" /></label>
          <label class="full">Final Version Link <input name="finalVersionLink" placeholder="https://..." value="${escapeHtml(asset?.finalVersionLink || asset?.link || "")}" /></label>
          <label class="full">PM Feedback <textarea name="pmFeedback" placeholder="PM comments, requested revisions, approval note">${escapeHtml(asset?.pmFeedback || "")}</textarea></label>
          <label class="checkbox full"><input type="checkbox" name="archived" ${asset?.archived ? "checked" : ""} /> Archived</label>
          <div class="full row"><button type="submit">${asset ? "Save PMM Asset" : "Add PMM Asset"}</button></div>
          <div class="error full" id="form-error"></div>
        </form>
      </section>
    </div>
  `;
}

function capacityCsvFromRows(rows = capacityRowsFromDashboard(state.dashboard?.items || [])) {
  const formatQuarter = (value, total, alert) => {
    const hasValue = value !== "" && value !== null && value !== undefined;
    return hasValue ? `${value}/${total || 0}${alert ? "!" : ""}` : "-";
  };
  return rows.map((row) => [
    row.initials || ownerInitials(row.pmName),
    row.pmName,
    row.status || "Active",
    row.roleScope || "",
    row.activeSince || "",
    formatQuarter(row.q1, row.q1Total || 64, row.q1Alert),
    formatQuarter(row.q2, row.q2Total || 65, row.q2Alert),
    formatQuarter(row.q3, row.q3Total || 66, row.q3Alert),
    formatQuarter(row.q4, row.q4Total || 66, row.q4Alert),
    row.notes || "",
  ].join(" | ")).join("\n");
}

function parseCapacityCsv(value) {
  const parseQuarter = (token) => {
    const raw = String(token || "").trim();
    if (!raw || raw === "-") return { value: "", total: "", alert: false };
    const alert = raw.endsWith("!");
    const clean = alert ? raw.slice(0, -1) : raw;
    const [value, total] = clean.split("/").map((part) => part?.trim());
    return { value: value === "-" ? "" : value, total: total || "", alert };
  };
  return String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [initials, pmName, status, roleScope, activeSince, q1Text, q2Text, q3Text, q4Text, ...notes] = line.split("|").map((part) => part.trim());
      const q1 = parseQuarter(q1Text);
      const q2 = parseQuarter(q2Text);
      const q3 = parseQuarter(q3Text);
      const q4 = parseQuarter(q4Text);
      return {
        initials,
        pmName,
        status,
        roleScope,
        activeSince,
        q1: q1.value,
        q1Total: q1.total,
        q1Alert: q1.alert,
        q2: q2.value,
        q2Total: q2.total,
        q2Alert: q2.alert,
        q3: q3.value,
        q3Total: q3.total,
        q3Alert: q3.alert,
        q4: q4.value,
        q4Total: q4.total,
        q4Alert: q4.alert,
        notes: notes.join(" | "),
      };
    });
}

function parseCapacityQuarterInput(raw) {
  const text = String(raw || "").trim();
  if (!text || text === "-") return { value: "", total: "", alert: false };
  const alert = text.endsWith("!");
  const clean = alert ? text.slice(0, -1) : text;
  const [value, total] = clean.split("/").map((part) => part?.trim());
  return { value: value === "-" ? "" : value, total: total || "", alert };
}

function formatCapacityQuarterInput(value, total, alert) {
  const hasValue = value !== "" && value !== null && value !== undefined;
  return hasValue ? `${value}/${total || 0}${alert ? "!" : ""}` : "-";
}

function renderCapacityInputRows() {
  const rows = state.modules.capacity?.records || capacityRowsFromDashboard(state.dashboard?.items || []);
  return rows.map(renderCapacityInputRow).join("");
}

function renderCapacitySummaryInputs() {
  const rows = capacityRowsFromDashboard(state.dashboard?.items || []);
  const summary = capacitySummaryDefaults(rows);
  const renderMetric = (key, label, value, quarters) => html`
    <fieldset class="capacity-summary-edit-card">
      <legend>${escapeHtml(label)}</legend>
      <label>Total <input name="${key}" value="${escapeHtml(value)}" /></label>
      <div class="capacity-summary-quarter-inputs">
        ${["q1", "q2", "q3", "q4"].map((quarter) => `<label>${quarter.toUpperCase()} <input name="${key}-${quarter}" value="${escapeHtml(quarters?.[quarter] ?? 0)}" /></label>`).join("")}
      </div>
    </fieldset>
  `;
  const renderBreakdown = (key, label, breakdown) => html`
    <fieldset class="capacity-summary-edit-card capacity-breakdown-edit-card">
      <legend>${escapeHtml(label)} Breakdown</legend>
      <div class="capacity-breakdown-edit-grid">
        ${["q1", "q2", "q3", "q4"].map((quarter) => html`
          <div>
            <strong>${quarter.toUpperCase()}</strong>
            ${["cbi", "cbp", "aai"].map((bucket) => `<label>${bucket.toUpperCase()} <input name="${key}-${quarter}-${bucket}" value="${escapeHtml(breakdown?.[quarter]?.[bucket] ?? 0)}" /></label>`).join("")}
          </div>
        `).join("")}
      </div>
    </fieldset>
  `;
  return html`
    <section class="capacity-summary-edit full">
      <div>
        <strong>Timesheet Statistics</strong>
        <span class="optional-label">Shown at the top of the Capacity module. Breakdown is grouped by CBI / CBP / AAI.</span>
      </div>
      <div class="capacity-summary-edit-grid">
        ${renderMetric("totalPd", "Total Team Timesheet Recorded", summary.totalPd, summary.totalQuarters)}
        ${renderMetric("activePm", "Total Active PM Count", summary.activePm, summary.activeQuarters)}
        ${renderMetric("averagePd", "Average PD per Active PM", summary.averagePd, summary.averageQuarters)}
      </div>
      <div class="capacity-summary-edit-grid">
        ${renderBreakdown("totalPd", "Total PD", summary.totalBreakdown)}
        ${renderBreakdown("activePm", "Active PM", summary.activeBreakdown)}
        ${renderBreakdown("averagePd", "Average PD", summary.averageBreakdown)}
      </div>
    </section>
  `;
}

function renderCapacityInputRow(row = {}) {
  const rows = state.modules.capacity?.records || capacityRowsFromDashboard(state.dashboard?.items || []);
  const pmOptions = [...new Set([...rows.map((row) => row.pmName), ...ownerProfiles()])].filter(Boolean);
  return html`
    <div class="capacity-edit-row" data-capacity-row>
      <input type="hidden" name="id" value="${escapeHtml(row.id || "")}" />
      <input type="hidden" name="initials" value="${escapeHtml(row.initials || ownerInitials(row.pmName))}" />
      <label>PM
        <select name="pmName" required>
          <option value="">Select PM</option>
          ${pmOptions.map((name) => `<option value="${escapeHtml(name)}" ${name === row.pmName ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}
        </select>
      </label>
      <label>Status
        <select name="status">
          ${["Active", "Transfer", "Resign"].map((status) => `<option value="${status}" ${status === (row.status || "Active") ? "selected" : ""}>${status}</option>`).join("")}
        </select>
      </label>
      <label>Scope <input name="roleScope" value="${escapeHtml(row.roleScope || "")}" /></label>
      <label>Active Since <input name="activeSince" value="${escapeHtml(row.activeSince || "")}" placeholder="01 Jan 2026" /></label>
      <label>Q1 <input name="q1" value="${escapeHtml(formatCapacityQuarterInput(row.q1, row.q1Total || 64, row.q1Alert))}" placeholder="67/64" /></label>
      <label>Q2 <input name="q2" value="${escapeHtml(formatCapacityQuarterInput(row.q2, row.q2Total || 65, row.q2Alert))}" placeholder="0/65!" /></label>
      <label>Q3 <input name="q3" value="${escapeHtml(formatCapacityQuarterInput(row.q3, row.q3Total || 66, row.q3Alert))}" placeholder="0/66" /></label>
      <label>Q4 <input name="q4" value="${escapeHtml(formatCapacityQuarterInput(row.q4, row.q4Total || 66, row.q4Alert))}" placeholder="0/66" /></label>
      <label class="wide">Notes <input name="notes" value="${escapeHtml(row.notes || "")}" /></label>
    </div>
  `;
}

function parseCapacityFormRows(form) {
  return [...form.querySelectorAll("[data-capacity-row]")].map((row) => {
    const q1 = parseCapacityQuarterInput(row.querySelector("[name='q1']").value);
    const q2 = parseCapacityQuarterInput(row.querySelector("[name='q2']").value);
    const q3 = parseCapacityQuarterInput(row.querySelector("[name='q3']").value);
    const q4 = parseCapacityQuarterInput(row.querySelector("[name='q4']").value);
    return {
      id: row.querySelector("[name='id']").value,
      initials: row.querySelector("[name='initials']").value,
      pmName: row.querySelector("[name='pmName']").value,
      status: row.querySelector("[name='status']").value,
      roleScope: row.querySelector("[name='roleScope']").value,
      activeSince: row.querySelector("[name='activeSince']").value,
      q1: q1.value,
      q1Total: q1.total,
      q1Alert: q1.alert,
      q2: q2.value,
      q2Total: q2.total,
      q2Alert: q2.alert,
      q3: q3.value,
      q3Total: q3.total,
      q3Alert: q3.alert,
      q4: q4.value,
      q4Total: q4.total,
      q4Alert: q4.alert,
      notes: row.querySelector("[name='notes']").value,
    };
  });
}

function parseCapacityNumber(value) {
  const text = String(value || "").trim();
  if (!text) return 0;
  const number = Number(text);
  return Number.isFinite(number) ? number : 0;
}

function parseCapacitySummaryForm(form) {
  const read = (name) => parseCapacityNumber(form.querySelector(`[name="${name}"]`)?.value);
  const readQuarters = (key) => ({
    q1: read(`${key}-q1`),
    q2: read(`${key}-q2`),
    q3: read(`${key}-q3`),
    q4: read(`${key}-q4`),
  });
  const readBreakdown = (key) => {
    const breakdown = emptyCapacityBreakdown();
    for (const quarter of ["q1", "q2", "q3", "q4"]) {
      for (const bucket of ["cbi", "cbp", "aai"]) {
        breakdown[quarter][bucket] = read(`${key}-${quarter}-${bucket}`);
      }
    }
    return breakdown;
  };
  return {
    totalPd: read("totalPd"),
    activePm: read("activePm"),
    averagePd: read("averagePd"),
    totalQuarters: readQuarters("totalPd"),
    activeQuarters: readQuarters("activePm"),
    averageQuarters: readQuarters("averagePd"),
    totalBreakdown: readBreakdown("totalPd"),
    activeBreakdown: readBreakdown("activePm"),
    averageBreakdown: readBreakdown("averagePd"),
  };
}

function renderCapacityForm() {
  return html`
    <div class="modal">
      <section class="modal-panel capacity-modal-panel">
        <div class="modal-head">
          <div><h2>Update PM Capacity</h2><p class="muted">Only Product Lead can upload or modify capacity data.</p></div>
          <button class="secondary" data-close>Close</button>
        </div>
        <form id="capacity-form" class="grid form-grid">
          ${renderCapacitySummaryInputs()}
          <div class="full">
            <strong>Capacity rows</strong>
            <span class="optional-label">Select PM and enter Q1-Q4 as used/target, e.g. 67/64. Add ! for red exception, e.g. 0/65!. Use - if empty.</span>
            <div class="capacity-edit-list">${renderCapacityInputRows()}</div>
            <button class="secondary" type="button" id="add-capacity-row">Add Capacity Row</button>
          </div>
          <div class="full row"><button type="submit">Save Capacity Data</button></div>
          <div class="error full" id="form-error"></div>
        </form>
      </section>
    </div>
  `;
}

function renderMeetingAgendaRow(item) {
  return html`
    <article class="module-row">
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.productArea)} · ${escapeHtml(item.segment)} · ${escapeHtml(item.track)} · ${escapeHtml(item.owner)}</small>
      </div>
      <span class="badge ${statusClass(item.status)}">${escapeHtml(item.status)}</span>
    </article>
  `;
}

function renderPmCapacity() {
  const owners = ownerProfiles()
    .map((owner) => {
      const items = (state.dashboard?.items || []).filter((item) => item.owner === owner);
      const active = items.filter((item) => !["Done"].includes(item.status)).length;
      const risk = items.filter((item) => ["Blocked", "Delay"].includes(item.status)).length;
      return { owner, total: items.length, active, risk };
    })
    .filter((row) => row.total || row.active || row.risk);
  const max = Math.max(1, ...owners.map((row) => row.active));
  app.innerHTML = renderStandalonePage("PM Capacity", "Workload snapshot by owner for the current filtered board.", html`
    <section class="module-grid">
      <div class="module-card wide">
        <h2>Owner Workload</h2>
        <div class="capacity-list">
          ${owners.length ? owners.map((row) => html`
            <article class="capacity-row">
              <div class="owner-chip"><span>${escapeHtml(ownerInitials(row.owner))}</span>${escapeHtml(row.owner)}</div>
              <div class="capacity-bar"><span style="width:${Math.max(8, Math.round((row.active / max) * 100))}%"></span></div>
              <strong>${row.active} active</strong>
              <small>${row.total} total · ${row.risk} risk</small>
            </article>
          `).join("") : `<div class="empty-track">No owner workload in this view.</div>`}
        </div>
      </div>
    </section>
  `);
  bindStandalonePageEvents();
}

function renderReportExport() {
  const reportText = generateReportText();
  const reportHtml = generateReportHtml();
  const exportPayload = {
    generatedAt: new Date().toISOString(),
    week: state.selectedWeek,
    period: state.period,
    filters: state.filters,
    cards: state.dashboard?.cards || {},
    items: state.dashboard?.items || [],
    announcements: state.modules.announcements || [],
  };
  app.innerHTML = renderStandalonePage("Report Export", "Formal weekly report preview with copy and data export controls.", html`
    <section class="report-export-grid">
      <aside class="report-control-panel">
        <div>
          <span class="eyebrow">Export Controls</span>
          <h2>Weekly Report Pack</h2>
          <p class="muted">Use the report preview for leadership review, or copy/download the source payload for follow-up.</p>
        </div>
        <div class="report-metrics">
          <div><span>Reporting week</span><strong>${escapeHtml(state.selectedWeek)}</strong></div>
          <div><span>Period</span><strong>${escapeHtml(state.period)}</strong></div>
          <div><span>Items</span><strong>${exportPayload.items.length}</strong></div>
          <div><span>Generated by</span><strong>${escapeHtml(state.selectedPmProfile || state.role)}</strong></div>
        </div>
        <div class="report-actions">
          <button id="copy-report" type="button">Copy Text Report</button>
          <button class="secondary" id="copy-export" type="button">Copy JSON</button>
          <button class="secondary" id="download-export" type="button">Download JSON</button>
        </div>
        <details class="export-raw-panel">
          <summary>Copyable Text Report</summary>
          <textarea id="report-text" readonly>${escapeHtml(reportText)}</textarea>
        </details>
        <details class="export-raw-panel">
          <summary>JSON Payload</summary>
          <textarea id="export-json" readonly>${escapeHtml(JSON.stringify(exportPayload, null, 2))}</textarea>
        </details>
      </aside>
      <section class="report-preview-shell">
        ${reportHtml}
      </section>
    </section>
  `);
  bindStandalonePageEvents();
}

function latestReportEntry(item) {
  return item.latestWeeklyUpdate || item.weeklyUpdatesThisPeriod?.[0] || null;
}

function reportItemLine(item) {
  const latest = latestReportEntry(item);
  return [
    `- ${item.title}`,
    `  Owner: ${item.owner || "-"}`,
    `  Status: ${item.status || "-"}`,
    `  Progress: ${latest ? cleanProgress(latest) : "-"}`,
    `  Next: ${latest?.nextStep || "-"}`,
    `  Blocker / risk: ${hasMeaningfulBlocker(latest?.blockerRisk || item.blockerRisk) ? (latest?.blockerRisk || item.blockerRisk) : "-"}`,
    `  Updates this period: ${item.updatesThisWeek || 0}`,
    `  Last updated by: ${item.lastUpdatedBy || "-"}`,
    `  Last updated at: ${formatDateTime(item.lastUpdatedAt)}`,
  ].join("\n");
}

function reportGroupedItems(items) {
  const groups = new Map();
  for (const item of items) {
    const key = `${item.productArea} > ${item.segment} > ${item.track}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.entries()].map(([key, groupItems]) => `${key}\n${groupItems.map(reportItemLine).join("\n")}`).join("\n\n");
}

function generateReportText() {
  const items = state.dashboard?.items || [];
  const updated = items.filter((item) => item.updatesThisWeek > 0);
  const blocked = items.filter((item) => needsBlockerDelay(item.status) || hasMeaningfulBlocker(item.latestWeeklyUpdate?.blockerRisk || item.blockerRisk));
  const done = items.filter((item) => item.doneWeek === state.selectedWeek || item.status === "Done");
  return [
    `Product Intelligence Weekly Report - ${state.selectedWeek}`,
    "",
    "1. Summary",
    `- Total active items: ${items.length}`,
    `- Updated items: ${updated.length}`,
    `- Blocked items: ${blocked.length}`,
    `- Done items: ${done.length}`,
    "",
    "2. Blocked Items",
    blocked.length ? blocked.map((item) => {
      const latest = latestReportEntry(item);
      return [
        `- ${item.title}`,
        `  Owner: ${item.owner || "-"}`,
        `  Blocker / risk: ${latest?.blockerRisk || item.blockerRisk || "-"}`,
        `  Next step: ${latest?.nextStep || "-"}`,
        `  Target completion date: ${item.targetCompletionDate || "-"}`,
        `  Related links: ${linkSummary(item.relatedLinks || [])}`,
      ].join("\n");
    }).join("\n") : "- None",
    "",
    "3. Updated Items",
    updated.length ? reportGroupedItems(updated) : "- None",
    "",
    "4. Done This Week",
    done.length ? done.map(reportItemLine).join("\n") : "- None",
  ].join("\n");
}

function generateReportHtml() {
  const items = state.dashboard?.items || [];
  const updated = items.filter((item) => item.updatesThisWeek > 0);
  const blocked = items.filter((item) => needsBlockerDelay(item.status) || hasMeaningfulBlocker(item.latestWeeklyUpdate?.blockerRisk || item.blockerRisk));
  const done = items.filter((item) => item.doneWeek === state.selectedWeek || item.status === "Done");
  const groupedUpdated = new Map();
  for (const item of updated) {
    const key = `${item.productArea} / ${item.segment}`;
    if (!groupedUpdated.has(key)) groupedUpdated.set(key, []);
    groupedUpdated.get(key).push(item);
  }
  const renderReportItem = (item, mode = "default") => {
    const latest = latestReportEntry(item);
    const blocker = latest?.blockerRisk || item.blockerRisk || "";
    return html`
      <article class="report-item ${mode === "risk" ? "report-item-risk" : ""}">
        <header>
          <div>
            <span>${escapeHtml(item.track || item.productWorkstream || item.segment)}</span>
            <strong>${escapeHtml(item.title)}</strong>
          </div>
          <span class="badge ${statusClass(item.status)}">${escapeHtml(item.status || "-")}</span>
        </header>
        <div class="report-item-grid">
          <div><span>Owner</span><strong>${escapeHtml(item.owner || "-")}</strong></div>
          <div><span>Last update</span><strong>${formatDateTime(item.lastUpdatedAt)}</strong></div>
          <div><span>Progress</span><p>${escapeHtml(latest ? cleanProgress(latest) : "-")}</p></div>
          <div><span>Next step</span><p>${escapeHtml(latest?.nextStep || "-")}</p></div>
          ${mode === "risk" ? `<div class="report-risk-note"><span>Blocker / Risk</span><p>${escapeHtml(blocker || "-")}</p></div>` : ""}
        </div>
      </article>
    `;
  };
  return html`
    <article class="report-document">
      <header class="report-cover">
        <div>
          <span class="eyebrow">Product Intelligence</span>
          <h2>Weekly Management Report</h2>
          <p>${escapeHtml(state.selectedWeek)} · ${escapeHtml(state.period)} · Generated ${formatDateTime(new Date().toISOString())}</p>
        </div>
        <div class="report-brand-strip" aria-label="Covered product brands">
          <span>Prepared for</span>
          <div>
            <img src="/assets/CBI-logo-F-1.svg" alt="CBI" />
            <img src="/assets/ADVANCE%20CBP%20logo-F.svg" alt="ADVANCE.CBP" />
            <img src="/assets/SME%20Bureau%20logo_Primary%20(3).svg" alt="SME Bureau" />
            <img src="/assets/SkorKu_Logo_Primary.svg" alt="SkorKu" />
          </div>
        </div>
      </header>
      <section class="report-kpi-row">
        <div><span>Total Items</span><strong>${items.length}</strong></div>
        <div><span>Updated</span><strong>${updated.length}</strong></div>
        <div><span>Blocked / Delay</span><strong>${blocked.length}</strong></div>
        <div><span>Done</span><strong>${done.length}</strong></div>
      </section>
      <section class="report-section">
        <div class="report-section-head">
          <span>01</span>
          <h3>Executive Risk Summary</h3>
        </div>
        <div class="report-list">
          ${blocked.length ? blocked.map((item) => renderReportItem(item, "risk")).join("") : `<p class="empty-track">No blocked or delayed items in this view.</p>`}
        </div>
      </section>
      <section class="report-section">
        <div class="report-section-head">
          <span>02</span>
          <h3>Updated Items</h3>
        </div>
        ${groupedUpdated.size ? [...groupedUpdated.entries()].map(([group, groupItems]) => html`
          <div class="report-group">
            <h4>${escapeHtml(group)}</h4>
            <div class="report-list">${groupItems.map((item) => renderReportItem(item)).join("")}</div>
          </div>
        `).join("") : `<p class="empty-track">No updated items in this view.</p>`}
      </section>
      <section class="report-section">
        <div class="report-section-head">
          <span>03</span>
          <h3>Done This Week</h3>
        </div>
        <div class="report-list compact">
          ${done.length ? done.map((item) => renderReportItem(item)).join("") : `<p class="empty-track">No completed items in this view.</p>`}
        </div>
      </section>
    </article>
  `;
}

function renderStandalonePage(title, subtitle, content) {
  return html`
    <main class="page">
      <header class="topbar">
        <div class="brand">
          <h1>${escapeHtml(title)}</h1>
          <div class="muted">${escapeHtml(subtitle)}</div>
        </div>
        <div class="row">
          <button class="secondary" id="back-dashboard">Back to Dashboard</button>
          <button class="secondary" id="logout">Logout</button>
        </div>
      </header>
      ${content}
    </main>
    ${state.modal ? renderModal() : ""}
  `;
}

function bindStandalonePageEvents() {
  document.querySelector("#back-dashboard").addEventListener("click", async () => {
    state.view = "dashboard";
    await loadDashboard();
    render();
  });
  document.querySelector("#logout").addEventListener("click", async () => {
    await api("/api/logout", { method: "POST" }).catch(() => {});
    localStorage.clear();
    Object.assign(state, { token: "", role: "", selectedPmProfile: "", pmAccountId: "", view: "login", dashboard: null, modal: null });
    render();
  });
  document.querySelector("#copy-report")?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(document.querySelector("#report-text").value);
  });
  document.querySelector("#copy-export")?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(document.querySelector("#export-json").value);
  });
  document.querySelector("#download-export")?.addEventListener("click", () => {
    const blob = new Blob([document.querySelector("#export-json").value], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `product-intelligence-board-${state.selectedWeek}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  });
}

function renderAdminSettingsContent() {
  return html`
    <div class="settings-grid">
      <div><span>Current role</span><strong>${escapeHtml(state.role)}</strong></div>
      <div><span>Current PM Profile</span><strong>${escapeHtml(state.selectedPmProfile || "Not selected")}</strong></div>
      <div><span>Passcode management</span><strong>Server-side only</strong><p>Enter new passcodes to rotate them. Current passcodes are not exposed in frontend components.</p></div>
      <div><span>Audit log</span><strong>Metadata captured</strong><p>Created by, updated by, submitted by, and timestamps are stored directly on update items, weekly entries, and module records.</p></div>
      <div><span>Lark Bot</span><strong>Integration readiness</strong><p>No live Lark integration yet. Export JSON can be used as the handoff source for bot/report automation.</p></div>
      <div><span>Backup</span><strong>Available through Report Export</strong><p>Use Report Export to download the current filtered board payload for manual backup and review.</p></div>
    </div>
    <form id="passcode-form" class="grid form-grid module-card">
      <h2 class="full">Role Passcodes</h2>
      ${(state.config.roles || []).map((role) => html`
        <label>${escapeHtml(role)}
          <input name="${escapeHtml(role)}" value="" placeholder="Enter new passcode" />
        </label>
      `).join("")}
      <div class="full row"><button type="submit">Save Passcodes</button></div>
      <div class="error full" id="form-error"></div>
    </form>
  `;
}

function renderPmProfilesPanel() {
  return html`
    <section class="management-block">
      <h2>PM Profiles</h2>
      <p class="muted">PM Profile is used for Owner, Submitted by, and Last updated by. It is separate from login role.</p>
      <div class="pill-list">${ownerProfiles().map((name) => `<span>${escapeHtml(name)}</span>`).join("")}</div>
    </section>
  `;
}

function renderTaxonomyPanel() {
  const customTracks = state.config.customTracks || [];
  return html`
    <section class="management-block">
      <h2>Taxonomy Structure</h2>
      <p class="muted">Product Area -> Segment -> Track / Category. Seeded categories stay visible; Product Lead can add, rename, order, and archive custom categories.</p>
      <div class="taxonomy-list">
        ${state.config.productAreas.map((area) => renderTaxonomyArea(area)).join("")}
      </div>
      <form id="taxonomy-form" class="taxonomy-editor">
        <h3>Custom Track / Category Management</h3>
        <div class="taxonomy-edit-list">
          ${customTracks.map((track) => renderCustomTrackRow(track)).join("")}
        </div>
        <div class="taxonomy-new-row">
          <select id="new-taxonomy-area">${state.config.productAreas.map((area) => `<option>${escapeHtml(area)}</option>`).join("")}</select>
          <select id="new-taxonomy-segment">${(state.config.segmentsByArea[state.config.productAreas[0]] || []).map((segment) => `<option>${escapeHtml(segment)}</option>`).join("")}</select>
          <input id="new-taxonomy-name" placeholder="New category name" />
          <button type="button" class="secondary" id="add-custom-track">Add Category</button>
        </div>
        <div class="row"><button type="submit">Save Category Management</button></div>
        <div class="error" id="form-error"></div>
      </form>
    </section>
  `;
}

function renderCustomTrackRow(track = {}) {
  const area = track.productArea || "CBI";
  const segment = track.segment || (state.config.segmentsByArea[area] || [])[0] || "";
  return html`
    <div class="taxonomy-edit-row" data-custom-track-row data-id="${escapeHtml(track.id || "")}">
      <select name="productArea">${state.config.productAreas.map((candidate) => `<option ${candidate === area ? "selected" : ""}>${escapeHtml(candidate)}</option>`).join("")}</select>
      <select name="segment">${(state.config.segmentsByArea[area] || []).map((candidate) => `<option ${candidate === segment ? "selected" : ""}>${escapeHtml(candidate)}</option>`).join("")}</select>
      <input name="name" value="${escapeHtml(track.name || "")}" placeholder="Category name" />
      <input name="order" type="number" value="${escapeHtml(track.order ?? 0)}" />
      <label class="checkbox"><input type="checkbox" name="archived" ${track.archived ? "checked" : ""} /> Archive</label>
      <button type="button" class="danger" data-remove-custom-track>Remove</button>
    </div>
  `;
}

function updateNewTaxonomySegment() {
  const area = document.querySelector("#new-taxonomy-area")?.value;
  const segment = document.querySelector("#new-taxonomy-segment");
  if (!area || !segment) return;
  segment.innerHTML = (state.config.segmentsByArea[area] || []).map((candidate) => `<option>${escapeHtml(candidate)}</option>`).join("");
}

function updateCustomTrackRowSegments(row) {
  if (!row) return;
  const area = row.querySelector("select[name='productArea']")?.value;
  const segment = row.querySelector("select[name='segment']");
  if (!area || !segment) return;
  segment.innerHTML = (state.config.segmentsByArea[area] || []).map((candidate) => `<option>${escapeHtml(candidate)}</option>`).join("");
}

function addCustomTrackRow() {
  const name = document.querySelector("#new-taxonomy-name")?.value.trim();
  const productArea = document.querySelector("#new-taxonomy-area")?.value || "CBI";
  const segment = document.querySelector("#new-taxonomy-segment")?.value || (state.config.segmentsByArea[productArea] || [])[0] || "";
  if (!name) return;
  const list = document.querySelector(".taxonomy-edit-list");
  if (!list) return;
  const order = list.querySelectorAll("[data-custom-track-row]").length;
  list.insertAdjacentHTML("beforeend", renderCustomTrackRow({ productArea, segment, name, order, archived: false }));
  document.querySelector("#new-taxonomy-name").value = "";
}

function parseCustomTrackRows() {
  return [...document.querySelectorAll("[data-custom-track-row]")].map((row, index) => ({
    id: row.dataset.id || "",
    productArea: row.querySelector("select[name='productArea']")?.value || "",
    segment: row.querySelector("select[name='segment']")?.value || "",
    name: row.querySelector("input[name='name']")?.value.trim() || "",
    order: Number(row.querySelector("input[name='order']")?.value || index),
    archived: row.querySelector("input[name='archived']")?.checked || false,
  })).filter((track) => track.productArea && track.segment && track.name);
}

function renderTaxonomyArea(area) {
  return html`
    <article class="taxonomy-area">
      <h3>${escapeHtml(area)}</h3>
      ${(state.config.segmentsByArea[area] || []).map((segment) => html`
        <div class="taxonomy-segment">
          <strong>${escapeHtml(segment)}</strong>
          <div class="pill-list">${(state.config.tracksByAreaSegment[`${area}::${segment}`] || []).map((track) => `<span>${escapeHtml(track)}</span>`).join("")}</div>
        </div>
      `).join("")}
    </article>
  `;
}

function renderManagementNotes() {
  return html`
    <section class="management-block">
      <h2>Archive Folder</h2>
      <p class="muted">Archived records are hidden from the default dashboard and kept in a searchable folder. Records are never physically deleted by archive.</p>
      <div class="row"><button class="secondary" id="management-show-archived">Open Archive Folder</button></div>
    </section>
  `;
}

function renderPmAccountsForm() {
  return html`
    <form id="pm-accounts-form" class="grid">
      <div>
        <h2>PM Account Mapping</h2>
        <p class="muted">PM Team logs in with account id plus passcode. Product Lead can add PM accounts such as pm01 and QA accounts such as qa01.</p>
      </div>
      <div class="account-map">
        ${state.config.pmAccounts.map((account) => renderPmAccountRow(account)).join("")}
      </div>
      <div class="row"><button type="button" class="secondary" id="add-pm-account">Add PM Account</button><button type="button" class="secondary" id="add-qa-account">Add QA Account</button><button type="submit">Save Mapping</button></div>
      <div class="error" id="form-error"></div>
    </form>
  `;
}

function nextAccountId(prefix = "pm") {
  const numbers = state.config.pmAccounts
    .map((account) => String(account.accountId || "").match(new RegExp(`^${prefix}(\\d+)$`, "i"))?.[1])
    .filter(Boolean)
    .map(Number);
  const next = Math.max(0, ...numbers) + 1;
  return `${prefix}${String(next).padStart(2, "0")}`;
}

function renderPmAccountRow(account) {
  return html`
    <div class="account-row" data-account-row="${escapeHtml(account.accountId)}">
      <label>Account ID <input name="accountId" value="${escapeHtml(account.accountId)}" pattern="(pm|qa)\\d+" required /></label>
      <label>PM Name <input name="pmProfile" value="${escapeHtml(account.pmProfile)}" required /></label>
      <label class="checkline"><input type="checkbox" name="active" ${account.active ? "checked" : ""} /> Active</label>
      <button type="button" class="danger account-delete" data-remove-account>Delete</button>
    </div>
  `;
}

function readPmAccountRowsFromDom() {
  const form = document.querySelector("#pm-accounts-form");
  if (!form) return state.config.pmAccounts || [];
  return [...form.querySelectorAll("[data-account-row]")].map((row) => ({
    accountId: row.querySelector("[name='accountId']")?.value || "",
    pmProfile: row.querySelector("[name='pmProfile']")?.value || "",
    active: row.querySelector("[name='active']")?.checked || false,
  }));
}

function renderItemForm(item) {
  const isEdit = Boolean(item);
  const productArea = item?.productArea || state.config.productAreas[0];
  const segment = item?.segment || state.config.segmentsByArea[productArea][0];
  const track = item?.track || state.config.tracksByAreaSegment[`${productArea}::${segment}`][0];
  const ownerDefault = item?.owner || state.selectedPmProfile || ownerProfiles()[0];
  const currentProductWorkstream = deriveProductWorkstream(item);
  const productWorkstreams = productWorkstreamOptions(productArea, segment, item);
  return html`
    <div class="modal">
      <section class="modal-panel">
        <div class="modal-head">
          <div><h2>${isEdit ? "Edit Update Item" : "Create New Update Item"}</h2><p class="muted">Create an update item under an existing Product / Workstream, or define a new Product / Workstream.</p></div>
          <button class="secondary" data-close>Close</button>
        </div>
        <form id="item-form" class="grid form-grid">
          <div class="form-section-title full">1. Classification</div>
          <label>Product Area <select name="productArea" required>${state.config.productAreas.map((area) => `<option ${area === productArea ? "selected" : ""}>${escapeHtml(area)}</option>`).join("")}</select></label>
          <label>Segment <select name="segment" required></select></label>
          <label>Track / Category <select name="track" required></select></label>
          <div class="track-add-control">
            <input id="new-track-input" placeholder="New category name" />
            <button type="button" class="secondary" id="add-track-category">+ Add category</button>
          </div>
          <div class="form-section-title full">2. Product / Workstream</div>
          <label class="full">Select existing Product / Workstream
            <select name="existingProductWorkstream">
              <option value="">Select existing Product / Workstream</option>
              ${productWorkstreams.map((name) => `<option value="${escapeHtml(name)}" ${name === currentProductWorkstream ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}
            </select>
          </label>
          <div class="form-or full">or</div>
          <label class="full">Create new Product / Workstream <input name="newProductWorkstream" placeholder="e.g. Polaris" value="${productWorkstreams.includes(currentProductWorkstream) ? "" : escapeHtml(currentProductWorkstream)}" /></label>
          <input type="hidden" name="productWorkstream" value="${escapeHtml(currentProductWorkstream)}" />

          <div class="form-section-title full">3. Update Item Details</div>
          <label class="full">Update Item Title <input name="title" required placeholder="e.g. Polaris — BAF Access Preparation" value="${escapeHtml(item?.title || "")}" /></label>
          <label class="full">Description <span class="optional-label">Optional</span><textarea name="description" placeholder="Background/context">${escapeHtml(item?.description || "")}</textarea></label>
          <label>Owner <select name="owner" required>${ownerProfiles().map((name) => `<option ${name === ownerDefault ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select></label>
          <label>Status <select name="status" required>${state.config.statuses.map((status) => `<option ${status === (item?.status || "Backlog") ? "selected" : ""}>${escapeHtml(status)}</option>`).join("")}</select></label>
          <label>Target Completion Date <input name="targetCompletionDate" type="date" required value="${escapeHtml(item?.targetCompletionDate || "")}" /></label>
          <label class="checkline full qa-toggle"><input name="isQaIssue" type="checkbox" ${item?.isQaIssue ? "checked" : ""} /> QA issue</label>
          <label class="full blocker-field" id="item-blocker-field" ${needsBlockerDelay(item?.status) ? "" : "hidden"}>Blocker / Delay <textarea name="blockerRisk" placeholder="Required when status is Blocked or Delay">${escapeHtml(item?.blockerRisk || "")}</textarea></label>
          <label class="full">Related Links <span class="optional-label">Optional</span><textarea name="relatedLinks" placeholder="Label | https://example.com">${escapeHtml(linkLines(item?.relatedLinks || []))}</textarea></label>
          <label class="full">Sub-tasks <span class="optional-label">Optional</span><textarea name="subTasks" placeholder="One sub-task per line">${escapeHtml(taskLines(item?.subTasks || []))}</textarea></label>
          ${item?.subTasks?.length ? `<div class="full subtask-form-panel"><span class="section-kicker">Current sub-task status</span>${renderSubTaskChecklist(item.subTasks || [])}</div>` : ""}
          <input type="hidden" name="allowNewTrack" value="" />
          <div class="full row">
            <button type="submit">${isEdit ? "Save Changes" : "Create Item"}</button>
            ${isEdit && canDeleteItem(item) ? `<button type="button" class="danger" data-delete-item-form="${escapeHtml(item.id)}">Delete Item</button>` : ""}
          </div>
          <div class="error full" id="form-error"></div>
        </form>
      </section>
    </div>
  `;
}

function renderWeeklyForm(itemId, entry = null) {
  const items = allWeeklyItems();
  const isEdit = Boolean(entry);
  const directItem = Boolean(state.modal?.direct || isEdit);
  const selectedItem = items.find((item) => item.id === itemId) || (directItem ? items[0] : null);
  const workstreams = workstreamsForItem(selectedItem, entry);
  const selectedWorkstream = workstreams.find((workstream) => workstream.id === entry?.workstreamId || workstream.title === entry?.workstreamTitle) || workstreams[0];
  const selection = weeklySelectionOptions({ item: selectedItem, allowBlank: !directItem });
  return html`
    <div class="modal">
      <section class="modal-panel">
        <div class="modal-head">
          <div><h2>${isEdit ? "Edit Weekly Update" : "Add Weekly Update"}</h2><p class="muted">${isEdit ? "Only this timeline entry will be updated." : "Add this week’s progress to an existing Update Item."}</p></div>
          <button class="secondary" data-close>Close</button>
        </div>
        <form id="weekly-form" class="grid form-grid">
          ${directItem
            ? `<input type="hidden" name="itemId" value="${escapeHtml(selectedItem?.id || "")}" />`
            : html`
                <div class="form-section-title full">1. Select Existing Item</div>
                <label>Product Area <select name="weeklyProductArea" required><option value="">Select Product Area</option>${selection.productAreas.map((area) => `<option value="${escapeHtml(area)}" ${area === selection.productArea ? "selected" : ""}>${escapeHtml(area)}</option>`).join("")}</select></label>
                <label>Segment <select name="weeklySegment" required><option value="">Select Segment</option>${selection.segments.map((segment) => `<option value="${escapeHtml(segment)}" ${segment === selection.segment ? "selected" : ""}>${escapeHtml(segment)}</option>`).join("")}</select></label>
                <label>Track / Category <select name="weeklyTrack" required><option value="">Select Track / Category</option>${selection.tracks.map((track) => `<option value="${escapeHtml(track)}" ${track === selection.track ? "selected" : ""}>${escapeHtml(track)}</option>`).join("")}</select></label>
                <label>Product / Workstream <select name="weeklyProductWorkstream" required><option value="">Select Product / Workstream</option>${selection.productWorkstreams.map((name) => `<option value="${escapeHtml(name)}" ${name === selection.productWorkstream ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select></label>
                <label class="full">Update Item <select name="itemId" required><option value="">Select Update Item</option>${selection.updateItems.map((item) => `<option value="${item.id}" ${item.id === selectedItem?.id ? "selected" : ""}>${escapeHtml(item.title)}</option>`).join("")}</select></label>
              `}
          <div class="weekly-item-info full" id="weekly-item-info">${renderWeeklyItemInfo(selectedItem)}</div>
          <input type="hidden" name="workstreamTitle" value="${escapeHtml(selectedWorkstream?.title || DEFAULT_WORKSTREAM_TITLE)}" />
          <input type="hidden" name="workstreamId" value="${escapeHtml(selectedWorkstream?.id || "")}" />
          <div class="form-section-title full">${directItem ? "1" : "2"}. Previous Update Reference</div>
          <div class="reference full" id="previous-reference">${selectedItem ? "Loading previous update reference..." : "Select an Update Item to view previous update reference."}</div>
          <div class="form-section-title full">${directItem ? "2" : "3"}. Weekly Update</div>
          <label>Reporting week <input name="reportingWeek" required pattern="\\d{4}-\\d{2}" value="${escapeHtml(entry?.reportingWeek || state.selectedWeek || state.config.currentReportingWeek)}" /></label>
          <label>Status at update time <select name="status" required>${state.config.statuses.map((status) => `<option ${status === (entry?.status || selectedItem?.status || "Backlog") ? "selected" : ""}>${escapeHtml(status)}</option>`).join("")}</select></label>
          <label class="full">Progress this week <span class="optional-label">Optional</span><textarea name="progress">${escapeHtml(entry?.progress || "")}</textarea></label>
          <label class="full">Next step <span class="optional-label">Optional</span><textarea name="nextStep">${escapeHtml(entry?.nextStep || "")}</textarea></label>
          <label class="full blocker-field" id="weekly-blocker-field" ${needsBlockerDelay(entry?.status || selectedItem?.status) ? "" : "hidden"}>Blocker / Delay <textarea name="blockerRisk">${escapeHtml(entry?.blockerRisk || "")}</textarea></label>
          <label class="full">Related links <span class="optional-label">Optional</span><textarea name="relatedLinks" placeholder="Label | https://example.com">${escapeHtml(linkLines(entry?.relatedLinks || []))}</textarea></label>
          <div class="full row"><button type="submit" ${selectedItem ? "" : "disabled"}>${isEdit ? "Save Weekly Update" : "Submit Weekly Update"}</button></div>
          <div class="error full" id="form-error"></div>
        </form>
      </section>
    </div>
  `;
}

function renderDetail() {
  const item = state.detail;
  return html`
    <div class="modal">
      <section class="modal-panel">
        <div class="modal-head">
          <div><h2>${escapeHtml(item.title)}</h2><p class="muted">${escapeHtml(item.productArea)} · ${escapeHtml(item.segment)} · ${escapeHtml(item.track)}</p></div>
          <button class="secondary" data-close>Close</button>
        </div>
        <div class="grid">
          <div class="meta">
            <div><span>Owner</span>${escapeHtml(item.owner)}</div>
            <div><span>Status</span><span class="badge ${statusClass(item.status)}">${escapeHtml(item.status)}</span></div>
            <div><span>Lifecycle</span>${escapeHtml(item.lifecycleState || lifecycleState(item))}</div>
            <div><span>QA issue</span>${item.isQaIssue ? "Yes" : "No"}</div>
            <div><span>Target completion</span>${escapeHtml(item.targetCompletionDate)}</div>
            <div><span>Created</span>${escapeHtml(item.createdBy || "-")} · ${formatDateTime(item.createdAt)}</div>
            <div><span>Last updated</span>${escapeHtml(item.lastUpdatedBy)} · ${formatDateTime(item.lastUpdatedAt)}</div>
            ${item.doneWeek ? `<div><span>Done</span>${escapeHtml(item.doneWeek)} · ${escapeHtml(item.doneDate || "-")}</div>` : ""}
            ${item.archived ? `<div><span>Archived reason</span>${escapeHtml(item.archivedReason || "-")}</div>` : ""}
          </div>
          <p>${escapeHtml(item.description)}</p>
          <section class="detail-block">
            <h3>Related Links</h3>
            ${renderLinks(item.relatedLinks)}
          </section>
          <section class="detail-block">
            <h3>Workstreams</h3>
            ${renderWorkstreams(item.workstreams || [])}
          </section>
          <section class="detail-block">
            <h3>Sub-tasks</h3>
            ${renderSubTaskChecklist(item.subTasks || [], { disabled: true })}
          </section>
          <div class="row">${canEdit() ? `<button data-weekly="${item.id}">Add Update</button>` : ""}${canArchive() && !item.archived ? `<button class="danger" id="archive-item">Archive</button>` : ""}${canAdmin() ? `<button class="danger" id="delete-item">Delete Update Item</button>` : ""}</div>
          ${state.archivePrompt ? html`
            <form id="archive-form" class="archive-form">
              <label class="full">Archive reason <textarea name="archivedReason" required placeholder="Why should this item be hidden from the default dashboard?"></textarea></label>
              <div class="row">
                <button class="danger" type="submit">Confirm Archive</button>
                <button class="secondary" type="button" id="cancel-archive">Cancel</button>
              </div>
            </form>
          ` : ""}
          <h3 class="timeline-title">Timeline</h3>
          <div class="timeline">
            ${item.weeklyUpdates.length ? item.weeklyUpdates.map(renderTimelineEntry).join("") : `<div class="empty">No weekly updates yet.</div>`}
          </div>
          <div class="error" id="form-error"></div>
        </div>
      </section>
    </div>
  `;
}

function renderTimelineEntry(entry) {
  return html`
    <article class="timeline-entry">
      <div class="timeline-marker" aria-hidden="true"></div>
      <div class="timeline-entry-body">
        <header>
          <div>
            <span>${escapeHtml(entry.reportingWeek)}</span>
            <strong>${escapeHtml(workstreamLabel(entry.workstreamTitle || DEFAULT_WORKSTREAM_TITLE))}</strong>
          </div>
          <span class="badge ${statusClass(entry.status)}">${escapeHtml(entry.status)}</span>
        </header>
        <div class="timeline-meta-line">
          <span>Submitted ${formatDateTime(entry.submittedAt)} by ${escapeHtml(entry.submittedBy)}</span>
          <span>Updated ${formatDateTime(entry.lastUpdatedAt)} by ${escapeHtml(entry.lastUpdatedBy)}</span>
        </div>
        <div class="timeline-copy-grid">
          <div>
            <span>Progress this week</span>
            <p>${escapeHtml(cleanProgress(entry))}</p>
          </div>
          <div>
            <span>Next step</span>
            <p>${escapeHtml(entry.nextStep || "-")}</p>
          </div>
          ${hasMeaningfulBlocker(entry.blockerRisk) ? `<div class="timeline-risk"><span>Blocker / Delay</span><p>${escapeHtml(entry.blockerRisk)}</p></div>` : ""}
        </div>
        <div class="timeline-links"><strong>Related links</strong>${renderLinks(entry.relatedLinks)}</div>
        ${canEdit() ? `<div class="row"><button class="secondary" data-edit-weekly="${entry.id}">Edit Entry</button></div>` : ""}
      </div>
    </article>
  `;
}

function renderLinks(links = []) {
  if (!links.length) return `<p class="muted">No related links.</p>`;
  return html`<div class="link-list">${links.map((link) => `<a href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">${escapeHtml(link.label || link.url)}</a>`).join("")}</div>`;
}

function renderWorkstreams(workstreams = []) {
  const meaningfulWorkstreams = workstreams
    .map((workstream) => ({ ...workstream, title: workstreamLabel(workstream.title || workstream) }))
    .filter((workstream) => workstream.title && !isPlaceholderWorkstream(workstream.title));
  if (!meaningfulWorkstreams.length) return `<p class="muted">No workstreams.</p>`;
  return html`<div class="task-list workstream-list">${meaningfulWorkstreams.map((workstream) => `<span class="${workstream.done ? "is-done" : "is-active"}">${workstream.done ? "Done" : "In progress"} · ${escapeHtml(workstream.title)}</span>`).join("")}</div>`;
}

document.addEventListener("click", async (event) => {
  if (event.target.matches("#add-capacity-row")) {
    document.querySelector(".capacity-edit-list")?.insertAdjacentHTML("beforeend", renderCapacityInputRow({
      status: "Active",
      q1: "",
      q1Total: 64,
      q2: "",
      q2Total: 65,
      q3: "",
      q3Total: 66,
      q4: "",
      q4Total: 66,
    }));
  }
  if (event.target.matches("[data-close]")) {
    state.modal = null;
    state.detail = null;
    state.archivePrompt = false;
    render();
  }
  if (event.target.matches("#archive-item")) {
    state.archivePrompt = true;
    render();
  }
  if (event.target.matches("#cancel-archive")) {
    state.archivePrompt = false;
    render();
  }
  if (event.target.matches("#delete-item")) {
    if (!window.confirm("Delete this Update Item and all of its weekly timeline entries?")) return;
    try {
      await api(`/api/items/${state.detail.id}`, { method: "DELETE" });
      state.modal = null;
      state.detail = null;
      await loadDashboard();
      render();
    } catch (error) {
      document.querySelector("#form-error").textContent = error.message;
    }
  }
  if (event.target.matches("[data-delete-item-form]")) {
    if (!window.confirm("Delete this Update Item and all of its weekly timeline entries?")) return;
    try {
      await api(`/api/items/${event.target.dataset.deleteItemForm}`, { method: "DELETE" });
      state.modal = null;
      state.detail = null;
      await loadDashboard();
      render();
    } catch (error) {
      document.querySelector("#form-error").textContent = error.message;
    }
  }
  if (event.target.matches("[data-delete-update]")) {
    if (!window.confirm("Delete this Update Item and all of its weekly timeline entries?")) return;
    await api(`/api/items/${event.target.dataset.deleteUpdate}`, { method: "DELETE" });
    await loadDashboard();
    render();
  }
  if (event.target.matches("[data-edit-weekly]")) {
    const entry = state.detail?.weeklyUpdates.find((candidate) => candidate.id === event.target.dataset.editWeekly);
    if (!entry) return;
    state.modal = { type: "weekly", itemId: state.detail.id, entry };
    render();
    loadPreviousReference();
  }
  if (event.target.matches("[data-edit-announcement]")) {
    const announcement = (state.modules.announcements || []).find((item) => item.id === event.target.dataset.editAnnouncement);
    if (!announcement) return;
    state.modal = { type: "announcement", announcement };
    render();
  }
  if (event.target.matches("[data-delete-announcement]")) {
    if (!window.confirm("Delete this announcement?")) return;
    await api(`/api/announcements/${event.target.dataset.deleteAnnouncement}`, { method: "DELETE" });
    await loadModules();
    render();
  }
  if (event.target.matches("[data-edit-meeting]")) {
    const meeting = (state.modules.meetings || []).find((item) => item.id === event.target.dataset.editMeeting);
    if (!meeting) return;
    state.modal = { type: "meeting", meeting };
    render();
  }
  if (event.target.matches("[data-delete-meeting]")) {
    if (!window.confirm("Delete this meeting note?")) return;
    await api(`/api/meetings/${event.target.dataset.deleteMeeting}`, { method: "DELETE" });
    await loadModules();
    render();
  }
  if (event.target.matches("[data-delete-marketing]")) {
    if (!window.confirm("Delete this PMM asset?")) return;
    await api(`/api/marketing-assets/${event.target.dataset.deleteMarketing}`, { method: "DELETE" });
    await loadModules();
    render();
  }
  if (event.target.matches("[data-edit-marketing]")) {
    const asset = (state.modules.marketing || []).find((item) => item.id === event.target.dataset.editMarketing);
    if (!asset) return;
    state.modal = { type: "marketing", asset };
    render();
  }
  if (event.target.matches("#add-custom-track")) {
    addCustomTrackRow();
  }
  if (event.target.matches("[data-remove-custom-track]")) {
    event.target.closest("[data-custom-track-row]")?.remove();
  }
});

document.addEventListener("change", (event) => {
  if (event.target.matches("select[name='productArea']")) updateDependentSelects();
  if (event.target.matches("select[name='segment']")) updateTrackSelect();
  if (event.target.matches("#new-taxonomy-area")) updateNewTaxonomySegment();
  if (event.target.matches("[data-custom-track-row] select[name='productArea']")) updateCustomTrackRowSegments(event.target.closest("[data-custom-track-row]"));
  if (event.target.matches("#item-form select[name='track']")) updateProductWorkstreamSelect();
  if (event.target.matches("#item-form select[name='existingProductWorkstream']")) syncProductWorkstreamField();
  if (event.target.matches("#item-form select[name='status']")) handleItemStatusChange(event.target);
  if (event.target.matches("#weekly-form select[name='status']")) handleWeeklyStatusChange(event.target);
  if (event.target.matches("#weekly-form select[name='weeklyProductArea'], #weekly-form select[name='weeklySegment'], #weekly-form select[name='weeklyTrack'], #weekly-form select[name='weeklyProductWorkstream']")) updateWeeklyHierarchySelects(event.target.name);
  if (event.target.matches("#weekly-form select[name='itemId']")) updateWeeklySelectedItem();
  if (event.target.matches("#weekly-form select[name='itemId'], #weekly-form input[name='reportingWeek']")) loadPreviousReference();
});

document.addEventListener("input", (event) => {
  if (event.target.matches("#item-form input[name='newProductWorkstream']")) syncProductWorkstreamField();
});

document.addEventListener("submit", async (event) => {
  if (event.target.matches("#taxonomy-form")) {
    event.preventDefault();
    try {
      const data = await api("/api/taxonomy/tracks", {
        method: "PUT",
        body: JSON.stringify({ customTracks: parseCustomTrackRows() }),
      });
      state.config.customTracks = data.customTracks;
      state.config.tracksByAreaSegment = data.tracksByAreaSegment;
      render();
    } catch (error) {
      document.querySelector("#form-error").textContent = error.message;
    }
  }
  if (event.target.matches("#archive-form")) {
    event.preventDefault();
    const form = event.target;
    const archivedReason = form.archivedReason.value.trim();
    if (!archivedReason) {
      document.querySelector("#form-error").textContent = "Archive reason is required.";
      return;
    }
    try {
      await api(`/api/items/${state.detail.id}/archive`, { method: "POST", body: JSON.stringify({ archivedReason }) });
      state.modal = null;
      state.detail = null;
      state.archivePrompt = false;
      await loadDashboard();
      render();
    } catch (error) {
      document.querySelector("#form-error").textContent = error.message;
    }
  }
  if (event.target.matches("#item-form")) {
    event.preventDefault();
    const form = event.target;
    syncProductWorkstreamField();
    if (!form.productWorkstream.value.trim()) {
      document.querySelector("#form-error").textContent = "Product / Workstream is required.";
      return;
    }
    if (needsBlockerDelay(form.status.value) && !form.blockerRisk.value.trim()) {
      document.querySelector("#form-error").textContent = "Blocker / Delay is required when status is Blocked or Delay.";
      return;
    }
    const payload = Object.fromEntries(new FormData(event.target));
    payload.productWorkstream = payload.newProductWorkstream?.trim() || payload.existingProductWorkstream?.trim() || payload.productWorkstream?.trim();
    payload.isQaIssue = form.isQaIssue?.checked || false;
    payload.subTaskStates = subTaskStatePayload(form);
    const itemId = state.modal.item?.id;
    try {
      setFormBusy(form, true);
      await api(itemId ? `/api/items/${itemId}` : "/api/items", {
        method: itemId ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      state.modal = null;
      await loadDashboard({ includeModules: false });
      render();
    } catch (error) {
      document.querySelector("#form-error").textContent = error.message;
    } finally {
      setFormBusy(form, false);
    }
  }
  if (event.target.matches("#weekly-form")) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.target));
    const entryId = state.modal.entry?.id;
    payload.subTaskStates = subTaskStatePayload(event.target);
    if (needsBlockerDelay(payload.status) && !String(payload.blockerRisk || "").trim()) {
      document.querySelector("#form-error").textContent = "Blocker / Delay is required when status is Blocked or Delay.";
      return;
    }
    try {
      setFormBusy(event.target, true);
      await api(entryId ? `/api/weekly-updates/${entryId}` : "/api/weekly-updates", {
        method: entryId ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      if (state.detail) state.detail = await api(`/api/items/${payload.itemId}`);
      state.modal = state.detail ? { type: "detail" } : null;
      await loadDashboard({ includeModules: false });
      render();
    } catch (error) {
      document.querySelector("#form-error").textContent = error.message;
    } finally {
      setFormBusy(event.target, false);
    }
  }
  if (event.target.matches("#pm-accounts-form")) {
    event.preventDefault();
    const form = event.target;
    const pmAccounts = readPmAccountRowsFromDom();
    try {
      const data = await api("/api/pm-accounts", {
        method: "PUT",
        body: JSON.stringify({ pmAccounts }),
      });
      state.config.pmAccounts = data.pmAccounts;
      state.config.pmProfiles = ownerProfiles();
      state.modal = null;
      render();
    } catch (error) {
      document.querySelector("#form-error").textContent = error.message;
    }
  }
  if (event.target.matches("#marketing-form")) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.target));
    payload.archived = event.target.archived?.checked || payload.status === "Archived";
    const assetId = state.modal?.asset?.id;
    await api(assetId ? `/api/marketing-assets/${assetId}` : "/api/marketing-assets", {
      method: assetId ? "PUT" : "POST",
      body: JSON.stringify(payload),
    });
    state.modal = null;
    await loadModules();
    if (state.view === "productMarketing") renderProductMarketing();
    else render();
  }
  if (event.target.matches("#meeting-form")) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.target));
    const meetingId = state.modal?.meeting?.id;
    await api(meetingId ? `/api/meetings/${meetingId}` : "/api/meetings", {
      method: meetingId ? "PUT" : "POST",
      body: JSON.stringify(payload),
    });
    state.modal = null;
    await loadModules();
    renderMeetings();
  }
  if (event.target.matches("#announcement-form")) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.target));
    const announcementId = state.modal?.announcement?.id;
    payload.archived = announcementId ? event.target.archived?.checked || false : false;
    await api(announcementId ? `/api/announcements/${announcementId}` : "/api/announcements", {
      method: announcementId ? "PUT" : "POST",
      body: JSON.stringify(payload),
    });
    state.modal = null;
    await loadModules();
    render();
  }
  if (event.target.matches("#passcode-form")) {
    event.preventDefault();
    try {
      const data = await api("/api/passcodes", {
        method: "PUT",
        body: JSON.stringify({ passcodes: Object.fromEntries(new FormData(event.target)) }),
      });
      state.config.passcodes = data.passcodes;
      render();
    } catch (error) {
      document.querySelector("#form-error").textContent = error.message;
    }
  }
  if (event.target.matches("#capacity-form")) {
    event.preventDefault();
    const form = event.target;
    try {
      const data = await api("/api/capacity", {
        method: "PUT",
        body: JSON.stringify({
          metricDefinition: state.modules.capacity?.metricDefinition || "PM Timesheet.",
          summary: parseCapacitySummaryForm(form),
          records: parseCapacityFormRows(form),
        }),
      });
      state.modules.capacity = data.capacity;
      state.modal = null;
      render();
    } catch (error) {
      document.querySelector("#form-error").textContent = error.message;
    }
  }
});

document.addEventListener("click", (event) => {
  if (event.target.matches("[data-edit]")) {
    event.preventDefault();
    api(`/api/items/${event.target.dataset.edit}`).then((item) => {
      state.modal = { type: "item", item };
      render();
    });
  }
  if (event.target.matches("#add-pm-account")) {
    state.config.pmAccounts = readPmAccountRowsFromDom();
    state.config.pmAccounts = [
      ...state.config.pmAccounts,
      { accountId: nextAccountId("pm"), pmProfile: "", active: true },
    ];
    render();
  }
  if (event.target.matches("#add-qa-account")) {
    state.config.pmAccounts = readPmAccountRowsFromDom();
    state.config.pmAccounts = [
      ...state.config.pmAccounts,
      { accountId: nextAccountId("qa"), pmProfile: "", active: true },
    ];
    render();
  }
  if (event.target.matches("[data-remove-account]")) {
    const row = event.target.closest("[data-account-row]");
    const accountId = row?.querySelector("[name='accountId']")?.value || "this account";
    if (!row || !window.confirm(`Remove ${accountId} from PM Account Mapping? Existing updates will remain unchanged.`)) return;
    row.remove();
    state.config.pmAccounts = readPmAccountRowsFromDom();
  }
  if (event.target.matches("#add-track-category")) {
    addTrackCategoryToForm();
  }
});

function handleItemStatusChange(select) {
  const form = document.querySelector("#item-form");
  const blockerField = document.querySelector("#item-blocker-field");
  if (!form || !blockerField) return;
  blockerField.hidden = !needsBlockerDelay(select.value);
}

function handleWeeklyStatusChange(select) {
  const blockerField = document.querySelector("#weekly-blocker-field");
  if (!blockerField) return;
  blockerField.hidden = !needsBlockerDelay(select.value);
}

function addTrackCategoryToForm() {
  const form = document.querySelector("#item-form");
  const input = document.querySelector("#new-track-input");
  if (!form || !input) return;
  const value = input.value.trim();
  if (!value) return;
  const exists = [...form.track.options].some((option) => option.value.toLowerCase() === value.toLowerCase());
  if (!exists) form.track.add(new Option(value, value));
  form.track.value = value;
  form.allowNewTrack.value = value;
  input.value = "";
}

function updateWeeklyHierarchySelects(changedName = "") {
  const form = document.querySelector("#weekly-form");
  if (!form) return;
  const selection = weeklySelectionOptions({
    productArea: form.weeklyProductArea?.value,
    segment: changedName === "weeklyProductArea" ? "" : form.weeklySegment?.value,
    track: ["weeklyProductArea", "weeklySegment"].includes(changedName) ? "" : form.weeklyTrack?.value,
    productWorkstream: ["weeklyProductArea", "weeklySegment"].includes(changedName) ? "" : form.weeklyProductWorkstream?.value,
    allowBlank: true,
  });
  form.weeklySegment.innerHTML = [`<option value="">Select Segment</option>`, ...selection.segments.map((segment) => `<option value="${escapeHtml(segment)}" ${segment === selection.segment ? "selected" : ""}>${escapeHtml(segment)}</option>`)].join("");
  form.weeklyTrack.innerHTML = [`<option value="">Select Track / Category</option>`, ...selection.tracks.map((track) => `<option value="${escapeHtml(track)}" ${track === selection.track ? "selected" : ""}>${escapeHtml(track)}</option>`)].join("");
  form.weeklyProductWorkstream.innerHTML = [`<option value="">Select Product / Workstream</option>`, ...selection.productWorkstreams.map((name) => `<option value="${escapeHtml(name)}" ${name === selection.productWorkstream ? "selected" : ""}>${escapeHtml(name)}</option>`)].join("");
  form.itemId.innerHTML = [`<option value="">Select Update Item</option>`, ...selection.updateItems.map((item) => `<option value="${item.id}">${escapeHtml(item.title)}</option>`)].join("");
  updateWeeklySelectedItem();
}

function updateWeeklySelectedItem() {
  const form = document.querySelector("#weekly-form");
  if (!form) return;
  const item = allWeeklyItems().find((candidate) => candidate.id === form.itemId.value);
  const workstream = workstreamsForItem(item)[0];
  form.workstreamId.value = workstream?.id || "";
  form.workstreamTitle.value = workstream?.title || DEFAULT_WORKSTREAM_TITLE;
  const info = document.querySelector("#weekly-item-info");
  if (info) info.innerHTML = renderWeeklyItemInfo(item);
  const submit = form.querySelector("button[type='submit']");
  if (submit) submit.disabled = !item;
  loadPreviousReference();
}

function updateDependentSelects() {
  const form = document.querySelector("#item-form");
  if (!form) return;
  form.allowNewTrack.value = "";
  const area = form.productArea.value;
  const segmentSelect = form.segment;
  segmentSelect.innerHTML = state.config.segmentsByArea[area].map((segment) => `<option>${escapeHtml(segment)}</option>`).join("");
  updateTrackSelect();
}

function updateTrackSelect() {
  const form = document.querySelector("#item-form");
  if (!form) return;
  form.allowNewTrack.value = "";
  const key = `${form.productArea.value}::${form.segment.value}`;
  const itemTrack = state.modal?.item?.track;
  const tracks = [...new Set([...(state.config.tracksByAreaSegment[key] || []), itemTrack].filter(Boolean))];
  form.track.innerHTML = tracks.map((track) => `<option>${escapeHtml(track)}</option>`).join("");
  updateProductWorkstreamSelect();
}

function updateProductWorkstreamSelect() {
  const form = document.querySelector("#item-form");
  if (!form?.existingProductWorkstream) return;
  const item = state.modal?.item;
  const current = form.productWorkstream.value || deriveProductWorkstream(item);
  const options = productWorkstreamOptions(form.productArea.value, form.segment.value, item);
  form.existingProductWorkstream.innerHTML = [
    `<option value="">Select existing Product / Workstream</option>`,
    ...options.map((name) => `<option value="${escapeHtml(name)}" ${name === current ? "selected" : ""}>${escapeHtml(name)}</option>`),
  ].join("");
  if (options.includes(current)) form.newProductWorkstream.value = "";
  syncProductWorkstreamField();
}

function syncProductWorkstreamField() {
  const form = document.querySelector("#item-form");
  if (!form?.productWorkstream) return;
  const created = form.newProductWorkstream?.value.trim();
  form.productWorkstream.value = created || form.existingProductWorkstream?.value || "";
  applyMatchedOwnerDefault();
}

function applyMatchedOwnerDefault() {
  const form = document.querySelector("#item-form");
  if (!form?.owner || !form.productWorkstream?.value) return;
  const matchedOwner = matchingProductWorkstreamOwner(form.productArea.value, form.segment.value, form.productWorkstream.value);
  if (matchedOwner && [...form.owner.options].some((option) => option.value === matchedOwner)) form.owner.value = matchedOwner;
}

async function loadPreviousReference() {
  const form = document.querySelector("#weekly-form");
  const box = document.querySelector("#previous-reference");
  if (!form || !box) return;
  if (!form.itemId.value) {
    box.textContent = "Select an Update Item to view previous update reference.";
    return;
  }
  box.textContent = "Loading previous update reference...";
  try {
    const params = new URLSearchParams({ week: form.reportingWeek.value });
    if (state.modal?.entry?.id) params.set("excludeEntryId", state.modal.entry.id);
    const data = await api(`/api/items/${form.itemId.value}/previous-update?${params.toString()}`);
    if (!data.previousUpdate) {
      box.textContent = "No previous update available.";
      return;
    }
    const previous = data.previousUpdate;
    box.innerHTML = html`
      <strong>Previous Update Reference (${escapeHtml(previous.reportingWeek)} · ${escapeHtml(workstreamLabel(previous.workstreamTitle || DEFAULT_WORKSTREAM_TITLE))})</strong>
      <p><strong>Progress:</strong> ${escapeHtml(previous.progress)}</p>
      <p><strong>Next step:</strong> ${escapeHtml(previous.nextStep || "-")}</p>
      ${hasMeaningfulBlocker(previous.blockerRisk) ? `<p><strong>Blocker / Delay:</strong> ${escapeHtml(previous.blockerRisk)}</p>` : ""}
    `;
  } catch (error) {
    box.textContent = error.message;
  }
}

function renderDemoShell(title, subtitle, content) {
  const liveIntelligence = state.view === "executionIntelligence" && state.demo.intelligenceMode === "live";
  app.innerHTML = html`
    <main class="demo-page">
      <div class="demo-safety-banner ${liveIntelligence ? "live" : ""}" role="status">
        <strong>${liveIntelligence ? "Read-only Mirror" : "Demo Mode"}</strong><span>${liveIntelligence ? "Live Board records are visible. Deterministic local analysis only; no external AI and no write-back." : "All displayed records are fictional. Do not enter confidential or production information."}</span>
      </div>
      <header class="demo-topbar">
        <div>
          <div class="demo-eyebrow">Product Intelligence Lab · Read-only mirror</div>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(subtitle)}</p>
        </div>
        <nav class="demo-nav" aria-label="Demo navigation">
          <button class="secondary" data-demo-page="dashboard">Board</button>
          <button class="secondary ${state.view === "smartCapture" ? "active" : ""}" data-demo-page="smartCapture">Smart Capture</button>
          <button class="secondary ${state.view === "executionIntelligence" ? "active" : ""}" data-demo-page="executionIntelligence">Control Room</button>
          <button class="secondary" data-demo-logout>Logout</button>
        </nav>
      </header>
      ${content}
    </main>`;
  bindDemoNavigation();
}

function bindDemoNavigation() {
  document.querySelectorAll("[data-demo-page]").forEach((button) => button.addEventListener("click", async () => {
    state.view = button.dataset.demoPage;
    if (state.view === "dashboard") await loadDashboard();
    render();
  }));
  document.querySelector("[data-demo-logout]")?.addEventListener("click", async () => {
    await api("/api/logout", { method: "POST" }).catch(() => {});
    localStorage.clear();
    Object.assign(state, { token: "", role: "", selectedPmProfile: "", view: "login", dashboard: null });
    render();
  });
}

function renderSmartCapture() {
  const demo = state.demo;
  const content = html`
    <section class="demo-workspace capture-workspace">
      <div class="demo-stepper" aria-label="Capture progress">
        ${[["input", "1", "Paste"], ["sanitize", "2", "Privacy scan"], ["review", "3", "Review draft"], ["done", "4", "Approve"]].map(([key, number, label]) => `<div class="${key === demo.captureStep ? "active" : ""} ${["sanitize", "review", "done"].indexOf(demo.captureStep) > ["sanitize", "review", "done"].indexOf(key) ? "complete" : ""}"><span>${number}</span>${label}</div>`).join("")}
      </div>
      ${demo.notice ? `<div class="demo-toast" role="status">${escapeHtml(demo.notice)}</div>` : ""}
      ${demo.captureStep === "input" ? renderCaptureInput() : demo.captureStep === "sanitize" ? renderPrivacyReview() : demo.captureStep === "review" ? renderCaptureReview() : renderCaptureComplete()}
    </section>`;
  renderDemoShell("AI Smart Capture", "Turn a fictional weekly message into reviewed, structured intelligence — without touching production data.", content);
  bindSmartCaptureEvents();
}

function renderCaptureInput() {
  return html`<div class="demo-two-column">
    <form class="demo-panel capture-form" id="demo-capture-form">
      <div class="demo-panel-heading"><div><span class="demo-kicker">Paste-only intake</span><h2>Source message</h2></div><span class="demo-badge neutral">Simulated AI</span></div>
      <div class="demo-form-grid">
        <label>Source title<input name="title" required value="Fictional Portfolio Weekly Review"></label>
        <label>Source date<input name="date" type="date" required value="2026-07-08"></label>
        <label>Source type<select name="type"><option>Weekly leadership update</option><option>Meeting notes</option><option>Planning review</option></select></label>
        <label>Fictional source ref (optional)<input name="sourceRef" placeholder="DEMO-W28"></label>
      </div>
      <label>Message<textarea name="message" id="demo-message" rows="14" placeholder="Paste fictional or sanitized text only…">${escapeHtml(state.demo.captureText)}</textarea></label>
      <div class="capture-tools"><button type="button" class="secondary" id="load-demo-message">Load fictional example</button><span id="capture-char-count">${state.demo.captureText.length} characters</span></div>
      <label class="demo-confirm"><input name="confirmed" type="checkbox"> I confirm this is fictional or fully sanitized and contains no confidential information.</label>
      <button type="submit" id="scan-message" disabled>Run local privacy scan</button>
    </form>
    <aside class="demo-panel demo-explainer">
      <span class="demo-kicker">Safety architecture</span><h2>What happens here</h2>
      <ol><li><strong>Local scan</strong><span>Detects links, contact details, mentions, credentials, identifiers and currency.</span></li><li><strong>Sanitized preview</strong><span>You see every replacement before analysis.</span></li><li><strong>Draft extraction</strong><span>Deterministic demo logic creates editable records.</span></li><li><strong>Human approval</strong><span>Nothing enters the demo workspace until reviewed.</span></li></ol>
      <div class="demo-guardrail"><strong>Original input lifecycle</strong><span>Held only in page memory; never logged, stored, or sent to an external model.</span></div>
    </aside>
  </div>`;
}

function renderPrivacyReview() {
  const scan = state.demo.privacy || { findings: [], sanitized: "" };
  return html`<section class="demo-panel privacy-review">
    <div class="demo-panel-heading"><div><span class="demo-kicker">Local privacy gate</span><h2>${scan.findings.length ? `${scan.findings.length} sensitive pattern types detected` : "No sensitive patterns detected"}</h2></div><span class="demo-badge ${scan.findings.length ? "warning" : "success"}">${scan.findings.length ? "Action required" : "Safe to continue"}</span></div>
    ${scan.findings.length ? `<div class="finding-list">${scan.findings.map((finding) => `<div><strong>${escapeHtml(finding.label)}</strong><span>${finding.count} replacement${finding.count > 1 ? "s" : ""}</span></div>`).join("")}</div>` : ""}
    <label>Sanitized preview<textarea id="sanitized-preview" rows="15">${escapeHtml(scan.sanitized)}</textarea></label>
    <p class="muted">Only the sanitized preview below will be used by the simulated extraction engine. The original is discarded when you continue.</p>
    <div class="demo-actions"><button class="secondary" id="cancel-scan">Cancel and clear</button><button id="continue-extraction">Use sanitized text</button></div>
  </section>`;
}

function captureTabData() {
  const extraction = state.demo.extraction || { records: [], risks: [], decisions: [], actions: [] };
  if (state.demo.reviewTab === "risks") return extraction.risks;
  if (state.demo.reviewTab === "decisions") return extraction.decisions;
  if (state.demo.reviewTab === "actions") return extraction.actions;
  return extraction.records;
}

function renderCaptureReview() {
  const extraction = state.demo.extraction || { records: [], risks: [], decisions: [], actions: [] };
  const tabs = [["updates", extraction.records.length], ["risks", extraction.risks.length], ["decisions", extraction.decisions.length], ["actions", extraction.actions.length]];
  const data = captureTabData();
  return html`<section class="demo-panel review-panel">
    <div class="demo-panel-heading"><div><span class="demo-kicker">Human-in-the-loop review</span><h2>Structured intelligence draft</h2></div><span class="demo-badge neutral">${extraction.records.filter((r) => r.approved).length} approved updates</span></div>
    <div class="review-tabs" role="tablist">${tabs.map(([tab, count]) => `<button class="secondary ${state.demo.reviewTab === tab ? "active" : ""}" data-review-tab="${tab}">${tab[0].toUpperCase() + tab.slice(1)} <span>${count}</span></button>`).join("")}</div>
    <div class="review-list">${data.length ? data.map((record) => state.demo.reviewTab === "updates" ? `<article class="review-record ${record.approved ? "approved" : "ignored"}"><label class="record-check"><input type="checkbox" data-approve-record="${record.id}" ${record.approved ? "checked" : ""}><span>Include</span></label><div><div class="record-title"><strong>${escapeHtml(record.product)}</strong><span class="status-pill ${statusClass(record.status)}">${escapeHtml(record.status)}</span><span class="confidence">${Math.round(record.confidence * 100)}% confidence</span></div><p>${escapeHtml(record.sourceExcerpt)}</p><div class="record-fields"><span>Owner <strong>${escapeHtml(record.owner)}</strong></span><span>Progress <strong>${record.progress ?? "Review"}${record.progress ? "%" : ""}</strong></span><span>Next <strong>${escapeHtml(record.nextStep || "Not detected")}</strong></span></div></div></article>` : `<article class="review-record compact"><div><strong>${escapeHtml(record.product)}</strong><p>${escapeHtml(record.text)}</p>${record.owner ? `<span class="confidence">Owner: ${escapeHtml(record.owner)}</span>` : ""}</div></article>`).join("") : `<div class="demo-empty">No ${escapeHtml(state.demo.reviewTab)} detected. This is a valid result, not an extraction failure.</div>`}</div>
    <div class="demo-actions"><button class="secondary" id="start-over-capture">Start over</button><button id="approve-demo-records" ${extraction.records.some((record) => record.approved) ? "" : "disabled"}>Approve selected drafts</button></div>
  </section>`;
}

function renderCaptureComplete() {
  const bundle = state.demo.importBundle || { records: [], risks: [], decisions: [], actions: [] };
  const matched = bundle.records.filter((record) => getDemoItems(4).some((item) => item.name === record.product)).length;
  return html`<section class="demo-panel import-summary-panel">
    <div class="import-summary-heading"><div class="complete-mark">✓</div><div><span class="demo-kicker">Import summary</span><h2>Approved intelligence is ready in the isolated Demo Workspace</h2><p>No production API or shared database was called.</p></div><span class="demo-badge success">Local only</span></div>
    <div class="import-stats"><div><strong>${bundle.records.length}</strong><span>Updates approved</span></div><div><strong>${bundle.risks.length}</strong><span>Risks created</span></div><div><strong>${bundle.decisions.length}</strong><span>Decisions required</span></div><div><strong>${bundle.actions.length}</strong><span>Actions assigned</span></div></div>
    <div class="match-summary"><span><strong>${matched}</strong> matched existing fictional workstreams</span><span><strong>${bundle.records.length - matched}</strong> require manual matching</span><span>Imported ${escapeHtml(formatDateTime(bundle.importedAt))}</span></div>
    <div class="import-preview">${bundle.records.map((record) => `<article><div><strong>${escapeHtml(record.product)}</strong><span class="status-pill ${statusClass(record.status)}">${escapeHtml(record.status)}</span></div><p>${escapeHtml(record.sourceExcerpt || record.nextStep || "Approved structured update")}</p><small>${record.progress == null ? "Metric requires review" : `${record.progress}% reported`} · ${escapeHtml(record.owner)}</small></article>`).join("")}</div>
    <div class="demo-actions"><button class="secondary" id="new-capture">Capture another message</button><button class="secondary" id="view-imported-records">Review imported records</button><button id="open-control-room">Compare before vs after</button></div>
  </section>`;
}

function bindSmartCaptureEvents() {
  const form = document.querySelector("#demo-capture-form");
  const textarea = document.querySelector("#demo-message");
  const confirmed = form?.elements.confirmed;
  const submit = document.querySelector("#scan-message");
  const sync = () => { if (submit) submit.disabled = !(confirmed?.checked && textarea?.value.trim()); document.querySelector("#capture-char-count") && (document.querySelector("#capture-char-count").textContent = `${textarea?.value.length || 0} characters`); };
  textarea?.addEventListener("input", sync); confirmed?.addEventListener("change", sync);
  document.querySelector("#load-demo-message")?.addEventListener("click", () => { textarea.value = SAMPLE_MESSAGE; state.demo.captureText = SAMPLE_MESSAGE; sync(); });
  form?.addEventListener("submit", (event) => { event.preventDefault(); state.demo.captureText = textarea.value; state.demo.privacy = scanDemoPrivacy(textarea.value); state.demo.captureStep = "sanitize"; render(); });
  document.querySelector("#cancel-scan")?.addEventListener("click", () => { Object.assign(state.demo, { captureText: "", privacy: null, captureStep: "input" }); render(); });
  document.querySelector("#continue-extraction")?.addEventListener("click", () => { const sanitized = document.querySelector("#sanitized-preview").value; state.demo.captureText = ""; state.demo.extraction = extractDemoUpdate(sanitized); state.demo.privacy.sanitized = ""; state.demo.captureStep = "review"; render(); });
  document.querySelectorAll("[data-review-tab]").forEach((button) => button.addEventListener("click", () => { state.demo.reviewTab = button.dataset.reviewTab; render(); }));
  document.querySelectorAll("[data-approve-record]").forEach((input) => input.addEventListener("change", () => { const record = state.demo.extraction.records.find((entry) => entry.id === input.dataset.approveRecord); if (record) record.approved = input.checked; render(); }));
  document.querySelector("#start-over-capture")?.addEventListener("click", resetDemoCapture);
  document.querySelector("#approve-demo-records")?.addEventListener("click", () => {
    const approvedIds = new Set(state.demo.extraction.records.filter((record) => record.approved).map((record) => record.id));
    const approvedProducts = new Set(state.demo.extraction.records.filter((record) => approvedIds.has(record.id)).map((record) => record.product));
    const bundle = {
      importedAt: new Date().toISOString(),
      records: state.demo.extraction.records.filter((record) => approvedIds.has(record.id)),
      risks: state.demo.extraction.risks.filter((record) => approvedProducts.has(record.product)),
      decisions: state.demo.extraction.decisions.filter((record) => approvedProducts.has(record.product)),
      actions: state.demo.extraction.actions.filter((record) => approvedProducts.has(record.product)),
    };
    state.demo.importBundle = bundle;
    localStorage.setItem("pib_fictional_demo_import", JSON.stringify(bundle));
    state.demo.captureStep = "done";
    render();
  });
  document.querySelector("#new-capture")?.addEventListener("click", resetDemoCapture);
  document.querySelector("#view-imported-records")?.addEventListener("click", () => { state.demo.captureStep = "review"; render(); });
  document.querySelector("#open-control-room")?.addEventListener("click", () => { state.demo.intelligenceMode = "fictional"; localStorage.setItem("pib_intelligence_mode", "fictional"); state.view = "executionIntelligence"; render(); });
}

function resetDemoCapture() { Object.assign(state.demo, { captureStep: "input", captureText: "", privacy: null, extraction: null, reviewTab: "updates", notice: "" }); render(); }

function filteredDemoItems(items) {
  const filter = state.demo.filter;
  if (!filter) return items;
  if (filter === "blocked") return items.filter((item) => item.status === "Blocked");
  if (filter === "stale") return items.filter((item) => item.fresh >= 7);
  if (filter === "low-completeness") return items.filter((item) => item.completeness < 75);
  if (filter === "repeat-risk") return items.filter((item) => item.riskCount >= 3);
  return items.filter((item) => item.area === filter || item.segment === filter || item.status === filter);
}

function daysSince(value) {
  if (!value) return 999;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 999;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 86400000));
}

function liveCompleteness(item) {
  const fields = [item.title, item.owner, item.status, item.productArea, item.segment, item.targetCompletionDate, item.description || item.currentStatus];
  return Math.round((fields.filter((value) => String(value || "").trim()).length / fields.length) * 100);
}

function getLiveIntelligenceItems() {
  return (state.dashboard?.items || []).filter((item) => !item.archived).map((item) => ({
    id: `live-${item.id}`,
    sourceId: item.id,
    name: item.productWorkstream || item.title || "Untitled workstream",
    title: item.title || "",
    area: item.productArea || "Unclassified",
    segment: item.segment || "Unclassified",
    owner: item.owner || "Unassigned",
    status: item.status || "Unknown",
    reportedStatus: item.status || "Unknown",
    due: item.targetCompletionDate || "Not configured",
    metric: "Metric not configured",
    unit: "",
    target: null,
    actual: null,
    progress: null,
    previous: null,
    change: null,
    fresh: daysSince(item.lastUpdatedAt || item.createdAt),
    completeness: liveCompleteness(item),
    blocker: item.blockerRisk || "",
    updatesThisWeek: Number(item.updatesThisWeek || 0),
    deps: [],
    riskCount: 0,
    isLive: true,
    evidence: item.currentStatus || item.description || "No narrative evidence available.",
  })).map((item) => ({ ...item, riskCount: computeLiveRisks([item]).length }));
}

function computeLiveRisks(items) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return items.flatMap((item) => {
    const risks = [];
    if (item.fresh >= 14) risks.push({ rule: "Stale update", severity: item.fresh >= 30 ? "critical" : "warning", detail: item.fresh >= 999 ? "No update timestamp available" : `${item.fresh} days since last update` });
    if (["Blocked", "Delay"].includes(item.status)) risks.push({ rule: item.status === "Blocked" ? "Blocked delivery" : "Delivery delay", severity: "critical", detail: item.blocker || `Reported status is ${item.status}` });
    if (item.due && item.due !== "Not configured") {
      const due = new Date(`${item.due}T00:00:00`);
      if (Number.isFinite(due.getTime()) && due < now && item.status !== "Done") risks.push({ rule: "Target date overdue", severity: "critical", detail: `Target date ${item.due} has passed` });
    }
    if (!item.owner || item.owner === "Unassigned") risks.push({ rule: "Missing owner", severity: "warning", detail: "No accountable owner is configured" });
    if (!item.due || item.due === "Not configured") risks.push({ rule: "Missing target date", severity: "info", detail: "No target completion date is configured" });
    if (hasMeaningfulBlocker(item.blocker) && !["Blocked", "Delay"].includes(item.status)) risks.push({ rule: "Blocker reported", severity: "warning", detail: item.blocker });
    if (item.completeness < 70) risks.push({ rule: "Low update completeness", severity: "info", detail: `${item.completeness}% of core fields complete` });
    return risks.map((risk) => ({ ...risk, itemId: item.id, itemName: item.name, owner: item.owner }));
  });
}

function getFictionalIntelligenceItems() {
  const items = getDemoItems(state.demo.weekIndex);
  const bundle = state.demo.importBundle;
  if (!bundle?.records?.length || state.demo.weekIndex !== DEMO_WEEKS.length - 1) return items;
  return items.map((item) => {
    const imported = bundle.records.find((record) => record.product === item.name);
    if (!imported) return item;
    const hasProgress = Number.isFinite(imported.progress);
    return {
      ...item,
      owner: imported.owner && imported.owner !== "Unassigned" ? imported.owner : item.owner,
      status: imported.status === "Needs Review" ? item.status : imported.status,
      actual: hasProgress ? imported.progress : item.actual,
      target: hasProgress ? 100 : item.target,
      unit: hasProgress ? "%" : item.unit,
      progress: hasProgress ? imported.progress : item.progress,
      change: hasProgress ? imported.progress - item.previous : item.change,
      riskCount: item.riskCount + bundle.risks.filter((risk) => risk.product === item.name).length,
      newFromCapture: true,
      sourceExcerpt: imported.sourceExcerpt,
    };
  });
}

function renderExecutionIntelligence() {
  const isLive = state.demo.intelligenceMode === "live";
  const allItems = isLive ? getLiveIntelligenceItems() : getFictionalIntelligenceItems();
  const items = filteredDemoItems(allItems);
  const risks = isLive ? computeLiveRisks(items) : computeDemoRisks(items);
  const selected = allItems.find((item) => item.id === state.demo.selectedId) || null;
  const compare = isLive ? [] : compareDemoWeeks(state.demo.compareFrom, state.demo.weekIndex);
  const critical = risks.filter((risk) => risk.severity === "critical").length;
  const measurable = allItems.filter((item) => Number.isFinite(item.progress));
  const avgProgress = measurable.length ? Math.round(measurable.reduce((sum, item) => sum + item.progress, 0) / measurable.length) : null;
  const freshCount = allItems.filter((item) => item.fresh < (isLive ? 14 : 7)).length;
  const coverage = allItems.length ? Math.round(allItems.reduce((sum, item) => sum + item.completeness, 0) / allItems.length) : 0;
  const preCaptureRiskCount = isLive ? 0 : computeDemoRisks(getDemoItems(state.demo.weekIndex)).length;
  const content = html`<section class="control-room">
    <section class="mode-switcher demo-panel" aria-label="Intelligence data mode"><div><span class="demo-kicker">Data source</span><h2>Choose the evidence boundary</h2></div><div class="mode-options"><button class="secondary ${isLive ? "active" : ""}" data-intelligence-mode="live"><strong>Live Read-Only</strong><span>Shared Board · deterministic analysis</span></button><button class="secondary ${!isLive ? "active" : ""}" data-intelligence-mode="fictional"><strong>Fictional Demo</strong><span>Isolated Capture workspace</span></button></div></section>
    <div class="provenance-banner ${isLive ? "live" : "fictional"}"><strong>${isLive ? "LIVE READ-ONLY PORTFOLIO" : "FICTIONAL AI LAB"}</strong><span>${isLive ? "Derived from the shared Board. No changes can be written back. No external AI is called." : "Demonstration records only. Capture imports remain local to this browser."}</span></div>
    ${!isLive && state.demo.importBundle?.records?.length ? `<section class="capture-impact demo-panel"><div><span class="demo-kicker">Before → After Capture</span><h2>${state.demo.importBundle.records.length} approved updates applied to W28</h2><p>Attention signals changed from <strong>${preCaptureRiskCount}</strong> to <strong>${computeDemoRisks(allItems).length}</strong>; imported evidence is marked on the map.</p></div><div><span><strong>${state.demo.importBundle.risks.length}</strong> extracted risks</span><span><strong>${state.demo.importBundle.decisions.length}</strong> decisions</span><span><strong>${state.demo.importBundle.actions.length}</strong> actions</span><button class="secondary" id="back-to-import">View import summary</button></div></section>` : ""}
    <section class="control-header demo-panel">
      <div><span class="demo-kicker">Overview → Explore → Diagnose → Act</span><h2>Portfolio execution, explained</h2><p>Reported progress and rule-based signals are shown separately. No black-box forecast.</p></div>
      <div class="control-actions"><label>Group map by<select id="demo-group"><option value="area" ${state.demo.groupBy === "area" ? "selected" : ""}>Product area</option><option value="segment" ${state.demo.groupBy === "segment" ? "selected" : ""}>Segment</option><option value="status" ${state.demo.groupBy === "status" ? "selected" : ""}>Status</option><option value="owner" ${state.demo.groupBy === "owner" ? "selected" : ""}>Owner</option></select></label><button class="secondary" id="clear-demo-filter" ${state.demo.filter ? "" : "disabled"}>Clear filter</button></div>
    </section>
    <section class="signal-strip"><div><span>Reported progress</span><strong>${avgProgress == null ? "Not configured" : `${avgProgress}%`}</strong><small>${isLive ? `${measurable.length}/${allItems.length} measurable workstreams` : "+4 pts vs prior week"}</small></div><div><span>Attention required</span><strong>${risks.length}</strong><small>${critical} critical signals</small></div><div><span>Fresh evidence</span><strong>${freshCount}/${allItems.length}</strong><small>Updated within ${isLive ? 14 : 7} days</small></div><div><span>Data coverage</span><strong>${coverage}%</strong><small>Rule-based · explainable</small></div></section>
    ${isLive ? `<section class="live-evidence-strip demo-panel"><div><strong>${allItems.filter((item) => item.updatesThisWeek > 0).length}</strong><span>updated this reporting week</span></div><div><strong>${allItems.filter((item) => item.due === "Not configured").length}</strong><span>missing target date</span></div><div><strong>${allItems.filter((item) => ["Blocked", "Delay"].includes(item.status)).length}</strong><span>reported blocked or delayed</span></div><p><strong>Metric policy:</strong> unavailable values remain unavailable; the system does not infer numeric progress from status.</p></section>` : `<section class="playback demo-panel"><div><button class="secondary playback-button" id="play-demo" aria-label="Play weekly history">▶</button><div><strong>Weekly playback</strong><span>See the portfolio change as one coordinated system.</span></div></div><input id="week-playback" type="range" min="0" max="4" value="${state.demo.weekIndex}" aria-label="Reporting week"><div class="week-labels">${DEMO_WEEKS.map((week, index) => `<span class="${index === state.demo.weekIndex ? "active" : ""}">${week}</span>`).join("")}</div></section>`}
    ${state.demo.filter ? `<div class="active-filter">Cross-filter active: <strong>${escapeHtml(state.demo.filter)}</strong><button id="remove-filter" aria-label="Remove filter">×</button></div>` : ""}
    <section class="control-grid">
      <div class="demo-panel execution-map-panel"><div class="demo-panel-heading"><div><span class="demo-kicker">Explore</span><h2>Interactive execution map</h2></div><span class="demo-badge neutral">${items.length} workstreams</span></div>${renderExecutionMap(items)}</div>
      <aside class="demo-panel attention-panel"><div class="demo-panel-heading"><div><span class="demo-kicker">Diagnose</span><h2>Attention required</h2></div><span class="demo-badge critical">${critical} critical</span></div><div class="attention-list">${risks.slice(0, 8).map((risk) => `<button data-risk-item="${risk.itemId}"><span class="risk-dot ${risk.severity}"></span><span><strong>${escapeHtml(risk.itemName)}</strong><small>${escapeHtml(risk.rule)} · ${escapeHtml(risk.detail)}</small></span><b>→</b></button>`).join("")}</div></aside>
    </section>
    <section class="demo-panel heatmap-panel"><div class="demo-panel-heading"><div><span class="demo-kicker">Cross-filter</span><h2>Portfolio signal matrix</h2></div><span class="muted">Select any cell to coordinate the map and risk list</span></div>${renderSignalHeatmap(allItems)}</section>
    ${isLive ? `<section class="demo-panel live-method-panel"><div class="demo-panel-heading"><div><span class="demo-kicker">Method</span><h2>What the live engine will—and will not—claim</h2></div><span class="demo-badge neutral">Deterministic</span></div><div><p><strong>Reported</strong>Status, owner, target date, blocker and last update come directly from the shared Board.</p><p><strong>Derived</strong>Staleness, overdue dates, missing fields and attention priority come from visible rules.</p><p><strong>Unavailable</strong>Progress, dependencies and trends remain unavailable when source fields do not support them.</p></div></section>` : `<section class="demo-panel compare-panel"><div class="demo-panel-heading"><div><span class="demo-kicker">Compare</span><h2>What changed?</h2></div><label>Compare from<select id="compare-week">${DEMO_WEEKS.slice(0, state.demo.weekIndex).map((week, index) => `<option value="${index}" ${index === state.demo.compareFrom ? "selected" : ""}>${week}</option>`).join("")}</select></label></div><div class="compare-summary">${["Improved", "Deteriorated", "Completed", "No change"].map((outcome) => `<div><strong>${compare.filter((item) => item.outcome === outcome).length}</strong><span>${outcome}</span></div>`).join("")}</div><div class="compare-list">${compare.map((item) => `<button data-select-demo="${item.id}"><span>${escapeHtml(item.name)}</span><strong class="outcome-${item.outcome.toLowerCase().replace(" ", "-")}">${item.delta > 0 ? "+" : ""}${item.delta} · ${item.outcome}</strong></button>`).join("")}</div></section>`}
    ${selected ? renderExecutionDrawer(selected, isLive ? computeLiveRisks([selected]) : computeDemoRisks([selected])) : ""}
  </section>`;
  renderDemoShell("Execution Control Room", isLive ? "Real Board evidence, analyzed locally with explainable rules and a hard read-only boundary." : "A coordinated view of progress, risk, dependencies and management actions across a fictional portfolio.", content);
  bindExecutionEvents();
}

function renderExecutionMap(items) {
  const width = 760;
  const columns = items.length > 12 ? 5 : 4;
  const xGap = width / columns;
  const yGap = items.length > 12 ? 118 : 180;
  const height = Math.max(390, Math.ceil(items.length / columns) * yGap + 50);
  const positions = Object.fromEntries(items.map((item, index) => [item.id, { x: xGap / 2 + (index % columns) * xGap, y: 65 + Math.floor(index / columns) * yGap }]));
  const lines = items.flatMap((item) => item.deps.map((dep) => positions[dep] && `<line x1="${positions[dep].x}" y1="${positions[dep].y}" x2="${positions[item.id].x}" y2="${positions[item.id].y}" marker-end="url(#arrow)"/>`)).filter(Boolean).join("");
  const live = items.some((item) => item.isLive);
  return `<div class="map-legend"><span><i class="on-track"></i>Active</span><span><i class="at-risk"></i>Delay</span><span><i class="blocked"></i>Blocked</span><span>${live ? "Fixed size = metric unavailable" : "Size = reported progress"}</span><span>Ring = evidence freshness</span></div><svg class="execution-map" viewBox="0 0 ${width} ${height}" role="img" aria-label="Execution map of ${live ? "live read-only" : "fictional"} workstreams"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z"/></marker></defs><g class="dependency-lines">${lines}</g>${items.map((item) => { const p = positions[item.id]; const radius = Number.isFinite(item.progress) ? 28 + item.progress * .14 : 34; const shortName = item.name.length > 20 ? `${item.name.slice(0, 18)}…` : item.name; return `<g class="map-node ${statusClass(item.status)} ${state.demo.selectedId === item.id ? "selected" : ""}" tabindex="0" role="button" data-select-demo="${item.id}" transform="translate(${p.x} ${p.y})"><circle class="freshness-ring ${item.fresh >= (live ? 14 : 7) ? "stale" : ""}" r="${radius + 7}"/><circle class="node-body" r="${radius}"/><text class="node-progress" y="4">${Number.isFinite(item.progress) ? `${item.progress}%` : "—"}</text>${item.newFromCapture ? `<text class="node-new" y="-${radius + 12}">NEW</text>` : ""}<text class="node-name" y="${radius + 22}">${escapeHtml(shortName)}</text></g>`; }).join("")}</svg>`;
}

function renderSignalHeatmap(items) {
  const columns = [...new Set(items.map((item) => item.area || "Unclassified"))].slice(0, 8);
  const rows = [{ key: "stale", label: "Stale updates", test: (i) => i.fresh >= 7 }, { key: "blocked", label: "Blocked", test: (i) => i.status === "Blocked" }, { key: "repeat-risk", label: "Repeated risks", test: (i) => i.riskCount >= 3 }, { key: "low-completeness", label: "Low completeness", test: (i) => i.completeness < 75 }];
  return `<div class="signal-matrix" style="--matrix-columns:${columns.length}"><div></div>${columns.map((column) => `<strong>${escapeHtml(column)}</strong>`).join("")}${rows.map((row) => `<span>${row.label}</span>${columns.map((column) => { const count = items.filter((item) => item.area === column && row.test(item)).length; return `<button data-demo-filter="${row.key}" class="heat-${Math.min(3, count)}" title="Filter by ${row.label}">${count}</button>`; }).join("")}`).join("")}</div>`;
}

function renderExecutionDrawer(item, risks) {
  const hasMetric = Number.isFinite(item.progress);
  return html`<aside class="demo-drawer" aria-label="Selected workstream details"><div class="drawer-heading"><div><span class="demo-kicker">${item.isLive ? "Reported + Derived" : "Act"}</span><h2>${escapeHtml(item.name)}</h2><span class="status-pill ${statusClass(item.status)}">${escapeHtml(item.status)}</span>${item.newFromCapture ? `<span class="demo-badge success">New from Capture</span>` : ""}</div><button class="secondary" id="close-demo-drawer" aria-label="Close details">×</button></div><div class="drawer-metric ${hasMetric ? "" : "unavailable"}"><span>${escapeHtml(item.metric)}</span><strong>${hasMetric ? `${item.actual}${escapeHtml(item.unit)}` : "Unavailable"}</strong>${hasMetric ? `<div><i style="width:${item.progress}%"></i></div><small>${item.progress}% of ${item.target}${escapeHtml(item.unit)} target · reported, not forecast</small>` : `<small>The source Board has no configured quantitative metric. No value is inferred.</small>`}</div><div class="drawer-grid"><div><span>Owner · Reported</span><strong>${escapeHtml(item.owner)}</strong></div><div><span>Target date · Reported</span><strong>${escapeHtml(item.due)}</strong></div><div><span>Freshness · Derived</span><strong>${item.fresh >= 999 ? "Unavailable" : `${item.fresh} days`}</strong></div><div><span>Completeness · Derived</span><strong>${item.completeness}%</strong></div></div><h3>Why this needs attention</h3><div class="drawer-risks">${risks.length ? risks.map((risk) => `<div><span class="risk-dot ${risk.severity}"></span><p><strong>${escapeHtml(risk.rule)}</strong><small>${escapeHtml(risk.detail)}</small></p></div>`).join("") : `<p class="muted">No active rule-based signals.</p>`}</div>${item.sourceExcerpt ? `<h3>Sanitized source excerpt</h3><p class="source-excerpt">${escapeHtml(item.sourceExcerpt)}</p>` : ""}<h3>Dependencies</h3><p>${item.deps.length ? item.deps.map((dep) => escapeHtml(dep.replaceAll("-", " "))).join(" · ") : item.isLive ? "Unavailable — no structured dependency field in the source Board." : "No upstream dependency"}</p>${item.isLive ? `<div class="read-only-callout"><strong>Read-only evidence</strong><span>This panel cannot edit or write back to the shared Board.</span></div>` : `<details class="metric-builder"><summary>Configure metric</summary><label>Template<select><option>Percentage complete</option><option>Count toward target</option><option>Milestone weighted</option></select></label><label>Metric name<input value="${escapeHtml(item.metric)}"></label><div class="demo-form-grid"><label>Current<input type="number" value="${item.actual}"></label><label>Target<input type="number" value="${item.target}"></label></div><button type="button" id="save-demo-metric">Save locally</button></details><div class="drawer-actions"><button class="secondary" id="demo-add-evidence">Add fictional evidence</button><button id="demo-create-action">Create demo action</button></div><p class="drawer-footnote">Demo-only actions are stored locally and never call the production API.</p>`}</aside>`;
}

let demoPlaybackTimer;
function bindExecutionEvents() {
  clearInterval(demoPlaybackTimer);
  document.querySelectorAll("[data-intelligence-mode]").forEach((button) => button.addEventListener("click", () => {
    state.demo.intelligenceMode = button.dataset.intelligenceMode;
    state.demo.selectedId = "";
    state.demo.filter = "";
    localStorage.setItem("pib_intelligence_mode", state.demo.intelligenceMode);
    render();
  }));
  document.querySelector("#back-to-import")?.addEventListener("click", () => { state.demo.captureStep = "done"; state.view = "smartCapture"; render(); });
  document.querySelector("#demo-group")?.addEventListener("change", (event) => { state.demo.groupBy = event.target.value; render(); });
  document.querySelector("#week-playback")?.addEventListener("input", (event) => { state.demo.weekIndex = Number(event.target.value); if (state.demo.compareFrom >= state.demo.weekIndex) state.demo.compareFrom = Math.max(0, state.demo.weekIndex - 1); render(); });
  document.querySelector("#play-demo")?.addEventListener("click", () => { state.demo.weekIndex = 0; render(); demoPlaybackTimer = setInterval(() => { if (state.view !== "executionIntelligence" || state.demo.weekIndex >= 4) return clearInterval(demoPlaybackTimer); state.demo.weekIndex += 1; renderExecutionIntelligence(); }, 900); });
  document.querySelectorAll("[data-select-demo], [data-risk-item]").forEach((element) => element.addEventListener("click", () => { state.demo.selectedId = element.dataset.selectDemo || element.dataset.riskItem; render(); }));
  document.querySelectorAll("[data-demo-filter]").forEach((button) => button.addEventListener("click", () => { state.demo.filter = button.dataset.demoFilter; render(); }));
  document.querySelector("#remove-filter")?.addEventListener("click", () => { state.demo.filter = ""; render(); });
  document.querySelector("#clear-demo-filter")?.addEventListener("click", () => { state.demo.filter = ""; render(); });
  document.querySelector("#compare-week")?.addEventListener("change", (event) => { state.demo.compareFrom = Number(event.target.value); render(); });
  document.querySelector("#close-demo-drawer")?.addEventListener("click", () => { state.demo.selectedId = ""; document.querySelector(".demo-drawer")?.remove(); });
  ["#save-demo-metric", "#demo-add-evidence", "#demo-create-action"].forEach((selector) => document.querySelector(selector)?.addEventListener("click", () => { state.demo.notice = "Demo action saved locally — production remained untouched."; localStorage.setItem("pib_demo_last_action", new Date().toISOString()); render(); }));
}

const observer = new MutationObserver(() => {
  const itemForm = document.querySelector("#item-form");
  if (itemForm && !itemForm.segment.options.length) {
    const item = state.modal?.item;
    updateDependentSelects();
    if (item) {
      itemForm.segment.value = item.segment;
      updateTrackSelect();
      itemForm.track.value = item.track;
      updateProductWorkstreamSelect();
    }
  }
});

observer.observe(app, { childList: true, subtree: true });
init();
