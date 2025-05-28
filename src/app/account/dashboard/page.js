"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppwriteException } from "appwrite"; // Client and Account are no longer needed here
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { logout, getCurrentUser } from "@/lib/cms/web/account"; // Import getCurrentUser

export default function DashboardPage() {
  const router = useRouter();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchUserData() {
      try {
        setLoading(true);
        setError(null);
        const response = await getCurrentUser();

        if (response.success) {
          setUserData(response.data);
        } else {
          // Handle error from getCurrentUser
          console.error("Failed to fetch user data from getCurrentUser:", response.error);
          if (response.code === 401 || response.error?.includes('user_unauthorized') || response.error?.includes('user_jwt_invalid')) {
            router.push("/login?session=expired");
          } else {
            setError(response.error || "An error occurred while fetching your profile.");
          }
        }
      } catch (e) {
        console.error("Failed to fetch user data:", e);
        if (e instanceof AppwriteException && (e.code === 401 || e.type === 'user_unauthorized' || e.type === 'user_jwt_invalid')) {
          // Common Appwrite error codes/types for unauthorized access
          router.push("/login?session=expired"); // Redirect to login if not authenticated
        } else {
          setError(e.message || "An error occurred while fetching your profile.");
        }
      } finally {
        setLoading(false);
      }
    }
    fetchUserData();
  }, [router]);

  const handleLogout = async () => {
    try {
      await logout(); // The logout function in account.js handles redirection
    } catch (e) {
      console.error("Logout failed on dashboard:", e);
      // Optionally, display a toast notification for logout failure
      setError("Logout failed. Please try again.");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <Skeleton className="mb-2 h-7 w-3/5" /> {/* CardTitle */}
            <Skeleton className="h-4 w-4/5" /> {/* CardDescription */}
          </CardHeader>
          <CardContent className="space-y-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="space-y-1">
                <Skeleton className="h-4 w-1/4" /> {/* Label */}
                <Skeleton className="h-6 w-3/4" /> {/* Value */}
              </div>
            ))}
            <Skeleton className="mt-4 h-10 w-full" /> {/* Button */}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center">
        <Card className="w-full max-w-md p-6">
          <CardTitle className="mb-4 text-xl text-destructive">Access Denied or Error</CardTitle>
          <CardContent>
            <p className="mb-4">{error}</p>
            <Button onClick={() => router.push("/login")}>Go to Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!userData) return null; // Should be handled by loading or error states

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl font-bold">Your Dashboard</CardTitle>
          <CardDescription>
            Welcome back, {userData.name || "User"}! Here are your details.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div><p className="text-sm font-medium text-muted-foreground">Name</p><p className="text-lg">{userData.name || "N/A"}</p></div>
          <div><p className="text-sm font-medium text-muted-foreground">Email</p><p className="text-lg">{userData.email}</p></div>
          <div><p className="text-sm font-medium text-muted-foreground">Member Since</p><p className="text-lg">{userData.$registration ? format(new Date(userData.$registration), "MMMM d, yyyy") : "N/A"}</p></div>
          <Button onClick={handleLogout} className="w-full" variant="outline">Logout</Button>
        </CardContent>
      </Card>
    </div>
  );
}