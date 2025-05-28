"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { logout } from '@/lib/cms/web/account';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  ShoppingCart, // Changed from ShoppingBag for variety, use what you prefer
  LifeBuoy,     // Changed from MessageSquare
  LogOut
} from 'lucide-react';

const sidebarNavItems = [
  { title: 'Dashboard', href: '/account/dashboard', icon: LayoutDashboard },
  { title: 'Orders', href: '/account/orders', icon: ShoppingCart },
  { title: 'Support', href: '/account/support', icon: LifeBuoy },
];

export default function AccountSidebar() {
  const pathname = usePathname();

  const handleLogout = async () => {
    await logout(); // The logout function in account.js handles redirection
  };

  return (
    <aside className="flex h-full flex-col w-64 border-r bg-background">
      <div className="flex-grow p-4">
        <nav className="flex flex-col space-y-1">
          {sidebarNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground",
                pathname === item.href
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-accent-foreground"
              )}
            >
              <item.icon className={cn("mr-3 h-5 w-5", pathname === item.href ? "text-accent-foreground" : "text-muted-foreground group-hover:text-accent-foreground")} aria-hidden="true" />
              <span>{item.title}</span>
            </Link>
          ))}
        </nav>
      </div>
      <div className="p-4 border-t">
        <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:bg-accent hover:text-accent-foreground" onClick={handleLogout}>
          <LogOut className="mr-3 h-5 w-5" />
          <span>Logout</span>
        </Button>
      </div>
    </aside>
  );
}