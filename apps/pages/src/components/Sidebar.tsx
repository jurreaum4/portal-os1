import { useGovernor } from "../layouts/GovernorLayout";
import { NavLink, Link } from "react-router-dom";
import { Icon } from "./Icon";
const links = [
  ["/portal/governor", "governance", "Governor console"],
  ["/portal/ecosystem", "globe", "MAX Universe"],
  ["/portal/intelligence", "spark", "Intelligence"],
  ["/portal/twin", "portfolio", "Digital twin"],
  ["/portal/marketplace", "products", "Marketplace"],
  ["/portal/dashboard", "dashboard", "Dashboard"],
  ["/portfolio", "portfolio", "Portfolio"],
  ["/products", "products", "Products"],
  ["/pipeline", "pipeline", "Pipeline"],
  ["/approvals", "approvals", "Approvals"],
  ["/analytics", "analytics", "Analytics"],
  ["/revenue", "analytics", "Revenue"],
  ["/publishing", "globe", "Publishing"],
  ["/recommendations", "spark", "Recommendations"],
  ["/forecasting", "forecasting", "Forecasting"],
  ["/departments", "departments", "Departments"],
  ["/governance", "governance", "Governance"],
];
export function Sidebar() {
  const { role, setToken } = useGovernor();
  return (
    <aside className="sidebar">
      <Link className="brand" to="/" aria-label="Portal OS1 home">
        <span className="portal-mark">
          <i />
          <i />
          <i />
        </span>
        <span>
          PORTAL<span className="brand-os">OS1</span>
        </span>
      </Link>
      <div className="workspace-switch">
        <span className="max-monogram">M</span>
        <div>
          <strong>MAX Ecosystem</strong>
          <small>Command centre</small>
        </div>
        <Icon name="down" size={14} />
      </div>
      <div className="workspace-label">WORKSPACE</div>
      <nav aria-label="Main navigation">
        {links
          .filter(
            ([to]) =>
              !["/governance", "/portal/governor"].includes(to) ||
              role === "Governor",
          )
          .map(([to, icon, label]) => (
            <NavLink key={to} to={to} end={to === "/"}>
              <Icon name={icon} />
              {label}
              {label === "Dashboard" && <span className="nav-active-dot" />}
            </NavLink>
          ))}
      </nav>
      <div className="workspace-label operations-label">OPERATIONS</div>
      <nav aria-label="Operations">
        <NavLink to="/portal/workers">
          <Icon name="health" />
          Execution workers
        </NavLink>
        <NavLink to="/orchestration">
          <Icon name="spark" />
          Product factory<span className="beta">BETA</span>
        </NavLink>
        <NavLink to="/runtime">
          <Icon name="health" />
          Runtime
        </NavLink>
        <NavLink to="/settings">
          <Icon name="settings" />
          Settings
        </NavLink>
      </nav>
      <div className="sidebar-bottom">
        <button onClick={() => setToken("")}>Sign out</button>
        <div className="edge-note">
          <span className="status-dot" />
          <span>Cloudflare edge workspace</span>
          <span className="edge-version">v2</span>
        </div>
        <Link className="profile" to="/settings">
          <span className="profile-avatar">MJ</span>
          <span>
            <strong>{role}</strong>
            <small>Authorised workspace access</small>
          </span>
          <Icon name="settings" size={16} />
        </Link>
      </div>
    </aside>
  );
}
