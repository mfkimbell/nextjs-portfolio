import CampsiteHome from "@/components/CampsiteHome";

// The campsite is the site now. The previous HomeShell/gallery entry point is left in
// place under src/components, so this is a one-line revert if it's ever wanted back.
export default function Home() {
  return <CampsiteHome />;
}
