import { Link, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { Icon } from "./Icon";
export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const page = location.pathname.startsWith("/portal/")
    ? location.pathname.split("/").at(-1)!
    : location.pathname.split("/")[1] || "Dashboard";
  return (
    <header className="header">
      <div className="breadcrumb">
        <Icon name="globe" size={16} />
        <span>Workspace</span>
        <span>/</span>
        <strong>
          {page === "orchestration"
            ? "Product factory"
            : page.charAt(0).toUpperCase() + page.slice(1)}
        </strong>
      </div>
      <div className="header-actions">
        <form
          className="global-search"
          onSubmit={(e) => {
            e.preventDefault();
            navigate(`/portfolio?q=${encodeURIComponent(search)}`);
          }}
        >
          <Icon name="search" size={16} />
          <input
            aria-label="Search workspace"
            placeholder="Search anything…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <kbd>↵</kbd>
        </form>
        <Link
          className="notification-link"
          to="/approvals"
          aria-label="Open approval notifications"
        >
          <Icon name="bell" />
          <i />
        </Link>
        <span className="header-divider" />
        <Link className="avatar" to="/settings" aria-label="Governor settings">
          MJ
        </Link>
      </div>
    </header>
  );
}
