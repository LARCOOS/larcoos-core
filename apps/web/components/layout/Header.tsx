export default function Header() {
  return (
    <header className="flex items-center justify-between bg-neutral-900 p-4 border-b border-neutral-800">
      <h1 className="text-xl font-bold">LARCOOS</h1>

      <div className="flex items-center gap-4">
        <select className="bg-neutral-800 rounded px-3 py-2">
          <option>LDC LLC</option>
          <option>ViDaMar</option>
        </select>

        <input
          className="bg-neutral-800 rounded px-3 py-2"
          placeholder="Buscar..."
        />

        <button>🔔</button>

        <span>Victor</span>

        <button>⚙️</button>
      </div>
    </header>
  );
}
