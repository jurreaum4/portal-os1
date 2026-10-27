import { NavLink, Link } from "react-router-dom";
import { Icon } from "./Icon";
const links = [
  ["/", "dashboard", "Dashboard"],
  ["/portfolio", "portfolio", "Portfolio"],
  ["/products", "products", "Products"],
  ["/pipeline", "pipeline", "Pipeline"],
  ["/approvals", "approvals", "Approvals"],
  ["/analytics", "analytics", "Analytics"],
  ["/forecasting", "forecasting", "Forecasting"],
  ["/departments", "departments", "Departments"],
  ["/governance", "governance", "Governance"],
];
export function Sidebar() {
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
      <div className="workspace-label">MAX UNIVERSE</div>
      <nav aria-label="MAX Universe">
        <NavLink to="/portal/universe" end>
          <Icon name="globe" />
          Universe
        </NavLink>
        <NavLink to="/portal/universe/galaxy">
          <Icon name="spark" />
          Ecosystem galaxy
        </NavLink>
        <NavLink to="/portal/governor">
          <Icon name="governance" />
          Governor console
        </NavLink>
        <NavLink to="/marketplace">
          <Icon name="products" />
          Marketplace
        </NavLink>
      </nav>
      <div className="workspace-label">WORKSPACE</div>
      <nav aria-label="Main navigation">
        {links.map(([to, icon, label]) => (
          <NavLink key={to} to={to} end={to === "/"}>
            <Icon name={icon} />
            {label}
            {label === "Dashboard" && <span className="nav-active-dot" />}
          </NavLink>
        ))}
      </nav>
      <div className="workspace-label operations-label">OPERATIONS</div>
      <nav aria-label="Operations">
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
        <div className="edge-note">
          <span className="status-dot" />
          <span>Cloudflare edge workspace</span>
          <span className="edge-version">v3</span>
        </div>
        <Link className="profile" to="/settings">
          <span className="profile-avatar">MJ</span>
          <span>
            <strong>MAX Governor</strong>
            <small>Workspace administrator</small>
          </span>
          <Icon name="settings" size={16} />
        </Link>
      </div>
    </aside>
  );
}
