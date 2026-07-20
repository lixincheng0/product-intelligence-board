import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

import { validatePasscodeWithConfig, canEditUpdates, canArchive, canManageEverything, canUsePmm, normalizeRole } from "./src/auth.js";
import {
  roles,
  STATUS_VALUES,
  currentReportingWeek,
  pmProfiles,
  productAreas,
  getSegments,
  getTracks,
} from "./src/config.js";
import { createStore } from "./src/store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const store = createStore(path.join(__dirname, "data", "store.json"));
const sessionSecret = process.env.SESSION_SECRET || "local-product-intelligence-board-secret";
const mirrorReadOnly = process.env.MIRROR_READ_ONLY === "true";

const mirrorSafePostRoutes = new Set([
  "/api/login",
  "/api/logout",
  "/api/session/profile",
]);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function buildConfigPayload(req) {
  const config = await store.getConfigSnapshot();
  return {
    roles,
    pmAccounts: config.pmAccounts,
    pmProfiles: config.pmProfiles,
    productAreas,
    segmentsByArea: Object.fromEntries(productAreas.map((area) => [area, getSegments(area)])),
    tracksByAreaSegment: config.tracksByAreaSegment,
    customTracks: config.customTracks,
    statuses: STATUS_VALUES,
    currentReportingWeek: currentReportingWeek(),
    modules: config.modules,
    passcodes: getAuth(req)?.role === "admin" ? Object.fromEntries(roles.map((role) => [role, ""])) : {},
  };
}

function staticHeaders(contentType, cacheControl = "no-store, no-cache, must-revalidate") {
  const headers = {
    "Content-Type": contentType,
    "Cache-Control": cacheControl,
  };
  if (cacheControl.includes("no-store") || cacheControl.includes("no-cache")) {
    headers.Pragma = "no-cache";
    headers.Expires = "0";
  }
  return headers;
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signSession(payload) {
  const body = base64UrlEncode(JSON.stringify({ ...payload, createdAt: new Date().toISOString() }));
  const signature = crypto.createHmac("sha256", sessionSecret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verifySession(token) {
  const [body, signature] = String(token || "").split(".");
  if (!body || !signature) return null;
  const expected = crypto.createHmac("sha256", sessionSecret).update(body).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    return JSON.parse(base64UrlDecode(body));
  } catch {
    return null;
  }
}

function getAuth(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const session = verifySession(token);
  return session ? { token, ...session } : null;
}

async function readBody(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function requireAuth(req, res) {
  const auth = getAuth(req);
  if (!auth) {
    sendJson(res, 401, { error: "Unauthorized" });
    return null;
  }
  return auth;
}

function requireDashboardAccess(req, res) {
  const auth = requireAuth(req, res);
  if (!auth) return null;
  if (normalizeRole(auth.role) === "pm_team" && !auth.selectedPmProfile) {
    sendJson(res, 403, { error: "PM Team account is not mapped to an active PM Profile." });
    return null;
  }
  return auth;
}

function requireEditor(req, res) {
  const auth = requireDashboardAccess(req, res);
  if (!auth) return null;
  if (!canEditUpdates(auth.role)) {
    sendJson(res, 403, { error: "This role cannot edit updates." });
    return null;
  }
  return auth;
}

function requireAdmin(req, res) {
  const auth = requireDashboardAccess(req, res);
  if (!auth) return null;
  if (!canManageEverything(auth.role)) {
    sendJson(res, 403, { error: "Only Admin can perform this action." });
    return null;
  }
  return auth;
}

function requireModuleEditor(req, res) {
  const auth = requireDashboardAccess(req, res);
  if (!auth) return null;
  if (!canEditUpdates(auth.role) && !canUsePmm(auth.role)) {
    sendJson(res, 403, { error: "This role cannot manage this module." });
    return null;
  }
  return auth;
}

function requireModuleManager(req, res) {
  const auth = requireDashboardAccess(req, res);
  if (!auth) return null;
  if (!["product_lead", "admin"].includes(auth.role)) {
    sendJson(res, 403, { error: "Only Product Lead or Admin can modify saved module records." });
    return null;
  }
  return auth;
}

function requireMarketingManager(req, res) {
  const auth = requireDashboardAccess(req, res);
  if (!auth) return null;
  if (!canUsePmm(auth.role)) {
    sendJson(res, 403, { error: "Only PMM, Product Lead, or Admin can modify PMM assets." });
    return null;
  }
  return auth;
}

function requireProductLead(req, res) {
  const auth = requireAuth(req, res);
  if (!auth) return null;
  if (auth.role !== "product_lead") {
    sendJson(res, 403, { error: "Only Product Lead can manage PM account mappings." });
    return null;
  }
  return auth;
}

function requireCapacityLead(req, res) {
  const auth = requireDashboardAccess(req, res);
  if (!auth) return null;
  if (auth.role !== "product_lead") {
    sendJson(res, 403, { error: "Only Product Lead can upload or modify PM Capacity data." });
    return null;
  }
  return auth;
}

function actorName(auth) {
  if (auth.selectedPmProfile) return auth.selectedPmProfile;
  if (auth.role === "product_lead") return "Product Lead";
  if (auth.role === "admin") return "Admin";
  if (auth.role === "pmm") return "PMM";
  return "Viewer";
}

function sessionPayload(auth) {
  const actorDisplayName = actorName(auth);
  return {
    role: auth.role,
    selectedPmProfile: auth.selectedPmProfile,
    pmAccountId: auth.pmAccountId || "",
    actor_pm_id: auth.selectedPmProfile || "",
    actor_display_name: actorDisplayName,
  };
}

async function getAllowedPmProfiles() {
  const accounts = await store.getPmAccounts();
  const knownOwners = await store.getKnownOwners();
  return [...new Set([...pmProfiles, ...accounts.map((account) => account.pmProfile).filter(Boolean), ...knownOwners])];
}

async function validateUpdateItemPayload(payload) {
  payload.status = payload.status || "Backlog";
  const required = ["title", "productArea", "segment", "track", "owner", "status", "targetCompletionDate"];
  for (const field of required) {
    if (!String(payload[field] || "").trim()) return `${field} is required.`;
  }
  if (!String(payload.productWorkstream || payload.newProductWorkstream || payload.existingProductWorkstream || "").trim()) return "Product / Workstream is required.";
  if (!productAreas.includes(payload.productArea)) return "Invalid product area.";
  if (!getSegments(payload.productArea).includes(payload.segment)) return "Invalid segment.";
  const allowedTracks = new Set([...getTracks(payload.productArea, payload.segment), ...(await store.getKnownTracks(payload.productArea, payload.segment))]);
  if (!allowedTracks.has(payload.track) && !String(payload.allowNewTrack || "").trim()) return "Invalid track/category.";
  if (!(await getAllowedPmProfiles()).includes(payload.owner)) return "Invalid owner PM profile.";
  if (!STATUS_VALUES.includes(payload.status)) return "Invalid status.";
  if (["Blocked", "Delay"].includes(payload.status) && !String(payload.blockerRisk || "").trim()) return "Blocker / Delay is required when status is Blocked or Delay.";
  return null;
}

async function validateWeeklyUpdatePayload(payload) {
  const required = ["itemId", "reportingWeek", "workstreamTitle", "status"];
  for (const field of required) {
    if (!String(payload[field] || "").trim()) return `${field} is required.`;
  }
  if (String(payload.workstreamId || "").startsWith("new:")) return "Create the workstream from the Update Item form before adding a weekly update.";
  const item = await store.getUpdateItemDetail(payload.itemId);
  if (!item) return "Update item not found.";
  const workstreams = item.workstreams || item.subTasks || [];
  const selectedWorkstream = workstreams.find((workstream) => {
    const sameId = payload.workstreamId && workstream.id === payload.workstreamId;
    const sameTitle = String(workstream.title || "").trim().toLowerCase() === String(payload.workstreamTitle || "").trim().toLowerCase();
    return sameId || sameTitle;
  });
  if (!selectedWorkstream) return "Select an existing workstream from this Update Item.";
  if (!STATUS_VALUES.includes(payload.status)) return "Invalid status.";
  if (["Blocked", "Delay"].includes(payload.status) && !String(payload.blockerRisk || "").trim()) {
    return "Blocker / Delay is required when status is Blocked or Delay.";
  }
  return null;
}

async function handleApi(req, res, pathname) {
  if (pathname === "/api/login" && req.method === "POST") {
    const { role: requestedRole, accountId, passcode } = await readBody(req);
    const role = validatePasscodeWithConfig(requestedRole, passcode, await store.getPasscodes());
    if (!role) return sendJson(res, 401, { error: "Invalid passcode." });
    let selectedPmProfile = null;
    let pmAccount = null;
    if (role === "pm_team") {
      pmAccount = await store.getPmAccount(String(accountId || "").trim());
      if (!pmAccount) return sendJson(res, 401, { error: "Invalid or inactive PM account." });
      selectedPmProfile = pmAccount.pmProfile;
    }
    const session = { role, selectedPmProfile, pmAccountId: pmAccount?.accountId || "" };
    const token = signSession(session);
    return sendJson(res, 200, { token, ...sessionPayload(session) });
  }

  if (pathname === "/api/session" && req.method === "GET") {
    const auth = requireAuth(req, res);
    if (!auth) return;
    return sendJson(res, 200, sessionPayload(auth));
  }

  if (pathname === "/api/session/profile" && req.method === "POST") {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (normalizeRole(auth.role) === "pm_team") return sendJson(res, 403, { error: "PM Team profile is controlled by the PM account mapping." });
    const { pmProfile } = await readBody(req);
    if (!pmProfiles.includes(pmProfile)) return sendJson(res, 400, { error: "Invalid PM profile." });
    const session = { role: auth.role, selectedPmProfile: pmProfile, pmAccountId: auth.pmAccountId || "" };
    return sendJson(res, 200, { token: signSession(session), ...sessionPayload(session) });
  }

  if (pathname === "/api/logout" && req.method === "POST") {
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === "/api/login-config" && req.method === "GET") {
    return sendJson(res, 200, {
      roles,
      pmAccounts: await store.getPmAccounts(),
      pmProfiles,
      currentReportingWeek: currentReportingWeek(),
    });
  }

  if (pathname === "/api/config" && req.method === "GET") {
    return sendJson(res, 200, await buildConfigPayload(req));
  }

  if (pathname === "/api/bootstrap" && req.method === "GET") {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const url = new URL(req.url, `http://${req.headers.host}`);
    const week = url.searchParams.get("week") || currentReportingWeek();
    const period = url.searchParams.get("period") || "weekly";
    const payload = {
      config: await buildConfigPayload(req),
      session: sessionPayload(auth),
    };
    if (!(normalizeRole(auth.role) === "pm_team" && !auth.selectedPmProfile)) {
      payload.dashboard = await store.getDashboard(week, {
        status: url.searchParams.get("status") || "",
        owner: url.searchParams.get("owner") || "",
        productArea: url.searchParams.get("productArea") || "",
        segment: url.searchParams.get("segment") || "",
        track: url.searchParams.get("track") || "",
        productWorkstream: url.searchParams.get("productWorkstream") || "",
        period,
        includeArchived: url.searchParams.get("includeArchived") === "true",
        includeFutureDone: url.searchParams.get("includeFutureDone") === "true",
      }, { role: auth.role });
    }
    return sendJson(res, 200, payload);
  }

  if (pathname === "/api/passcodes" && req.method === "PUT") {
    const auth = requireAdmin(req, res);
    if (!auth) return;
    const { passcodes } = await readBody(req);
    return sendJson(res, 200, { passcodes: await store.updatePasscodes(passcodes, actorName(auth)) });
  }

  if (pathname === "/api/pm-accounts" && req.method === "GET") {
    const auth = requireProductLead(req, res);
    if (!auth) return;
    return sendJson(res, 200, { pmAccounts: await store.getPmAccounts() });
  }

  if (pathname === "/api/pm-accounts" && req.method === "PUT") {
    const auth = requireProductLead(req, res);
    if (!auth) return;
    const { pmAccounts } = await readBody(req);
    if (!Array.isArray(pmAccounts)) return sendJson(res, 400, { error: "pmAccounts must be an array." });
    const seen = new Set();
    for (const account of pmAccounts) {
      const accountId = String(account.accountId || "").trim().toLowerCase();
      if (!accountId) return sendJson(res, 400, { error: "PM account id is required." });
      if (!/^(pm|qa)\d+$/i.test(accountId)) return sendJson(res, 400, { error: `Account id must look like pm01, pm02, qa01, qa02. Invalid: ${account.accountId}.` });
      if (seen.has(accountId)) return sendJson(res, 400, { error: `Duplicate PM account id: ${accountId}.` });
      seen.add(accountId);
      if (!String(account.pmProfile || "").trim()) return sendJson(res, 400, { error: `PM name is required for ${accountId}.` });
    }
    return sendJson(res, 200, { pmAccounts: await store.updatePmAccounts(pmAccounts) });
  }

  if (pathname === "/api/taxonomy/tracks" && req.method === "PUT") {
    const auth = requireProductLead(req, res);
    if (!auth) return;
    const { customTracks } = await readBody(req);
    if (!Array.isArray(customTracks)) return sendJson(res, 400, { error: "customTracks must be an array." });
    return sendJson(res, 200, { customTracks: await store.saveCustomTracks(customTracks, actorName(auth)), tracksByAreaSegment: await store.getTracksByAreaSegment() });
  }

  if (pathname === "/api/dashboard" && req.method === "GET") {
    const auth = requireDashboardAccess(req, res);
    if (!auth) return;
    const url = new URL(req.url, `http://${req.headers.host}`);
    const week = url.searchParams.get("week") || currentReportingWeek();
    return sendJson(res, 200, await store.getDashboard(week, {
      status: url.searchParams.get("status") || "",
      owner: url.searchParams.get("owner") || "",
      productArea: url.searchParams.get("productArea") || "",
      segment: url.searchParams.get("segment") || "",
      track: url.searchParams.get("track") || "",
      productWorkstream: url.searchParams.get("productWorkstream") || "",
      period: url.searchParams.get("period") || "weekly",
      includeArchived: url.searchParams.get("includeArchived") === "true",
      includeFutureDone: url.searchParams.get("includeFutureDone") === "true",
    }, { role: auth.role }));
  }

  if (pathname === "/api/archived-items" && req.method === "GET") {
    const auth = requireDashboardAccess(req, res);
    if (!auth) return;
    return sendJson(res, 200, { items: await store.getArchivedItems() });
  }

  if (pathname === "/api/items" && req.method === "POST") {
    const auth = requireEditor(req, res);
    if (!auth) return;
    const payload = await readBody(req);
    const error = await validateUpdateItemPayload(payload);
    if (error) return sendJson(res, 400, { error });
    return sendJson(res, 201, await store.createUpdateItem(payload, actorName(auth)));
  }

  const itemMatch = pathname.match(/^\/api\/items\/([^/]+)$/);
  if (itemMatch && req.method === "GET") {
    const auth = requireDashboardAccess(req, res);
    if (!auth) return;
    const item = await store.getUpdateItemDetail(itemMatch[1]);
    if (!item) return sendJson(res, 404, { error: "Update item not found." });
    return sendJson(res, 200, item);
  }

  if (itemMatch && req.method === "PUT") {
    const auth = requireEditor(req, res);
    if (!auth) return;
    const payload = await readBody(req);
    const error = await validateUpdateItemPayload(payload);
    if (error) return sendJson(res, 400, { error });
    const item = await store.updateUpdateItem(itemMatch[1], payload, actorName(auth));
    if (!item) return sendJson(res, 404, { error: "Update item not found." });
    return sendJson(res, 200, item);
  }

  if (itemMatch && req.method === "DELETE") {
    const auth = requireEditor(req, res);
    if (!auth) return;
    const existing = await store.getUpdateItemDetail(itemMatch[1]);
    if (!existing) return sendJson(res, 404, { error: "Update item not found." });
    const canDelete = canManageEverything(auth.role) || (["pm_team", "pm_editor"].includes(normalizeRole(auth.role)) && existing.owner === auth.selectedPmProfile);
    if (!canDelete) return sendJson(res, 403, { error: "You can only delete update items owned by your PM profile." });
    const deleted = await store.deleteUpdateItem(itemMatch[1]);
    if (!deleted) return sendJson(res, 404, { error: "Update item not found." });
    return sendJson(res, 200, { ok: true });
  }

  if (pathname.match(/^\/api\/items\/([^/]+)\/archive$/) && req.method === "POST") {
    const auth = requireDashboardAccess(req, res);
    if (!auth) return;
    if (!canArchive(auth.role)) return sendJson(res, 403, { error: "Only Product Lead or Admin can archive update items." });
    const itemId = pathname.split("/")[3];
    const { archivedReason } = await readBody(req);
    if (!String(archivedReason || "").trim()) return sendJson(res, 400, { error: "Archived reason is required." });
    const item = await store.archiveUpdateItem(itemId, archivedReason, actorName(auth));
    if (!item) return sendJson(res, 404, { error: "Update item not found." });
    return sendJson(res, 200, item);
  }

  if (pathname === "/api/weekly-updates" && req.method === "POST") {
    const auth = requireEditor(req, res);
    if (!auth) return;
    const payload = await readBody(req);
    const error = await validateWeeklyUpdatePayload(payload);
    if (error) return sendJson(res, 400, { error });
    const entry = await store.createWeeklyUpdate(payload, actorName(auth));
    if (!entry) return sendJson(res, 404, { error: "Update item not found." });
    return sendJson(res, 201, entry);
  }

  const weeklyUpdateMatch = pathname.match(/^\/api\/weekly-updates\/([^/]+)$/);
  if (weeklyUpdateMatch && req.method === "PUT") {
    const auth = requireEditor(req, res);
    if (!auth) return;
    const payload = await readBody(req);
    const error = await validateWeeklyUpdatePayload(payload);
    if (error) return sendJson(res, 400, { error });
    const entry = await store.updateWeeklyUpdate(weeklyUpdateMatch[1], payload, actorName(auth));
    if (!entry) return sendJson(res, 404, { error: "Weekly update entry not found." });
    return sendJson(res, 200, entry);
  }

  if (pathname.match(/^\/api\/items\/([^/]+)\/previous-update$/) && req.method === "GET") {
    const auth = requireDashboardAccess(req, res);
    if (!auth) return;
    const itemId = pathname.split("/")[3];
    const url = new URL(req.url, `http://${req.headers.host}`);
    const week = url.searchParams.get("week") || currentReportingWeek();
    return sendJson(res, 200, await store.getPreviousUpdate(
      itemId,
      week,
      url.searchParams.get("excludeEntryId") || "",
      url.searchParams.get("workstreamId") || "",
      url.searchParams.get("workstreamTitle") || "",
    ));
  }

  if (pathname === "/api/modules" && req.method === "GET") {
    const auth = requireDashboardAccess(req, res);
    if (!auth) return;
    return sendJson(res, 200, await store.getModules());
  }

  if (pathname === "/api/announcements" && req.method === "POST") {
    const auth = requireModuleEditor(req, res);
    if (!auth) return;
    const payload = await readBody(req);
    if (!String(payload.title || "").trim()) return sendJson(res, 400, { error: "Announcement title is required." });
    return sendJson(res, 201, await store.createAnnouncement(payload, actorName(auth)));
  }

  const announcementMatch = pathname.match(/^\/api\/announcements\/([^/]+)$/);
  if (announcementMatch && req.method === "PUT") {
    const auth = requireModuleManager(req, res);
    if (!auth) return;
    const announcement = await store.updateAnnouncement(announcementMatch[1], await readBody(req), actorName(auth));
    if (!announcement) return sendJson(res, 404, { error: "Announcement not found." });
    return sendJson(res, 200, announcement);
  }
  if (announcementMatch && req.method === "DELETE") {
    const auth = requireModuleManager(req, res);
    if (!auth) return;
    const deleted = await store.deleteAnnouncement(announcementMatch[1]);
    if (!deleted) return sendJson(res, 404, { error: "Announcement not found." });
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === "/api/meetings" && req.method === "POST") {
    const auth = requireModuleEditor(req, res);
    if (!auth) return;
    const payload = await readBody(req);
    if (!String(payload.title || "").trim()) return sendJson(res, 400, { error: "Meeting title is required." });
    return sendJson(res, 201, await store.createMeeting(payload, actorName(auth)));
  }

  const meetingMatch = pathname.match(/^\/api\/meetings\/([^/]+)$/);
  if (meetingMatch && req.method === "PUT") {
    const auth = requireModuleManager(req, res);
    if (!auth) return;
    const meeting = await store.updateMeeting(meetingMatch[1], await readBody(req), actorName(auth));
    if (!meeting) return sendJson(res, 404, { error: "Meeting not found." });
    return sendJson(res, 200, meeting);
  }
  if (meetingMatch && req.method === "DELETE") {
    const auth = requireModuleManager(req, res);
    if (!auth) return;
    const deleted = await store.deleteMeeting(meetingMatch[1]);
    if (!deleted) return sendJson(res, 404, { error: "Meeting not found." });
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === "/api/marketing-assets" && req.method === "POST") {
    const auth = requireMarketingManager(req, res);
    if (!auth) return;
    const payload = await readBody(req);
    if (!String(payload.title || "").trim()) return sendJson(res, 400, { error: "Asset title is required." });
    return sendJson(res, 201, await store.createMarketingAsset(payload, actorName(auth)));
  }

  if (pathname === "/api/capacity" && req.method === "PUT") {
    const auth = requireCapacityLead(req, res);
    if (!auth) return;
    return sendJson(res, 200, { capacity: await store.saveCapacity(await readBody(req), actorName(auth)) });
  }

  const marketingMatch = pathname.match(/^\/api\/marketing-assets\/([^/]+)$/);
  if (marketingMatch && req.method === "PUT") {
    const auth = requireMarketingManager(req, res);
    if (!auth) return;
    const asset = await store.updateMarketingAsset(marketingMatch[1], await readBody(req), actorName(auth));
    if (!asset) return sendJson(res, 404, { error: "Marketing asset not found." });
    return sendJson(res, 200, asset);
  }
  if (marketingMatch && req.method === "DELETE") {
    const auth = requireMarketingManager(req, res);
    if (!auth) return;
    const deleted = await store.deleteMarketingAsset(marketingMatch[1]);
    if (!deleted) return sendJson(res, 404, { error: "Marketing asset not found." });
    return sendJson(res, 200, { ok: true });
  }

  sendJson(res, 404, { error: "API route not found." });
}

async function serveStatic(req, res, pathname) {
  if (pathname.startsWith("/assets/")) {
    const assetName = decodeURIComponent(pathname.replace("/assets/", ""));
    const allowedAssets = new Set([
      "CBI-logo-F-1.svg",
      "ADVANCE CBP logo-F.svg",
      "SME Bureau logo_Primary (3).svg",
      "SkorKu_Logo_Primary.svg",
    ]);
    if (!allowedAssets.has(assetName)) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    try {
      const data = await readFile(path.join(__dirname, assetName));
      res.writeHead(200, staticHeaders("image/svg+xml", "public, max-age=300"));
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
    return;
  }
  const filePath = pathname === "/" ? path.join(publicDir, "index.html") : path.join(publicDir, pathname);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const data = await readFile(resolved);
    const ext = path.extname(resolved);
    const cacheControl = ext === ".html" ? "no-store, no-cache, must-revalidate" : "public, max-age=300";
    res.writeHead(200, staticHeaders(mimeTypes[ext] || "application/octet-stream", cacheControl));
    res.end(data);
  } catch {
    const data = await readFile(path.join(publicDir, "index.html"));
    res.writeHead(200, staticHeaders(mimeTypes[".html"]));
    res.end(data);
  }
}

export async function handleRequest(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      if (mirrorReadOnly && req.method !== "GET" && !mirrorSafePostRoutes.has(url.pathname)) {
        return sendJson(res, 403, {
          error: "This CEO demo mirror is read-only to protect the production workspace.",
          code: "MIRROR_READ_ONLY",
        });
      }
      await handleApi(req, res, url.pathname);
    } else {
      await serveStatic(req, res, url.pathname);
    }
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Unexpected server error." });
  }
}

const server = http.createServer(handleRequest);

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";
if (!process.env.VERCEL) {
  server.listen(port, host, () => {
    console.log(`Product Intelligence Board running at http://${host}:${port}`);
  });
}

export default handleRequest;
