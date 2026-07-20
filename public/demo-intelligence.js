export const DEMO_WEEKS = ["W24", "W25", "W26", "W27", "W28"];

const PRODUCTS = [
  { id: "atlas-score", name: "Atlas Score", area: "Decision Intelligence", segment: "Banking", owner: "Team Member A", status: "On Track", due: "18 Jul", metric: "Model validation", unit: "%", target: 100, values: [42, 51, 63, 72, 79], risks: [1, 1, 1, 1, 1], fresh: 1, deps: [] },
  { id: "nova-verify", name: "Nova Verify", area: "Identity", segment: "Enterprise", owner: "Team Member B", status: "At Risk", due: "12 Jul", metric: "UAT cases passed", unit: "%", target: 95, values: [35, 48, 55, 57, 58], risks: [1, 1, 2, 3, 3], fresh: 8, deps: ["atlas-score"] },
  { id: "orbit-shield", name: "Orbit Shield", area: "Fraud", segment: "Banking", owner: "Team Member C", status: "Blocked", due: "09 Jul", metric: "Rules migrated", unit: "/120", target: 120, values: [38, 52, 67, 67, 67], risks: [1, 2, 3, 4, 4], fresh: 12, deps: ["nova-verify"] },
  { id: "horizon-alert", name: "Horizon Alert", area: "Monitoring", segment: "SME", owner: "Team Member D", status: "On Track", due: "25 Jul", metric: "Alert precision", unit: "%", target: 90, values: [50, 58, 66, 76, 84], risks: [1, 1, 1, 1, 1], fresh: 2, deps: ["atlas-score"] },
  { id: "meridian-insights", name: "Meridian Insights", area: "Analytics", segment: "Enterprise", owner: "Team Member A", status: "At Risk", due: "15 Jul", metric: "Dashboards adopted", unit: "/8", target: 8, values: [2, 3, 4, 4, 4], risks: [0, 1, 1, 2, 3], fresh: 9, deps: ["horizon-alert"] },
  { id: "vector-connect", name: "Vector Connect", area: "Platform", segment: "Banking", owner: "Team Member B", status: "On Track", due: "01 Aug", metric: "API consumers", unit: "/12", target: 12, values: [3, 4, 6, 8, 9], risks: [1, 1, 1, 1, 1], fresh: 3, deps: [] },
  { id: "ember-case", name: "Ember Case", area: "Operations", segment: "SME", owner: "Team Member C", status: "Done", due: "05 Jul", metric: "Playbooks shipped", unit: "/6", target: 6, values: [2, 3, 4, 5, 6], risks: [1, 1, 1, 0, 0], fresh: 1, deps: [] },
  { id: "quartz-risk", name: "Quartz Risk", area: "Decision Intelligence", segment: "Enterprise", owner: "Team Member D", status: "At Risk", due: "20 Jul", metric: "Policy coverage", unit: "%", target: 100, values: [62, 64, 64, 64, 66], risks: [1, 2, 2, 3, 3], fresh: 7, deps: ["vector-connect", "atlas-score"] },
];

export function getDemoItems(weekIndex = 4) {
  return PRODUCTS.map((item) => {
    const actual = item.values[weekIndex];
    const previous = item.values[Math.max(0, weekIndex - 1)];
    const progress = Math.min(100, Math.round((actual / item.target) * 100));
    return { ...item, actual, previous, progress, riskCount: item.risks[weekIndex], change: actual - previous,
      completeness: Math.max(48, 100 - item.fresh * 2 - (item.deps.length ? 4 : 0) - (item.status === "Blocked" ? 8 : 0)) };
  });
}

export function computeDemoRisks(items) {
  return items.flatMap((item) => {
    const risks = [];
    if (item.fresh >= 7) risks.push({ rule: "Stale update", severity: item.fresh >= 10 ? "critical" : "warning", detail: `${item.fresh} days since last evidence` });
    if (item.status === "Blocked") risks.push({ rule: "Long blocked", severity: "critical", detail: "Blocked across 3 reporting cycles" });
    if (item.progress < 70 && ["09 Jul", "12 Jul", "15 Jul"].includes(item.due)) risks.push({ rule: "Due date pressure", severity: "critical", detail: `${item.progress}% complete near or after target date` });
    if (item.change === 0 && item.status !== "Done") risks.push({ rule: "Unchanged progress", severity: "warning", detail: "No measurable movement this week" });
    if (item.riskCount >= 3) risks.push({ rule: "Repeated blocker", severity: "warning", detail: `${item.riskCount} linked risk signals` });
    if (item.deps.length >= 2) risks.push({ rule: "Dependency concentration", severity: "warning", detail: `${item.deps.length} upstream dependencies` });
    if (item.completeness < 70) risks.push({ rule: "Low update completeness", severity: "info", detail: `${item.completeness}% required fields complete` });
    return risks.map((risk) => ({ ...risk, itemId: item.id, itemName: item.name, owner: item.owner }));
  });
}

const PRIVACY_RULES = [
  ["Email address", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL REMOVED]"],
  ["URL or internal link", /https?:\/\/[^\s)]+/gi, "[LINK REMOVED]"],
  ["API key or token", /\b(?:sk|pk|token|key)[-_][A-Za-z0-9_-]{10,}\b/gi, "[SECRET REMOVED]"],
  ["Password-like value", /\b(?:password|passcode|secret)\s*[:=]\s*\S+/gi, "[CREDENTIAL REMOVED]"],
  ["Phone number", /(?:\+?\d[\d\s()-]{7,}\d)/g, "[PHONE REMOVED]"],
  ["User mention", /@[A-Za-z][\w.-]+(?:\s+[A-Za-z][\w.-]+)?/g, "[PERSON REMOVED]"],
  ["Currency amount", /(?:USD|SGD|IDR|\$|S\$|Rp)\s?[\d,.]+(?:m|k|bn)?/gi, "[AMOUNT REMOVED]"],
  ["Reference ID", /\b(?:INC|TKT|JIRA|REF|CASE)-?\d{3,}\b/gi, "[REFERENCE REMOVED]"],
];

export function scanDemoPrivacy(text) {
  let sanitized = String(text || "");
  const findings = [];
  PRIVACY_RULES.forEach(([label, pattern, replacement]) => {
    pattern.lastIndex = 0;
    const matches = sanitized.match(pattern) || [];
    if (matches.length) findings.push({ label, count: matches.length });
    pattern.lastIndex = 0;
    sanitized = sanitized.replace(pattern, replacement);
  });
  return { safe: findings.length === 0, findings, sanitized };
}

export const SAMPLE_MESSAGE = `[08-Jul-2026] Fictional Portfolio Weekly Review
Atlas Score validation reached 79%. Team Member A will close the remaining test gaps by 18 Jul.
Nova Verify UAT is at 58% and at risk because the sandbox response is late. Team Member B to confirm a recovery plan by Friday.
Orbit Shield remains blocked at 67 of 120 rules migrated. Decision needed: approve a temporary manual review path.
Horizon Alert precision improved to 84%. Next step is a controlled pilot with Example Bank.
Meridian Insights adoption is unchanged at 4 of 8 dashboards. Risk: sponsor availability.
All names and products in this message are fictional.`;

export function extractDemoUpdate(text) {
  const lines = String(text || "").split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const productNames = PRODUCTS.map((item) => item.name);
  const records = [];
  lines.forEach((line, index) => {
    const product = productNames.find((name) => line.toLowerCase().includes(name.toLowerCase()));
    if (!product) return;
    const lower = line.toLowerCase();
    const percent = line.match(/\b(\d{1,3})%/);
    const owner = line.match(/Team Member [A-D]/i)?.[0] || "Unassigned";
    records.push({
      id: `draft-${index}`, product, owner, sourceExcerpt: line, confidence: percent ? 0.94 : 0.82,
      status: lower.includes("blocked") ? "Blocked" : lower.includes("risk") ? "At Risk" : lower.includes("reached") || lower.includes("improved") ? "On Track" : "Needs Review",
      progress: percent ? Number(percent[1]) : null,
      blocker: lower.includes("because") ? line.split(/because/i)[1]?.split(".")[0]?.trim() : lower.includes("risk:") ? line.split(/risk:/i)[1]?.split(".")[0]?.trim() : "",
      nextStep: lower.includes("next step") ? line.split(/next step(?: is)?/i)[1]?.trim() : lower.includes(" will ") ? line.split(/ will /i)[1]?.trim() : "",
      decision: lower.includes("decision needed") ? line.split(/decision needed:/i)[1]?.trim() : "",
      approved: true,
    });
  });
  const decisions = records.filter((record) => record.decision).map((record) => ({ product: record.product, text: record.decision }));
  const risks = records.filter((record) => record.blocker || record.status === "Blocked").map((record) => ({ product: record.product, text: record.blocker || "Blocked delivery path" }));
  return { records, decisions, risks, actions: records.filter((record) => record.nextStep).map((record) => ({ product: record.product, owner: record.owner, text: record.nextStep })) };
}

export function compareDemoWeeks(fromIndex, toIndex) {
  const from = getDemoItems(fromIndex);
  const to = getDemoItems(toIndex);
  return to.map((item, index) => ({ ...item, delta: item.actual - from[index].actual,
    outcome: item.status === "Done" && from[index].status !== "Done" ? "Completed" : item.actual > from[index].actual ? "Improved" : item.riskCount > from[index].riskCount ? "Deteriorated" : "No change" }));
}
