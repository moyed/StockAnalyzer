"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { logout, isLoggedIn } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    setLoggedIn(isLoggedIn());
  }, [pathname]);

  const handleLogout = async () => {
    await logout();
    setLoggedIn(false);
    router.push("/login");
  };

  const links = [
    { href: "/", label: "Dashboard" },
    { href: "/scan", label: "Scan" },
    { href: "/companies", label: "Companies" },
    { href: "/watchlist", label: "Watchlist" },
    { href: "/sectors", label: "Sectors" },
    { href: "/index", label: "Index" },
    { href: "/chat", label: "AI Chat" },
    { href: "/health", label: "Health" },
  ];

  return (
    <nav className="bg-white border-b border-gray-200 px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-bold text-lg text-green-700">PSX Analyzer</span>
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`text-sm font-medium ${
                pathname === l.href
                  ? "text-green-700 border-b-2 border-green-700 pb-0.5"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <div>
          {loggedIn ? (
            <Button variant="outline" size="sm" onClick={handleLogout}>
              Logout
            </Button>
          ) : (
            <Link href="/login">
              <Button size="sm">Login</Button>
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
