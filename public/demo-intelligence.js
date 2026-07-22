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
    if (Number.isFinite(item.progress) && item.progress < 70 && ["09 Jul", "12 Jul", "15 Jul"].includes(item.due)) risks.push({ rule: "Due date pressure", severity: "critical", detail: `${item.progress}% complete near or after target date` });
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

export const SAMPLE_MESSAGE = `[20-Jul-2026] Fictional H1 Review & H2 Plan | Portfolio MMR
The leadership team will be in Example City next week. Please ensure attendance.

H1 REVIEW & H2 PLAN
Atlas Score
Team Member A and Team Member B to clarify the key difference between Atlas Score and the legacy score [Thinking]

Nova Verify
v2 is a key H2 priority. Service tiering requires Team Member C alignment.
Partner Echo integration was discussed with Team Member D and Team Member E; commitment still needs confirmation.

Orbit Shield
Team Member F and Team Member G to prepare the BRD request.
Engineering will not start development without BRD approval and sign-off.

Horizon Alert
Employment verification received positive initial feedback.
To do: draft a BRD. Owner needs confirmation between Team Member H and Team Member A.

H1 REVIEW FINDINGS
Revenue enablement gap
Training is required on how to position score products. Team Member B and Team Member A to propose a session.
Potential option: hire a presales specialist with banking experience.

Vector Connect
Team Member B to walk the three business units through how products map to bank services.

PORTFOLIO MMR
Meridian Insights
Additional use cases were explored; no material opportunity was found. Close the exploration.

Quartz Risk
Compliance follow-up is waiting for a response by tomorrow. Team Member D to check.

Horizon Alert
Marketing material and a short product video are required. Team Member C to coordinate.

All names, organisations and products in this message are fictional.`;

export function extractDemoUpdate(text) {
  const lines = String(text || "").split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const productNames = PRODUCTS.map((item) => item.name);
  const records = [];
  const actions = [];
  const decisions = [];
  const risks = [];
  const gates = [];
  const pmmRequests = [];
  const questions = [];
  let currentProduct = "Portfolio";

  const ownersFrom = (line) => [...new Set(line.match(/Team Member [A-Z]/gi) || [])];
  const add = (collection, type, line, index, overrides = {}) => collection.push({
    id: `${type}-${index}`,
    recordType: type,
    product: currentProduct,
    text: line.replace(/\[Thinking\]/gi, "").trim(),
    evidence: line,
    owners: ownersFrom(line),
    owner: ownersFrom(line).join(", ") || "Unassigned",
    dueDate: /by tomorrow/i.test(line) ? "2026-07-21" : null,
    progress: null,
    approved: true,
    confidence: 0.9,
    requiresConfirmation: false,
    ...overrides,
  });

  lines.forEach((line, index) => {
    const exactProduct = productNames.find((name) => line.toLowerCase() === name.toLowerCase());
    if (exactProduct) {
      currentProduct = exactProduct;
      if (!records.some((record) => record.product === exactProduct)) add(records, "topic", line, index, { text: `Execution topic detected: ${exactProduct}`, status: "Needs Update", confidence: 0.99 });
      return;
    }
    const lower = line.toLowerCase();
    if (/fictional|leadership team|h1 review|portfolio mmr/.test(lower)) return;
    const percent = line.match(/\b(\d{1,3})%/);
    if (percent) {
      const record = records.find((entry) => entry.product === currentProduct);
      if (record) {
        record.progress = Number(percent[1]);
        record.progressEvidence = line;
        record.status = "Reported";
      }
    }
    if (/to clarify|to prepare|to propose|to walk|to check|to coordinate|to do:|requires .* alignment/i.test(line)) {
      const ownerAmbiguous = /owner needs confirmation/i.test(line);
      add(actions, "action", line, index, { executionState: "open", confidence: ownerAmbiguous ? 0.72 : 0.93, requiresConfirmation: ownerAmbiguous, owner: ownerAmbiguous ? "Unassigned" : ownersFrom(line).join(", ") || "Unassigned", confirmationReason: ownerAmbiguous ? "Multiple people are mentioned; accountable owner is unclear." : "" });
    }
    if (/needs confirmation|owner needs confirmation|discussed with/i.test(line)) {
      add(questions, "question", line, index, { requiresConfirmation: true, confidence: 0.72, confirmationReason: /owner/i.test(line) ? "Multiple people are mentioned; accountable owner is unclear." : "The wording does not establish a confirmed commitment." });
    }
    if (/will not start development without|approval and sign-off/i.test(line)) {
      add(gates, "gate", line, index, { executionState: "awaiting_brd", confidence: 0.97 });
      add(risks, "risk", line, index, { severity: "warning", executionState: "blocked_by_prerequisite", confidence: 0.95 });
    }
    if (/key h2 priority/i.test(line)) add(decisions, "priority", line, index, { executionState: "strategic_priority", confidence: 0.96 });
    if (/positive initial feedback/i.test(line)) add(decisions, "decision", line, index, { executionState: "concept_supported", confidence: 0.88 });
    if (/close the exploration/i.test(line)) add(decisions, "closed_finding", line, index, { executionState: "closed_no_opportunity", confidence: 0.98 });
    if (/training is required|enablement gap/i.test(line)) add(risks, "strategic_risk", line, index, { severity: "warning", executionState: "open", confidence: 0.9 });
    if (/waiting for a response|by tomorrow/i.test(line)) add(risks, "follow_up_risk", line, index, { severity: "warning", executionState: "waiting", confidence: 0.95 });
    if (/marketing material|product video/i.test(line)) add(pmmRequests, "pmm_request", line, index, { executionState: "open", confidence: 0.97 });
  });

  records.forEach((record) => {
    const related = [...actions, ...decisions, ...risks, ...gates, ...pmmRequests].filter((entry) => entry.product === record.product);
    const ownerQuestion = questions.find((question) => question.product === record.product && /accountable owner is unclear/i.test(question.confirmationReason || ""));
    record.sourceExcerpt = related[0]?.evidence || record.product;
    record.owner = ownerQuestion ? "Unassigned" : related.map((entry) => entry.owner).find((owner) => owner && owner !== "Unassigned") || "Unassigned";
    record.status = gates.some((gate) => gate.product === record.product) ? "Awaiting BRD" : decisions.some((decision) => decision.product === record.product && decision.recordType === "closed_finding") ? "Closed" : record.status;
    record.requiresConfirmation = questions.some((question) => question.product === record.product);
  });

  const allActions = [...actions, ...pmmRequests];
  return {
    summary: "The review identified strategic priorities, execution actions, an approval gate, a commercial enablement gap, a compliance follow-up and a PMM request. Numeric progress was not reported.",
    records,
    actions: allActions,
    decisions,
    risks,
    gates,
    pmmRequests,
    questions,
    metrics: {
      actions: allActions.length,
      ownerCoverage: allActions.length ? Math.round(allActions.filter((item) => item.owner !== "Unassigned").length / allActions.length * 100) : 0,
      dueDateCoverage: allActions.length ? Math.round(allActions.filter((item) => item.dueDate).length / allActions.length * 100) : 0,
      progressCoverage: records.length ? Math.round(records.filter((item) => Number.isFinite(item.progress)).length / records.length * 100) : 0,
      confirmations: questions.length,
    },
  };
}

export function compareDemoWeeks(fromIndex, toIndex) {
  const from = getDemoItems(fromIndex);
  const to = getDemoItems(toIndex);
  return to.map((item, index) => ({ ...item, delta: item.actual - from[index].actual,
    outcome: item.status === "Done" && from[index].status !== "Done" ? "Completed" : item.actual > from[index].actual ? "Improved" : item.riskCount > from[index].riskCount ? "Deteriorated" : "No change" }));
}
