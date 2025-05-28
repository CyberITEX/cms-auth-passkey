"use client";

import AccountSidebar from '@/components/account/sidebar';

export default function AccountLayout({ children }) {
  return (
    <div className="flex min-h-screen bg-background">
      <AccountSidebar />
      <main className="flex-1 overflow-y-auto p-6 md:p-8">
        {children}
      </main>
    </div>
  );
}