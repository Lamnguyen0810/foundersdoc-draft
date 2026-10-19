import MobileDraftBar from "./MobileDraftBar";
import ExitFeedbackHost from "./ExitFeedback";

/* Every drafting screen, new or reopened: the phone and tablet controls
   (the rail as a drawer, the progress pane as a sheet), and the "Before you
   go" box for someone leaving a document half-way (ExitFeedback.tsx). */
export default function DraftLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <MobileDraftBar />
      <ExitFeedbackHost />
    </>
  );
}
