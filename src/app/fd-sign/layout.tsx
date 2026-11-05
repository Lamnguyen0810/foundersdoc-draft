import "../sign/sign.css";
import "./fd-sign.css";

/* FD Sign for everyone (0188): My documents, New request, one request.
   Signed-in FD AI accounts only (middleware sends others to /login and back). */
export const metadata = { title: { default: "FD Sign", template: "%s · FD Sign" }, robots: { index: false, follow: false } };

export default function FdSignLayout({ children }: { children: React.ReactNode }) {
  return children;
}
