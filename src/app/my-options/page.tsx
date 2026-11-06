import { RequestLink } from "./Forms";
import "./my-options.css";

/** /my-options — "Send me my link" for option holders (124). */
export const metadata = { title: "My share options · Founders Doc", robots: { index: false, follow: false } };

export default function MyOptionsHome() {
  return (
    <div className="mo">
      <header className="mo-top">
        <span className="mo-fd">Founders Doc</span>
      </header>
      <main className="mo-wrap narrow">
        <RequestLink />
        <p className="mo-foot">Your page shows only your own options and documents. It is read-only: for any correction, contact your company&rsquo;s ESOP admin or Founders Doc.</p>
      </main>
    </div>
  );
}
