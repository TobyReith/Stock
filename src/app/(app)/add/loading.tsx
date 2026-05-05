/**
 * Dedicated scanner-shaped skeleton for `/add`.
 *
 * The generic `(app)/loading.tsx` renders a list — totally wrong shape
 * for the Add-Flow, which opens with a big central camera viewport.
 * Showing the list skeleton briefly on tab-switch to "Hinzufügen" was
 * visually jarring (list → scanner swap), so we give this segment its
 * own fallback.
 *
 * Matches the wrapper of `AddPage`: `mx-auto max-w-md px-4 py-6`, with
 * a title block and a 4:3 viewport box that sits where the camera
 * preview lands.
 */
export default function AddLoading() {
  return (
    <div
      className="mx-auto w-full max-w-md animate-pulse px-4 py-6"
      aria-hidden
    >
      <div className="mb-3 h-7 w-40 rounded-md bg-muted" />
      <div className="mb-6 flex flex-col gap-2">
        <div className="h-8 w-40 rounded bg-muted" />
        <div className="h-4 w-64 rounded bg-muted" />
      </div>
      {/* Viewport placeholder — 4:3, same aspect the scanner paints */}
      <div className="aspect-[4/3] w-full rounded-lg border bg-muted" />
      <div className="mt-4 flex justify-center">
        <div className="h-10 w-48 rounded-md bg-muted" />
      </div>
    </div>
  );
}
