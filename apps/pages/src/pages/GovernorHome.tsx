import { SystemStatus } from "../components/SystemStatus";
import { Link } from "react-router-dom";
import { getEcosystem } from "../api/universe";
import { useApi } from "../hooks/useApi";
import { AsyncState } from "../components/AsyncState";
import {
  UniverseSummary,
  UniverseSignals,
} from "../components/UniverseSummary";
import Approvals from "./Approvals";
export default function GovernorHome() {
  const state = useApi(getEcosystem, 15000);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">EXECUTIVE GOVERNANCE LAYER</div>
          <h1>
            Governor console<span className="title-dot">.</span>
          </h1>
          <p>Approve. Reject. Override. ICVS handles operational execution.</p>
        </div>
        <Link className="button" to="/portal/ecosystem">
          Explore MAX Universe ↗
        </Link>
      </div>
      <AsyncState {...state} retry={state.reload} />
      {state.data && (
        <>
          <UniverseSummary data={state.data} />
          <UniverseSignals data={state.data} />
          <SystemStatus />
        </>
      )}
      <Approvals embedded />
      <section className="panel">
        <h2>Explore the ecosystem</h2>
        <div className="universe-drilldowns">
          {[
            ["/portal/portfolio", "Portfolio"],
            ["/portal/factory", "Product factory"],
            ["/portal/publishing", "Publishing"],
            ["/portal/departments", "Departments"],
            ["/portal/workers", "Execution workers"],
            ["/portal/marketplace", "Marketplace operations"],
            ["/portal/twin", "Ecosystem digital twin"],
            ["/governance", "Decision history"],
          ].map(([to, label]) => (
            <Link key={to} to={to}>
              {label} ↗
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
