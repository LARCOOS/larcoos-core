export default function Dashboard() {
  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <header className="border-b border-neutral-800 p-6">
        <h1 className="text-3xl font-bold">LARCOOS Dashboard</h1>
      </header>

      <div className="grid grid-cols-4 gap-6 p-8">
        <div className="rounded-xl bg-neutral-900 p-6">
          <h2 className="text-gray-400">Revenue</h2>
          <p className="mt-3 text-3xl font-bold">$0</p>
        </div>

        <div className="rounded-xl bg-neutral-900 p-6">
          <h2 className="text-gray-400">Truckloads</h2>
          <p className="mt-3 text-3xl font-bold">0</p>
        </div>

        <div className="rounded-xl bg-neutral-900 p-6">
          <h2 className="text-gray-400">Inventory</h2>
          <p className="mt-3 text-3xl font-bold">0</p>
        </div>

        <div className="rounded-xl bg-neutral-900 p-6">
          <h2 className="text-gray-400">Orders</h2>
          <p className="mt-3 text-3xl font-bold">0</p>
        </div>
      </div>
    </main>
  );
}
