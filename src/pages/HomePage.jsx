import { getCurrentUser } from "../lib/authStorage";

const FEATURES = [
  {
    icon: "📅",
    title: "Auto Timetable Generation",
    desc: "Constraint-based scheduler creates conflict-free weekly timetables in seconds — no manual juggling of teacher slots.",
    tab: "timetable",
  },
  {
    icon: "🔄",
    title: "Substitute Management",
    desc: "When a teacher is absent, the system instantly identifies the best available substitute based on subject match and workload.",
    tab: "substitutions",
  },
  {
    icon: "👩‍🏫",
    title: "Teacher & Subject Setup",
    desc: "Configure teachers, subjects, classes, and time-off constraints from a single settings panel.",
    tab: "settings",
  },
  {
    icon: "🖨️",
    title: "Printable Timetables",
    desc: "Export clean printouts — 1, 2, or 4 timetables per page — in portrait or landscape for notice boards and staff rooms.",
    tab: "timetable",
  },
];

const STEPS = [
  { number: "1", label: "Configure", detail: "Add your school's teachers, subjects, classes, and schedule under General Settings." },
  { number: "2", label: "Generate", detail: "Go to Timetable → Generate. The algorithm resolves all conflicts automatically." },
  { number: "3", label: "Manage", detail: "Mark absent teachers under Substitution and the system assigns the best available cover." },
  { number: "4", label: "Print", detail: "Print or download the timetable for display in classrooms and staff rooms." },
];

const STATS = [
  { value: "0 sec", label: "Manual scheduling time" },
  { value: "100%", label: "Conflict-free output" },
  { value: "5 min", label: "Full setup to timetable" },
  { value: "∞", label: "Schedule regenerations" },
];

export default function HomePage() {
  const user = getCurrentUser();
  const displayName = user?.profile?.name?.trim() || user?.userId || "";

  return (
    <div className="home-page">

      {/* Hero */}
      <div className="home-hero">
        <div className="home-hero__badge">Smart Scheduler Dashboard</div>
        <h1 className="home-hero__title">
          {displayName ? `Welcome back, ${displayName}` : "Welcome to Smart Scheduler"}
        </h1>
        <p className="home-hero__sub">
          Everything you need to build, manage, and print your school's weekly timetable — all in one place.
        </p>
      </div>

      {/* Stats strip */}
      <div className="home-stats">
        {STATS.map((s) => (
          <div key={s.label} className="home-stat">
            <span className="home-stat__value">{s.value}</span>
            <span className="home-stat__label">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Feature cards */}
      <h2 className="home-section-title">What you can do</h2>
      <div className="home-features">
        {FEATURES.map((f) => (
          <div key={f.title} className="home-feature-card">
            <span className="home-feature-card__icon">{f.icon}</span>
            <h3 className="home-feature-card__title">{f.title}</h3>
            <p className="home-feature-card__desc">{f.desc}</p>
          </div>
        ))}
      </div>

      {/* How it works */}
      <h2 className="home-section-title">How it works</h2>
      <div className="home-steps">
        {STEPS.map((s, i) => (
          <div key={s.number} className="home-step">
            <div className="home-step__number">{s.number}</div>
            {i < STEPS.length - 1 && <div className="home-step__line" />}
            <div className="home-step__body">
              <div className="home-step__label">{s.label}</div>
              <div className="home-step__detail">{s.detail}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick-start tip */}
      <div className="home-tip">
        <span className="home-tip__icon">💡</span>
        <div>
          <strong>First time here?</strong> Start under <em>General Settings</em> to add your teachers, subjects, and classes, then head to <em>Timetable</em> to generate your first schedule.
        </div>
      </div>

    </div>
  );
}
