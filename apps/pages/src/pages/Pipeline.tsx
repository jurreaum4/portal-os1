import { getConsole } from "../api/console";
import { useApi } from "../hooks/useApi";
import { AsyncState } from "../components/AsyncState";
import { RefreshControl } from "../components/RefreshControl";
import { Factory } from "../components/Factory";
export default function Pipeline() {
  const state = useApi(getConsole, 15000);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">AUTONOMOUS PRODUCT FACTORY</div>
          <h1>
            Product pipeline<span className="title-dot">.</span>
          </h1>
          <p>
            System-reported progression from idea to publication. Refreshes
            every 15 seconds.
          </p>
        </div>
        <RefreshControl {...state} />
      </div>
      <AsyncState {...state} retry={state.reload} />
      {state.data && <Factory data={state.data} />}
      <p className="muted">
        Test includes QA. Ready means ready to publish. Stage counts describe
        current position, not proof that earlier stages completed.
      </p>
    </>
  );
}
