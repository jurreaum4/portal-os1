import { useGovernor } from "../layouts/GovernorLayout";
import { Link } from "react-router-dom";
export function Header() {
  const { token } = useGovernor();
  return (
    <header className="header">
      <div className="breadcrumb">
        Workspace <span>/</span> <strong>Governor console</strong>
      </div>
      <div className="header-actions">
        <Link className="environment" to="/settings">
          {token ? "GOVERNOR ACCESS" : "SIGN IN"}
        </Link>
        <Link className="avatar" to="/settings" aria-label="Governor settings">
          G
        </Link>
      </div>
    </header>
  );
}
