"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useEffect, useState } from "react";
import * as z from "zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation"; // For potential redirect after login

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

// Placeholder for Appwrite SDK and functions
import { createCredentialsSession } from "@/lib/cms/web/account"; // Using the provided function
import { AppwriteException } from 'appwrite';

const loginFormSchema = z.object({
  email: z.string().email({
    message: "Please enter a valid email address.",
  }),
  password: z.string().min(8, {
    message: "Password must be at least 8 characters.",
  }),
});

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pageErrorMessage, setPageErrorMessage] = useState(null);
  const [pageSuccessMessage, setPageSuccessMessage] = useState(null);

  const form = useForm({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  useEffect(() => {
    const errorParam = searchParams.get('error');
    const nextParam = searchParams.get('next');
    const statusParam = searchParams.get('status');
    let message = null;

    // Handle error messages
    if (errorParam) {
      switch (errorParam) {
        case 'session_invalid_or_expired':
          message = `Your session has expired or is invalid. Please log in again${nextParam ? ` to continue to ${nextParam}` : ''}.`;
          break;
        case 'session_check_failed':
          message = `There was a problem verifying your session. Please log in again${nextParam ? ` to continue to ${nextParam}` : ''}.`;
          break;
        default:
          // You could have a more generic message or log this unexpected error type
          message = `An issue occurred. Please log in${nextParam ? ` to continue to ${nextParam}` : ''}.`;
          break;
      }
      setPageErrorMessage(message);
    }

    // Handle success messages
    if (statusParam === 'registration_successful') {
      setPageSuccessMessage("Registration successful! Please log in to continue.");
      // Clear the status param from URL to prevent message from re-appearing on refresh if desired
      // router.replace('/login', undefined, { shallow: true }); // Optional
    }
  }, [searchParams, router]);

  async function onSubmit(values) {
    console.log("Login form submitted:", values);
    try {
      const session = await createCredentialsSession(values.email, values.password);
      console.log("Login successful, session:", session);
      const nextParam = searchParams.get('next');
      // Redirect to the 'next' URL if it exists and is a relative path, otherwise to dashboard
      router.push((nextParam && nextParam.startsWith('/')) ? nextParam : '/account/dashboard');
    } catch (error) {
      console.error("Login failed:", error);
      if (error instanceof AppwriteException) {
        form.setError("root", { type: "manual", message: error.message || "Invalid email or password." });
      } else {
        form.setError("root", { type: "manual", message: "An unexpected error occurred. Please try again." });
      }
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">Welcome Back</CardTitle>
          <CardDescription>
            Enter your credentials to access your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pageErrorMessage && (
            <div className="mb-4 rounded-md border border-destructive bg-destructive/10 p-3 text-center">
              <p className="text-sm font-medium text-destructive">{pageErrorMessage}</p>
            </div>
          )}
          {pageSuccessMessage && (
            <div className="mb-4 rounded-md border border-green-500 bg-green-500/10 p-3 text-center">
              <p className="text-sm font-medium text-green-600 dark:text-green-400">{pageSuccessMessage}</p>
            </div>
          )}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="you@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Password</FormLabel>
                      <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
                        Forgot password?
                      </Link>
                    </div>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {form.formState.errors.root && (
                <p className="text-sm font-medium text-destructive">{form.formState.errors.root.message}</p>
              )}
              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Logging in..." : "Login"}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex flex-col items-center space-y-2 pt-4">
          <p className="text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="font-medium text-primary hover:underline">
              Sign up
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}