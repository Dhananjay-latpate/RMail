import Link from "next/link";

export default function HomePage() {
  return (
    <>
      <nav className="nav">
        <span className="nav-brand">RMail Workspace</span>
        <Link href="/login">Sign in</Link>
        <Link href="/signup" className="btn">Get started</Link>
      </nav>
      <section className="hero">
        <h1>Business email for your team</h1>
        <p>
          Professional email, calendar, and contacts for your organization.
          Subscribe in minutes — custom domain, admin controls, and secure mail.
        </p>
        <Link href="/signup" className="btn">Start free trial</Link>
      </section>
      <div className="container">
        <div className="plans">
          <div className="plan-card">
            <h3>Starter</h3>
            <p className="plan-price">$6</p>
            <p>per user / month</p>
            <p>5 users · 10 GB storage</p>
          </div>
          <div className="plan-card">
            <h3>Business</h3>
            <p className="plan-price">$12</p>
            <p>per user / month</p>
            <p>25 users · 50 GB storage</p>
          </div>
          <div className="plan-card">
            <h3>Enterprise</h3>
            <p className="plan-price">$25</p>
            <p>per user / month</p>
            <p>Unlimited users · 500 GB storage</p>
          </div>
        </div>
      </div>
    </>
  );
}
