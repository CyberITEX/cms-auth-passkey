// src/components/Header.js
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { 
  Home, 
  LogIn, 
  UserPlus, 
  LayoutDashboard, 
  Settings, 
  Menu, 
  X,
  User,
  LogOut,
  Shield,
  Fingerprint
} from "lucide-react";
import { cn } from "@/lib/utils";

// Import your logout function
import { logout, getCurrentUser } from "@/lib/cms/web/account";

export default function Header() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check if user is logged in
  useEffect(() => {
    const checkUser = async () => {
      try {
        const userResult = await getCurrentUser();
        if (userResult.success) {
          setUser(userResult.data);
        }
      } catch (error) {
        console.log("User not logged in");
      } finally {
        setIsLoading(false);
      }
    };

    checkUser();
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
      setUser(null);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const isActive = (path) => {
    if (path === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(path);
  };

  const publicRoutes = [
    {
      name: "Home",
      href: "/",
      icon: Home
    },
    {
      name: "Login",
      href: "/login",
      icon: LogIn,
      hideWhenLoggedIn: true
    },
    {
      name: "Register",
      href: "/register",
      icon: UserPlus,
      hideWhenLoggedIn: true
    }
  ];

  const protectedRoutes = [
    {
      name: "Dashboard",
      href: "/account/dashboard",
      icon: LayoutDashboard,
      requireAuth: true
    },
    {
      name: "Admin",
      href: "/admin/settings",
      icon: Settings,
      requireAuth: true,
      badge: "Admin"
    }
  ];

  const getUserInitials = (user) => {
    if (!user) return "U";
    if (user.name) {
      return user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    if (user.email) {
      return user.email.slice(0, 2).toUpperCase();
    }
    return "U";
  };

  const getUserDisplayName = (user) => {
    if (!user) return "User";
    return user.name || user.email?.split('@')[0] || "User";
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between px-4">
        {/* Logo */}
        <div className="flex items-center space-x-2">
          <Link href="/" className="flex items-center space-x-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
              <Fingerprint className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-xl">CyberITEX</span>
          </Link>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center space-x-6">
          {/* Public Routes */}
          {publicRoutes.map((route) => {
            if (route.hideWhenLoggedIn && user) return null;
            
            const Icon = route.icon;
            return (
              <Link
                key={route.href}
                href={route.href}
                className={cn(
                  "flex items-center space-x-2 text-sm font-medium transition-colors hover:text-primary",
                  isActive(route.href) 
                    ? "text-primary" 
                    : "text-muted-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{route.name}</span>
              </Link>
            );
          })}

          {/* Protected Routes */}
          {user && protectedRoutes.map((route) => {
            const Icon = route.icon;
            return (
              <Link
                key={route.href}
                href={route.href}
                className={cn(
                  "flex items-center space-x-2 text-sm font-medium transition-colors hover:text-primary",
                  isActive(route.href) 
                    ? "text-primary" 
                    : "text-muted-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{route.name}</span>
                {route.badge && (
                  <Badge variant="secondary" className="text-xs">
                    {route.badge}
                  </Badge>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User Menu / Auth Buttons */}
        <div className="flex items-center space-x-4">
          {!isLoading && (
            <>
              {user ? (
                // User Menu
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-primary text-primary-foreground">
                          {getUserInitials(user)}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56" align="end" forceMount>
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">
                          {getUserDisplayName(user)}
                        </p>
                        <p className="text-xs leading-none text-muted-foreground">
                          {user.email}
                        </p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuItem asChild>
                        <Link href="/account/dashboard">
                          <LayoutDashboard className="mr-2 h-4 w-4" />
                          <span>Dashboard</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/account/profile">
                          <User className="mr-2 h-4 w-4" />
                          <span>Profile</span>
                        </Link>
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/admin/settings">
                        <Shield className="mr-2 h-4 w-4" />
                        <span>Admin Settings</span>
                        <Badge variant="secondary" className="ml-auto text-xs">
                          Admin
                        </Badge>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout}>
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Log out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                // Auth Buttons
                <div className="hidden md:flex items-center space-x-2">
                  <Button variant="ghost" asChild>
                    <Link href="/login">
                      <LogIn className="mr-2 h-4 w-4" />
                      Login
                    </Link>
                  </Button>
                  <Button asChild>
                    <Link href="/register">
                      <UserPlus className="mr-2 h-4 w-4" />
                      Register
                    </Link>
                  </Button>
                </div>
              )}
            </>
          )}

          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            className="md:hidden"
            size="sm"
            onClick={() => setIsOpen(!isOpen)}
          >
            {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Navigation */}
      {isOpen && (
        <div className="md:hidden border-t bg-background">
          <nav className="container space-y-1 px-4 py-4">
            {/* Public Routes */}
            {publicRoutes.map((route) => {
              if (route.hideWhenLoggedIn && user) return null;
              
              const Icon = route.icon;
              return (
                <Link
                  key={route.href}
                  href={route.href}
                  className={cn(
                    "flex items-center space-x-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                    isActive(route.href) 
                      ? "bg-accent text-accent-foreground" 
                      : "text-muted-foreground"
                  )}
                  onClick={() => setIsOpen(false)}
                >
                  <Icon className="h-4 w-4" />
                  <span>{route.name}</span>
                </Link>
              );
            })}

            {/* Protected Routes */}
            {user && protectedRoutes.map((route) => {
              const Icon = route.icon;
              return (
                <Link
                  key={route.href}
                  href={route.href}
                  className={cn(
                    "flex items-center space-x-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                    isActive(route.href) 
                      ? "bg-accent text-accent-foreground" 
                      : "text-muted-foreground"
                  )}
                  onClick={() => setIsOpen(false)}
                >
                  <Icon className="h-4 w-4" />
                  <span>{route.name}</span>
                  {route.badge && (
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {route.badge}
                    </Badge>
                  )}
                </Link>
              );
            })}

            {/* Mobile Auth */}
            {!isLoading && !user && (
              <>
                <div className="border-t pt-4 mt-4">
                  <Link
                    href="/login"
                    className="flex items-center space-x-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground text-muted-foreground"
                    onClick={() => setIsOpen(false)}
                  >
                    <LogIn className="h-4 w-4" />
                    <span>Login</span>
                  </Link>
                  <Link
                    href="/register"
                    className="flex items-center space-x-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground text-muted-foreground"
                    onClick={() => setIsOpen(false)}
                  >
                    <UserPlus className="h-4 w-4" />
                    <span>Register</span>
                  </Link>
                </div>
              </>
            )}

            {/* Mobile User Section */}
            {user && (
              <div className="border-t pt-4 mt-4">
                <div className="px-3 py-2 text-xs font-medium text-muted-foreground">
                  Signed in as {getUserDisplayName(user)}
                </div>
                <Link
                  href="/account/profile"
                  className="flex items-center space-x-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground text-muted-foreground"
                  onClick={() => setIsOpen(false)}
                >
                  <User className="h-4 w-4" />
                  <span>Profile</span>
                </Link>
                <button
                  onClick={() => {
                    handleLogout();
                    setIsOpen(false);
                  }}
                  className="flex w-full items-center space-x-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground text-muted-foreground"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Log out</span>
                </button>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}