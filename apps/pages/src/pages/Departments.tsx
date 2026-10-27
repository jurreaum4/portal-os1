import { getConsole } from "../api/console";
import { useApi } from "../hooks/useApi";
import { AsyncState } from "../components/AsyncState";
import { RefreshControl } from "../components/RefreshControl";
import { Departments as DepartmentGrid } from "../components/Departments";
export default function Departments() {
  const state = useApi(getConsole, 15000);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ICVS / OPERATIONS CENTRE</div>
          <h1>
            Departments<span className="title-dot">.</span>
          </h1>
          <p>
            Health, current work and queues across the eight ICVS departments.
          </p>
        </div>
        <RefreshControl {...state} />
      </div>
      <AsyncState {...state} retry={state.reload} />
      {state.data && <DepartmentGrid rows={state.data.departments} />}
      <p className="muted">
        Observations older than 24 hours are unverified. GOV queue falls back to
        the live approval count when no department queue is supplied.
      </p>
    </>
  );
}
