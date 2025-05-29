// src/app/login/page.js
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useEffect, useState } from "react";
import * as z from "zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

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
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Fingerprint, Lock, AlertCircle, Loader2 } from "lucide-react";
import {
  Alert,
  AlertDescription,
} from "@/components/ui/alert";

// Import your existing login function
import { createCredentialsSession } from "@/lib/cms/web/account";
import { AppwriteException } from 'appwrite';

// Import passkey functions
import { 
  authenticateWithPasskey, 
  checkPasskeySupport,
  setupConditionalAuth
} from "@/lib/cms/web/passkey_client";

const loginFormSchema = z.object({
  email: z.string().email({
    message: "Please enter a valid email address.",
  }),
  password: z.string().min(8, {
    message: "Password must be at least 8 characters.",
  }),
});

const passkeyFormSchema = z.object({
  email: z.string().email({
    message: "Please enter a valid email address.",
  }).optional(),
});

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pageErrorMessage, setPageErrorMessage] = useState(null);
  const [pageSuccessMessage, setPageSuccessMessage] = useState(null);
  const [loginMethod, setLoginMethod] = useState("password"); // "password" or "passkey"
  const [passkeySupport, setPasskeySupport] = useState(null);
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);
  const [conditionalAuth, setConditionalAuth] = useState(null);

  // Traditional login form
  const passwordForm = useForm({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  // Passkey login form
  const passkeyForm = useForm({
    resolver: zodResolver(passkeyFormSchema),
    defaultValues: {
      email: "",
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
          message = `An issue occurred. Please log in${nextParam ? ` to continue to ${nextParam}` : ''}.`;
          break;
      }
      setPageErrorMessage(message);
    }

    // Handle success messages
    if (statusParam === 'registration_successful') {
      setPageSuccessMessage("Registration successful! Please log in to continue.");
    }

    // Check passkey support
    const support = checkPasskeySupport();
    setPasskeySupport(support);

    // Set up conditional authentication (autofill) if supported
    if (support.autofillSupported) {
      // Small delay to ensure DOM is ready
      const timeoutId = setTimeout(async () => {
        const emailInput = document.querySelector('input[type="email"]');
        if (emailInput) {
          const conditionalResult = await setupConditionalAuth(
            emailInput,
            (result) => {
              // Success callback - user authenticated via autofill
              console.log("Conditional auth successful:", result);
              const nextParam = searchParams.get('next');
              router.push((nextParam && nextParam.startsWith('/')) ? nextParam : '/account/dashboard');
            },
            (error) => {
              // Error callback - only log actual errors, ignore cancellations
              console.log("Conditional auth result:", error);
              // Only show error messages that aren't user cancellations
              if (error.message && 
                  !error.message.toLowerCase().includes('cancelled') && 
                  !error.message.toLowerCase().includes('aborted') &&
                  !error.message.toLowerCase().includes('not allowed') &&
                  !error.message.toLowerCase().includes('timed out')) {
                setPageErrorMessage(error.message);
              }
            }
          );
          setConditionalAuth(conditionalResult);
        }
      }, 1000); // 1 second delay

      return () => {
        clearTimeout(timeoutId);
        // Cleanup conditional auth on unmount
        if (conditionalAuth?.abort) {
          conditionalAuth.abort();
        }
      };
    }
  }, [searchParams, router, conditionalAuth]);

  // Traditional password login
  async function onPasswordSubmit(values) {
    console.log("Password login submitted:", values);
    try {
      const session = await createCredentialsSession(values.email, values.password);
      console.log("Login successful, session:", session);
      const nextParam = searchParams.get('next');
      router.push((nextParam && nextParam.startsWith('/')) ? nextParam : '/account/dashboard');
    } catch (error) {
      console.error("Login failed:", error);
      if (error instanceof AppwriteException) {
        passwordForm.setError("root", { type: "manual", message: error.message || "Invalid email or password." });
      } else {
        passwordForm.setError("root", { type: "manual", message: "An unexpected error occurred. Please try again." });
      }
    }
  }

  // Passkey login
  async function onPasskeySubmit(values) {
    console.log("Passkey login submitted:", values);
    setIsPasskeyLoading(true);

    try {
      const result = await authenticateWithPasskey(values.email || null);

      if (result.success) {
        console.log("Passkey login successful:", result.data);
        const nextParam = searchParams.get('next');
        router.push((nextParam && nextParam.startsWith('/')) ? nextParam : '/account/dashboard');
      } else {
        console.error("Passkey login failed:", result.message);
        passkeyForm.setError("root", { 
          type: "manual", 
          message: result.message || "Passkey authentication failed. Please try again." 
        });
      }
    } catch (error) {
      console.error("Unexpected error during passkey login:", error);
      passkeyForm.setError("root", { 
        type: "manual", 
        message: "An unexpected error occurred. Please try again." 
      });
    } finally {
      setIsPasskeyLoading(false);
    }
  }

  // Quick passkey login (without email)
  async function onQuickPasskeyLogin() {
    setIsPasskeyLoading(true);

    try {
      const result = await authenticateWithPasskey(null); // No email = discoverable credentials

      if (result.success) {
        console.log("Quick passkey login successful:", result.data);
        const nextParam = searchParams.get('next');
        router.push((nextParam && nextParam.startsWith('/')) ? nextParam : '/account/dashboard');
      } else {
        console.error("Quick passkey login failed:", result.message);
        setPageErrorMessage(result.message || "Passkey authentication failed. Please try again.");
      }
    } catch (error) {
      console.error("Unexpected error during quick passkey login:", error);
      setPageErrorMessage("An unexpected error occurred. Please try again.");
    } finally {
      setIsPasskeyLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">Welcome Back</CardTitle>
          <CardDescription>
            Sign in to your account using your preferred method.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Page-level messages */}
          {pageErrorMessage && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{pageErrorMessage}</AlertDescription>
            </Alert>
          )}
          {pageSuccessMessage && (
            <Alert className="border-green-500 bg-green-50 text-green-700">
              <AlertDescription>{pageSuccessMessage}</AlertDescription>
            </Alert>
          )}

          {/* Quick Passkey Login (if supported) */}
          {passkeySupport?.passkeySupported && (
            <div className="space-y-3">
              <Button
                onClick={onQuickPasskeyLogin}
                variant="outline"
                className="w-full"
                disabled={isPasskeyLoading}
              >
                {isPasskeyLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  <>
                    <Fingerprint className="w-4 h-4 mr-2" />
                    Sign in with Passkey
                  </>
                )}
              </Button>
              
              {passkeySupport.autofillSupported && (
                <div className="text-center">
                  <Badge variant="secondary" className="text-xs">
                    💡 Try typing in the email field below for autofill passkey login
                  </Badge>
                </div>
              )}

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    Or continue with
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Login Method Toggle */}
          <div className="flex space-x-2">
            <Button
              variant={loginMethod === "password" ? "default" : "outline"}
              className="flex-1"
              onClick={() => setLoginMethod("password")}
              type="button"
            >
              <Lock className="w-4 h-4 mr-2" />
              Password
            </Button>
            <Button
              variant={loginMethod === "passkey" ? "default" : "outline"}
              className="flex-1"
              onClick={() => setLoginMethod("passkey")}
              disabled={!passkeySupport?.passkeySupported}
              type="button"
            >
              <Fingerprint className="w-4 h-4 mr-2" />
              Passkey
            </Button>
          </div>

          {/* Password Login Form */}
          {loginMethod === "password" && (
            <Form {...passwordForm}>
              <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
                <FormField
                  control={passwordForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input 
                          type="email" 
                          placeholder="you@example.com" 
                          autoComplete="username webauthn"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={passwordForm.control}
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
                {passwordForm.formState.errors.root && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{passwordForm.formState.errors.root.message}</AlertDescription>
                  </Alert>
                )}
                <Button type="submit" className="w-full" disabled={passwordForm.formState.isSubmitting}>
                  {passwordForm.formState.isSubmitting ? "Signing in..." : "Sign in"}
                </Button>
              </form>
            </Form>
          )}

          {/* Passkey Login Form */}
          {loginMethod === "passkey" && passkeySupport?.passkeySupported && (
            <div className="space-y-4">
              <div className="text-center space-y-2">
                <div className="flex justify-center">
                  <div className="p-3 bg-primary/10 rounded-full">
                    <Fingerprint className="w-8 h-8 text-primary" />
                  </div>
                </div>
                <h3 className="font-medium">Sign in with Passkey</h3>
                <p className="text-sm text-muted-foreground">
                  Use your fingerprint, face, or device PIN to sign in securely.
                </p>
              </div>

              <Form {...passkeyForm}>
                <form onSubmit={passkeyForm.handleSubmit(onPasskeySubmit)} className="space-y-4">
                  <FormField
                    control={passkeyForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email (optional)</FormLabel>
                        <FormControl>
                          <Input 
                            type="email" 
                            placeholder="you@example.com" 
                            autoComplete="username webauthn"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                        <p className="text-xs text-muted-foreground">
                          Leave empty to see all available passkeys for this device.
                        </p>
                      </FormItem>
                    )}
                  />
                  {passkeyForm.formState.errors.root && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{passkeyForm.formState.errors.root.message}</AlertDescription>
                    </Alert>
                  )}
                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={isPasskeyLoading}
                  >
                    {isPasskeyLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Authenticating...
                      </>
                    ) : (
                      <>
                        <Fingerprint className="w-4 h-4 mr-2" />
                        Sign in with Passkey
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            </div>
          )}

          {/* Passkey not supported message */}
          {passkeySupport && !passkeySupport.passkeySupported && loginMethod === "passkey" && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Passkeys are not supported in your current browser. Please use password login or try a different browser.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>

        <CardFooter className="flex flex-col items-center space-y-2 pt-4">
          <Separator className="mb-4" />
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