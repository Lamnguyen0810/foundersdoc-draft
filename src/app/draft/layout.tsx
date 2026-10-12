import MobileDraftBar from "./MobileDraftBar";

/* Every drafting screen, new or reopened: the phone and tablet controls
   (the rail as a drawer, the progress pane as a sheet). */
export default function DraftLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <MobileDraftBar />
    </>
  );
}
