/**
 * Built-in project templates. Plans is a general project app: a template decides the definition
 * questions, stages and gates, the drivers and the starter plan (effort and cost per work package),
 * and whether the schedule runs forward from a start date or backward from an event date.
 *
 * Amounts are starting values in the library currency, not quotes; edit them in the library.
 */
import seed from "./seed.json";
import type { GateTemplateItem, Option, ProjectTemplate, StageTemplateItem, TemplateSection, TemplateWorkPackage } from "./model";

const st = (stage_key: string, sequence: number, name: string, purpose: string, typical_outputs: string[] = [], optional = false): StageTemplateItem => ({ stage_key, sequence, name, purpose, typical_outputs, optional });
const gate = (gate_key: string, stage_key: string, name: string, purpose: string, criteria: Array<[string, "MANUAL" | "DEFINITION_CONFIRMED", boolean]>): GateTemplateItem => ({
  gate_key, stage_key, name, purpose, criteria: criteria.map(([title, kind, blocking]) => ({ title, kind, required: true, blocking })),
});
const sec = (key: TemplateSection["key"], label: string, prompt: string): TemplateSection => ({ key, label, prompt });
const opts = (...xs: Array<[string, string]>): Option[] => xs.map(([value_key, label]) => ({ value_key, label }));
const role = (role_key: string, label: string, default_people = 1, default_allocation = 1) => ({ role_key, label, hourly_rate: null, default_people, default_allocation });
const wp = (wp_key: string, sequence: number, stage_key: string, name: string, v: Partial<TemplateWorkPackage>): TemplateWorkPackage => ({
  wp_key, sequence, stage_key, name, deliverable_title: v.deliverable_title ?? name, predecessors: v.predecessors ?? [], effort: v.effort ?? [], costs: v.costs ?? [], ...v,
});
const definitionGate = (stage: string) => gate("DEFINED", stage, "Defined", "What the project must achieve is agreed.", [["Project definition confirmed", "DEFINITION_CONFIRMED", true]]);

// ---------------------------------------------------------------- general
const general: ProjectTemplate = {
  key: "general",
  name: "General project",
  description: "Any project. Stages from initiation to close; you add milestones and deliverables by hand.",
  method: "lines", scheduling: "forward", calendar: "working", anchorLabel: "Start date",
  features: { location: true, size: false, codes: false, permit: false, scopeModel: false },
  terms: { deliverable: "Deliverable", deliverables: "Deliverables" },
  sections: [
    sec("objective", "Objective", "What must the project achieve? One or two sentences."),
    sec("scope", "Scope", "What is included."),
    sec("exclusions", "Exclusions", "What is not included."),
    sec("client_requirements", "Stakeholder requirements", "What the client or sponsor needs."),
    sec("assumptions", "Assumptions", "What you assume until confirmed."),
    sec("acceptance_criteria", "Acceptance criteria", "How you will know it is done."),
  ],
  criteriaLabel: "Requirements",
  criteriaCategories: opts(["REQUIREMENT", "Requirement"], ["CONSTRAINT", "Constraint"], ["QUALITY", "Quality"], ["OTHER", "Other"]),
  drivers: [],
  roles: [role("LEAD", "Project lead"), role("TEAM", "Team member")],
  factorSets: [],
  stages: [st("INITIATE", 10, "Initiate", "Agree what the project is for."), st("PLAN", 20, "Plan", "Plan the work, schedule and budget."), st("EXECUTE", 30, "Execute", "Do the work."), st("CLOSE", 40, "Close", "Hand over and close out.")],
  gates: [definitionGate("INITIATE"), gate("ACCEPTED", "CLOSE", "Accepted", "The client accepts the result.", [["Client acceptance received", "MANUAL", true]])],
  workPackages: [],
};

// ---------------------------------------------------------------- wedding / event (backward from the event date)
const wedding: ProjectTemplate = {
  key: "wedding_event",
  name: "Wedding / event",
  description: "Planned backward from the event date: bookings, vendors, guests and the day itself. Budget by vendor and per guest.",
  method: "lines", scheduling: "backward", calendar: "calendar", anchorLabel: "Event date",
  features: { location: true, size: false, codes: false, permit: false, scopeModel: false },
  terms: { deliverable: "Task", deliverables: "Tasks" },
  sections: [
    sec("objective", "The day", "What the event should be like, in a sentence or two."),
    sec("scope", "What's included", "Ceremony, reception, after-party, entourage, travel…"),
    sec("client_requirements", "Must-haves", "Things that must happen: traditions, music, food, people."),
    sec("site_conditions", "Venue notes", "Venue rules, capacity, curfew, rain plan."),
    sec("exclusions", "Not included", "What the couple or family will handle themselves."),
    sec("assumptions", "Assumptions", "Guest count, season, travel, until confirmed."),
  ],
  criteriaLabel: "Preferences",
  criteriaCategories: opts(["THEME", "Theme & style"], ["FOOD", "Food & drinks"], ["MUSIC", "Music & program"], ["GUESTS", "Guests"], ["OTHER", "Other"]),
  drivers: [{ key: "GUESTS", label: "Guests", unit: "guests", default: 120 }],
  roles: [role("COORDINATOR", "Coordinator"), role("ASSISTANT", "Assistant")],
  factorSets: [],
  stages: [
    st("FOUNDATION", 10, "Foundation", "Budget, guest list and date.", ["Budget", "Guest list"]),
    st("BOOKINGS", 20, "Key bookings", "Venue, caterer and the vendors that book out first.", ["Signed vendor contracts"]),
    st("DETAILS", 30, "Details", "Attire, invitations, styling, program.", ["Invitations", "Program"]),
    st("FINAL", 40, "Final preparations", "Headcount, seating, timeline, rehearsal.", ["Seating plan", "Day-of timeline"]),
    st("EVENT", 50, "Event day", "The day itself."),
    st("WRAP_UP", 60, "Wrap-up", "Payments, returns, thank-yous."),
  ],
  gates: [
    definitionGate("FOUNDATION"),
    gate("VENDORS_BOOKED", "BOOKINGS", "Vendors booked", "Contracts and deposits are in place.", [["Venue contract signed", "MANUAL", true], ["Caterer contract signed", "MANUAL", true]]),
    gate("READY_FOR_DAY", "FINAL", "Ready for the day", "Everything is confirmed.", [["Final headcount given to the caterer", "MANUAL", true], ["Day-of timeline sent to all vendors", "MANUAL", true]]),
  ],
  workPackages: [
    wp("BUDGET", 10, "FOUNDATION", "Budget and guest list", { finishBeforeAnchorDays: 300, minDays: 14, effort: [{ role: "COORDINATOR", base: 6 }], deliverable_title: "Budget and guest list" }),
    wp("VENUE", 20, "BOOKINGS", "Venue", { finishBeforeAnchorDays: 270, minDays: 21, effort: [{ role: "COORDINATOR", base: 8 }], costs: [{ label: "Venue rental", unit: "lot", base: 1, unitCost: 150000 }], deliverable_title: "Venue booked" }),
    wp("CATERING", 30, "BOOKINGS", "Catering", { finishBeforeAnchorDays: 240, minDays: 21, effort: [{ role: "COORDINATOR", base: 6 }], costs: [{ label: "Catering", unit: "guest", base: 0, per: { driver: "GUESTS", rate: 1 }, unitCost: 1500 }], deliverable_title: "Caterer booked" }),
    wp("PHOTO", 40, "BOOKINGS", "Photo and video", { finishBeforeAnchorDays: 210, minDays: 14, effort: [{ role: "COORDINATOR", base: 4 }], costs: [{ label: "Photo and video package", unit: "lot", base: 1, unitCost: 80000 }], deliverable_title: "Photo and video booked" }),
    wp("ATTIRE", 50, "DETAILS", "Attire", { finishBeforeAnchorDays: 60, minDays: 90, effort: [{ role: "COORDINATOR", base: 6 }], costs: [{ label: "Attire", unit: "lot", base: 1, unitCost: 60000 }], deliverable_title: "Attire ready" }),
    wp("INVITES", 60, "DETAILS", "Invitations", { finishBeforeAnchorDays: 75, minDays: 14, effort: [{ role: "ASSISTANT", base: 4, per: { driver: "GUESTS", rate: 0.1 } }], costs: [{ label: "Invitations", unit: "guest", base: 0, per: { driver: "GUESTS", rate: 1 }, unitCost: 80 }], deliverable_title: "Invitations sent" }),
    wp("STYLING", 70, "DETAILS", "Flowers and styling", { finishBeforeAnchorDays: 60, minDays: 14, effort: [{ role: "COORDINATOR", base: 6 }], costs: [{ label: "Flowers and styling", unit: "lot", base: 1, unitCost: 70000 }], deliverable_title: "Styling confirmed" }),
    wp("HEADCOUNT", 80, "FINAL", "Final headcount and seating", { finishBeforeAnchorDays: 14, minDays: 7, effort: [{ role: "ASSISTANT", base: 4, per: { driver: "GUESTS", rate: 0.05 } }], deliverable_title: "Seating plan" }),
    wp("TIMELINE", 90, "FINAL", "Day-of timeline", { finishBeforeAnchorDays: 7, minDays: 5, effort: [{ role: "COORDINATOR", base: 6 }], deliverable_title: "Day-of timeline" }),
    wp("REHEARSAL", 100, "FINAL", "Rehearsal", { finishBeforeAnchorDays: 1, fixedDays: 1, effort: [{ role: "COORDINATOR", base: 3 }], deliverable_title: "Rehearsal held" }),
    wp("DAY", 110, "EVENT", "Event day", { finishBeforeAnchorDays: 0, fixedDays: 1, effort: [{ role: "COORDINATOR", base: 14 }, { role: "ASSISTANT", base: 14 }], deliverable_title: "Event delivered" }),
    wp("WRAP", 120, "WRAP_UP", "Payments and thank-yous", { finishBeforeAnchorDays: -14, minDays: 14, effort: [{ role: "ASSISTANT", base: 6 }], deliverable_title: "Vendors paid, thank-yous sent" }),
  ],
};

// ---------------------------------------------------------------- small HVAC install job
const hvacInstall: ProjectTemplate = {
  key: "hvac_install",
  name: "Small HVAC install job",
  description: "Split / multi-split / small VRF installs: survey, quote, procurement, installation, testing and handover. Effort and materials per indoor unit and per metre of piping.",
  method: "lines", scheduling: "forward", calendar: "working", anchorLabel: "Start date",
  features: { location: true, size: false, codes: true, permit: true, scopeModel: false },
  terms: { deliverable: "Work item", deliverables: "Work items" },
  sections: [
    sec("objective", "Objective", "What the client needs cooled or ventilated, and why."),
    sec("scope", "Scope", "Units, rooms, piping runs, electrical and drain work included."),
    sec("site_conditions", "Site conditions", "Wall/ceiling types, outdoor unit location, access, power supply."),
    sec("client_requirements", "Client requirements", "Brand, inverter, working hours, noise, finishes."),
    sec("performance_criteria", "Performance", "Room temperatures, capacity per room."),
    sec("exclusions", "Exclusions", "Civil works, electrical panel upgrades, permits by others…"),
    sec("assumptions", "Assumptions", "Pipe lengths, power available, access, until surveyed."),
    sec("acceptance_criteria", "Acceptance", "Pressure test, vacuum, operation test, handover documents."),
  ],
  criteriaLabel: "Installation criteria",
  criteriaCategories: opts(["CAPACITY", "Capacity"], ["INDOOR", "Indoor conditions"], ["ELECTRICAL", "Electrical"], ["PIPING", "Piping"], ["OTHER", "Other"]),
  drivers: [{ key: "UNITS", label: "Indoor units", unit: "units", default: 4 }, { key: "PIPE_M", label: "Refrigerant piping", unit: "m", default: 40 }],
  roles: [role("SUPERVISOR", "Supervisor", 1, 0.25), role("TECHNICIAN", "Technician"), role("HELPER", "Helper")],
  factorSets: [],
  stages: [
    st("SURVEY", 10, "Survey and quote", "See the site and agree the price.", ["Survey notes", "Quotation"]),
    st("PROCURE", 20, "Procurement", "Equipment and materials on site."),
    st("INSTALL", 30, "Installation", "Mount, pipe, wire and drain."),
    st("TEST", 40, "Testing and commissioning", "Pressure, vacuum, charge, run."),
    st("HANDOVER", 50, "Handover", "Client acceptance, warranty, documents."),
  ],
  gates: [
    definitionGate("SURVEY"),
    gate("QUOTE_ACCEPTED", "SURVEY", "Quote accepted", "The client has accepted the quotation.", [["Signed quotation or purchase order", "MANUAL", true], ["Down payment received", "MANUAL", false]]),
    gate("READY_TO_HAND_OVER", "TEST", "Ready to hand over", "The system works as agreed.", [["Pressure test held 24 h", "MANUAL", true], ["Operation test all units", "MANUAL", true]]),
    gate("ACCEPTED", "HANDOVER", "Accepted", "The client signs off.", [["Client acceptance signed", "MANUAL", true]]),
  ],
  workPackages: [
    wp("SURVEY", 10, "SURVEY", "Site survey", { minDays: 1, effort: [{ role: "TECHNICIAN", base: 3, per: { driver: "UNITS", rate: 0.5 } }], deliverable_title: "Survey notes" }),
    wp("QUOTE", 20, "SURVEY", "Quotation and approval", { predecessors: ["SURVEY"], minDays: 5, effort: [{ role: "SUPERVISOR", base: 3 }], deliverable_title: "Accepted quotation" }),
    wp("PROCURE", 30, "PROCURE", "Equipment and materials", { predecessors: ["QUOTE"], minDays: 10, effort: [{ role: "SUPERVISOR", base: 2 }], costs: [
      { label: "Air-conditioning units", unit: "unit", base: 0, per: { driver: "UNITS", rate: 1 }, unitCost: 45000 },
      { label: "Refrigerant piping and insulation", unit: "m", base: 0, per: { driver: "PIPE_M", rate: 1 }, unitCost: 650 },
      { label: "Consumables", unit: "lot", base: 1, unitCost: 5000 },
    ], deliverable_title: "Equipment and materials on site" }),
    wp("MOUNT_PIPE", 40, "INSTALL", "Mounting and piping", { predecessors: ["PROCURE"], effort: [
      { role: "TECHNICIAN", base: 0, per: { driver: "UNITS", rate: 6 } }, { role: "HELPER", base: 0, per: { driver: "UNITS", rate: 6 } }, { role: "HELPER", base: 0, per: { driver: "PIPE_M", rate: 0.15 } },
    ], deliverable_title: "Units mounted and piped" }),
    wp("ELEC_DRAIN", 50, "INSTALL", "Electrical and drain", { predecessors: ["MOUNT_PIPE"], effort: [{ role: "TECHNICIAN", base: 0, per: { driver: "UNITS", rate: 2 } }], costs: [{ label: "Wiring and breakers", unit: "unit", base: 0, per: { driver: "UNITS", rate: 1 }, unitCost: 2500 }], deliverable_title: "Power and drains connected" }),
    wp("TEST", 60, "TEST", "Pressure test, vacuum and charge", { predecessors: ["ELEC_DRAIN"], minDays: 2, effort: [{ role: "TECHNICIAN", base: 2, per: { driver: "UNITS", rate: 1.5 } }], deliverable_title: "Test records" }),
    wp("HANDOVER", 70, "HANDOVER", "Commissioning and handover", { predecessors: ["TEST"], minDays: 1, effort: [{ role: "SUPERVISOR", base: 3 }, { role: "TECHNICIAN", base: 2 }], deliverable_title: "Signed acceptance and warranty" }),
  ],
};

// ---------------------------------------------------------------- software / app development
const software: ProjectTemplate = {
  key: "software_app",
  name: "Software / app development",
  description: "Discovery to release: features and screens drive the effort; design, build, test, release.",
  method: "lines", scheduling: "forward", calendar: "working", anchorLabel: "Start date",
  features: { location: false, size: false, codes: false, permit: false, scopeModel: false },
  terms: { deliverable: "Deliverable", deliverables: "Deliverables" },
  sections: [
    sec("objective", "Product goal", "Who it is for and what problem it solves."),
    sec("scope", "Features in scope", "The features or user stories for this release."),
    sec("exclusions", "Out of scope", "What waits for a later release."),
    sec("performance_criteria", "Non-functional requirements", "Platforms, offline, performance, security, accessibility."),
    sec("interfaces_summary", "Integrations", "APIs, payment, sign-in, data sources."),
    sec("assumptions", "Assumptions", "Team, accounts, content available, until confirmed."),
    sec("acceptance_criteria", "Definition of done", "Tests, reviews, store approval, documentation."),
  ],
  criteriaLabel: "Requirements",
  criteriaCategories: opts(["FUNCTIONAL", "Functional"], ["NON_FUNCTIONAL", "Non-functional"], ["PLATFORM", "Platform"], ["DATA", "Data"], ["OTHER", "Other"]),
  drivers: [{ key: "FEATURES", label: "Features", unit: "features", default: 8 }, { key: "SCREENS", label: "Screens", unit: "screens", default: 12 }],
  roles: [role("PM", "Product / PM", 1, 0.5), role("DESIGNER", "Designer", 1, 0.5), role("DEVELOPER", "Developer"), role("QA", "Tester", 1, 0.5)],
  factorSets: [{ set: "COMPLEXITY", label: "Complexity", values: [{ key: "SIMPLE", label: "Simple", factor: 0.8, is_default: false }, { key: "NORMAL", label: "Normal", factor: 1, is_default: true }, { key: "COMPLEX", label: "Complex", factor: 1.4, is_default: false }] }],
  stages: [
    st("DISCOVERY", 10, "Discovery", "Understand users and scope.", ["Backlog"]),
    st("DESIGN", 20, "Design", "Screens and flows.", ["UI designs"]),
    st("BUILD", 30, "Build", "Implement the features."),
    st("TEST", 40, "Test", "Test and fix."),
    st("RELEASE", 50, "Release", "Deploy and hand over."),
  ],
  gates: [
    definitionGate("DISCOVERY"),
    gate("DESIGN_APPROVED", "DESIGN", "Design approved", "The client approves the screens.", [["UI designs approved", "MANUAL", true]]),
    gate("RELEASE_READY", "TEST", "Release ready", "Quality is good enough to ship.", [["No open critical defects", "MANUAL", true], ["Acceptance tests passed", "MANUAL", true]]),
  ],
  workPackages: [
    wp("BACKLOG", 10, "DISCOVERY", "Requirements and backlog", { effort: [{ role: "PM", base: 16, per: { driver: "FEATURES", rate: 2 } }], deliverable_title: "Prioritised backlog" }),
    wp("UX", 20, "DESIGN", "UX / UI design", { predecessors: ["BACKLOG"], effort: [{ role: "DESIGNER", base: 8, per: { driver: "SCREENS", rate: 6 } }, { role: "PM", base: 4 }], deliverable_title: "Approved UI designs" }),
    wp("SETUP", 30, "BUILD", "Architecture and setup", { predecessors: ["BACKLOG"], effort: [{ role: "DEVELOPER", base: 24 }], deliverable_title: "Project skeleton and CI" }),
    wp("FEATURES", 40, "BUILD", "Build features", { predecessors: ["UX", "SETUP"], effort: [{ role: "DEVELOPER", base: 0, per: { driver: "FEATURES", rate: 24 } }], deliverable_title: "Features implemented" }),
    wp("TESTING", 50, "TEST", "Testing and fixes", { predecessors: ["FEATURES"], effort: [{ role: "QA", base: 8, per: { driver: "FEATURES", rate: 4 } }, { role: "DEVELOPER", base: 0, per: { driver: "FEATURES", rate: 4 } }], deliverable_title: "Test report" }),
    wp("RELEASE", 60, "RELEASE", "Release and deployment", { predecessors: ["TESTING"], minDays: 3, effort: [{ role: "DEVELOPER", base: 8 }, { role: "PM", base: 4 }], costs: [{ label: "Hosting and store fees", unit: "lot", base: 1, unitCost: 6000 }], deliverable_title: "Release in production" }),
    wp("HANDOVER", 70, "RELEASE", "Handover and documentation", { predecessors: ["RELEASE"], effort: [{ role: "PM", base: 8 }, { role: "DEVELOPER", base: 4 }], deliverable_title: "Handover documents" }),
  ],
};

// ---------------------------------------------------------------- engineering design (area-scaled man-hours)
type SeedWp = { wp_key: string; name: string; sequence: number; exponent: number; stage_key: string | null; deliverable_title: string | null; predecessors: string[]; base: Record<string, number> };
type SeedFactor = { factor_set: string; value_key: string; label: string; factor: number; is_default: boolean };
const SET_LABEL: Record<string, string> = { SYSTEM: "System", COMPLEXITY: "Complexity", DELIVERABLE: "Deliverable level", BIM_COORDINATION: "BIM coordination" };
const engineering: ProjectTemplate = {
  key: "engineering_design",
  name: "Building services design (area-based)",
  description: "Engineering design consultancy: man-hours scale with floor area, system and complexity. (The full HVAC engineering workflow is in the HVAC app.)",
  method: "area_scaled", scheduling: "forward", calendar: "working", anchorLabel: "Start date", referenceArea: 5000,
  features: { location: true, size: true, codes: true, permit: true, scopeModel: true },
  terms: { deliverable: "Deliverable", deliverables: "Deliverables" },
  sections: [
    sec("objective", "Objective", "What must the project or system achieve? One or two sentences."),
    sec("scope", "Scope and boundaries", "What is included: systems, areas, services, deliverables."),
    sec("exclusions", "Exclusions", "What is explicitly not included."),
    sec("required_capacity", "Required capacity / performance", "Known capacities and duties."),
    sec("performance_criteria", "Performance criteria", "Temperatures, humidity, air changes, noise, efficiency."),
    sec("operating_conditions", "Operating conditions", "Hours, occupancy, 24/7 areas, redundancy."),
    sec("site_conditions", "Site conditions", "Existing building, ceiling voids, shafts, utilities."),
    sec("client_requirements", "Client requirements", "Owner standards, brands, maintenance, phasing."),
    sec("interfaces_summary", "Interfaces with other systems", "Chilled water, electrical, fire alarm, BMS, architecture."),
    sec("assumptions", "Assumptions", "What you assume until confirmed."),
    sec("acceptance_criteria", "Acceptance criteria", "Tests, commissioning, documents at handover."),
  ],
  criteriaLabel: "Design criteria",
  criteriaCategories: seed.options.design_criteria_category as Option[],
  drivers: [{ key: "AREA", label: "Floor area", unit: "m²", default: 5000, fromProjectArea: true }],
  roles: seed.roles.map((r) => ({ ...r, hourly_rate: r.hourly_rate as number | null })),
  factorSets: [...new Set((seed.factors as SeedFactor[]).map((f) => f.factor_set))].map((set) => ({
    set, label: SET_LABEL[set] ?? set,
    values: (seed.factors as SeedFactor[]).filter((f) => f.factor_set === set).map((f) => ({ key: f.value_key, label: f.label, factor: f.factor, is_default: f.is_default })),
  })),
  stages: seed.stages as StageTemplateItem[],
  gates: seed.gates as GateTemplateItem[],
  workPackages: (seed.workPackages as SeedWp[]).map((w) => ({
    wp_key: w.wp_key, name: w.name, sequence: w.sequence, stage_key: w.stage_key, deliverable_title: w.deliverable_title, predecessors: w.predecessors, exponent: w.exponent,
    effort: Object.entries(w.base).map(([r, base]) => ({ role: r, base })), costs: [],
  })),
};

export const BUILT_IN_TEMPLATES: ProjectTemplate[] = [general, wedding, hvacInstall, software, engineering];
