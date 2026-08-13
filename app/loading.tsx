export default function RootLoading() {
  return (
    <main className="arc4 flex min-h-screen w-full items-center justify-center bg-paper text-ink">
      <div className="w-full max-w-sm px-6 text-center">
        <p className="kicker">Kyro</p>
        <div className="mx-auto mt-6 h-1.5 w-full overflow-hidden rounded-full bg-linec">
          <span className="skeleton block h-full w-full" />
        </div>
        <p className="mt-4 font-mono text-xs text-mutedc">Loading...</p>
      </div>
    </main>
  );
}
