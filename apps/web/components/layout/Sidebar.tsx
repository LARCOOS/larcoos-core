import Link from "next/link";
import Logo from "./Logo";

const menu = [
  { name: "Dashboard", href: "/dashboard" },
  { name: "LDC LLC", href: "/ldc" },
  { name: "ViDaMar", href: "/vidamar" },
  { name: "Truckloads", href: "/ldc/truckloads" },
  { name: "Inventory", href: "/ldc/inventory" },
  { name: "Logistics", href: "/ldc/logistics" },
  { name: "Finance", href: "/ldc/finance" },
  { name: "Marketplace", href: "/vidamar/marketplace" },
  { name: "AI Assistant", href: "/ai" },
  { name: "Settings", href: "/settings" },
];

export default function Sidebar() {
  return (
    <aside className="min-h-screen w-64 border-r border-neutral-800 bg-black p-5 text-white">
      <div className="mb-8">
        <Logo />
        <p className="mt-1 text-xs text-neutral-500">
          Business Operating System
        </p>
      </div>

      <nav className="space-y-1">
        {menu.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block rounded-lg px-3 py-2 text-sm text-neutral-300 transition hover:bg-neutral-900 hover:text-white"
          >
            {item.name}
          </Link>
        ))}
      </nav>

      <div className="mt-10 border-t border-neutral-800 pt-4">
        <p className="text-xs text-neutral-500">Founder</p>
        <p className="text-sm font-medium">Victor</p>
      </div>
    </aside>
  );
}