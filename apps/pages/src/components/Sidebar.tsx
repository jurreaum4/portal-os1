import { NavLink } from "react-router-dom";
const links = [
  ["/", "◫", "Dashboard"],
  ["/portfolio", "▦", "Portfolio"],
  ["/pipeline", "⇢", "Pipeline"],
  ["/products", "◇", "Products"],
  ["/approvals", "✓", "Approval centre"],
  ["/departments", "◉", "Departments"],
  ["/runtime", "⌁", "Runtime"],
  ["/orchestration", "⤳", "Orchestration"],
  ["/analytics", "▥", "Analytics"],
  ["/settings", "⚙", "Settings"],
];
export function Sidebar() {
  return (
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="Portal OS1 home">
        <span className="brand-icon">P</span>
        <span>
          PORTAL<span className="brand-os">—OS1</span>
        </span>
      </a>
      <div className="workspace-label">WORKSPACE</div>
      <nav aria-label="Main navigation">
        {links.map(([to, icon, label]) => (
          <NavLink key={to} to={to} end={to === "/"}>
            <span aria-hidden="true" className="nav-icon">
              {icon}
            </span>
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">
        <span className="status-dot" /> EDGE NATIVE
        <span>Governor workspace</span>
      </div>
    </aside>
  );
}
